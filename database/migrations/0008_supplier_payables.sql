CREATE TABLE IF NOT EXISTS supplier_bills (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 supplier_id uuid NOT NULL REFERENCES suppliers(id),
 purchase_order_id uuid REFERENCES purchase_orders(id),
 supplier_invoice_number text NOT NULL,
 invoice_date date NOT NULL,
 due_date date,
 subtotal numeric(18,2) NOT NULL CHECK(subtotal>=0),
 tax_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK(tax_amount>=0),
 total_amount numeric(18,2) NOT NULL CHECK(total_amount>0),
 paid_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK(paid_amount>=0 AND paid_amount<=total_amount),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','posted','partially_paid','paid','void')),
 created_by uuid REFERENCES user_profiles(id),
 posted_by uuid REFERENCES user_profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,supplier_id,supplier_invoice_number),
 CHECK(due_date IS NULL OR due_date>=invoice_date),
 CHECK(total_amount=subtotal+tax_amount)
);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS supplier_bill_id uuid REFERENCES supplier_bills(id);
CREATE INDEX IF NOT EXISTS idx_supplier_bills_org_status_due ON supplier_bills(organization_id,status,due_date);
CREATE INDEX IF NOT EXISTS idx_supplier_bills_supplier ON supplier_bills(supplier_id,invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_supplier_bill ON payments(supplier_bill_id,payment_date DESC);
CREATE OR REPLACE FUNCTION validate_supplier_bill_payment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b supplier_bills%ROWTYPE;
BEGIN
 IF NEW.payment_type='supplier_payment' THEN
  IF NEW.supplier_bill_id IS NULL THEN RAISE EXCEPTION 'Pembayaran harus terkait faktur pemasok'; END IF;
  SELECT * INTO b FROM supplier_bills WHERE id=NEW.supplier_bill_id FOR UPDATE;
  IF NOT FOUND OR b.organization_id<>NEW.organization_id OR b.supplier_id<>NEW.party_id OR NEW.party_type<>'supplier'
    THEN RAISE EXCEPTION 'Faktur pemasok tidak cocok dengan organisasi atau pemasok'; END IF;
  IF b.status NOT IN ('posted','partially_paid') THEN RAISE EXCEPTION 'Faktur harus diposting sebelum dibayar'; END IF;
  IF NEW.status='settled' AND b.paid_amount+NEW.amount>b.total_amount THEN RAISE EXCEPTION 'Pembayaran melebihi sisa utang'; END IF;
 ELSIF NEW.supplier_bill_id IS NOT NULL THEN RAISE EXCEPTION 'Referensi faktur hanya untuk pembayaran pemasok';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validate_supplier_bill_payment ON payments;
CREATE TRIGGER trg_validate_supplier_bill_payment BEFORE INSERT ON payments FOR EACH ROW EXECUTE FUNCTION validate_supplier_bill_payment();
CREATE OR REPLACE FUNCTION apply_supplier_bill_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.payment_type='supplier_payment' AND NEW.status='settled' THEN
  UPDATE supplier_bills SET paid_amount=paid_amount+NEW.amount,
   status=CASE WHEN paid_amount+NEW.amount>=total_amount THEN 'paid' ELSE 'partially_paid' END
  WHERE id=NEW.supplier_bill_id;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_apply_supplier_bill_payment ON payments;
CREATE TRIGGER trg_apply_supplier_bill_payment AFTER INSERT ON payments FOR EACH ROW EXECUTE FUNCTION apply_supplier_bill_payment();
CREATE OR REPLACE FUNCTION protect_settled_supplier_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.payment_type='supplier_payment' AND OLD.status='settled' THEN RAISE EXCEPTION 'Pembayaran settled tidak dapat diubah atau dihapus'; END IF;
 RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_protect_supplier_bill_update ON supplier_bills;
DROP TRIGGER IF EXISTS trg_protect_supplier_payment_update ON payments;
CREATE TRIGGER trg_protect_supplier_payment_update BEFORE UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION protect_settled_supplier_payment();
CREATE OR REPLACE FUNCTION prevent_paid_supplier_bill_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.paid_amount>0 THEN RAISE EXCEPTION 'Faktur yang telah dibayar tidak dapat dihapus'; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER trg_prevent_paid_supplier_bill_delete BEFORE DELETE ON supplier_bills FOR EACH ROW EXECUTE FUNCTION prevent_paid_supplier_bill_delete();
