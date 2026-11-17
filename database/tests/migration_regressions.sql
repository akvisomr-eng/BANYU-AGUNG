-- PostgreSQL integration regression tests for the complete migration chain.
\set ON_ERROR_STOP on

DO $$
DECLARE
  org_a uuid := gen_random_uuid();
  org_b uuid := gen_random_uuid();
  supplier_a uuid := gen_random_uuid();
  supplier_b uuid := gen_random_uuid();
  bill_id uuid := gen_random_uuid();
  overpay_bill_id uuid := gen_random_uuid();
  journal_id uuid := gen_random_uuid();
  payment_id uuid;
  cash_account uuid := gen_random_uuid();
  payable_account uuid := gen_random_uuid();
  observed numeric(18,2);
  observed_status text;
BEGIN
  INSERT INTO organizations (id, legal_name, trade_name) VALUES
    (org_a, 'Banyu Agung Test A', 'Banyu Agung Test A'),
    (org_b, 'Banyu Agung Test B', 'Banyu Agung Test B');
  INSERT INTO suppliers (id, organization_id, supplier_code, name) VALUES
    (supplier_a, org_a, 'SUP-A', 'Supplier A'),
    (supplier_b, org_b, 'SUP-B', 'Supplier B');

  INSERT INTO supplier_bills (
    id, organization_id, supplier_id, supplier_invoice_number,
    invoice_date, subtotal, tax_amount, total_amount
  ) VALUES (
    bill_id, org_a, supplier_a, 'INV-AP-001',
    DATE '2026-11-01', 100, 11, 111
  );
  UPDATE supplier_bills SET status = 'posted' WHERE id = bill_id;

  INSERT INTO payments (
    organization_id, payment_number, payment_type, party_type, party_id,
    supplier_bill_id, payment_date, amount, method, status
  ) VALUES (
    org_a, 'PAY-AP-001', 'supplier_payment', 'supplier', supplier_a,
    bill_id, DATE '2026-11-02', 50, 'bank_transfer', 'draft'
  ) RETURNING id INTO payment_id;
  UPDATE payments SET status = 'settled' WHERE id = payment_id;
  SELECT paid_amount, status INTO observed, observed_status
    FROM supplier_bills WHERE id = bill_id;
  IF observed <> 50 OR observed_status <> 'partially_paid' THEN
    RAISE EXCEPTION 'Partial settlement regression: paid %, status %', observed, observed_status;
  END IF;

  BEGIN
    UPDATE payments SET reference_number = 'MUTATED' WHERE id = payment_id;
    RAISE EXCEPTION 'Settled supplier payment was unexpectedly mutable';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Settled supplier payment was unexpectedly mutable' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'Pembayaran settled tidak dapat diubah%' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE supplier_bills SET subtotal = 99 WHERE id = bill_id;
    RAISE EXCEPTION 'Posted supplier bill was unexpectedly mutable';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Posted supplier bill was unexpectedly mutable' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'Faktur pemasok yang sudah dibuat%' THEN RAISE; END IF;
  END;

  INSERT INTO payments (
    organization_id, payment_number, payment_type, party_type, party_id,
    supplier_bill_id, payment_date, amount, method, status
  ) VALUES (
    org_a, 'PAY-AP-002', 'supplier_payment', 'supplier', supplier_a,
    bill_id, DATE '2026-11-03', 61, 'cash', 'settled'
  );
  SELECT paid_amount, status INTO observed, observed_status
    FROM supplier_bills WHERE id = bill_id;
  IF observed <> 111 OR observed_status <> 'paid' THEN
    RAISE EXCEPTION 'Full settlement regression: paid %, status %', observed, observed_status;
  END IF;

  INSERT INTO supplier_bills (
    id, organization_id, supplier_id, supplier_invoice_number,
    invoice_date, subtotal, tax_amount, total_amount, status
  ) VALUES (
    overpay_bill_id, org_a, supplier_a, 'INV-AP-002',
    DATE '2026-11-01', 100, 0, 100, 'posted'
  );
  BEGIN
    INSERT INTO payments (
      organization_id, payment_number, payment_type, party_type, party_id,
      supplier_bill_id, payment_date, amount, method, status
    ) VALUES (
      org_a, 'PAY-AP-OVER', 'supplier_payment', 'supplier', supplier_a,
      overpay_bill_id, DATE '2026-11-04', 101, 'bank_transfer', 'settled'
    );
    RAISE EXCEPTION 'Overpayment was unexpectedly accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Overpayment was unexpectedly accepted' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'Pembayaran melebihi sisa utang%' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO payments (
      organization_id, payment_number, payment_type, party_type, party_id,
      supplier_bill_id, payment_date, amount, method, status
    ) VALUES (
      org_b, 'PAY-AP-CROSS', 'supplier_payment', 'supplier', supplier_b,
      bill_id, DATE '2026-11-04', 1, 'bank_transfer', 'settled'
    );
    RAISE EXCEPTION 'Cross-organization supplier bill payment was unexpectedly accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Cross-organization supplier bill payment was unexpectedly accepted' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'Faktur pemasok tidak cocok%' THEN RAISE; END IF;
  END;

  INSERT INTO chart_of_accounts (id, organization_id, account_code, account_name, account_type)
  VALUES
    (cash_account, org_a, '1101', 'Kas Test', 'asset'),
    (payable_account, org_a, '2101', 'Utang Test', 'liability');
  INSERT INTO journal_entries (
    id, organization_id, journal_number, journal_date, description, status
  ) VALUES (
    journal_id, org_a, 'JU-TEST-001', DATE '2026-11-01', 'Balanced journal regression', 'draft'
  );
  INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
  VALUES
    (journal_id, cash_account, 111, 0),
    (journal_id, payable_account, 0, 111);
  UPDATE journal_entries SET status = 'posted' WHERE id = journal_id;
  SELECT total_debit INTO observed FROM journal_entries WHERE id = journal_id;
  IF observed <> 111 THEN
    RAISE EXCEPTION 'Balanced journal totals were not calculated';
  END IF;
END $$;

DO $$
DECLARE
  org_id uuid := gen_random_uuid();
  account_a uuid := gen_random_uuid();
  account_b uuid := gen_random_uuid();
  journal_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO organizations (id, legal_name) VALUES (org_id, 'Unbalanced Journal Test');
  INSERT INTO chart_of_accounts (id, organization_id, account_code, account_name, account_type)
  VALUES
    (account_a, org_id, '1101', 'Kas', 'asset'),
    (account_b, org_id, '4101', 'Pendapatan', 'revenue');
  INSERT INTO journal_entries (id, organization_id, journal_number, journal_date, description)
  VALUES (journal_id, org_id, 'JU-TEST-002', DATE '2026-11-01', 'Unbalanced journal rejection');
  INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
  VALUES
    (journal_id, account_a, 100, 0),
    (journal_id, account_b, 0, 90);
  BEGIN
    UPDATE journal_entries SET status = 'posted' WHERE id = journal_id;
    RAISE EXCEPTION 'Unbalanced journal was unexpectedly posted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Unbalanced journal was unexpectedly posted' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'Jurnal tidak dapat diposting%' THEN RAISE; END IF;
  END;
END $$;
