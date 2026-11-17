-- Finance foundation hardening: tenant-safe journal lines and balanced posting.
CREATE INDEX IF NOT EXISTS idx_journal_entries_org_date
  ON journal_entries (organization_id, journal_date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_entries_org_status
  ON journal_entries (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account
  ON journal_lines (account_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org_status_due
  ON invoices (organization_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_payments_org_date_status
  ON payments (organization_id, payment_date DESC, status);

CREATE OR REPLACE FUNCTION enforce_journal_line_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  entry_org uuid;
  account_org uuid;
  entry_status text;
BEGIN
  SELECT organization_id, status INTO entry_org, entry_status
  FROM journal_entries WHERE id = NEW.journal_entry_id;
  SELECT organization_id INTO account_org
  FROM chart_of_accounts WHERE id = NEW.account_id;

  IF entry_org IS NULL OR account_org IS NULL OR entry_org <> account_org THEN
    RAISE EXCEPTION 'Akun dan jurnal harus berada dalam organisasi yang sama';
  END IF;
  IF entry_status <> 'draft' THEN
    RAISE EXCEPTION 'Baris jurnal hanya dapat diubah saat jurnal berstatus draft';
  END IF;
  IF NEW.debit < 0 OR NEW.credit < 0 OR
     NOT ((NEW.debit > 0 AND NEW.credit = 0) OR (NEW.credit > 0 AND NEW.debit = 0)) THEN
    RAISE EXCEPTION 'Setiap baris harus memiliki debit atau kredit positif, bukan keduanya';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_line_scope ON journal_lines;
CREATE TRIGGER trg_journal_line_scope
BEFORE INSERT OR UPDATE ON journal_lines
FOR EACH ROW EXECUTE FUNCTION enforce_journal_line_scope();

CREATE OR REPLACE FUNCTION enforce_balanced_journal_posting()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  line_count integer;
  debit_total numeric(20,2);
  credit_total numeric(20,2);
BEGIN
  IF NEW.status = 'posted' AND OLD.status <> 'posted' THEN
    SELECT count(*), COALESCE(sum(debit),0), COALESCE(sum(credit),0)
      INTO line_count, debit_total, credit_total
    FROM journal_lines WHERE journal_entry_id = NEW.id;
    IF line_count < 2 OR debit_total <= 0 OR debit_total <> credit_total THEN
      RAISE EXCEPTION 'Jurnal tidak dapat diposting: minimal dua baris dan total debit harus sama dengan kredit';
    END IF;
    NEW.total_debit := debit_total;
    NEW.total_credit := credit_total;
    NEW.posted_at := COALESCE(NEW.posted_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_balanced_posting ON journal_entries;
CREATE TRIGGER trg_journal_balanced_posting
BEFORE UPDATE OF status ON journal_entries
FOR EACH ROW EXECUTE FUNCTION enforce_balanced_journal_posting();
