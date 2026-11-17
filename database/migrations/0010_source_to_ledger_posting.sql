-- Organization-level account mapping and immutable source-to-ledger posting.
CREATE TABLE IF NOT EXISTS accounting_config (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  accounts_receivable_id uuid REFERENCES chart_of_accounts(id),
  accounts_payable_id uuid REFERENCES chart_of_accounts(id),
  sales_revenue_id uuid REFERENCES chart_of_accounts(id),
  purchase_expense_id uuid REFERENCES chart_of_accounts(id),
  output_tax_id uuid REFERENCES chart_of_accounts(id),
  input_tax_id uuid REFERENCES chart_of_accounts(id),
  cash_account_id uuid REFERENCES chart_of_accounts(id),
  bank_account_id uuid REFERENCES chart_of_accounts(id),
  updated_by uuid REFERENCES user_profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION validate_accounting_config()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  mapping record;
  expected_type text;
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
      ('bank_account_id', NEW.bank_account_id, 'asset')
    ) AS m(field_name, account_id, account_type)
  LOOP
    IF mapping.account_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM chart_of_accounts a
      WHERE a.id = mapping.account_id
        AND a.organization_id = NEW.organization_id
        AND a.account_type = mapping.account_type
        AND a.is_active = true
    ) THEN
      RAISE EXCEPTION 'Pemetaan akun % harus memakai akun aktif bertipe % milik organisasi ini',
        mapping.field_name, mapping.account_type;
    END IF;
  END LOOP;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_accounting_config ON accounting_config;
CREATE TRIGGER trg_validate_accounting_config
BEFORE INSERT OR UPDATE ON accounting_config
FOR EACH ROW EXECUTE FUNCTION validate_accounting_config();

CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_source_active
  ON journal_entries (organization_id, source_module, source_id)
  WHERE source_module IS NOT NULL AND source_id IS NOT NULL AND status <> 'reversed';

CREATE OR REPLACE FUNCTION emit_accounting_journal(
  p_org uuid,
  p_module text,
  p_source uuid,
  p_date date,
  p_description text,
  p_lines jsonb,
  p_actor uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  existing_id uuid;
  entry_id uuid;
  line_count integer;
  debit_total numeric(18,2);
  credit_total numeric(18,2);
BEGIN
  SELECT id INTO existing_id FROM journal_entries
  WHERE organization_id = p_org AND source_module = p_module
    AND source_id = p_source AND status <> 'reversed';
  IF existing_id IS NOT NULL THEN RETURN existing_id; END IF;

  SELECT count(*)::int, COALESCE(sum((x->>'debit')::numeric),0),
         COALESCE(sum((x->>'credit')::numeric),0)
    INTO line_count, debit_total, credit_total
  FROM jsonb_array_elements(p_lines) AS elem(value);

  IF line_count < 2 OR debit_total <= 0 OR debit_total <> credit_total THEN
    RAISE EXCEPTION 'Jurnal sumber % tidak seimbang atau tidak lengkap', p_module;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_lines) AS elem(value)
    LEFT JOIN chart_of_accounts a ON a.id = (elem.value->>'account_id')::uuid
    WHERE a.id IS NULL OR a.organization_id <> p_org OR a.is_active <> true
  ) THEN
    RAISE EXCEPTION 'Jurnal sumber memakai akun yang tidak aktif atau lintas organisasi';
  END IF;

  INSERT INTO journal_entries (
    organization_id, journal_number, journal_date, description,
    source_module, source_id, status, total_debit, total_credit,
    created_by
  ) VALUES (
    p_org,
    'AUTO-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),
    p_date, left(p_description,500), p_module, p_source, 'draft',
    debit_total, credit_total, p_actor
  ) RETURNING id INTO entry_id;

  INSERT INTO journal_lines (journal_entry_id, account_id, description, debit, credit)
  SELECT entry_id, (elem.value->>'account_id')::uuid, left(elem.value->>'description',180),
         (elem.value->>'debit')::numeric, (elem.value->>'credit')::numeric
  FROM jsonb_array_elements(p_lines) AS elem(value);

  UPDATE journal_entries SET status = 'posted', posted_by = p_actor
  WHERE id = entry_id;
  RETURN entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION post_invoice_to_ledger()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cfg accounting_config%ROWTYPE;
lines jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO cfg FROM accounting_config WHERE organization_id = NEW.organization_id;
  IF NOT FOUND OR cfg.accounts_receivable_id IS NULL OR cfg.sales_revenue_id IS NULL THEN
    RAISE EXCEPTION 'Pemetaan Piutang dan Pendapatan wajib diatur sebelum invoice diposting';
  END IF;
  lines := jsonb_build_array(jsonb_build_object('account_id',cfg.accounts_receivable_id,'description','Piutang invoice '||NEW.invoice_number,'debit',NEW.total_amount,'credit',0));
  IF NEW.subtotal > 0 THEN
    lines := lines || jsonb_build_array(jsonb_build_object('account_id',cfg.sales_revenue_id,'description','Pendapatan invoice '||NEW.invoice_number,'debit',0,'credit',NEW.subtotal));
  END IF;
  IF NEW.tax_amount > 0 THEN
    IF cfg.output_tax_id IS NULL THEN RAISE EXCEPTION 'Pemetaan Pajak Keluaran wajib diatur'; END IF;
    lines := lines || jsonb_build_array(jsonb_build_object(
      'account_id',cfg.output_tax_id,'description','Pajak keluaran invoice '||NEW.invoice_number,
      'debit',0,'credit',NEW.tax_amount
    ));
  END IF;
  PERFORM emit_accounting_journal(NEW.organization_id,'invoice',NEW.id,NEW.invoice_date,
    'Posting invoice '||NEW.invoice_number,lines,NULL);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_invoice_to_ledger ON invoices;
CREATE TRIGGER trg_post_invoice_to_ledger
AFTER UPDATE OF status ON invoices
FOR EACH ROW WHEN (OLD.status = 'draft' AND NEW.status = 'posted')
EXECUTE FUNCTION post_invoice_to_ledger();

CREATE OR REPLACE FUNCTION post_supplier_bill_to_ledger()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cfg accounting_config%ROWTYPE;
lines jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO cfg FROM accounting_config WHERE organization_id = NEW.organization_id;
  IF NOT FOUND OR cfg.accounts_payable_id IS NULL OR cfg.purchase_expense_id IS NULL THEN
    RAISE EXCEPTION 'Pemetaan Utang dan Pembelian wajib diatur sebelum faktur pemasok diposting';
  END IF;
  lines := jsonb_build_array(jsonb_build_object('account_id',cfg.accounts_payable_id,'description','Utang faktur '||NEW.supplier_invoice_number,'debit',0,'credit',NEW.total_amount));
  IF NEW.subtotal > 0 THEN
    lines := lines || jsonb_build_array(jsonb_build_object('account_id',cfg.purchase_expense_id,'description','Pembelian faktur '||NEW.supplier_invoice_number,'debit',NEW.subtotal,'credit',0));
  END IF;
  IF NEW.tax_amount > 0 THEN
    IF cfg.input_tax_id IS NULL THEN RAISE EXCEPTION 'Pemetaan Pajak Masukan wajib diatur'; END IF;
    lines := lines || jsonb_build_array(jsonb_build_object(
      'account_id',cfg.input_tax_id,'description','Pajak masukan faktur '||NEW.supplier_invoice_number,
      'debit',NEW.tax_amount,'credit',0
    ));
  END IF;
  PERFORM emit_accounting_journal(NEW.organization_id,'supplier_bill',NEW.id,NEW.invoice_date,
    'Posting faktur pemasok '||NEW.supplier_invoice_number,lines,NEW.posted_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_supplier_bill_to_ledger ON supplier_bills;
CREATE TRIGGER trg_post_supplier_bill_to_ledger
AFTER UPDATE OF status ON supplier_bills
FOR EACH ROW WHEN (OLD.status = 'draft' AND NEW.status = 'posted')
EXECUTE FUNCTION post_supplier_bill_to_ledger();

CREATE OR REPLACE FUNCTION post_supplier_payment_to_ledger()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cfg accounting_config%ROWTYPE;
DECLARE bill supplier_bills%ROWTYPE;
DECLARE credit_account uuid;
DECLARE lines jsonb;
BEGIN
  IF NEW.payment_type <> 'supplier_payment' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'settled' THEN RETURN NEW; END IF;
  SELECT * INTO cfg FROM accounting_config WHERE organization_id = NEW.organization_id;
  SELECT * INTO bill FROM supplier_bills WHERE id = NEW.supplier_bill_id
    AND organization_id = NEW.organization_id;
  IF NOT FOUND OR cfg.accounts_payable_id IS NULL THEN
    RAISE EXCEPTION 'Pemetaan Utang wajib diatur sebelum pembayaran pemasok';
  END IF;
  credit_account := CASE
    WHEN NEW.method IN ('bank_transfer','card','gateway') THEN cfg.bank_account_id
    WHEN NEW.method = 'cash' THEN cfg.cash_account_id
    ELSE NULL
  END;
  IF credit_account IS NULL THEN
    RAISE EXCEPTION 'Pemetaan akun Kas/Bank untuk metode pembayaran ini belum diatur';
  END IF;
  lines := jsonb_build_array(
    jsonb_build_object('account_id',cfg.accounts_payable_id,'description','Pelunasan faktur '||bill.supplier_invoice_number,'debit',NEW.amount,'credit',0),
    jsonb_build_object('account_id',credit_account,'description','Pembayaran pemasok '||NEW.payment_number,'debit',0,'credit',NEW.amount)
  );
  PERFORM emit_accounting_journal(NEW.organization_id,'supplier_payment',NEW.id,NEW.payment_date,
    'Pembayaran pemasok '||NEW.payment_number,lines,NULL);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_supplier_payment_to_ledger ON payments;
CREATE TRIGGER trg_post_supplier_payment_to_ledger
AFTER INSERT OR UPDATE OF status ON payments
FOR EACH ROW WHEN (NEW.status = 'settled' AND NEW.payment_type = 'supplier_payment')
EXECUTE FUNCTION post_supplier_payment_to_ledger();
