-- BANYU AGUNG ERP foundation schema
-- PostgreSQL / Neon. Apply through a reviewed migration workflow.
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name text NOT NULL,
  trade_name text NOT NULL DEFAULT 'BANYU AGUNG',
  legal_identifier text,
  email text,
  phone text,
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  timezone text NOT NULL DEFAULT 'Asia/Jakarta',
  currency char(3) NOT NULL DEFAULT 'IDR',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  code text NOT NULL,
  name text NOT NULL,
  site_type text NOT NULL CHECK (site_type IN ('office','factory','warehouse','distribution','source')),
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);
CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  parent_id uuid REFERENCES departments(id),
  code text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (organization_id, code)
);
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  UNIQUE (organization_id, code)
);
CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  module text NOT NULL,
  description text NOT NULL
);
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  auth_subject text NOT NULL UNIQUE,
  employee_id uuid,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','suspended','disabled')),
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email)
);
CREATE TABLE IF NOT EXISTS user_role_assignments (
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id),
  site_id uuid REFERENCES sites(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id, site_id)
);
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  customer_code text NOT NULL,
  customer_type text NOT NULL DEFAULT 'retail' CHECK (customer_type IN ('retail','wholesale','reseller','distributor','institutional')),
  name text NOT NULL,
  tax_identifier text,
  phone text,
  email text,
  billing_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  shipping_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  credit_limit numeric(18,2) NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
  payment_terms_days integer NOT NULL DEFAULT 0 CHECK (payment_terms_days >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('prospect','active','blocked','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, customer_code)
);
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  supplier_code text NOT NULL,
  name text NOT NULL,
  supplier_type text NOT NULL DEFAULT 'general',
  tax_identifier text,
  contact_name text,
  phone text,
  email text,
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  payment_terms_days integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, supplier_code)
);
CREATE TABLE IF NOT EXISTS units_of_measure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  code text NOT NULL,
  name text NOT NULL,
  dimension text NOT NULL,
  UNIQUE (organization_id, code)
);
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  sku text NOT NULL,
  name text NOT NULL,
  description text,
  product_type text NOT NULL CHECK (product_type IN ('finished_good','raw_material','packaging','spare_part','service')),
  base_unit_id uuid REFERENCES units_of_measure(id),
  barcode text,
  net_content_ml integer,
  shelf_life_days integer,
  is_returnable_packaging boolean NOT NULL DEFAULT false,
  is_sellable boolean NOT NULL DEFAULT false,
  is_purchasable boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, sku)
);
CREATE TABLE IF NOT EXISTS product_boms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  product_id uuid NOT NULL REFERENCES products(id),
  version text NOT NULL,
  output_quantity numeric(18,4) NOT NULL CHECK (output_quantity > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','retired')),
  effective_from date,
  effective_to date,
  approved_by uuid REFERENCES user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, product_id, version)
);
CREATE TABLE IF NOT EXISTS product_bom_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id uuid NOT NULL REFERENCES product_boms(id) ON DELETE CASCADE,
  component_product_id uuid NOT NULL REFERENCES products(id),
  quantity numeric(18,4) NOT NULL CHECK (quantity > 0),
  scrap_factor numeric(8,5) NOT NULL DEFAULT 0 CHECK (scrap_factor >= 0),
  UNIQUE (bom_id, component_product_id)
);
CREATE TABLE IF NOT EXISTS warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  site_id uuid NOT NULL REFERENCES sites(id),
  code text NOT NULL,
  name text NOT NULL,
  warehouse_type text NOT NULL CHECK (warehouse_type IN ('raw_material','packaging','work_in_progress','finished_goods','quarantine','returns')),
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (organization_id, code)
);
CREATE TABLE IF NOT EXISTS inventory_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  product_id uuid NOT NULL REFERENCES products(id),
  lot_code text NOT NULL,
  supplier_id uuid REFERENCES suppliers(id),
  received_at timestamptz,
  manufactured_at date,
  expires_at date,
  quality_status text NOT NULL DEFAULT 'pending' CHECK (quality_status IN ('pending','released','quarantined','rejected','expired')),
  source_document text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, lot_code, product_id)
);
CREATE TABLE IF NOT EXISTS inventory_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  product_id uuid NOT NULL REFERENCES products(id),
  lot_id uuid REFERENCES inventory_lots(id),
  quantity_on_hand numeric(18,4) NOT NULL DEFAULT 0,
  quantity_reserved numeric(18,4) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (quantity_on_hand >= 0 AND quantity_reserved >= 0 AND quantity_reserved <= quantity_on_hand),
  UNIQUE NULLS NOT DISTINCT (warehouse_id, product_id, lot_id)
);
CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  movement_no text NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('receipt','issue','transfer_in','transfer_out','adjustment_in','adjustment_out','production_consume','production_output','sales_pick','sales_return')),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  product_id uuid NOT NULL REFERENCES products(id),
  lot_id uuid REFERENCES inventory_lots(id),
  quantity numeric(18,4) NOT NULL CHECK (quantity > 0),
  unit_cost numeric(18,4),
  reference_type text,
  reference_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  posted_by uuid REFERENCES user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, movement_no)
);
CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  site_id uuid NOT NULL REFERENCES sites(id),
  po_number text NOT NULL,
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  order_date date NOT NULL DEFAULT current_date,
  expected_date date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','partially_received','received','cancelled')),
  subtotal numeric(18,2) NOT NULL DEFAULT 0,
  tax_amount numeric(18,2) NOT NULL DEFAULT 0,
  total_amount numeric(18,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES user_profiles(id),
  approved_by uuid REFERENCES user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, po_number)
);
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  quantity_ordered numeric(18,4) NOT NULL CHECK (quantity_ordered > 0),
  quantity_received numeric(18,4) NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  unit_price numeric(18,4) NOT NULL CHECK (unit_price >= 0),
  tax_rate numeric(8,5) NOT NULL DEFAULT 0,
  line_total numeric(18,2) NOT NULL
);
CREATE TABLE IF NOT EXISTS production_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  site_id uuid NOT NULL REFERENCES sites(id),
  code text NOT NULL,
  name text NOT NULL,
  nominal_capacity_per_hour numeric(18,4),
  capacity_unit_id uuid REFERENCES units_of_measure(id),
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (organization_id, code)
);
CREATE TABLE IF NOT EXISTS production_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  batch_number text NOT NULL,
  product_id uuid NOT NULL REFERENCES products(id),
  bom_id uuid REFERENCES product_boms(id),
  production_line_id uuid REFERENCES production_lines(id),
  planned_quantity numeric(18,4) NOT NULL CHECK (planned_quantity > 0),
  produced_quantity numeric(18,4) NOT NULL DEFAULT 0,
  rejected_quantity numeric(18,4) NOT NULL DEFAULT 0,
  planned_start timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','released','in_progress','quality_hold','completed','cancelled')),
  quality_status text NOT NULL DEFAULT 'pending' CHECK (quality_status IN ('pending','released','rejected')),
  supervisor_id uuid REFERENCES user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, batch_number)
);
CREATE TABLE IF NOT EXISTS production_batch_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES production_batches(id),
  product_id uuid NOT NULL REFERENCES products(id),
  lot_id uuid REFERENCES inventory_lots(id),
  quantity_consumed numeric(18,4) NOT NULL CHECK (quantity_consumed > 0)
);
CREATE TABLE IF NOT EXISTS qa_parameters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  code text NOT NULL,
  name text NOT NULL,
  unit text,
  method_reference text,
  standard_reference text,
  min_value numeric(18,6),
  max_value numeric(18,6),
  is_critical boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (organization_id, code)
);
CREATE TABLE IF NOT EXISTS qa_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  test_number text NOT NULL,
  sample_type text NOT NULL CHECK (sample_type IN ('source','incoming','process','finished_product','environment')),
  sample_point text NOT NULL,
  sampled_at timestamptz NOT NULL,
  sampled_by uuid REFERENCES user_profiles(id),
  batch_id uuid REFERENCES production_batches(id),
  lot_id uuid REFERENCES inventory_lots(id),
  laboratory_name text,
  laboratory_accreditation text,
  report_reference text,
  report_file_url text,
  reviewed_by uuid REFERENCES user_profiles(id),
  reviewed_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','testing','review','passed','failed','invalid')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, test_number)
);
CREATE TABLE IF NOT EXISTS qa_test_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qa_test_id uuid NOT NULL REFERENCES qa_tests(id) ON DELETE CASCADE,
  parameter_id uuid NOT NULL REFERENCES qa_parameters(id),
  result_numeric numeric(18,6),
  result_text text,
  result_unit text,
  method_used text,
  within_limit boolean,
  remarks text,
  UNIQUE (qa_test_id, parameter_id)
);
CREATE TABLE IF NOT EXISTS sales_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  site_id uuid NOT NULL REFERENCES sites(id),
  order_number text NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id),
  order_date timestamptz NOT NULL DEFAULT now(),
  requested_delivery_date date,
  channel text NOT NULL DEFAULT 'direct',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','allocated','picking','dispatched','delivered','invoiced','cancelled','returned')),
  subtotal numeric(18,2) NOT NULL DEFAULT 0,
  discount_amount numeric(18,2) NOT NULL DEFAULT 0,
  tax_amount numeric(18,2) NOT NULL DEFAULT 0,
  total_amount numeric(18,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES user_profiles(id),
  approved_by uuid REFERENCES user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, order_number)
);
CREATE TABLE IF NOT EXISTS sales_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  quantity numeric(18,4) NOT NULL CHECK (quantity > 0),
  unit_price numeric(18,4) NOT NULL CHECK (unit_price >= 0),
  discount_amount numeric(18,2) NOT NULL DEFAULT 0,
  tax_rate numeric(8,5) NOT NULL DEFAULT 0,
  line_total numeric(18,2) NOT NULL
);
CREATE TABLE IF NOT EXISTS deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  delivery_number text NOT NULL,
  sales_order_id uuid NOT NULL REFERENCES sales_orders(id),
  planned_date date,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  vehicle_plate text,
  driver_name text,
  proof_of_delivery_url text,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','picked','dispatched','delivered','failed','returned')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, delivery_number)
);
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  invoice_number text NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id),
  sales_order_id uuid REFERENCES sales_orders(id),
  invoice_date date NOT NULL DEFAULT current_date,
  due_date date,
  subtotal numeric(18,2) NOT NULL DEFAULT 0,
  tax_amount numeric(18,2) NOT NULL DEFAULT 0,
  total_amount numeric(18,2) NOT NULL DEFAULT 0,
  paid_amount numeric(18,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','partially_paid','paid','void','overdue')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, invoice_number)
);
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  payment_number text NOT NULL,
  payment_type text NOT NULL CHECK (payment_type IN ('customer_receipt','supplier_payment','refund','other')),
  party_type text,
  party_id uuid,
  payment_date date NOT NULL DEFAULT current_date,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('cash','bank_transfer','card','gateway','other')),
  reference_number text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','settled','void')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, payment_number)
);
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  account_code text NOT NULL,
  account_name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
  parent_id uuid REFERENCES chart_of_accounts(id),
  is_control_account boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (organization_id, account_code)
);
CREATE TABLE IF NOT EXISTS journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  journal_number text NOT NULL,
  journal_date date NOT NULL,
  description text NOT NULL,
  source_module text,
  source_id uuid,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','reversed')),
  total_debit numeric(18,2) NOT NULL DEFAULT 0,
  total_credit numeric(18,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES user_profiles(id),
  posted_by uuid REFERENCES user_profiles(id),
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, journal_number)
);
CREATE TABLE IF NOT EXISTS journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES chart_of_accounts(id),
  description text,
  debit numeric(18,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric(18,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);
CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  employee_number text NOT NULL,
  full_name text NOT NULL,
  department_id uuid REFERENCES departments(id),
  site_id uuid REFERENCES sites(id),
  job_title text,
  employment_type text,
  hire_date date,
  employment_status text NOT NULL DEFAULT 'active' CHECK (employment_status IN ('active','leave','resigned','terminated')),
  phone text,
  email text,
  emergency_contact jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, employee_number)
);
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_employee_id_fkey;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id);
CREATE TABLE IF NOT EXISTS attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  employee_id uuid NOT NULL REFERENCES employees(id),
  work_date date NOT NULL,
  check_in timestamptz,
  check_out timestamptz,
  attendance_status text NOT NULL CHECK (attendance_status IN ('present','late','absent','leave','sick','off')),
  source text NOT NULL DEFAULT 'manual',
  approved_by uuid REFERENCES user_profiles(id),
  notes text,
  UNIQUE (employee_id, work_date)
);
CREATE TABLE IF NOT EXISTS leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  employee_id uuid NOT NULL REFERENCES employees(id),
  leave_type text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','rejected','cancelled')),
  approver_id uuid REFERENCES user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  asset_code text NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  site_id uuid REFERENCES sites(id),
  acquired_at date,
  acquisition_cost numeric(18,2),
  useful_life_months integer,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','maintenance','disposed','inactive')),
  serial_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, asset_code)
);
CREATE TABLE IF NOT EXISTS maintenance_work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  asset_id uuid NOT NULL REFERENCES assets(id),
  work_order_number text NOT NULL,
  maintenance_type text NOT NULL CHECK (maintenance_type IN ('preventive','corrective','inspection')),
  scheduled_at timestamptz,
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','completed','cancelled')),
  description text NOT NULL,
  cost numeric(18,2) NOT NULL DEFAULT 0,
  UNIQUE (organization_id, work_order_number)
);
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  document_type text NOT NULL,
  document_number text,
  title text NOT NULL,
  file_url text NOT NULL,
  issued_at date,
  expires_at date,
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','rejected','expired')),
  verified_by uuid REFERENCES user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  actor_user_id uuid REFERENCES user_profiles(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  ip_address inet,
  user_agent text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_orders_customer_date ON sales_orders(customer_id, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_production_batches_status ON production_batches(organization_id, status, planned_start);
CREATE INDEX IF NOT EXISTS idx_inventory_lots_expiry ON inventory_lots(organization_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_date ON stock_movements(product_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_qa_tests_batch ON qa_tests(batch_id, sampled_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_status ON invoices(customer_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(organization_id, entity_type, entity_id, occurred_at DESC);
