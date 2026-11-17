import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { SignOutButton } from "../sign-out-button";
import { createSite, createWarehouse, createUnit } from "./actions";

export const dynamic = "force-dynamic";

type Site = { id: string; code: string; name: string; site_type: string; address: { label?: string } | null };
type Warehouse = { code: string; name: string; warehouse_type: string; site_name: string };
type Unit = { code: string; name: string; dimension: string };

const siteLabels: Record<string,string> = { office:"Kantor",factory:"Pabrik",warehouse:"Gudang",distribution:"Distribusi",source:"Sumber" };
const warehouseLabels: Record<string,string> = { raw_material:"Bahan baku",packaging:"Kemasan",work_in_progress:"Barang dalam proses",finished_goods:"Produk jadi",quarantine:"Karantina",returns:"Retur" };
const dimensionLabels: Record<string,string> = { count:"Jumlah",volume:"Volume",mass:"Massa",length:"Panjang",area:"Luas",time:"Waktu",other:"Lainnya" };

export default async function OperationalSetupPage({ searchParams }: { searchParams: Promise<{ created?: string; error?: string }> }) {
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
      AND r.code IN ('OWNER','ADMIN')
    ORDER BY r.code LIMIT 1
  `;
  const actor = actors[0] as { organization_id:string; role_name:string } | undefined;
  if (!actor) redirect("/workspace?access=denied");

  const sites = await sql`
    SELECT id, code, name, site_type, address
    FROM sites WHERE organization_id = ${actor.organization_id}::uuid AND is_active = true
    ORDER BY name
  ` as Site[];
  const warehouses = await sql`
    SELECT w.code, w.name, w.warehouse_type, s.name AS site_name
    FROM warehouses w JOIN sites s ON s.id = w.site_id
    WHERE w.organization_id = ${actor.organization_id}::uuid AND w.is_active = true
    ORDER BY w.name
  ` as Warehouse[];
  const units = await sql`
    SELECT code, name, dimension FROM units_of_measure
    WHERE organization_id = ${actor.organization_id}::uuid ORDER BY name
  ` as Unit[];
  const params = await searchParams;

  return (
    <main className="workspace">
      <aside className="side">
        <Link className="brand" href="/">BANYU <span>AGUNG</span></Link>
        <p className="sideLabel">MASTER DATA</p>
        <Link className="sideLink" href="/workspace">← Ringkasan</Link>
        <Link className="sideLink" href="/workspace/products">Produk & Barang</Link>
        <Link className="sideActive" href="/workspace/setup">Lokasi, Gudang & Satuan</Link>
        <Link className="sideLink" href="/workspace/customers">Master Pelanggan</Link>
        <Link className="sideLink" href="/">Kembali ke Website</Link>
      </aside>
      <section className="workMain">
        <header className="workHeader">
          <div><p className="eyebrow">BANYU AGUNG / MASTER DATA</p><h1>Konfigurasi Operasional</h1><p className="muted">Lokasi kerja, gudang, dan satuan dasar · {actor.role_name}</p></div>
          <SignOutButton />
        </header>

        {params.created && <p className="authSuccess" role="status">{params.created === "site" ? "Lokasi berhasil disimpan." : params.created === "warehouse" ? "Gudang berhasil disimpan." : "Satuan berhasil disimpan."} Perubahan dicatat dalam audit.</p>}
        {params.error && <p className="authError" role="alert">{params.error === "site_invalid" ? "Periksa kode, nama, dan jenis lokasi." : params.error === "site_duplicate" ? "Kode lokasi sudah digunakan atau lokasi gagal disimpan." : params.error === "warehouse_invalid" ? "Periksa kode, nama, lokasi, dan jenis gudang." : params.error === "warehouse_site" ? "Pilih lokasi aktif yang terdaftar." : params.error === "warehouse_duplicate" ? "Kode gudang sudah digunakan atau gudang gagal disimpan." : params.error === "unit_invalid" ? "Periksa kode, nama, dan dimensi satuan." : "Kode satuan sudah digunakan atau satuan gagal disimpan."}</p>}

        <div className="metricGrid">
          <article className="metric"><span>Lokasi aktif</span><strong>{sites.length}</strong><small>Kantor, pabrik, gudang, distribusi, sumber</small></article>
          <article className="metric"><span>Gudang aktif</span><strong>{warehouses.length}</strong><small>Gudang terhubung ke lokasi</small></article>
          <article className="metric"><span>Satuan terdaftar</span><strong>{units.length}</strong><small>Referensi kuantitas produk</small></article>
          <article className="metric"><span>Hak akses</span><strong className="metricText">OWNER / ADMIN</strong><small>Perubahan dicatat dalam audit log</small></article>
        </div>

        <div className="setupGrid">
          <section className="metric">
            <h2 style={{marginTop:0}}>Tambah lokasi</h2>
            <p className="muted">Masukkan lokasi nyata yang digunakan perusahaan. Alamat bersifat opsional.</p>
            <form action={createSite} className="authForm">
              <label htmlFor="site-code">Kode lokasi</label><input id="site-code" name="code" required maxLength={20} placeholder="Contoh: JLT-01" />
              <label htmlFor="site-name">Nama lokasi</label><input id="site-name" name="name" required maxLength={120} placeholder="Nama lokasi resmi" />
              <label htmlFor="site-type">Jenis lokasi</label>
              <select id="site-type" name="site_type" defaultValue="factory">
                <option value="factory">Pabrik</option><option value="office">Kantor</option><option value="warehouse">Gudang</option><option value="distribution">Distribusi</option><option value="source">Sumber</option>
              </select>
              <label htmlFor="site-address">Alamat (opsional)</label><textarea id="site-address" name="address" rows={2} maxLength={500} placeholder="Alamat lokasi" />
              <button className="primary authSubmit" type="submit">Simpan lokasi</button>
            </form>
          </section>

          <section className="metric">
            <h2 style={{marginTop:0}}>Tambah gudang</h2>
            <p className="muted">Setiap gudang harus terhubung ke lokasi aktif.</p>
            {sites.length === 0 ? <p className="setupNotice">Daftarkan lokasi terlebih dahulu sebelum membuat gudang.</p> : (
              <form action={createWarehouse} className="authForm">
                <label htmlFor="warehouse-site">Lokasi</label><select id="warehouse-site" name="site_id" required>{sites.map(s=><option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</select>
                <label htmlFor="warehouse-code">Kode gudang</label><input id="warehouse-code" name="code" required maxLength={20} placeholder="Contoh: FG-01" />
                <label htmlFor="warehouse-name">Nama gudang</label><input id="warehouse-name" name="name" required maxLength={120} placeholder="Nama gudang" />
                <label htmlFor="warehouse-type">Jenis gudang</label>
                <select id="warehouse-type" name="warehouse_type" defaultValue="finished_goods">
                  <option value="raw_material">Bahan baku</option><option value="packaging">Kemasan</option><option value="work_in_progress">Barang dalam proses</option><option value="finished_goods">Produk jadi</option><option value="quarantine">Karantina</option><option value="returns">Retur</option>
                </select>
                <button className="primary authSubmit" type="submit">Simpan gudang</button>
              </form>
            )}
          </section>

          <section className="metric">
            <h2 style={{marginTop:0}}>Tambah satuan</h2>
            <p className="muted">Buat satuan dasar sebelum mendaftarkan produk agar pencatatan stok konsisten.</p>
            <form action={createUnit} className="authForm">
              <label htmlFor="unit-code">Kode satuan</label><input id="unit-code" name="code" required maxLength={20} placeholder="Contoh: BOTOL, GALON, LTR" />
              <label htmlFor="unit-name">Nama satuan</label><input id="unit-name" name="name" required maxLength={80} placeholder="Nama satuan" />
              <label htmlFor="unit-dimension">Dimensi</label>
              <select id="unit-dimension" name="dimension" defaultValue="count">
                <option value="count">Jumlah</option><option value="volume">Volume</option><option value="mass">Massa</option><option value="length">Panjang</option><option value="area">Luas</option><option value="time">Waktu</option><option value="other">Lainnya</option>
              </select>
              <button className="primary authSubmit" type="submit">Simpan satuan</button>
            </form>
          </section>
        </div>

        <h2>Data konfigurasi</h2>
        <div className="setupDataGrid">
          <section className="moduleCard"><strong>Lokasi</strong>{sites.length ? sites.map(s=><p key={s.id}><b>{s.code}</b> · {s.name}<small>{siteLabels[s.site_type] ?? s.site_type} · {s.address?.label ?? "Alamat belum diisi"}</small></p>) : <small>Belum ada lokasi.</small>}</section>
          <section className="moduleCard"><strong>Gudang</strong>{warehouses.length ? warehouses.map(w=><p key={w.code}><b>{w.code}</b> · {w.name}<small>{warehouseLabels[w.warehouse_type] ?? w.warehouse_type} · {w.site_name}</small></p>) : <small>Belum ada gudang.</small>}</section>
          <section className="moduleCard"><strong>Satuan</strong>{units.length ? units.map(u=><p key={u.code}><b>{u.code}</b> · {u.name}<small>{dimensionLabels[u.dimension] ?? u.dimension}</small></p>) : <small>Belum ada satuan.</small>}</section>
        </div>
        <p className="workspaceFoot"><Link href="/workspace">Kembali ke dashboard</Link> · Jangan daftarkan lokasi, satuan, atau kapasitas perkiraan yang belum dikonfirmasi.</p>
      </section>
    </main>
  );
}
