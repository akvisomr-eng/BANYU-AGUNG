import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { SignOutButton } from "../sign-out-button";
import { updateInquiryStatus } from "./actions";

export const dynamic = "force-dynamic";

type Inquiry = {
  id: string;
  inquiry_type: string;
  contact_name: string;
  phone: string;
  email: string | null;
  preferred_contact: string;
  message: string;
  status: string;
  created_at: string;
};

const labels: Record<string, string> = {
  product_info: "Informasi produk",
  order: "Pemesanan",
  partnership: "Kemitraan",
  complaint: "Layanan / keluhan",
  other: "Lainnya",
};
const statuses = ["new", "assigned", "contacted", "qualified", "converted", "closed", "spam"];
const statusLabels: Record<string, string> = {
  new: "Baru", assigned: "Ditugaskan", contacted: "Dihubungi",
  qualified: "Prospek", converted: "Menjadi pelanggan", closed: "Selesai", spam: "Spam",
};

export default async function InquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ updated?: string; error?: string }>;
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
    SELECT id, inquiry_type, contact_name, phone, email, preferred_contact,
           message, status, created_at
    FROM customer_inquiries
    WHERE organization_id = ${actor.organization_id}::uuid
    ORDER BY created_at DESC
    LIMIT 100
  ` as Inquiry[];
  const params = await searchParams;

  return (
    <main className="workspace">
      <aside className="side">
        <Link className="brand" href="/">BANYU <span>AGUNG</span></Link>
        <p className="sideLabel">CUSTOMER RELATIONSHIP</p>
        <Link className="sideLink" href="/workspace">← Ringkasan</Link>
        <Link className="sideActive" href="/workspace/inquiries">Permintaan pelanggan</Link>
        <Link className="sideLink" href="/workspace/products">Master Produk</Link>
        <Link className="sideLink" href="/">Kembali ke Website</Link>
      </aside>
      <section className="workMain">
        <header className="workHeader">
          <div>
            <p className="eyebrow">BANYU AGUNG / CRM</p>
            <h1>Permintaan Pelanggan</h1>
            <p className="muted">Kotak masuk permintaan dari formulir website · {actor.role_name}</p>
          </div>
          <SignOutButton />
        </header>
        {params.updated === "1" && <p className="authSuccess" role="status">Status permintaan berhasil diperbarui dan dicatat dalam audit.</p>}
        {params.error && <p className="authError" role="alert">Perubahan tidak dapat diproses. Muat ulang dan periksa kembali permintaan.</p>}
        <div className="metricGrid inquiryMetrics">
          <article className="metric"><span>Total ditampilkan</span><strong>{rows.length}</strong><small>Maksimal 100 permintaan terbaru</small></article>
          <article className="metric"><span>Belum ditangani</span><strong>{rows.filter((row) => row.status === "new").length}</strong><small>Perlu ditindaklanjuti</small></article>
          <article className="metric"><span>Sudah dihubungi</span><strong>{rows.filter((row) => ["contacted", "qualified"].includes(row.status)).length}</strong><small>Dalam proses tindak lanjut</small></article>
          <article className="metric"><span>Hak akses</span><strong className="metricText">OWNER / ADMIN</strong><small>Data dibatasi per organisasi</small></article>
        </div>
        <h2>Daftar permintaan terbaru</h2>
        {rows.length === 0 ? (
          <article className="moduleCard">
            <strong>Belum ada permintaan masuk</strong>
            <small>Permintaan dari formulir publik akan muncul di sini setelah pelanggan mengirimkannya.</small>
            <Link href="/permintaan" className="moduleOpen">Lihat formulir publik ↗</Link>
          </article>
        ) : (
          <div className="inquiryList">
            {rows.map((row) => (
              <article className="inquiryItem" key={row.id}>
                <div className="inquiryItemHead">
                  <div><span className="inquiryType">{labels[row.inquiry_type] ?? row.inquiry_type}</span><h3>{row.contact_name}</h3></div>
                  <span className={`inquiryStatus inquiryStatus-${row.status}`}>{statusLabels[row.status] ?? row.status}</span>
                </div>
                <p className="inquiryDate">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(row.created_at))} WIB</p>
                <p className="inquiryMessage">{row.message}</p>
                <div className="inquiryContacts">
                  <a href={`https://wa.me/${row.phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer">WhatsApp: {row.phone} ↗</a>
                  {row.email && <a href={`mailto:${row.email}`}>{row.email}</a>}
                  <small>Preferensi: {row.preferred_contact === "whatsapp" ? "WhatsApp" : row.preferred_contact === "phone" ? "Telepon" : "Email"}</small>
                </div>
                <form action={updateInquiryStatus} className="inquiryStatusForm">
                  <input type="hidden" name="inquiry_id" value={row.id} />
                  <label htmlFor={`status-${row.id}`}>Perbarui status</label>
                  <select id={`status-${row.id}`} name="status" defaultValue={row.status}>
                    {statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
                  </select>
                  <button type="submit" className="primary">Simpan</button>
                </form>
              </article>
            ))}
          </div>
        )}
        <p className="workspaceFoot"><Link href="/workspace">Kembali ke dashboard</Link> · Data kontak hanya untuk tindak lanjut layanan.</p>
      </section>
    </main>
  );
}
