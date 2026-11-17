-- Quality inspection records and lot-level sales reservations.
CREATE TABLE IF NOT EXISTS quality_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  inspection_number text NOT NULL,
  lot_id uuid NOT NULL REFERENCES inventory_lots(id),
  result text NOT NULL CHECK (result IN ('released','quarantined','rejected','expired')),
  report_reference text,
  notes text NOT NULL CHECK (char_length(notes) >= 10),
  inspected_by uuid REFERENCES user_profiles(id),
  inspected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, inspection_number),
  CHECK (result <> 'released' OR (report_reference IS NOT NULL AND char_length(trim(report_reference)) >= 3 AND char_length(notes) >= 20))
);

CREATE TABLE IF NOT EXISTS sales_order_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  sales_order_id uuid NOT NULL REFERENCES sales_orders(id),
  sales_order_item_id uuid NOT NULL REFERENCES sales_order_items(id),
  inventory_balance_id uuid NOT NULL REFERENCES inventory_balances(id),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  product_id uuid NOT NULL REFERENCES products(id),
  lot_id uuid NOT NULL REFERENCES inventory_lots(id),
  quantity_reserved numeric NOT NULL CHECK (quantity_reserved > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sales_order_item_id, inventory_balance_id)
);

CREATE INDEX IF NOT EXISTS idx_quality_inspections_org_date
  ON quality_inspections (organization_id, inspected_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_allocations_order
  ON sales_order_allocations (sales_order_id);
CREATE INDEX IF NOT EXISTS idx_sales_allocations_balance
  ON sales_order_allocations (inventory_balance_id);
