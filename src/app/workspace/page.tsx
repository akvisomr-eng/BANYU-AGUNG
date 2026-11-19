import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { SignOutButton } from "./sign-out-button";

const modules = [
  ["Permintaan Pelanggan","Kotak masuk dan tindak lanjut CRM"],["Master Pelanggan","Data pelanggan untuk proses penjualan"],["Konfigurasi Operasional","Lokasi, gudang dan satuan dasar"],["Sales Orders","Pencatatan pesanan pelanggan"],["Master Pemasok","Data pemasok terverifikasi"],["Purchase Orders","Pencatatan pembelian pemasok"],["Goods Receipts","Penerimaan dan pelacakan lot"],["Inventory","Saldo dan pergerakan stok"],["Quality Control","Pemeriksaan dan pelepasan lot"],["Delivery","Jadwal dan bukti pengiriman"],["Invoices","Faktur dan piutang pelanggan"],["Production","Rencana, batch, hasil produksi"],["Quality Assurance","Sampling, hasil uji, release"],["Procurement","Supplier, PO, penerimaan"],["Distribution","Pengiriman, armada, retur"],["Finance","Kas, bank, jurnal, AR/AP"],["Human Resources","Karyawan, absensi, payroll"],["Assets & Maintenance","Mesin, kendaraan, perawatan"],["Reports & Analytics","KPI dan laporan manajemen"],["Compliance","Izin, sertifikat, dokumen"],["Administration","Pengguna, peran, audit"]
];

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");
  const { sql } = await import("@/lib/db");

  const rows = await sql`
    SELECT p.id AS profile_id, p.organization_id, p.full_name, p.email, r.name AS role_name, r.code AS role_code
    FROM user_profiles p
    JOIN user_role_assignments ura ON ura.user_id = p.id
    JOIN roles r ON r.id = ura.role_id
    WHERE p.auth_subject = ${session.user.id}
      AND p.status = 'active'
    ORDER BY r.code
    LIMIT 1
  `;
  const profile = rows[0] as { profile_id: string; organization_id: string; full_name: string; email: string; role_name: string; role_code: string } | undefined;
  if (!profile) redirect("/auth/sign-in?access=not-provisioned");
  const isFinance = profile.role_code === "FINANCE";
  const isOwner = profile.role_code === "OWNER";
  const readinessRows = isFinance ? [] : await sql`
    SELECT
      (SELECT count(*) FROM sites WHERE organization_id=${profile.organization_id}::uuid AND is_active=true)::int AS sites,
      (SELECT count(*) FROM warehouses WHERE organization_id=${profile.organization_id}::uuid AND is_active=true)::int AS warehouses,
      (SELECT count(*) FROM products WHERE organization_id=${profile.organization_id}::uuid AND is_active=true)::int AS products,
      (SELECT count(*) FROM customers WHERE organization_id=${profile.organization_id}::uuid)::int AS customers,
      (SELECT count(*) FROM suppliers WHERE organization_id=${profile.organization_id}::uuid AND status='active')::int AS suppliers,
      (SELECT count(*) FROM units_of_measure WHERE organization_id=${profile.organization_id}::uuid)::int AS units,
      (SELECT count(*) FROM chart_of_accounts WHERE organization_id=${profile.organization_id}::uuid AND is_active=true)::int AS accounts,
      (SELECT count(*) FROM accounting_config WHERE organization_id=${profile.organization_id}::uuid
        AND accounts_receivable_id IS NOT NULL AND accounts_payable_id IS NOT NULL
        AND sales_revenue_id IS NOT NULL AND purchase_expense_id IS NOT NULL
        AND output_tax_id IS NOT NULL AND input_tax_id IS NOT NULL
        AND cash_account_id IS NOT NULL AND bank_account_id IS NOT NULL
        AND inventory_asset_id IS NOT NULL AND goods_received_not_invoiced_id IS NOT NULL
        AND cost_of_goods_sold_id IS NOT NULL AND inventory_opening_equity_id IS NOT NULL)::int AS mapped_configs
  `;
  const readiness = readinessRows[0] as {sites:number;warehouses:number;products:number;customers:number;suppliers:number;units:number;accounts:number;mapped_configs:number}|undefined;
  const readinessItems = readiness ? [
    {label:"Bagan akun & mapping",count:readiness.accounts,ready:readiness.accounts>=12&&readiness.mapped_configs>0,href:isOwner?"/workspace/finance/settings":"/workspace/finance",detail:"12 akun standar dan pemetaan wajib"},
    {label:"Satuan ukur",count:readiness.units,ready:readiness.units>0,href:"/workspace/setup",detail:"Satuan produk dan kemasan"},
    {label:"Lokasi operasional",count:readiness.sites,ready:readiness.sites>0,href:"/workspace/setup",detail:"Pabrik, kantor atau titik distribusi"},
    {label:"Gudang",count:readiness.warehouses,ready:readiness.warehouses>0,href:"/workspace/setup",detail:"Gudang barang jadi dan kategori lain"},
    {label:"Produk / SKU",count:readiness.products,ready:readiness.products>0,href:"/workspace/products",detail:"Katalog resmi dan spesifikasi"},
    {label:"Pelanggan",count:readiness.customers,ready:readiness.customers>0,href:"/workspace/customers",detail:"Data pelanggan nyata"},
    {label:"Pemasok",count:readiness.suppliers,ready:readiness.suppliers>0,href:"/workspace/suppliers",detail:"Data pemasok terverifikasi"}
  ] : [];
  const visibleModules = isFinance
    ? [...modules.filter(m => ["Invoices", "Finance"].includes(m[0])), ["Utang Pemasok", "Faktur pemasok dan pembayaran"]]
    : modules;
  const dashboardMetrics = isFinance
    ? [["Ruang lingkup", "Finance", "Akses operasional"], ["Piutang", "Tersedia", "Invoice dan penerimaan"], ["Utang pemasok", "Tersedia", "Faktur dan pembayaran"], ["Kontrol", "OWNER only", "Posting jurnal dan konfigurasi"]]
    : [["Penjualan","Belum tersedia","Menunggu aktivasi"],["Produksi","Belum tersedia","Menunggu aktivasi"],["Stok tersedia","Belum tersedia","Menunggu aktivasi"],["Piutang","Belum tersedia","Menunggu aktivasi"]];

  return <main className="workspace">
    <aside className="side">
      <Link className="brand" href="/">BANYU <span>AGUNG</span></Link>
      <p className="sideLabel">ENTERPRISE</p>
      <Link className="sideActive" href="/workspace">◫ &nbsp; Ringkasan</Link>
      {!isFinance && <Link className="sideLink" href="/workspace/enterprise">Pusat Enterprise</Link>}
      {isFinance ? <>
        <Link className="sideLink" href="/workspace/finance">Finance & Accounting</Link>
        <Link className="sideLink" href="/workspace/invoices">Invoices / Piutang</Link>
        <Link className="sideLink" href="/workspace/payables">Utang Pemasok</Link>
      </> : <>
        <Link className="sideLink" href="/workspace/inquiries">Permintaan Pelanggan</Link>
        <Link className="sideLink" href="/workspace/customers">Master Pelanggan</Link>
        <Link className="sideLink" href="/workspace/setup">Konfigurasi Operasional</Link>
        <Link className="sideLink" href="/workspace/sales-orders">Sales Orders</Link>
        <Link className="sideLink" href="/workspace/suppliers">Master Pemasok</Link>
        <Link className="sideLink" href="/workspace/purchase-orders">Purchase Orders</Link>
        <Link className="sideLink" href="/workspace/goods-receipts">Goods Receipts</Link>
        <Link className="sideLink" href="/workspace/inventory">Inventory</Link>
        <Link className="sideLink" href="/workspace/quality">Quality Control</Link>
        <Link className="sideLink" href="/workspace/deliveries">Delivery</Link>
        <Link className="sideLink" href="/workspace/invoices">Invoices</Link>
        <Link className="sideLink" href="/workspace/finance">Finance & Accounting</Link>
        <Link className="sideLink" href="/workspace/payables">Utang Pemasok</Link>
        <Link className="sideLink" href="/workspace/products">Master Produk</Link>
        {modules.map(m=><a className="sideLink" href="#modul" key={m[0]}>{m[0]}</a>)}
      </>}
      <Link className="sideLink" href="/">← Kembali ke Website</Link>
    </aside>
    <section className="workMain">
      <header className="workHeader">
        <div><p className="eyebrow">BANYU AGUNG / ENTERPRISE</p><h1>Dashboard Manajemen</h1><p className="muted">Selamat datang, {profile.full_name}. {profile.role_name}</p></div>
        <SignOutButton/>
      </header>
      {isFinance ? <div className="notice">Akses Finance aktif. Anda dapat mengelola akun, menyusun jurnal draft, menangani piutang dan utang pemasok. Posting jurnal serta konfigurasi akuntansi tetap menjadi kewenangan OWNER.</div> : <div className="notice">Akun Anda telah terautentikasi. Gunakan checklist kesiapan operasional di bawah untuk melengkapi master data sebelum transaksi nyata dijalankan.</div>}
      {!isFinance && readinessItems.length > 0 && <section>
        <h2>Kesiapan operasional</h2>
        <div className="metricGrid">{readinessItems.map(item=><Link className="metric" href={item.href} key={item.label}>
          <span>{item.label}</span>
          <strong className="metricText">{item.ready ? "Siap" : "Perlu data"}</strong>
          <small>{item.count} data · {item.detail}</small>
        </Link>)}</div>
      </section>}
      <div className="metricGrid">{dashboardMetrics.map(x=><article className="metric" key={x[0]}><span>{x[0]}</span><strong className="metricText">{x[1]}</strong><small>{x[2]}</small></article>)}</div>
      <h2 id="modul">Modul perusahaan</h2>
      <div className="moduleGrid">{visibleModules.map(m=>m[0] === "Utang Pemasok" ? <Link className="moduleCard" href="/workspace/payables" key={m[0]}><span className="moduleIcon">◇</span><strong>{m[0]}</strong><small>{m[1]}</small><span className="moduleOpen">Buka utang pemasok ↗</span></Link> : m[0] === "Permintaan Pelanggan" ? <Link className="moduleCard" href="/workspace/inquiries" key={m[0]}><span className="moduleIcon">◇</span><strong>{m[0]}</strong><small>{m[1]}</small><span className="moduleOpen">Buka kotak masuk ↗</span></Link> : m[0] === "Master Pelanggan" ? <Link className="moduleCard" href="/workspace/customers" key={m[0]}><span className="moduleIcon">◇</span><strong>{m[0]}</strong><small>{m[1]}</small><span className="moduleOpen">Buka master pelanggan ↗</span></Link> : m[0] === "Konfigurasi Operasional" ? <Link className="moduleCard" href="/workspace/setup" key={m[0]}><span className="moduleIcon">◇</span><strong>{m[0]}</strong><small>{m[1]}</small><span className="moduleOpen">Buka konfigurasi ↗</span></Link> : m[0] === "Sales Orders" ? <Link className="moduleCard" href="/workspace/sales-orders" key={m[0]}><span className="moduleIcon">◇</span><strong>{m[0]}</strong><small>{m[1]}</small><span className="moduleOpen">Buka pesanan ↗</span></Link> : m[0] === "Master Pemasok" ? <Link className="moduleCard" href="/workspace/suppliers" key={m[0]}><span className="moduleIcon">◇</span><strong>{m[0]}</strong><small>{m[1]}</small><span className="moduleOpen">Buka pemasok ↗</span></Link> : m[0] === "Purchase Orders" ? <Link className="moduleCard" href="/workspace/purchase-orders" key={m[0]}><span className="moduleIcon">◇</span><strong>{m[0]}</strong><small>{m[1]}</small><span className="moduleOpen">Buka pembelian ↗</span></Link> : m[0] === "Goods Receipts" ? <Link className="moduleCard" href="/workspace/goods-receipts" key={m[0]}><span className="moduleIcon">◇</span><strong>{m[0]}</strong><small>{m[1]}</small><span className="moduleOpen">Buka penerimaan ↗</span></Link> : m[0] === "Inventory" ? <Link className="moduleCard" href="/workspace/inventory" key={m[0]}><span className="moduleIcon">◇</span><strong>{m[0]}</strong><small>{m[1]}</small><span className="moduleOpen">Lihat stok ↗</span></Link> : m[0] === "Quality Control" ? <Link className="moduleCard" href="/workspace/quality" key={m[0]}><span className="moduleIcon">◇</span><strong>{m[0]}</strong><small>{m[1]}</small><span className="moduleOpen">Buka QC ↗</span></Link> : m[0] === "Delivery" ? <Link className="moduleCard" href="/workspace/deliveries" key={m[0]}><span className="moduleIcon">◇</span><strong>{m[0]}</strong><small>{m[1]}</small><span className="moduleOpen">Buka pengiriman ↗</span></Link> : m[0] === "Invoices" ? <Link className="moduleCard" href="/workspace/invoices" key={m[0]}><span className="moduleIcon">◇</span><strong>{m[0]}</strong><small>{m[1]}</small><span className="moduleOpen">Buka invoice ↗</span></Link> : m[0] === "Finance" ? <Link className="moduleCard" href="/workspace/finance" key={m[0]}><span className="moduleIcon">◇</span><strong>{m[0]}</strong><small>{m[1]}</small><span className="moduleOpen">Buka keuangan ↗</span></Link> : <article className="moduleCard moduleDisabled" key={m[0]}><span className="moduleIcon">◇</span><strong>{m[0]}</strong><small>{m[1]}</small><span className="moduleOpen">Dalam pengembangan</span></article>)}</div>
      <p className="workspaceFoot">Masuk sebagai {profile.email} · Akses dicatat dalam sistem.</p>
    </section>
  </main>;
}
