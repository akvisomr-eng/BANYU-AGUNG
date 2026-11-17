-- Controlled owner-only opening valuation for legacy inventory lots.
ALTER TABLE accounting_config
  ADD COLUMN IF NOT EXISTS inventory_opening_equity_id uuid REFERENCES chart_of_accounts(id);

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
      ('cost_of_goods_sold_id', NEW.cost_of_goods_sold_id, 'expense'),
      ('inventory_opening_equity_id', NEW.inventory_opening_equity_id, 'equity')
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

CREATE TABLE IF NOT EXISTS inventory_opening_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  product_id uuid NOT NULL REFERENCES products(id),
  lot_id uuid NOT NULL REFERENCES inventory_lots(id),
  quantity numeric(18,4) NOT NULL CHECK (quantity > 0),
  total_value numeric(18,2) NOT NULL CHECK (total_value > 0),
  journal_entry_id uuid REFERENCES journal_entries(id),
  posted_by uuid NOT NULL REFERENCES user_profiles(id),
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, product_id, lot_id)
);

CREATE OR REPLACE FUNCTION validate_inventory_opening_balance()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  cost_row inventory_lot_costs%ROWTYPE;
  actual_quantity numeric(18,4);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles p
    JOIN user_role_assignments a ON a.user_id = p.id
    JOIN roles r ON r.id = a.role_id
    WHERE p.id = NEW.posted_by AND p.organization_id = NEW.organization_id
      AND p.status = 'active' AND r.code = 'OWNER'
  ) THEN
    RAISE EXCEPTION 'Hanya OWNER aktif organisasi yang boleh mengesahkan saldo awal persediaan';
  END IF;
  SELECT * INTO cost_row FROM inventory_lot_costs
  WHERE organization_id = NEW.organization_id AND product_id = NEW.product_id
    AND lot_id = NEW.lot_id FOR UPDATE;
  IF NOT FOUND OR NOT cost_row.opening_balance_pending THEN
    RAISE EXCEPTION 'Lot tidak memiliki saldo awal yang menunggu rekonsiliasi';
  END IF;
  SELECT COALESCE(sum(quantity_on_hand),0) INTO actual_quantity
  FROM inventory_balances
  WHERE organization_id = NEW.organization_id AND product_id = NEW.product_id
    AND lot_id = NEW.lot_id;
  IF actual_quantity <= 0 OR NEW.quantity <> actual_quantity
     OR NEW.quantity <> cost_row.quantity_on_hand THEN
    RAISE EXCEPTION 'Kuantitas saldo awal tidak sama dengan stok aktual per gudang';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_validate_inventory_opening_balance ON inventory_opening_balances;
CREATE TRIGGER trg_validate_inventory_opening_balance
BEFORE INSERT ON inventory_opening_balances
FOR EACH ROW EXECUTE FUNCTION validate_inventory_opening_balance();

CREATE OR REPLACE FUNCTION post_inventory_opening_balance()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  cfg accounting_config%ROWTYPE;
  journal_id uuid;
  lines jsonb;
  changed integer;
BEGIN
  SELECT * INTO cfg FROM accounting_config WHERE organization_id = NEW.organization_id;
  IF NOT FOUND OR cfg.inventory_asset_id IS NULL OR cfg.inventory_opening_equity_id IS NULL THEN
    RAISE EXCEPTION 'Pemetaan Persediaan dan Ekuitas Saldo Awal wajib diatur';
  END IF;
  UPDATE inventory_lot_costs SET
    quantity_on_hand = NEW.quantity,
    carrying_value = NEW.total_value,
    opening_balance_pending = false,
    updated_at = now()
  WHERE organization_id = NEW.organization_id AND product_id = NEW.product_id
    AND lot_id = NEW.lot_id AND opening_balance_pending = true
    AND quantity_on_hand = NEW.quantity;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN
    RAISE EXCEPTION 'Saldo valuasi lot berubah; saldo awal tidak dapat diposting';
  END IF;
  lines := jsonb_build_array(
    jsonb_build_object('account_id',cfg.inventory_asset_id,'description','Saldo awal persediaan lot '||NEW.lot_id,'debit',NEW.total_value,'credit',0),
    jsonb_build_object('account_id',cfg.inventory_opening_equity_id,'description','Ekuitas saldo awal persediaan lot '||NEW.lot_id,'debit',0,'credit',NEW.total_value)
  );
  journal_id := emit_accounting_journal(NEW.organization_id,'inventory_opening_balance',NEW.id,
    CURRENT_DATE,'Pengakuan saldo awal persediaan lot '||NEW.lot_id,lines,NEW.posted_by);
  UPDATE inventory_opening_balances SET journal_entry_id=journal_id,posted_at=now()
  WHERE id=NEW.id;
  INSERT INTO audit_logs (organization_id,actor_user_id,action,entity_type,entity_id,after_data)
  VALUES(NEW.organization_id,NEW.posted_by,'POST_INVENTORY_OPENING_BALANCE',
    'inventory_opening_balance',NEW.id::text,
    jsonb_build_object('product_id',NEW.product_id,'lot_id',NEW.lot_id,
      'quantity',NEW.quantity,'total_value',NEW.total_value,'journal_entry_id',journal_id));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_post_inventory_opening_balance ON inventory_opening_balances;
CREATE TRIGGER trg_post_inventory_opening_balance
AFTER INSERT ON inventory_opening_balances
FOR EACH ROW EXECUTE FUNCTION post_inventory_opening_balance();

CREATE OR REPLACE FUNCTION guard_inventory_opening_balance_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE'
     AND pg_trigger_depth()>1
     AND OLD.journal_entry_id IS NULL AND NEW.journal_entry_id IS NOT NULL
     AND NEW.organization_id=OLD.organization_id
     AND NEW.product_id=OLD.product_id AND NEW.lot_id=OLD.lot_id
     AND NEW.quantity=OLD.quantity AND NEW.total_value=OLD.total_value
     AND NEW.posted_by=OLD.posted_by AND NEW.created_at=OLD.created_at
     AND NEW.posted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Dokumen saldo awal persediaan tidak dapat diubah atau dihapus';
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_inventory_opening_balance_immutable ON inventory_opening_balances;
CREATE TRIGGER trg_guard_inventory_opening_balance_immutable
BEFORE UPDATE OR DELETE ON inventory_opening_balances
FOR EACH ROW EXECUTE FUNCTION guard_inventory_opening_balance_immutable();
