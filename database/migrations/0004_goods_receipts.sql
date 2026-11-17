-- Auditable, line-level goods receipt records for purchase order receiving.
CREATE TABLE IF NOT EXISTS goods_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  receipt_number text NOT NULL,
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  received_at timestamptz NOT NULL DEFAULT now(),
  received_by uuid REFERENCES user_profiles(id),
  notes text,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','void')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, receipt_number)
);

CREATE TABLE IF NOT EXISTS goods_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_receipt_id uuid NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  purchase_order_item_id uuid NOT NULL REFERENCES purchase_order_items(id),
  product_id uuid NOT NULL REFERENCES products(id),
  lot_id uuid NOT NULL REFERENCES inventory_lots(id),
  quantity_received numeric NOT NULL CHECK (quantity_received > 0),
  unit_cost numeric NOT NULL CHECK (unit_cost >= 0),
  line_total numeric NOT NULL CHECK (line_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_goods_receipts_org_date
  ON goods_receipts (organization_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_goods_receipt_items_po_item
  ON goods_receipt_items (purchase_order_item_id);
