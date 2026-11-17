import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { SignOutButton } from "../sign-out-button";
import { createSupplier } from "./actions";

export const dynamic = "force-dynamic";

type Supplier = { supplier_code: string; name: string; supplier_type: string; contact_name: string | null; phone: string | null; email: string | null; payment_terms_days: number; status: string };
const supplierLabels: Record<string,string> = { general:"Umum",raw_material:"Bahan baku",packaging:"Kemasan",service:"Jasa",logistics:"Logistik" };

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ created?:string; error?:string }> }) {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");
  const { sql } = await import("@/lib/db");
  const actors = await sql`
    SELECT p.organization_id, r.name AS role_name
    FROM user_profiles p JOIN user_role_assignments a ON a.user_id=p.id
    JOIN roles r ON r.id=a.role_id
    WHERE p.auth_subject=${session.user.id} AND p.status='active' AND r.code IN ('OWNER','ADMIN')
    ORDER BY r.code LIMIT 1
  `;
  const actor = actors[0] as {organization_id:string;role_name:string}|undefined;
  if (!actor) redirect("/workspace?access=denied");
  const rows = await sql`
    SELECT supplier_code,name,supplier_type,contact_name,phone,email,payment_terms_days,status
    FROM suppliers WHERE organization_id=${actor.organization_id}::uuid
    ORDER BY created_at DESC LIMIT 100
  ` as Supplier[];
  const params = await searchParams;

  return (
    <main className="workspace">
      <aside className="side">
        <Link className="brand" href="/">BANYU <span>AGUNG</span></Link>
        <p className="sideLabel">PROCUREMENT</p>
        <Link className="sideLink" href="/workspace">← Ringkasan</Link>
        <Link className="sideActive" href="/workspace/suppliers">Master Pemasok</Link>
        <Link className="sideLink" href="/workspace/purchase-orders">Purchase Orders</Link>
        <Link className="sideLink" href="/workspace/setup">Konfigurasi Operasional</Link>
        <Link className="sideLink" href="/">Kembali ke Website</Link>
      </aside>
      <section className="workMain">
        <header className="workHeader"><div><p className="eyebrow">BANYU AGUNG / PROCUREMENT</p><h1>Master Pemasok</h1><p className="muted">Data pemasok yang telah diverifikasi · {actor.role_name}</p></div><SignOutButton /></header>
        {params.created === "1" && <p className="authSuccess" role="status">Pemasok berhasil disimpan dan dicatat dalam audit.</p>}
        {params.error && <p className="authError" role="alert">{params.error === "invalid" ? "Periksa kode, nama, kontak, dan termin pembayaran." : params.error === "duplicate" ? "Kode pemasok sudah digunakan atau data gagal disimpan." : "Pemasok tidak dapat disimpan."}</p>}
        <div className="metricGrid">
          <article className="metric"><span>Total pemasok</span><strong>{rows.length}</strong><small>Maksimal 100 data terbaru</small></article>
          <article className="metric"><span>Pemasok bahan baku</span><strong>{rows.filter(x=>x.supplier_type==="raw_material").length}</strong><small>Master aktif</small></article>
          <article className="metric"><span>Pemasok kemasan</span><strong>{rows.filter(x=>x.supplier_type==="packaging").length}</strong><small>Master aktif</small></article>
          <article className="metric"><span>Hak akses</span><strong className="metricText">OWNER / ADMIN</strong><small>Perubahan tercatat dalam audit</small></article>
        </div>
        <section className="metric supplierCreatePanel">
          <h2 style={{marginTop:0}}>Tambah pemasok</h2>
          <p className="muted">Daftarkan pemasok berdasarkan identitas dan kontak yang sudah diverifikasi.</p>
          <form action={createSupplier} className="authForm supplierForm">
            <label htmlFor="supplier_code">Kode pemasok</label><input id="supplier_code" name="supplier_code" required maxLength={20} placeholder="Contoh: SUP-001" />
            <label htmlFor="name">Nama pemasok / badan usaha</label><input id="name" name="name" required maxLength={160} placeholder="Nama resmi pemasok" />
            <label htmlFor="supplier_type">Kategori</label><select id="supplier_type" name="supplier_type" defaultValue="general"><option value="general">Umum</option><option value="raw_material">Bahan baku</option><option value="packaging">Kemasan</option><option value="service">Jasa</option><option value="logistics">Logistik</option></select>
            <label htmlFor="contact_name">Nama kontak (opsional)</label><input id="contact_name" name="contact_name" maxLength={120} placeholder="Nama PIC" />
            <label htmlFor="phone">Telepon / WhatsApp (opsional)</label><input id="phone" name="phone" maxLength={24} inputMode="tel" placeholder="Nomor kontak" />
            <label htmlFor="email">Email (opsional)</label><input id="email" name="email" type="email" maxLength={254} placeholder="nama@email.com" />
            <label htmlFor="address">Alamat (opsional)</label><textarea id="address" name="address" maxLength={500} rows={2} placeholder="Alamat pemasok" />
            <label htmlFor="payment_terms_days">Termin pembayaran (hari)</label><input id="payment_terms_days" name="payment_terms_days" type="number" min="0" max="365" step="1" defaultValue="0" required />
            <button className="primary authSubmit" type="submit">Simpan pemasok</button>
          </form>
        </section>
        <h2>Daftar pemasok</h2>
        {rows.length === 0 ? <article className="moduleCard"><strong>Belum ada pemasok terdaftar</strong><small>Data pemasok nyata perlu diinput sebelum purchase order dibuat.</small></article> :
          <div className="customerList">{rows.map(row=><article className="customerItem" key={row.supplier_code}><div><span className="inquiryType">{row.supplier_code} · {supplierLabels[row.supplier_type] ?? row.supplier_type}</span><h3>{row.name}</h3></div><span className="inquiryStatus">{row.status === "active" ? "Aktif" : row.status}</span><div className="inquiryContacts">{row.phone && <a href={`https://wa.me/${row.phone.replace(/[^0-9]/g,"")}`} target="_blank" rel="noreferrer">{row.phone} ↗</a>}{row.email && <a href={`mailto:${row.email}`}>{row.email}</a>}<small>Termin {row.payment_terms_days} hari{row.contact_name ? ` · PIC ${row.contact_name}` : ""}</small></div></article>)}</div>
        }
        <p className="workspaceFoot"><Link href="/workspace">Kembali ke dashboard</Link> · Gunakan data legal dan kontak yang terverifikasi.</p>
      </section>
    </main>
  );
}
