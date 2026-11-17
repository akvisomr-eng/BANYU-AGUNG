import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { SignOutButton } from "../sign-out-button";
import { createProduct } from "./actions";

export const dynamic = "force-dynamic";

const typeLabels: Record<string, string> = {
  finished_good: "Produk jadi",
  raw_material: "Bahan baku",
  packaging: "Kemasan",
  spare_part: "Suku cadang",
  service: "Jasa",
};

type ProductRow = {
  sku: string;
  name: string;
  product_type: string;
  is_sellable: boolean;
  is_purchasable: boolean;
  is_active: boolean;
  created_at: string;
};

export default async function ProductsPage({
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
    SELECT sku, name, product_type, is_sellable, is_purchasable, is_active, created_at
    FROM products
    WHERE organization_id = ${actor.organization_id}::uuid
    ORDER BY created_at DESC
    LIMIT 100
  ` as ProductRow[];
  const params = await searchParams;

  return (
    <main className="workspace">
      <aside className="side">
        <Link className="brand" href="/">BANYU <span>AGUNG</span></Link>
        <p className="sideLabel">MASTER DATA</p>
        <Link className="sideLink" href="/workspace">← Ringkasan</Link>
        <Link className="sideActive" href="/workspace/products">Produk & Barang</Link>
        <Link className="sideLink" href="/">Kembali ke Website</Link>
      </aside>
      <section className="workMain">
        <header className="workHeader">
          <div>
            <p className="eyebrow">BANYU AGUNG / MASTER DATA</p>
            <h1>Produk & Barang</h1>
            <p className="muted">Kelola SKU, klasifikasi barang, dan penggunaan produk · {actor.role_name}</p>
          </div>
          <SignOutButton />
        </header>

        {params.created === "1" && <p className="authSuccess" role="status">Produk berhasil disimpan dan tercatat dalam audit.</p>}
        {params.error === "invalid" && <p className="authError" role="alert">Periksa kembali SKU, nama, dan klasifikasi produk.</p>}
        {params.error === "save" && <p className="authError" role="alert">Produk tidak dapat disimpan. Pastikan SKU belum digunakan dan coba kembali.</p>}

        <div className="metricGrid">
          <article className="metric"><span>Total master produk</span><strong>{rows.length}</strong><small>Maksimal 100 data terbaru ditampilkan</small></article>
          <article className="metric"><span>Produk dapat dijual</span><strong>{rows.filter((row) => row.is_sellable && row.is_active).length}</strong><small>Data aktif dengan status dapat dijual</small></article>
          <article className="metric"><span>Bahan / kemasan</span><strong>{rows.filter((row) => ["raw_material", "packaging"].includes(row.product_type)).length}</strong><small>Termasuk bahan baku dan kemasan</small></article>
          <article className="metric"><span>Hak akses</span><strong>OWNER / ADMIN</strong><small>Perubahan tercatat di audit log</small></article>
        </div>

        <section className="metric" style={{ marginBottom: 28 }}>
          <h2 style={{ marginTop: 0 }}>Tambah master produk</h2>
          <p className="muted">Isi berdasarkan katalog dan spesifikasi resmi perusahaan. Belum ada data contoh yang dimasukkan.</p>
          <form action={createProduct} className="authForm" style={{ maxWidth: 760 }}>
            <label htmlFor="sku">Kode SKU</label>
            <input id="sku" name="sku" required minLength={2} maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9._/-]{1,39}" placeholder="Contoh: BA-AIR-600" />
            <label htmlFor="name">Nama produk / barang</label>
            <input id="name" name="name" required minLength={2} maxLength={160} placeholder="Nama sesuai master perusahaan" />
            <label htmlFor="product_type">Klasifikasi</label>
            <select id="product_type" name="product_type" required defaultValue="finished_good">
              <option value="finished_good">Produk jadi</option>
              <option value="raw_material">Bahan baku</option>
              <option value="packaging">Kemasan</option>
              <option value="spare_part">Suku cadang</option>
              <option value="service">Jasa</option>
            </select>
            <label htmlFor="description">Keterangan (opsional)</label>
            <textarea id="description" name="description" maxLength={1000} rows={3} placeholder="Spesifikasi atau keterangan singkat" />
            <label style={{ display: "flex", alignItems: "center", gap: 9, fontWeight: 400 }}>
              <input type="checkbox" name="is_sellable" style={{ width: 16 }} /> Dapat dijual
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 9, fontWeight: 400 }}>
              <input type="checkbox" name="is_purchasable" style={{ width: 16 }} /> Dapat dibeli
            </label>
            <button className="primary authSubmit" type="submit">Simpan master produk</button>
          </form>
        </section>

        <h2>Daftar produk</h2>
        {rows.length === 0 ? (
          <article className="moduleCard">
            <strong>Belum ada master produk</strong>
            <small>Tambahkan SKU resmi perusahaan melalui formulir di atas. Data ini akan menjadi referensi pembelian, persediaan, produksi, dan penjualan.</small>
          </article>
        ) : (
          <div className="moduleGrid">
            {rows.map((row) => (
              <article className="moduleCard" key={row.sku}>
                <span className="moduleIcon">{row.is_active ? "◇" : "○"}</span>
                <strong>{row.name}</strong>
                <small>{row.sku} · {typeLabels[row.product_type] ?? row.product_type}</small>
                <small>{row.is_sellable ? "Dapat dijual" : "Tidak untuk dijual"} · {row.is_purchasable ? "Dapat dibeli" : "Tidak untuk dibeli"}</small>
                <span className="moduleOpen">{row.is_active ? "Aktif" : "Nonaktif"}</span>
              </article>
            ))}
          </div>
        )}
        <p className="workspaceFoot"><Link href="/workspace">Kembali ke dashboard</Link> · Setiap produk baru dicatat pada audit log.</p>
      </section>
    </main>
  );
}
