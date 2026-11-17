-- Inventory valuation, GR/IR matching and COGS posting.
-- All postings are source-linked, tenant-scoped and committed with the stock movement.
ALTER TABLE accounting_config
  ADD COLUMN IF NOT EXISTS inventory_asset_id uuid REFERENCES chart_of_accounts(id),
  ADD COLUMN IF NOT EXISTS goods_received_not_invoiced_id uuid REFERENCES chart_of_accounts(id),
  ADD COLUMN IF NOT EXISTS cost_of_goods_sold_id uuid REFERENCES chart_of_accounts(id);

CREATE OR REPLACE FUNCTION validate_accounting_config()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE mapping record;
BEGIN
  FOR mapping IN
    SELECT * FROM (VALUES
      ('accounts_receivable_id', NEW.accounts_receivable_id, 'asset'),
      ('accounts_payable_id', NEW.accounts_payable_id, 'liability'),
      ('sales_revenue_id', NEW.sales_revenue_id, 'revenue'),
      ('purchase_expense_id', NEW.purchase_expense_id, 'expense'),
      ('output_tax_id', NEW.output_tax_id, 'liability'),
      ('input_tax_id', NEW.input_tax_id, 'asset'),
      ('cash_account_id', NEW.cash_account_id, 'asset'),
      ('bank_account_id', NEW.bank_account_id, 'asset'),
      ('inventory_asset_id', NEW.inventory_asset_id, 'asset'),
      ('goods_received_not_invoiced_id', NEW.goods_received_not_invoiced_id, 'liability'),
      ('cost_of_goods_sold_id', NEW.cost_of_goods_sold_id, 'expense')
    ) AS m(field_name, account_id, account_type)
  LOOP
    IF mapping.account_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM chart_of_accounts a
      WHERE a.id = mapping.account_id AND a.organization_id = NEW.organization_id
        AND a.account_type = mapping.account_type AND a.is_active = true
    ) THEN
      RAISE EXCEPTION 'Pemetaan akun % harus memakai akun aktif bertipe % milik organisasi ini',
        mapping.field_name, mapping.account_type;
    END IF;
  END LOOP;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS inventory_lot_costs (
  organization_id uuid NOT NULL REFERENCES organizations(id),
  product_id uuid NOT NULL REFERENCES products(id),
  lot_id uuid NOT NULL REFERENCES inventory_lots(id),
  quantity_on_hand numeric(18,4) NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  carrying_value numeric(18,2) NOT NULL DEFAULT 0 CHECK (carrying_value >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, product_id, lot_id)
);

CREATE TABLE IF NOT EXISTS inventory_valuation_entries (
  movement_id uuid PRIMARY KEY REFERENCES stock_movements(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  product_id uuid NOT NULL REFERENCES products(id),
  lot_id uuid NOT NULL REFERENCES inventory_lots(id),
  movement_type text NOT NULL CHECK (movement_type IN ('receipt','sales_pick')),
  quantity numeric(18,4) NOT NULL CHECK (quantity > 0),
  unit_cost numeric(18,4) NOT NULL CHECK (unit_cost >= 0),
  total_value numeric(18,2) NOT NULL CHECK (total_value >= 0),
  journal_entry_id uuid REFERENCES journal_entries(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_valuation_entries
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES warehouses(id);

CREATE TABLE IF NOT EXISTS inventory_grni_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  supplier_bill_id uuid NOT NULL REFERENCES supplier_bills(id),
  goods_receipt_id uuid NOT NULL REFERENCES goods_receipts(id),
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_bill_id, goods_receipt_id)
);
CREATE INDEX IF NOT EXISTS idx_inventory_grni_receipt
  ON inventory_grni_applications (organization_id, goods_receipt_id);

-- Preserve current quantities for existing lots. Their opening GL balance must be
-- reconciled separately before they can be dispatched under the new valuation ledger.
ALTER TABLE inventory_lot_costs
  ADD COLUMN IF NOT EXISTS opening_balance_pending boolean NOT NULL DEFAULT false;

INSERT INTO inventory_lot_costs (organization_id, product_id, lot_id, quantity_on_hand, carrying_value, opening_balance_pending)
SELECT ib.organization_id, ib.product_id, ib.lot_id, ib.quantity_on_hand,
  round(ib.quantity_on_hand * COALESCE(receipt_cost.average_cost, 0), 2), ib.quantity_on_hand > 0
FROM inventory_balances ib
LEFT JOIN LATERAL (
  SELECT sum(sm.quantity * sm.unit_cost) / NULLIF(sum(sm.quantity), 0) AS average_cost
  FROM stock_movements sm
  WHERE sm.organization_id = ib.organization_id AND sm.product_id = ib.product_id
    AND sm.lot_id = ib.lot_id AND sm.movement_type = 'receipt'
) receipt_cost ON true
WHERE ib.lot_id IS NOT NULL AND ib.quantity_on_hand > 0
ON CONFLICT (organization_id, product_id, lot_id) DO NOTHING;

CREATE OR REPLACE FUNCTION prepare_inventory_movement_cost()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cost_row inventory_lot_costs%ROWTYPE;
BEGIN
  IF NEW.movement_type = 'sales_pick' THEN
    IF NEW.lot_id IS NULL THEN RAISE EXCEPTION 'Pengeluaran penjualan wajib memiliki lot'; END IF;
    SELECT * INTO cost_row FROM inventory_lot_costs
    WHERE organization_id = NEW.organization_id AND product_id = NEW.product_id AND lot_id = NEW.lot_id
    FOR UPDATE;
    IF NOT FOUND OR cost_row.quantity_on_hand < NEW.quantity THEN
      RAISE EXCEPTION 'Saldo valuasi lot tidak mencukupi untuk pengeluaran';
    END IF;
    IF cost_row.opening_balance_pending THEN
      RAISE EXCEPTION 'Saldo awal persediaan lot harus direkonsiliasi sebelum pengiriman';
    END IF;
    NEW.unit_cost := CASE WHEN cost_row.quantity_on_hand = NEW.quantity
      THEN cost_row.carrying_value / NEW.quantity
      ELSE round(cost_row.carrying_value / cost_row.quantity_on_hand, 4) END;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_prepare_inventory_movement_cost ON stock_movements;
CREATE TRIGGER trg_prepare_inventory_movement_cost
BEFORE INSERT ON stock_movements
FOR EACH ROW EXECUTE FUNCTION prepare_inventory_movement_cost();

CREATE OR REPLACE FUNCTION apply_inventory_valuation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  cfg accounting_config%ROWTYPE;
  cost_row inventory_lot_costs%ROWTYPE;
  value_amount numeric(18,2);
  journal_id uuid;
  lines jsonb;
BEGIN
  IF NEW.movement_type NOT IN ('receipt','sales_pick') THEN RETURN NEW; END IF;
  IF NEW.lot_id IS NULL OR NEW.unit_cost IS NULL OR NEW.unit_cost < 0 THEN
    RAISE EXCEPTION 'Pergerakan persediaan bernilai wajib memiliki lot dan biaya unit valid';
  END IF;
  SELECT * INTO cfg FROM accounting_config WHERE organization_id = NEW.organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pemetaan akuntansi persediaan belum diatur'; END IF;

  IF NEW.movement_type = 'receipt' THEN
    IF NEW.reference_type <> 'goods_receipt' OR NEW.reference_id IS NULL THEN
      RAISE EXCEPTION 'Penerimaan bernilai harus berasal dari dokumen goods receipt';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM goods_receipts gr
      JOIN goods_receipt_items gri ON gri.goods_receipt_id = gr.id
      WHERE gr.id = NEW.reference_id AND gr.organization_id = NEW.organization_id
        AND gr.status = 'posted' AND gri.product_id = NEW.product_id
        AND gri.lot_id = NEW.lot_id AND gri.quantity_received = NEW.quantity
    ) THEN
      RAISE EXCEPTION 'Pergerakan penerimaan tidak cocok dengan baris goods receipt';
    END IF;
    value_amount := round(NEW.quantity * NEW.unit_cost, 2);
    INSERT INTO inventory_lot_costs (
      organization_id, product_id, lot_id, quantity_on_hand, carrying_value
    ) VALUES (
      NEW.organization_id, NEW.product_id, NEW.lot_id, NEW.quantity, value_amount
    )
    ON CONFLICT (organization_id, product_id, lot_id) DO UPDATE SET
      quantity_on_hand = inventory_lot_costs.quantity_on_hand + EXCLUDED.quantity_on_hand,
      carrying_value = inventory_lot_costs.carrying_value + EXCLUDED.carrying_value,
      updated_at = now();
    IF value_amount > 0 THEN
      IF cfg.inventory_asset_id IS NULL OR cfg.goods_received_not_invoiced_id IS NULL THEN
        RAISE EXCEPTION 'Pemetaan Persediaan dan GR/IR wajib diatur sebelum penerimaan diposting';
      END IF;
      lines := jsonb_build_array(
        jsonb_build_object('account_id',cfg.inventory_asset_id,'description','Penerimaan persediaan '||NEW.movement_no,'debit',value_amount,'credit',0),
        jsonb_build_object('account_id',cfg.goods_received_not_invoiced_id,'description','GR/IR penerimaan '||NEW.movement_no,'debit',0,'credit',value_amount)
      );
      journal_id := emit_accounting_journal(NEW.organization_id,'inventory_receipt',NEW.id,
        NEW.occurred_at::date,'Penerimaan persediaan '||NEW.movement_no,lines,NEW.posted_by);
    END IF;
  ELSE
    SELECT * INTO cost_row FROM inventory_lot_costs
    WHERE organization_id = NEW.organization_id AND product_id = NEW.product_id AND lot_id = NEW.lot_id
    FOR UPDATE;
    IF NOT FOUND OR cost_row.quantity_on_hand < NEW.quantity THEN
      RAISE EXCEPTION 'Saldo valuasi lot tidak mencukupi untuk pengeluaran';
    END IF;
    value_amount := CASE WHEN cost_row.quantity_on_hand = NEW.quantity
      THEN cost_row.carrying_value
      ELSE round(NEW.quantity * NEW.unit_cost, 2) END;
    UPDATE inventory_lot_costs SET
      quantity_on_hand = quantity_on_hand - NEW.quantity,
      carrying_value = greatest(0, carrying_value - value_amount),
      updated_at = now()
    WHERE organization_id = NEW.organization_id AND product_id = NEW.product_id AND lot_id = NEW.lot_id;
    IF value_amount > 0 THEN
      IF cfg.inventory_asset_id IS NULL OR cfg.cost_of_goods_sold_id IS NULL THEN
        RAISE EXCEPTION 'Pemetaan Persediaan dan HPP wajib diatur sebelum pengiriman';
      END IF;
      lines := jsonb_build_array(
        jsonb_build_object('account_id',cfg.cost_of_goods_sold_id,'description','HPP pengiriman '||NEW.movement_no,'debit',value_amount,'credit',0),
        jsonb_build_object('account_id',cfg.inventory_asset_id,'description','Pengurangan persediaan '||NEW.movement_no,'debit',0,'credit',value_amount)
      );
      journal_id := emit_accounting_journal(NEW.organization_id,'inventory_cogs',NEW.id,
        NEW.occurred_at::date,'HPP pengiriman '||NEW.movement_no,lines,NEW.posted_by);
    END IF;
  END IF;

  INSERT INTO inventory_valuation_entries (
    movement_id, organization_id, warehouse_id, product_id, lot_id, movement_type, quantity,
    unit_cost, total_value, journal_entry_id
  ) VALUES (
    NEW.id, NEW.organization_id, NEW.warehouse_id, NEW.product_id, NEW.lot_id, NEW.movement_type,
    NEW.quantity, NEW.unit_cost, value_amount, journal_id
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_apply_inventory_valuation ON stock_movements;
CREATE TRIGGER trg_apply_inventory_valuation
AFTER INSERT ON stock_movements
FOR EACH ROW EXECUTE FUNCTION apply_inventory_valuation();

-- Supplier bills tied to a PO clear the GR/IR accrual from received goods instead
-- of debiting purchase expense a second time. Unmatched bills remain expenses.
CREATE OR REPLACE FUNCTION post_supplier_bill_to_ledger()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  cfg accounting_config%ROWTYPE;
  po purchase_orders%ROWTYPE;
  receipt_row record;
  remaining_amount numeric(18,2);
  allocation_amount numeric(18,2);
  lines jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO cfg FROM accounting_config WHERE organization_id = NEW.organization_id;
  IF NOT FOUND OR cfg.accounts_payable_id IS NULL THEN
    RAISE EXCEPTION 'Pemetaan Utang wajib diatur sebelum faktur pemasok diposting';
  END IF;

  IF NEW.purchase_order_id IS NULL THEN
    IF cfg.purchase_expense_id IS NULL THEN
      RAISE EXCEPTION 'Pemetaan Pembelian wajib diatur untuk faktur tanpa PO';
    END IF;
    IF NEW.subtotal > 0 THEN
      lines := lines || jsonb_build_array(jsonb_build_object(
        'account_id',cfg.purchase_expense_id,'description','Pembelian faktur '||NEW.supplier_invoice_number,
        'debit',NEW.subtotal,'credit',0));
    END IF;
  ELSE
    SELECT * INTO po FROM purchase_orders
    WHERE id = NEW.purchase_order_id AND organization_id = NEW.organization_id
      AND supplier_id = NEW.supplier_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PO faktur tidak cocok dengan organisasi atau pemasok'; END IF;
    IF cfg.goods_received_not_invoiced_id IS NULL THEN
      RAISE EXCEPTION 'Pemetaan GR/IR wajib diatur untuk faktur terkait PO';
    END IF;
    remaining_amount := NEW.subtotal;
    PERFORM 1 FROM goods_receipts
      WHERE organization_id = NEW.organization_id AND purchase_order_id = NEW.purchase_order_id
        AND status = 'posted' FOR UPDATE;
    FOR receipt_row IN
      SELECT gr.id, greatest(0, round(sum(gri.line_total),2) -
        COALESCE((SELECT sum(app.amount) FROM inventory_grni_applications app
          WHERE app.goods_receipt_id = gr.id),0)) AS available_amount
      FROM goods_receipts gr
      JOIN goods_receipt_items gri ON gri.goods_receipt_id = gr.id
      WHERE gr.organization_id = NEW.organization_id AND gr.purchase_order_id = NEW.purchase_order_id
        AND gr.status = 'posted'
      GROUP BY gr.id, gr.received_at
      HAVING round(sum(gri.line_total),2) >
        COALESCE((SELECT sum(app.amount) FROM inventory_grni_applications app
          WHERE app.goods_receipt_id = gr.id),0)
      ORDER BY gr.received_at, gr.id
    LOOP
      EXIT WHEN remaining_amount <= 0;
      allocation_amount := least(remaining_amount, receipt_row.available_amount);
      IF allocation_amount > 0 THEN
        INSERT INTO inventory_grni_applications (
          organization_id, supplier_bill_id, goods_receipt_id, amount
        ) VALUES (NEW.organization_id, NEW.id, receipt_row.id, allocation_amount);
        remaining_amount := remaining_amount - allocation_amount;
      END IF;
    END LOOP;
    IF remaining_amount > 0 THEN
      RAISE EXCEPTION 'Nilai faktur melebihi nilai penerimaan PO yang belum ditagihkan (sisa %)', remaining_amount;
    END IF;
    IF NEW.subtotal > 0 THEN
      lines := lines || jsonb_build_array(jsonb_build_object(
        'account_id',cfg.goods_received_not_invoiced_id,'description','Clearing GR/IR faktur '||NEW.supplier_invoice_number,
        'debit',NEW.subtotal,'credit',0));
    END IF;
  END IF;

  IF NEW.tax_amount > 0 THEN
    IF cfg.input_tax_id IS NULL THEN RAISE EXCEPTION 'Pemetaan Pajak Masukan wajib diatur'; END IF;
    lines := lines || jsonb_build_array(jsonb_build_object(
      'account_id',cfg.input_tax_id,'description','Pajak masukan faktur '||NEW.supplier_invoice_number,
      'debit',NEW.tax_amount,'credit',0));
  END IF;
  lines := lines || jsonb_build_array(jsonb_build_object(
    'account_id',cfg.accounts_payable_id,'description','Utang faktur '||NEW.supplier_invoice_number,
    'debit',0,'credit',NEW.total_amount));
  PERFORM emit_accounting_journal(NEW.organization_id,'supplier_bill',NEW.id,NEW.invoice_date,
    'Posting faktur pemasok '||NEW.supplier_invoice_number,lines,NEW.posted_by);
  RETURN NEW;
END;
$$;


-- Valuation and GR/IR subledgers are append-only. Cost rows can only be changed
-- by the stock-movement trigger, never by an application-side direct UPDATE.
CREATE OR REPLACE FUNCTION guard_inventory_lot_cost_write()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() <= 1 THEN
    RAISE EXCEPTION 'Saldo valuasi lot hanya boleh berubah melalui pergerakan stok yang diposting';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_inventory_lot_cost_write ON inventory_lot_costs;
CREATE TRIGGER trg_guard_inventory_lot_cost_write
BEFORE INSERT OR UPDATE OR DELETE ON inventory_lot_costs
FOR EACH ROW EXECUTE FUNCTION guard_inventory_lot_cost_write();

CREATE OR REPLACE FUNCTION guard_inventory_subledger_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Subledger persediaan tidak dapat dihapus';
  END IF;
  RAISE EXCEPTION 'Subledger persediaan tidak dapat diubah';
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_inventory_valuation_immutable ON inventory_valuation_entries;
CREATE TRIGGER trg_guard_inventory_valuation_immutable
BEFORE INSERT OR UPDATE OR DELETE ON inventory_valuation_entries
FOR EACH ROW EXECUTE FUNCTION guard_inventory_subledger_immutable();
DROP TRIGGER IF EXISTS trg_guard_inventory_grni_immutable ON inventory_grni_applications;
CREATE TRIGGER trg_guard_inventory_grni_immutable
BEFORE INSERT OR UPDATE OR DELETE ON inventory_grni_applications
FOR EACH ROW EXECUTE FUNCTION guard_inventory_subledger_immutable();
