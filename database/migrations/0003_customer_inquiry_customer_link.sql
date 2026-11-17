-- Link public customer inquiries to the customer master.
ALTER TABLE customer_inquiries
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id);

CREATE INDEX IF NOT EXISTS idx_customer_inquiries_customer
  ON customer_inquiries (organization_id, customer_id)
  WHERE customer_id IS NOT NULL;
