import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { SignOutButton } from "../sign-out-button";

export const dynamic = "force-dynamic";

type ModuleItem = [string, string, string | null, string];
type ModuleGroup = { title: string; items: ModuleItem[] };

const groups: ModuleGroup[] = [
  { title: "Corporate & master data", items: [
    ["Organization & IAM","Organisasi, site, departemen, user, role dan audit","/workspace/setup","Fondasi tersedia"],
    ["Master produk & SKU","Produk jadi, bahan baku, kemasan, satuan dan BOM","/workspace/products","Fondasi tersedia"],
    ["Customer & CRM","Lead inbox, pelanggan, kanal, quotation dan pipeline","/workspace/customers","Parsial"],
    ["Supplier & procurement","Pemasok, PO, penerimaan dan tagihan pemasok","/workspace/suppliers","Fondasi tersedia"],
    ["Warehouse Management","Gudang, lot, saldo, movement dan rekonsiliasi","/workspace/inventory","Fondasi tersedia"],
  ]},
  { title: "Operations & supply chain", items: [
    ["Sales & order fulfilment","Sales order, allocation, delivery, invoice dan payment","/workspace/sales-orders","Fondasi tersedia"],
    ["Procurement-to-pay","Purchase order, goods receipt, supplier bill dan AP","/workspace/purchase-orders","Fondasi tersedia"],
    ["Production planning & execution","MPS/MRP, work order, line, batch, yield dan downtime",null,"Belum tersedia"],
    ["Quality & food safety","Inspection, test, lot hold, release, CAPA dan recall","/workspace/quality","Parsial"],
    ["Distribution & fleet","Dispatch, route, vehicle, POD, returnable gallon", "/workspace/deliveries","Parsial"],
    ["Maintenance & fixed assets","Asset register, preventive maintenance, depreciation",null,"Parsial"],
  ]},
  { title: "Finance, people & governance", items: [
    ["Accounting & GL","COA, journal, posting, AP/AR dan financial close","/workspace/finance","Fondasi tersedia"],
    ["Treasury & bank reconciliation","Cash/bank, payment, statement matching dan cash forecast",null,"Belum tersedia"],
    ["Budget & controlling","Budget, cost center, variance, profitability dan CAPEX",null,"Belum tersedia"],
    ["HRD & HCM","Employee lifecycle, recruitment, contracts, shift, leave, K3",null,"Fondasi database"],
    ["Payroll","Components, BPJS, PPh 21, THR, payroll approval, payslip",null,"Belum tersedia"],
    ["Legal, risk & compliance","Permit, SNI, BPOM, environmental, contracts, risk register",null,"Belum tersedia"],
    ["Enterprise BI & reports","Management reports, KPI, forecasting, exports",null,"Belum tersedia"],
    ["AI control plane & IT security","Agent registry, audit, approvals, SRE, security and recovery",null,"Blueprint"],
  ]},
];

const Status = ({value}:{value:string}) => <span className="inquiryStatus">{value}</span>;

export default async function EnterpriseHubPage() {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");
  const { sql } = await import("@/lib/db");
  const rows = await sql`
    SELECT p.full_name, p.email, r.code AS role_code, r.name AS role_name
    FROM user_profiles p
    JOIN user_role_assignments a ON a.user_id=p.id
    JOIN roles r ON r.id=a.role_id
    WHERE p.auth_subject=${session.user.id} AND p.status='active'
      AND r.code IN ('OWNER','ADMIN')
    ORDER BY CASE WHEN r.code='OWNER' THEN 0 ELSE 1 END LIMIT 1
  `;
  const actor = rows[0] as {full_name:string;email:string;role_code:string;role_name:string}|undefined;
  if (!actor) redirect("/workspace?access=denied");

  const allModules = groups.flatMap(group => group.items);
  const foundationCount = allModules.filter(item => ["Fondasi tersedia", "Parsial", "Fondasi database"].includes(item[3])).length;
  const roadmapCount = allModules.filter(item => ["Belum tersedia", "Blueprint"].includes(item[3])).length;

  return <main className="workspace">
    <aside className="side">
      <Link className="brand" href="/">BANYU <span>AGUNG</span></Link>
      <p className="sideLabel">ENTERPRISE</p>
      <Link className="sideLink" href="/workspace">← Ringkasan</Link>
      <Link className="sideActive" href="/workspace/enterprise">Pusat Enterprise</Link>
      <Link className="sideLink" href="/workspace/setup">Master & konfigurasi</Link>
      <Link className="sideLink" href="/workspace/finance">Finance & Accounting</Link>
      <Link className="sideLink" href="/workspace">Kembali ke dashboard</Link>
    </aside>
    <section className="workMain">
      <header className="workHeader">
        <div><p className="eyebrow">BANYU AGUNG / ENTERPRISE OPERATING SYSTEM</p><h1>Pusat Manajemen Enterprise</h1><p className="muted">Arsitektur modul, cakupan proses, dan status implementasi · {actor.role_name}</p></div>
        <SignOutButton/>
      </header>
      <div className="notice">Satu perusahaan · satu sumber data · kontrol akses dan audit terpusat. Status di bawah membedakan fitur yang sudah memiliki fondasi aplikasi dari modul yang masih dalam roadmap. &quot;Fondasi tersedia&quot; bukan pernyataan bahwa modul telah lulus UAT atau siap untuk transaksi komersial.</div>
      <div className="metricGrid">
        <article className="metric"><span>Modul dalam peta enterprise</span><strong>{allModules.length}</strong><small>Corporate, ERP, CRM, HR, Finance, Quality, IT dan governance</small></article>
        <article className="metric"><span>Fondasi aplikasi tersedia</span><strong>{foundationCount}</strong><small>Rute aktif dan fitur dasar yang telah ada</small></article>
        <article className="metric"><span>Modul dalam pengembangan roadmap</span><strong>{roadmapCount}</strong><small>Termasuk payroll, production execution dan BI</small></article>
        <article className="metric"><span>Kontrol utama</span><strong>Maker–checker</strong><small>Approval, tenant isolation dan audit trail</small></article>
      </div>
      {groups.map(group=><section key={group.title}>
        <h2>{group.title}</h2>
        <div className="moduleGrid">
          {group.items.map(([name,description,href,status])=><article className="moduleCard" key={name}>
            <span className="moduleIcon">◇</span>
            <strong>{name}</strong>
            <small>{description}</small>
            <Status value={status}/>
            {href ? <Link className="moduleOpen" href={href}>Buka modul ↗</Link> : <span className="moduleOpen">Dalam roadmap</span>}
          </article>)}
        </div>
      </section>)}
      <section className="metric" style={{marginTop:24}}>
        <h2>Standar enterprise yang harus dipenuhi</h2>
        <ul>
          <li>Setiap transaksi memiliki nomor unik, status lifecycle, pembuat, penyetuju dan audit trail.</li>
          <li>Setiap query dan server action dibatasi berdasarkan organisasi dan permission.</li>
          <li>Persediaan dan jurnal posted tidak dihapus; koreksi melalui reversal atau adjustment yang sah.</li>
          <li>Payroll, perubahan rekening bank, pembayaran, QA batch release dan akses privileged menggunakan maker-checker.</li>
          <li>AI hanya bertindak dalam tool allowlist, batas biaya, dan kewenangan yang disetujui.</li>
        </ul>
      </section>
      <p className="workspaceFoot">Masuk sebagai {actor.email} · Status modul harus diverifikasi kembali melalui pengujian dan UAT sebelum go-live.</p>
    </section>
  </main>;
}
