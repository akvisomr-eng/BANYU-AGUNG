# BANYU AGUNG — Enterprise Operating Model

**Tujuan:** membangun sistem manajemen perusahaan terintegrasi (Enterprise Management System / EMS) untuk produsen AMDK, siap multi-site, multi-warehouse, multi-line, multi-channel, dan dapat dikembangkan menjadi multi-legal-entity tanpa menggandakan sumber data.

## 1. Prinsip arsitektur perusahaan

1. **Single source of truth:** satu master record untuk produk, pelanggan, pemasok, pegawai, aset, lokasi, akun, dan satuan.
2. **Modular monolith terlebih dahulu:** modul domain terpisah dalam satu aplikasi dan database transaksional; hindari microservices prematur. Pisahkan layanan bila beban, risiko, atau kebutuhan organisasi terbukti.
3. **Organization/tenant isolation:** setiap data operasional mempunyai organization_id; site, warehouse, department, cost center, dan legal entity scope ditentukan eksplisit.
4. **Workflow-driven:** transaksi bergerak melalui status, validasi, approval, posting, dan audit; bukan sekadar CRUD.
5. **Maker-checker:** pembuat dan penyetuju dipisah untuk tindakan bernilai/berisiko tinggi.
6. **Event and ledger integrity:** stok dan akuntansi berasal dari peristiwa yang dapat ditelusuri; jangan mengedit saldo historis secara langsung.
7. **Indonesian-first:** IDR, Asia/Jakarta, kalender kerja, pajak dan dokumen lokal sesuai konfigurasi yang ditinjau ahli.
8. **Evidence-first AI:** AI mengusulkan dan memantau berdasarkan data/sumber; manusia tetap bertanggung jawab atas keputusan material.

## 2. Peta modul enterprise

### A. Executive & Corporate Management
- Executive dashboard: revenue, gross margin, cash, AR/AP, working capital, sales pipeline, forecast, production attainment, yield, rejection, stock cover, OTIF, complaints, QA holds, employee cost, compliance exposure.
- Strategic planning: annual budget, KPI, OKR, target per unit, scenario planning, investment appraisal, CAPEX gate.
- Organization structure: legal entity, business unit, site, branch, department, cost center, profit center, reporting line.
- Approval center: inbox, delegation, SLA, escalation, decision log, conflict-of-interest declaration.
- Policy and document control: owner, version, approval, effective date, expiry, acknowledgement.

### B. ERP — Plan, Source, Make, Deliver
- Demand planning: sales history, confirmed orders, seasonality, promotions, forecast accuracy.
- MPS/MRP: master production schedule, BOM explosion, lead-time, safety stock, capacity constraints, procurement suggestions.
- Procurement: purchase request, RFQ, quotation comparison, supplier qualification, PO, amendment, goods receipt, incoming QC, supplier invoice, 3-way match, returns/debit note.
- Production: recipe/BOM version, work order, line/shift, material issue/return, water treatment batch, filling/packing, yield, scrap, rework, downtime, OEE, finished goods receipt.
- Warehouse: bin/location, putaway, replenishment, reservations, wave picking, packing, transfer, cycle count, stock opname, FEFO/FIFO, lot and expiry, quarantine, returns, deposit packaging.
- Sales & fulfilment: quotation, price approval, order, credit limit, ATP check, allocation, picking, dispatch, proof of delivery, invoice, receipt, return and credit note.
- Distribution: route, vehicle, driver, capacity, fuel, delivery sequence, route profitability, failed delivery, customer signature/photo/POD, reverse logistics.
- Maintenance: equipment register, preventive schedule, work order, spare parts, downtime, calibration, utilities, service history.
- Quality: supplier approval, incoming/in-process/final inspection, sampling plan, lab result, CCP, calibration, sanitation, deviation, CAPA, hold/release/reject, recall and mock recall.

### C. CRM & Customer Experience
- Lead capture and deduplication, company/contact/account hierarchy.
- Lead qualification, source, campaign, territory, owner, next action, SLA and pipeline stage.
- Opportunity, forecast, quotation, negotiated price, discount authority, contract and renewal.
- Customer segmentation: retail, wholesale, reseller, distributor, institution, hospitality, subscription/route.
- Customer 360: contacts, orders, deliveries, invoices, payment history, complaints, service cases, credit exposure and consent.
- Subscription/reorder: gallon recurring schedule, reminders, skipped/paused service, deposit and returnable-container balance.
- Service desk: ticket, priority, SLA, complaint category, evidence, root cause, CAPA link and customer response.
- Customer portal: order status, invoice, payment reference, reorder, complaint and document download, subject to identity verification.

### D. HRD, HCM & Payroll
- Organization chart, job family, position, grade, job description, competency and manpower planning.
- Employee master: employee number, legal identity, contact, emergency contact, site, department, manager, job, employment type, status.
- Recruitment: requisition, applicant, interview, offer, onboarding, probation and checklist.
- Employee lifecycle: contract/PKWT/PKWTT records, amendments, probation, transfer, promotion, termination, exit clearance and asset return.
- Time & attendance: shifts, roster, attendance source, late/absence, overtime request/approval, work calendar and holiday rules.
- Leave: annual, sick, maternity/paternity and other configured leave types; entitlement, accrual, carry-forward, evidence and approval.
- Payroll: salary components, allowances, deductions, overtime, BPJS, PPh 21, THR, prorate, loans/advances, payslip, payroll register and bank disbursement file.
- Payroll control: period lock, payroll preview, exception checks, maker-checker, employee acknowledgement, posting to GL, reconciliation and correction run.
- Performance & development: objectives, appraisal, training, certifications, skill matrix, mandatory food safety and K3 training.
- Employee relations: grievances, disciplinary cases, investigation, whistleblowing and restricted access.
- K3: hazard register, risk assessment, PPE, toolbox meeting, incident/near miss, corrective action, emergency drill and occupational health records.
- Employee self-service: profile update request, leave, attendance correction, payslip, tax documents, training and company policy acknowledgement.

**Payroll guardrails:** salary, bank account, tax identity, medical/disciplinary and personal data are restricted. Payroll is calculated from approved inputs, checked by HR and Finance, approved by an authorized officer, and only then exported/posted. AI must not determine final salary, tax filing, dismissal, sanction or payment.

### E. Accounting, Finance & Treasury
- General ledger, configurable chart of accounts, journal sources, accruals, reversals, recurring journals and period close.
- AP: supplier bills, matching, due date, payment proposal, withholding/tax documents, settlement and aging.
- AR: invoice, receipt, allocation, credit note, aging, collection promises, write-off approval and customer statement.
- Cash & bank: cashbook, bank accounts, payment/receipt, transfer, reconciliation, bank statement import and cash forecast.
- Tax: tax codes, VAT/PPN, withholding/PPh, tax invoice references, reconciliation and reporting exports; final tax treatment reviewed by tax professional.
- Cost accounting: standard/actual costing, landed cost, BOM/route cost, production variance, scrap, overhead allocation, COGS.
- Budgeting: annual/rolling budget, department cost center, commitment control, variance analysis and reforecast.
- Fixed assets: capitalization, asset class, depreciation method, useful life, impairment/disposal and GL integration.
- Financial statements: trial balance, P&L, balance sheet, cash flow, equity changes, notes and management consolidation.
- Treasury: liquidity forecast, payment calendar, bank covenant register, funding scenario and cash concentration.
- Internal controls: journal approval, period lock, segregation of duties, audit evidence and reconciliation sign-off.

### F. Data Governance & Master Data Management
- Master data domain owners and stewards, create/change/approve workflow, duplicate detection, merge history and golden record.
- Effective dating, inactive/blocked status, versioning and source provenance.
- Data quality rules: completeness, validity, uniqueness, consistency, timeliness, referential integrity.
- Reference data: currency, country/province/city, units, tax codes, payment terms, incoterms, reasons, status dictionaries.
- Import/export: templates, preview, dry run, row-level validation, error workbook, duplicate policy, approval and audit.
- Data lineage: source transaction → operational subledger → journal/report; who changed what and why.
- Data classification, retention schedule, lawful purpose, access log, subject rights and deletion/anonymization workflow under applicable privacy law.

### G. Warehouse & Logistics Master Data
- Sites, buildings, warehouses, zones, aisles, racks, bins, staging, loading docks and quarantine areas.
- Warehouse type: raw material, packaging, WIP, finished goods, quarantine, returns, maintenance/spares.
- Lot, batch, serial, expiry, manufacturing date, receipt date, supplier lot, quality status and traceability.
- Inventory policies: FEFO for dated goods, FIFO where suitable, min/max, reorder point, safety stock, ABC/XYZ classification.
- Handling rules: temperature/humidity if required by product/material, stack height, segregation, pest control, sanitation and food-grade zoning.
- Returnable assets: gallon/container identity, ownership, deposit, customer balance, inspection, wash cycle and retirement.

### H. Legal, Risk, Compliance & Sustainability
- Permit and certificate register with authority, scope, site, issue/expiry, evidence and responsible owner.
- Regulatory obligation register and change assessment.
- Contracts, insurance, claims, litigation, vendor due diligence and related-party declarations.
- Enterprise risk register: likelihood, impact, controls, owner, residual risk, treatment and review.
- Food safety: hazard analysis, CCP, traceability, recall, mock recall and CAPA.
- Environmental: source-water abstraction rights, meter, source flow, water balance, wastewater, waste, energy, emissions, plastic and community complaints.
- Business continuity, disaster recovery, crisis communications and incident command.

### I. IT, Cybersecurity & AI Governance
- IAM, MFA, SSO readiness, joiner-mover-leaver, role/permission matrix, service identities and privileged access.
- Security operations: audit, login anomalies, session control, rate limits, dependency scanning, secret hygiene, vulnerability and incident handling.
- Platform reliability: uptime, latency, error budgets, queues, backups, restore drills, RTO/RPO, deployment and rollback gates.
- AI control plane: agent registry, model/provider policy, data access, tool allowlist, budget, evaluation, audit, approval and kill switch.
- AI-generated code or database changes only in isolated QA; production requires review and deployment authorization.

## 3. Enterprise master data dictionary

| Domain | Master records | Owner |
|---|---|---|
| Corporate | Legal entity, site, branch, department, cost center, profit center | OWNER / Corporate |
| Product | SKU, category, brand, pack, BOM, recipe/process version, unit, barcode, shelf life, tax class | Product / QA |
| Customer | Account, outlet, contact, ship-to, bill-to, channel, price list, credit terms | Sales / Finance |
| Supplier | Vendor, contact, bank account (restricted), qualification, certificates, payment terms | Procurement / Finance |
| Inventory | Warehouse, zone, bin, lot, status, movement reason, stock policy | Warehouse |
| Production | Line, machine, shift, routing, work center, capacity, maintenance plan | Production |
| Quality | Parameter, method, specification version, sampling plan, lab, instrument, CCP | QA |
| HR | Employee, job, grade, contract, shift, leave type, pay component, skill | HR |
| Finance | COA, tax code, fiscal period, journal source, bank, currency, budget, asset class | Finance |
| Distribution | Vehicle, driver, route, territory, delivery window, POD type | Distribution |
| Compliance | Permit, certificate, regulation, obligation, policy, SOP, risk, incident | Compliance |

Master data is not automatically populated with illustrative values. Demo records, if ever needed, must live in a separate demo organization/database and carry an unmistakable DEMO marker.

## 4. Enterprise document lifecycle and numbering

Document numbers must be generated server-side, unique by organization + document type + site/fiscal period, concurrency-safe, and never reused after posting. Draft cancellation creates a traceable cancellation event. Posted records are corrected by reversal/credit/debit/adjustment documents, never hard-deleted.

Examples: PR, RFQ, PO, GRN, QC, WO, BATCH, SO, DO, INV, RCPT, AP, JV, PAY, LEAVE, PAYRUN, CAPA, NCR, MAINT.

## 5. Segregation of duties and approval matrix

| Activity | Maker | Checker / final approver |
|---|---|---|
| Master product / BOM change | Product admin | QA + Production + OWNER according to change impact |
| Supplier onboarding | Procurement | Finance / OWNER |
| Supplier bank change | Procurement | Independent Finance/OWNER dual control |
| Purchase requisition / PO | Requester / Procurement | Budget owner + authorized approver |
| Goods receipt | Warehouse | Independent QC for quality disposition |
| Production work order | Planner | Production supervisor |
| Batch release | QA reviewer | Authorized QA lead; never AI alone |
| Customer price override | Sales | Commercial manager / OWNER by threshold |
| Credit limit | Sales/Finance proposal | Finance / OWNER |
| Inventory adjustment | Warehouse | Independent approver + Finance if valuation impact |
| Journal posting | Finance maker | Authorized Finance controller / OWNER |
| Payroll run | HR maker | HR lead + Finance / authorized approver |
| Bank payment | AP maker | Independent bank approver |
| Role/permission change | Admin | OWNER with audit trail |
| Production deploy/restore | Engineering | OWNER/change authority after tests |

Thresholds, roles and monetary limits must be configured from approved company policy, not hard-coded guesses.

## 6. Standard end-to-end enterprise cycles

1. **Lead-to-cash:** lead → qualification → opportunity → quotation → price approval → sales order → credit/ATP → reservation → pick/pack → dispatch/POD → invoice → receipt allocation → AR reconciliation → customer follow-up.
2. **Source-to-pay:** request → budget check → RFQ → supplier evaluation → PO approval → receipt → incoming QC → supplier invoice 3-way match → payment approval → bank reconciliation.
3. **Plan-to-produce:** forecast → MPS/MRP → capacity/material check → work order → issue lot-controlled inputs → line execution → in-process QC → batch close → final QC release → finished stock.
4. **Record-to-report:** subledger events → journal draft → validation → approval/post → bank/subledger reconciliation → period close → statements.
5. **Hire-to-retire:** manpower plan → recruitment → onboarding → contract → attendance/leave → payroll → performance/training → transfer/separation → clearance and access revocation.
6. **Issue-to-resolution:** incident/complaint → triage → contain/hold → investigate → root cause → CAPA → effectiveness check → closure and learning.
7. **Asset lifecycle:** request → acquisition/receipt → capitalization → preventive maintenance → repair → calibration → depreciation → disposal.

## 7. Enterprise KPIs and control tower

- Finance: net sales, gross margin, EBITDA (if configured), cash conversion, DSO, DPO, working capital, budget variance, bank reconciliation age.
- Sales: leads, conversion, pipeline coverage, repeat purchase, churn, average order value, channel margin.
- Production: schedule attainment, OEE, yield, reject, downtime, material variance, cost per liter.
- Quality: first-pass yield, nonconformance, CAPA overdue, complaint rate, batch hold time, recall traceability time.
- Warehouse: inventory accuracy, stock cover, expiry exposure, pick accuracy, shrinkage, returnable-container balance.
- Distribution: OTIF, cost/drop, route utilization, failed delivery, fuel per delivered unit.
- HR: headcount, overtime, absenteeism, turnover, training compliance, payroll variance.
- Compliance/sustainability: permit expiry, audit findings, water use per liter, water loss, waste, energy per liter and community complaints.

Each KPI must have an owner, formula, source tables, refresh time, filters and target approval. A dashboard must not display "real time" when data is delayed or incomplete.

## 8. Non-functional enterprise requirements

- Server-side authorization and tenant isolation on every query/action.
- Strong typing, schema validation, database constraints, transaction boundaries and idempotency.
- Concurrency-safe numbering and inventory reservation.
- Append-only audit and business event records.
- Encryption in transit/at rest, secret management, MFA for privileged users.
- Backup retention and restore test, disaster recovery, documented RTO/RPO.
- Observability with structured logs, traces, metrics, alert routing and runbooks.
- Accessibility, responsive UI, Indonesian localization and export access control.
- Data retention, privacy, records management and legal hold.
- Performance tests with realistic volume; pagination and indexes for large ledgers.

## 9. Definition of done per module

A module is not "enterprise ready" merely because a menu/page exists. It must have:
- approved process map and data owner;
- schema, constraints, indexes and tenant isolation tests;
- role/action permission matrix and server-side enforcement;
- input validation, duplicate protection and concurrency handling;
- status lifecycle and approval matrix;
- audit trail and reversal/correction path;
- integration events with upstream/downstream modules;
- report/reconciliation and exception handling;
- unit/integration/e2e/security tests;
- operator SOP, training and monitored production rollout.
