# BANYU AGUNG — Enterprise Blueprint

## 1. Product principles
- One integrated company system; public website and authenticated workspace share the same product identity but have separate access boundaries.
- Indonesian-first, responsive, auditable, role-based, approval-driven, and ready for multiple warehouses, production lines, sales channels and legal entities.
- Never expose secrets, customer personal data, internal cost, payroll or supplier pricing on public pages.
- Historical Jolotundo research is contextual secondary data only. Do not label it as current product test, drinking-water certification, mineral composition proof, or regulatory compliance evidence.

## 2. Public website
1. Home and company profile.
2. Brand story and verified source provenance.
3. Product catalogue with actual pack sizes, SKU, packaging, price policy and availability supplied by the company.
4. Quality and safety page: publish current laboratory reports, sample date/location, laboratory identity/accreditation, methods, applicable regulatory criteria and document validity only after QA approval.
5. Production/process overview, sanitation and traceability explanation based on verified SOPs.
6. Distributor/reseller registration and lead capture.
7. Order inquiry, contact, FAQ, news and downloadable approved documents.
8. SEO metadata, sitemap, structured data, analytics consent and accessible mobile design.

## 3. Enterprise modules
- Executive cockpit: revenue, gross margin, cash, receivables, payables, sales pipeline, production plan/actual, yield, reject, stock cover, on-time delivery, complaints and quality holds.
- Organization & IAM: companies, sites, departments, employees, users, roles, permissions, session controls and audit logs.
- Master data: product/SKU, packaging/BOM, units, price lists, tax codes, customers, channels, suppliers, warehouses, vehicles, routes, chart of accounts and cost centers.
- CRM & sales: leads, accounts, contacts, quotations, price approvals, sales orders, allocation, credit checks, invoices, receipts, returns and commissions.
- Procurement: purchase requests, supplier quotations, approval matrix, purchase orders, goods receipt, inspection, supplier invoices, debit notes and supplier scorecards.
- Production: demand planning, MPS, work orders, BOM/version, material issue, line scheduling, shift output, batch/lot genealogy, yield, scrap, rework, downtime and finished-goods receipt.
- QA/QC: sampling plans, parameter catalogue, incoming/in-process/final tests, laboratory documents, calibration, sanitation, non-conformance, CAPA, quarantine/release/reject and recall traceability.
- Warehouse: multi-location inventory, lot/expiry, FEFO/FIFO policy, reservations, picking, packing, transfer, cycle count, stock opname and immutable stock ledger.
- Distribution: delivery planning, route/vehicle/driver, dispatch, proof of delivery, cash collection, failed delivery, returnable packaging/deposit and reverse logistics.
- Finance: chart of accounts, journals, AP/AR, cash/bank, payment allocation, bank reconciliation, tax configuration, fixed assets, depreciation, cost accounting, budgets, P&L, balance sheet and cash flow.
- HR: employee files, contracts, organization, attendance, shifts, leave, payroll components, payroll approvals, payslips, training, safety and performance.
- Assets & maintenance: asset register, preventive/corrective maintenance, spare parts, work orders, downtime and depreciation integration.
- Governance: permits, certificates, policies, SOPs, document expiry, risk register, complaints, incidents, approvals and audit evidence.
- Reports: operational, sales, production, quality, inventory, procurement, logistics, finance, HR and compliance; CSV/XLSX/PDF exports with access filtering.

## 4. Core workflows
### Order-to-cash
Lead → quotation → approved price → sales order → credit/stock validation → allocation → pick/pack → delivery → proof of delivery → invoice → receipt → AR settlement.
### Procure-to-pay
Purchase request → budget/approval → supplier quotation → PO → goods receipt & incoming inspection → supplier invoice match → payment approval → bank settlement.
### Plan-to-produce
Demand forecast → production plan → material availability → work order → line/shift execution → in-process checks → batch close → final QC release → finished goods stock.
### Quality hold/release
Sample registration → chain of custody → lab/test result → QA review against configured current standard → hold/release/reject → traceability and recall if needed. A failed/unknown test must not be silently released.
### Record-to-report
Source transaction → subledger → journal posting → reconciliation → period close → management statements.

## 5. Controls
- Role-based access and least privilege; server-side authorization on every protected action.
- Maker-checker for supplier bank changes, purchase approvals, price overrides, journal posting, payroll, inventory adjustments and QA release.
- No hard delete for posted financial, stock, production or QA events; use reversal/correction with reason and audit record.
- Idempotency keys for external order/payment events; unique document numbering by site and fiscal period.
- Lot-level genealogy from incoming material/packaging to production batch and customer delivery.
- QA status gates dispatch; expired/held/rejected lots are not allocatable.
- Financial posting uses balanced debit/credit journal lines and period locks.
- Backups, restore drills, monitoring, rate limits, security headers and incident response.

## 6. KPI definitions
- Net sales = invoiced sales less approved returns/discounts/tax treatment as configured.
- Gross margin = net sales less cost of goods sold.
- Production yield = accepted finished quantity / total input quantity (unit conversions controlled).
- Reject rate = rejected quantity / total produced quantity.
- OTIF = deliveries on time and in full / total due deliveries.
- Inventory days = average inventory value / COGS × days in period.
- DSO = average trade receivables / credit sales × days in period.
- Complaint rate = valid complaints / delivered units × chosen scale.

## 7. Implementation phases
A. Foundation: Next.js app, design system, environments, schema, migrations, auth, roles, audit and CI.
B. Commercial: master data, CRM, quotations, sales orders, customer portal inquiry.
C. Operations: procurement, warehouse, production, batch traceability and QA release gates.
D. Fulfilment: delivery, returns, route/vehicle and proof of delivery.
E. Finance & people: accounting, AP/AR, cash/bank, HR/payroll and assets.
F. Governance & analytics: compliance, BI, exports, alerting, backup/restore and UAT.

## 8. Company inputs required before production activation
Legal entity and permits; official address/contact; brand assets; actual SKU/pack sizes/prices; production flow and capacity; equipment/line details; approved SOPs; current accredited lab reports; applicable licenses/certificates; warehouses; customer/supplier opening balances; chart of accounts; employee roster; approval matrix; tax setup; distribution zones and vehicle data.

## 9. Source-data caution
The workbook `Data_Penelitian_Air_Jolotundo.xlsx` compiles secondary studies. It reports different pH/TDS contexts, flags the temperature value as questionable, and asks for clarification of microbiology reporting. It also identifies missing mineral-ion, contaminant, seasonal stability and source-flow data. Preserve provenance and validation notes; never merge observations from different studies as one sample.
