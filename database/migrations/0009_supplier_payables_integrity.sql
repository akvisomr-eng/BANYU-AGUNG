-- Harden supplier payable lifecycle and ensure settlement updates are applied exactly once.
CREATE OR REPLACE FUNCTION validate_supplier_bill_payment()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  bill supplier_bills%ROWTYPE;
BEGIN
  IF NEW.payment_type = 'supplier_payment' THEN
    IF NEW.supplier_bill_id IS NULL THEN
      RAISE EXCEPTION 'Pembayaran harus terkait faktur pemasok';
    END IF;

    SELECT * INTO bill
    FROM supplier_bills
    WHERE id = NEW.supplier_bill_id
    FOR UPDATE;

    IF NOT FOUND
       OR bill.organization_id <> NEW.organization_id
       OR bill.supplier_id <> NEW.party_id
       OR NEW.party_type <> 'supplier' THEN
      RAISE EXCEPTION 'Faktur pemasok tidak cocok dengan organisasi atau pemasok';
    END IF;

    IF bill.status NOT IN ('posted', 'partially_paid') THEN
      RAISE EXCEPTION 'Faktur harus diposting sebelum dibayar';
    END IF;

    IF NEW.status = 'settled'
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'settled')
       AND bill.paid_amount + NEW.amount > bill.total_amount THEN
      RAISE EXCEPTION 'Pembayaran melebihi sisa utang';
    END IF;
  ELSIF NEW.supplier_bill_id IS NOT NULL THEN
    RAISE EXCEPTION 'Referensi faktur hanya untuk pembayaran pemasok';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_supplier_bill_payment ON payments;
CREATE TRIGGER trg_validate_supplier_bill_payment
BEFORE INSERT OR UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION validate_supplier_bill_payment();

CREATE OR REPLACE FUNCTION apply_supplier_bill_payment()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.payment_type = 'supplier_payment'
     AND NEW.status = 'settled'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'settled') THEN
    UPDATE supplier_bills
    SET paid_amount = paid_amount + NEW.amount,
        status = CASE
          WHEN paid_amount + NEW.amount >= total_amount THEN 'paid'
          ELSE 'partially_paid'
        END
    WHERE id = NEW.supplier_bill_id
      AND organization_id = NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_supplier_bill_payment ON payments;
CREATE TRIGGER trg_apply_supplier_bill_payment
AFTER INSERT OR UPDATE OF status, amount ON payments
FOR EACH ROW EXECUTE FUNCTION apply_supplier_bill_payment();

CREATE OR REPLACE FUNCTION protect_settled_supplier_payment()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.payment_type = 'supplier_payment' AND OLD.status = 'settled' THEN
    RAISE EXCEPTION 'Pembayaran settled tidak dapat diubah atau dihapus';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_supplier_payment_update ON payments;
CREATE TRIGGER trg_protect_supplier_payment_update
BEFORE UPDATE OR DELETE ON payments
FOR EACH ROW EXECUTE FUNCTION protect_settled_supplier_payment();

CREATE OR REPLACE FUNCTION protect_supplier_bill_lifecycle()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' OR OLD.paid_amount > 0 THEN
      RAISE EXCEPTION 'Hanya faktur draft yang boleh dihapus';
    END IF;
    RETURN OLD;
  END IF;

  -- The nested update is performed only by apply_supplier_bill_payment().
  IF pg_trigger_depth() > 1
     AND NEW.organization_id = OLD.organization_id
     AND NEW.supplier_id = OLD.supplier_id
     AND NEW.purchase_order_id IS NOT DISTINCT FROM OLD.purchase_order_id
     AND NEW.supplier_invoice_number = OLD.supplier_invoice_number
     AND NEW.invoice_date = OLD.invoice_date
     AND NEW.due_date IS NOT DISTINCT FROM OLD.due_date
     AND NEW.subtotal = OLD.subtotal
     AND NEW.tax_amount = OLD.tax_amount
     AND NEW.total_amount = OLD.total_amount
     AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
     AND NEW.posted_by IS NOT DISTINCT FROM OLD.posted_by
     AND NEW.paid_amount >= OLD.paid_amount
     AND NEW.paid_amount <= NEW.total_amount
     AND NEW.status = CASE
       WHEN NEW.paid_amount >= NEW.total_amount THEN 'paid'
       WHEN NEW.paid_amount > 0 THEN 'partially_paid'
       ELSE OLD.status
     END THEN
    RETURN NEW;
  END IF;

  -- Posting is the only direct mutation permitted after draft creation.
  IF OLD.status = 'draft'
     AND NEW.status = 'posted'
     AND OLD.paid_amount = 0
     AND NEW.paid_amount = 0
     AND OLD.posted_by IS NULL
     AND NEW.posted_by IS NOT NULL
     AND NEW.organization_id = OLD.organization_id
     AND NEW.supplier_id = OLD.supplier_id
     AND NEW.purchase_order_id IS NOT DISTINCT FROM OLD.purchase_order_id
     AND NEW.supplier_invoice_number = OLD.supplier_invoice_number
     AND NEW.invoice_date = OLD.invoice_date
     AND NEW.due_date IS NOT DISTINCT FROM OLD.due_date
     AND NEW.subtotal = OLD.subtotal
     AND NEW.tax_amount = OLD.tax_amount
     AND NEW.total_amount = OLD.total_amount
     AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Faktur pemasok yang sudah dibuat tidak dapat diubah di luar alur posting dan pembayaran';
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_supplier_bill_lifecycle ON supplier_bills;
CREATE TRIGGER trg_protect_supplier_bill_lifecycle
BEFORE UPDATE OR DELETE ON supplier_bills
FOR EACH ROW EXECUTE FUNCTION protect_supplier_bill_lifecycle();
