import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { sql } from "@/lib/db";
import { SignOutButton } from "./sign-out-button";

const modules = [
  ["Sales & CRM","Pelanggan, penawaran, pesanan"],["Production","Rencana, batch, hasil produksi"],["Quality Control","Sampling, hasil uji, release"],["Inventory","Bahan baku, kemasan, stok"],["Procurement","Supplier, PO, penerimaan"],["Distribution","Pengiriman, armada, retur"],["Finance","Kas, bank, jurnal, AR/AP"],["Human Resources","Karyawan, absensi, payroll"],["Assets & Maintenance","Mesin, kendaraan, perawatan"],["Reports & Analytics","KPI dan laporan manajemen"],["Compliance","Izin, sertifikat, dokumen"],["Administration","Pengguna, peran, audit"]
];

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");

  const rows = await sql`
    SELECT p.full_name, p.email, r.name AS role_name
    FROM user_profiles p
    JOIN user_role_assignments ura ON ura.user_id = p.id
    JOIN roles r ON r.id = ura.role_id
    WHERE p.auth_subject = ${session.user.id}
      AND p.status = 'active'
    ORDER BY r.code
    LIMIT 1
  `;
  const profile = rows[0] as { full_name: string; email: string; role_name: string } | undefined;
  if (!profile) redirect("/auth/sign-in?access=not-provisioned");

  return <main className="workspace">
    <aside className="side">
      <Link className="brand" href="/">BANYU <span>AGUNG</span></Link>
      <p className="sideLabel">ENTERPRISE</p>
      <Link className="sideActive" href="/workspace">◫ &nbsp; Ringkasan</Link>
      {modules.map(m=><a className="sideLink" href="#modul" key={m[0]}>{m[0]}</a>)}
      <Link className="sideLink" href="/">← Kembali ke Website</Link>
    </aside>
    <section className="workMain">
      <header className="workHeader">
        <div><p className="eyebrow">BANYU AGUNG / ENTERPRISE</p><h1>Dashboard Manajemen</h1><p className="muted">Selamat datang, {profile.full_name}. {profile.role_name}</p></div>
        <SignOutButton/>
      </header>
      <div className="notice">Akun Anda telah terautentikasi. Modul transaksi masih dalam tahap aktivasi; angka operasional belum ditampilkan sampai data diverifikasi dan alur transaksi diuji.</div>
      <div className="metricGrid">{[["Penjualan","Belum tersedia","Menunggu aktivasi"],["Produksi","Belum tersedia","Menunggu aktivasi"],["Stok tersedia","Belum tersedia","Menunggu aktivasi"],["Piutang","Belum tersedia","Menunggu aktivasi"]].map(x=><article className="metric" key={x[0]}><span>{x[0]}</span><strong className="metricText">{x[1]}</strong><small>{x[2]}</small></article>)}</div>
      <h2 id="modul">Modul perusahaan</h2>
      <div className="moduleGrid">{modules.map(m=><article className="moduleCard moduleDisabled" key={m[0]}><span className="moduleIcon">◇</span><strong>{m[0]}</strong><small>{m[1]}</small><span className="moduleOpen">Dalam pengembangan</span></article>)}</div>
      <p className="workspaceFoot">Masuk sebagai {profile.email} · Akses dicatat dalam sistem.</p>
    </section>
  </main>;
}
