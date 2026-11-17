-- Public website inquiry intake. Additive migration; no existing records are modified.
CREATE TABLE IF NOT EXISTS customer_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  inquiry_type text NOT NULL CHECK (inquiry_type IN ('product_info','order','partnership','complaint','other')),
  contact_name text NOT NULL CHECK (char_length(contact_name) BETWEEN 2 AND 120),
  phone text NOT NULL CHECK (char_length(phone) BETWEEN 8 AND 24),
  email text,
  preferred_contact text NOT NULL DEFAULT 'whatsapp'
    CHECK (preferred_contact IN ('whatsapp','phone','email')),
  message text NOT NULL CHECK (char_length(message) BETWEEN 10 AND 2000),
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','assigned','contacted','qualified','converted','closed','spam')),
  consent_at timestamptz NOT NULL,
  source text NOT NULL DEFAULT 'public_website',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_inquiries_org_created
  ON customer_inquiries (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_inquiries_org_status
  ON customer_inquiries (organization_id, status, created_at DESC);
