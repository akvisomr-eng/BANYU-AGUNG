-- Delivery line traceability, allocation lifecycle and invoice line details.
ALTER TABLE sales_order_allocations
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'reserved'
  CHECK (status IN ('reserved','dispatched','released'));

CREATE TABLE IF NOT EXISTS delivery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  sales_order_item_id uuid NOT NULL REFERENCES sales_order_items(id),
  allocation_id uuid NOT NULL REFERENCES sales_order_allocations(id),
  product_id uuid NOT NULL REFERENCES products(id),
  lot_id uuid NOT NULL REFERENCES inventory_lots(id),
  quantity numeric NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (allocation_id)
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  sales_order_item_id uuid NOT NULL REFERENCES sales_order_items(id),
  product_id uuid NOT NULL REFERENCES products(id),
  description text NOT NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_price numeric NOT NULL CHECK (unit_price >= 0),
  discount_amount numeric NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_rate numeric NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  line_total numeric NOT NULL CHECK (line_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, sales_order_item_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_sales_order_unique
  ON invoices (sales_order_id) WHERE sales_order_id IS NOT NULL AND status <> 'void';
CREATE INDEX IF NOT EXISTS idx_delivery_items_delivery
  ON delivery_items (delivery_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice
  ON invoice_items (invoice_id);
