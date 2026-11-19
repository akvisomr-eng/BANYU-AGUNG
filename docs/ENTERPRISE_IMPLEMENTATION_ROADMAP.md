# BANYU AGUNG — Enterprise Implementation Roadmap

This is a delivery sequence and readiness ledger. A module marked "existing foundation" is not automatically production-ready; workflows, permissions, controls, reconciliation and user acceptance must still be validated.

## Phase 0 — Foundation and governance
- Confirm legal entity, org/site model, fiscal calendar, role matrix, permission catalog, audit policy and approval thresholds.
- Establish migration discipline, QA branch, backup/restore drill, deployment gates and incident runbooks.
- Build master-data governance, import staging, validation, dry-run and approval.

## Phase 1 — Master data & corporate administration
- Corporate: legal entities, sites, branches, departments, cost/profit centers.
- Product: categories, SKU, pack configuration, UOM conversion, BOM/recipe versions, tax class, barcode, shelf-life and status.
- Customer/supplier: addresses, contacts, channel, payment terms, credit policy, tax data, bank data with dual control, qualification and document expiry.
- Warehouse: zone/bin, storage conditions, quarantine, returns, FEFO/FIFO, transfer policy.
- HR: employee, job, grade, shift, contract and pay-component master.
- Finance: COA hierarchy, fiscal periods, bank, tax code, cost center, asset class, budget version.

## Phase 2 — Commercial ERP and CRM
- Lead, account, contact, opportunity, quotation, price list and approval.
- Sales order, ATP/credit check, allocation, picking, dispatch, POD, invoice, receipt and return.
- Procurement request, RFQ, supplier evaluation, PO, receipt, incoming QC and 3-way match.
- Customer service, complaint, subscription, reorder and gallon deposit/return.

## Phase 3 — Warehouse, production and quality
- WMS bins, putaway, replenishment, wave pick, count, adjustment and warehouse transfer.
- Lot/serial/expiry traceability and genealogy from raw materials/packaging through finished batch to customer.
- MPS/MRP, work orders, routing, shift output, consumption, yield, scrap, downtime and OEE.
- Sampling, lab data, specification version, quarantine/release/reject, CAPA, calibration and recall.
- No finished batch available for dispatch without authorized QA release and required compliance evidence.

## Phase 4 — Accounting, treasury and controlling
- GL, AP, AR, cash/bank, payment allocations, reconciliation, period close and financial statements.
- Automated journals from validated operational events with source IDs and idempotency.
- Inventory valuation, landed cost, standard/actual production cost and variance.
- Tax configuration, fixed assets/depreciation, budgets, cost centers and profitability analytics.
- Reconcile inventory subledger to GL, AR/AP subledgers to control accounts and cashbook to bank.

## Phase 5 — HRD, payroll and employee self-service
- Employee lifecycle, recruitment, contracts, organization, attendance, shift, overtime, leave, training and K3.
- Payroll components, calculation rules, BPJS/PPh21 configuration reviewed by qualified HR/tax professionals, payroll preview, maker-checker, payslips, bank export and GL posting.
- ESS portal, restricted documents, privacy controls, payroll audit and correction runs.
- Validate calculations against approved sample cases and current statutory rules before first live payroll.

## Phase 6 — Corporate control tower and AI
- Executive BI, budget, scenario, risk and compliance dashboard.
- AI read-only copilots for finance, sales, procurement, QA, production, HR and SRE.
- Evidence citations, per-agent permission, model/provider budget, tool allowlist, approval inbox, audit, evaluation and kill switch.
- Controlled reversible actions after safety/security tests; no AI batch release, payment, payroll approval, journal posting or production deployment.

## Existing production database foundations (verified 19 Nov 2026)
Current schema includes:
- Organization and access: organizations, user_profiles, roles, permissions, role_permissions, user_role_assignments, access_role_requests.
- Commercial/SCM: customer_inquiries, customers, suppliers, products, purchase_orders/items, goods_receipts/items, sales_orders/items/allocations, invoices/items, payments, supplier_bills, deliveries/items.
- Inventory/production/quality: warehouses, inventory_balances, inventory_lots, stock_movements, inventory_valuation_entries, product_boms/items, production_lines, production_batches/inputs, qa_tests/parameters/results, quality_inspections.
- Finance: chart_of_accounts, accounting_config, journal_entries/lines, inventory_lot_costs, inventory_grni_applications.
- People/assets: departments, employees, attendance_records, leave_requests, assets, maintenance_work_orders.
- Governance: audit_logs, documents, sites, units_of_measure.

This schema proves the presence of foundations only. The current route tree has active workspace pages for customer inquiries/customers, suppliers, products, setup, sales orders, purchase orders, goods receipts, inventory, quality, deliveries, invoices, payables and finance. There are no dedicated workspace pages yet for HR/payroll, full CRM pipeline, full WMS bin operations, production execution, fixed-asset accounting, budget/controlling, legal/compliance register, or enterprise reporting hub. Those are delivery gaps, not features to represent as complete.

## Production activation criteria
- No fake business master data or demo payroll in production.
- Every live site, warehouse, product, customer, supplier, employee and asset must be source-verified.
- Opening stock, AR/AP, cash/bank, fixed assets and GL opening balances require signed reconciliation.
- All critical permissions and maker-checker tests pass.
- End-to-end UAT across procure-to-pay, plan-to-produce, order-to-cash, record-to-report and hire-to-retire.
- QA release, recall drill, bank reconciliation, payroll test, backup restore and incident drill pass.
- OWNER signs off go-live readiness and operating procedures.

## Delivery policy
Build in small reviewable pull requests. Each production schema change must have a reversible migration strategy, QA validation and verified deployment. Never seed guessed operational values, create fake employees/customers/vendors, or post opening balances without approved source documents.
