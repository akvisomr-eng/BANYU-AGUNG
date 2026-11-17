import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { SignOutButton } from "../sign-out-button";
import { createCustomer } from "./actions";

export const dynamic = "force-dynamic";

type Customer = {
  id: string;
  customer_code: string;
  customer_type: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
  created_at: string;
};

const typeLabels: Record<string, string> = {
  retail: "Pelanggan umum",
  wholesale: "Grosir",
  reseller: "Reseller",
  distributor: "Distributor",
  institutional: "Institusi",
};

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; error?: string }>;
}) {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");
  const { sql } = await import("@/lib/db");

  const actors = await sql`
    SELECT p.organization_id, r.name AS role_name
    FROM user_profiles p
    JOIN user_role_assignments a ON a.user_id = p.id
    JOIN roles r ON r.id = a.role_id
    WHERE p.auth_subject = ${session.user.id}
      AND p.status = 'active'
      AND r.code IN ('OWNER', 'ADMIN')
    ORDER BY r.code
    LIMIT 1
  `;
  const actor = actors[0] as { organization_id: string; role_name: string } | undefined;
  if (!actor) redirect("/workspace?access=denied");

  const rows = await sql`
    SELECT id, customer_code, customer_type, name, phone, email, status, created_at
    FROM customers
    WHERE organization_id = ${actor.organization_id}::uuid
    ORDER BY created_at DESC
    LIMIT 100
  ` as Customer[];
  const params = await searchParams;

  return (
    <main className="workspace">
      <aside className="side">
        <Link className="brand" href="/">BANYU <span>AGUNG</span></Link>
        <p className="sideLabel">CUSTOMER RELATIONSHIP</p>
        <Link className="sideLink" href="/workspace">← Ringkasan</Link>
        <Link className="sideLink" href="/workspace/inquiries">Permintaan pelanggan</Link>
        <Link className="sideActive" href="/workspace/customers">Master pelanggan</Link>
        <Link className="sideLink" href="/workspace/products">Master Produk</Link>
        <Link className="sideLink" href="/">Kembali ke Website</Link>
      </aside>
      <section className="workMain">
        <header className="workHeader">
          <div>
            <p className="eyebrow">BANYU AGUNG / CRM</p>
            <h1>Master Pelanggan</h1>
            <p className="muted">Data pelanggan resmi untuk proses penjualan dan layanan · {actor.role_name}</p>
          </div>
          <SignOutButton />
        </header>

        {params.created === "1" && <p className="authSuccess" role="status">Pelanggan berhasil disimpan dan dicatat dalam audit.</p>}
        {params.error === "invalid" && <p className="authError" role="alert">Periksa kembali nama, nomor telepon, dan klasifikasi pelanggan.</p>}
        {params.error === "save" && <p className="authError" role="alert">Data pelanggan tidak dapat disimpan. Periksa kembali dan coba lagi.</p>}{params.error === "duplicate" && <p className="authError" role="alert">Pelanggan dengan nomor telepon atau email tersebut sudah terdaftar.</p>}

        <div className="metricGrid">
          <article className="metric"><span>Total pelanggan</span><strong>{rows.length}</strong><small>Maksimal 100 data terbaru ditampilkan</small></article>
          <article className="metric"><span>Distributor</span><strong>{rows.filter((row) => row.customer_type === "distributor").length}</strong><small>Data master aktif</small></article>
          <article className="metric"><span>Reseller</span><strong>{rows.filter((row) => row.customer_type === "reseller").length}</strong><small>Data master aktif</small></article>
          <article className="metric"><span>Hak akses</span><strong className="metricText">OWNER / ADMIN</strong><small>Data dibatasi per organisasi</small></article>
        </div>

        <section className="metric customerCreatePanel">
          <h2 style={{ marginTop: 0 }}>Tambah pelanggan</h2>
          <p className="muted">Masukkan data pelanggan yang sudah dikonfirmasi oleh tim. Data dari permintaan website dapat dikonversi melalui kotak masuk CRM.</p>
          <form action={createCustomer} className="authForm customerForm">
            <label htmlFor="customer_type">Jenis pelanggan</label>
            <select id="customer_type" name="customer_type" defaultValue="retail" required>
              <option value="retail">Pelanggan umum</option>
              <option value="wholesale">Grosir</option>
              <option value="reseller">Reseller</option>
              <option value="distributor">Distributor</option>
              <option value="institutional">Institusi</option>
            </select>
            <label htmlFor="name">Nama pelanggan / badan usaha</label>
            <input id="name" name="name" required minLength={2} maxLength={160} placeholder="Nama sesuai konfirmasi pelanggan" />
            <label htmlFor="phone">Nomor telepon / WhatsApp</label>
            <input id="phone" name="phone" required minLength={8} maxLength={24} inputMode="tel" placeholder="Nomor kontak pelanggan" />
            <label htmlFor="email">Email (opsional)</label>
            <input id="email" name="email" type="email" maxLength={254} placeholder="nama@email.com" />
            <button className="primary authSubmit" type="submit">Simpan pelanggan</button>
          </form>
        </section>

        <h2>Daftar pelanggan</h2>
        {rows.length === 0 ? (
          <article className="moduleCard">
            <strong>Belum ada pelanggan terdaftar</strong>
            <small>Tambahkan pelanggan yang sudah dikonfirmasi atau konversi permintaan yang memenuhi syarat dari kotak masuk CRM.</small>
            <Link className="moduleOpen" href="/workspace/inquiries">Buka permintaan pelanggan ↗</Link>
          </article>
        ) : (
          <div className="customerList">
            {rows.map((row) => (
              <article className="customerItem" key={row.id}>
                <div><span className="inquiryType">{row.customer_code} · {typeLabels[row.customer_type] ?? row.customer_type}</span><h3>{row.name}</h3></div>
                <span className="inquiryStatus">{row.status === "active" ? "Aktif" : row.status}</span>
                <div className="inquiryContacts">
                  {row.phone && <a href={`https://wa.me/${row.phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer">{row.phone} ↗</a>}
                  {row.email && <a href={`mailto:${row.email}`}>{row.email}</a>}
                </div>
              </article>
            ))}
          </div>
        )}
        <p className="workspaceFoot"><Link href="/workspace">Kembali ke dashboard</Link> · Master pelanggan menjadi referensi proses penjualan.</p>
      </section>
    </main>
  );
}
