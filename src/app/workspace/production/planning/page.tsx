import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { SignOutButton } from "../../sign-out-button";
import { createProductionBatch } from "../actions";

export const dynamic = "force-dynamic";

type BOM = { id: string; sku: string; product_name: string; version: string; output_quantity: string | number; unit_code: string | null };
type Line = { id: string; code: string; name: string; site_name: string };

export default async function ProductionPlanningPage({ searchParams }: { searchParams: Promise<{ planned?: string; error?: string }> }) {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");
  const { sql } = await import("@/lib/db");
  const actors = await sql`
    SELECT p.organization_id, r.name AS role_name
    FROM user_profiles p
    JOIN user_role_assignments a ON a.user_id = p.id
    JOIN roles r ON r.id = a.role_id
    WHERE p.auth_subject = ${session.user.id} AND p.status = 'active'
      AND r.code IN ('OWNER', 'ADMIN')
    ORDER BY CASE r.code WHEN 'OWNER' THEN 0 ELSE 1 END LIMIT 1
  `;
  const actor = actors[0] as { organization_id: string; role_name: string } | undefined;
  if (!actor) redirect("/workspace?access=denied");
  const [boms, lines] = await Promise.all([
    sql`
      SELECT pb.id, p.sku, p.name AS product_name, pb.version, pb.output_quantity, u.code AS unit_code
      FROM product_boms pb
      JOIN products p ON p.id = pb.product_id
      LEFT JOIN units_of_measure u ON u.id = p.base_unit_id
      WHERE pb.organization_id = ${actor.organization_id}::uuid
        AND pb.status = 'approved' AND p.organization_id = pb.organization_id
        AND p.product_type = 'finished_good' AND p.is_active = true
        AND (pb.effective_from IS NULL OR pb.effective_from <= current_date)
        AND (pb.effective_to IS NULL OR pb.effective_to >= current_date)
      ORDER BY p.name, pb.version DESC
    `,
    sql`
      SELECT pl.id, pl.code, pl.name, s.name AS site_name
      FROM production_lines pl
      JOIN sites s ON s.id = pl.site_id AND s.organization_id = pl.organization_id
      WHERE pl.organization_id = ${actor.organization_id}::uuid
        AND pl.is_active = true AND s.is_active = true
      ORDER BY pl.name
    `
  ]) as [BOM[], Line[]];
  const params = await searchParams;
  const number = (value: string | number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 }).format(Number(value ?? 0));

  return (
    <main className="workspace">
      <aside className="side">
        <Link className="brand" href="/">BANYU <span>AGUNG</span></Link>
        <p className="sideLabel">OPERATIONS</p>
        <Link className="sideLink" href="/workspace">← Ringkasan</Link>
        <Link className="sideLink" href="/workspace/production">Kontrol Produksi</Link>
        <Link className="sideActive" href="/workspace/production/planning">Rencana Batch</Link>
        <Link className="sideLink" href="/workspace/products">Produk & BOM</Link>
        <Link className="sideLink" href="/workspace/inventory">Persediaan</Link>
        <Link className="sideLink" href="/workspace/quality">Quality Control</Link>
      </aside>
      <section className="workMain">
        <header className="workHeader">
          <div><p className="eyebrow">BANYU AGUNG / OPERATIONS</p><h1>Rencana Batch Produksi</h1>
          <p className="muted">Rencana awal produksi · {actor.role_name}</p></div>
          <SignOutButton />
        </header>
        <div className="inventoryNotice">
          Form ini hanya membuat batch berstatus Terencana. Tidak ada stok yang dikurangi, bahan yang dikeluarkan,
          hasil produksi yang diterima, atau jurnal yang diposting. Eksekusi produksi menunggu integrasi stok dan biaya.
        </div>
        {params.planned === "1" && <p className="authSuccess" role="status">Rencana batch berhasil disimpan dan tercatat dalam audit.</p>}
        {params.error === "invalid" && <p className="authError" role="alert">Periksa kembali BOM, lini produksi, jumlah, dan jadwal.</p>}
        {params.error === "reference" && <p className="authError" role="alert">BOM atau lini tidak aktif/tidak berlaku untuk organisasi ini.</p>}
        {params.error === "save" && <p className="authError" role="alert">Rencana tidak dapat disimpan. Periksa data dan coba kembali.</p>}
        {boms.length === 0 || lines.length === 0 ? (
          <article className="moduleCard"><strong>Data master belum siap</strong>
            <p>{boms.length === 0 ? "Belum ada BOM produk jadi yang disetujui dan masih berlaku. " : ""}{lines.length === 0 ? "Belum ada lini produksi aktif pada lokasi aktif." : ""}</p>
            <small>Lengkapi produk, BOM, lokasi, dan lini produksi sebelum membuat rencana batch.</small>
          </article>
        ) : (
          <section className="metric" style={{ marginBottom: 28 }}>
            <h2 style={{ marginTop: 0 }}>Detail rencana produksi</h2>
            <form action={createProductionBatch} className="authForm" style={{ maxWidth: 760 }}>
              <label htmlFor="bom_id">Produk jadi & versi BOM</label>
              <select id="bom_id" name="bom_id" required defaultValue="">
                <option value="" disabled>Pilih BOM yang disetujui</option>
                {boms.map((bom) => <option key={bom.id} value={bom.id}>{bom.sku} · {bom.product_name} — BOM {bom.version} (standar {number(bom.output_quantity)} {bom.unit_code ?? "unit"})</option>)}
              </select>
              <label htmlFor="production_line_id">Lini produksi</label>
              <select id="production_line_id" name="production_line_id" required defaultValue="">
                <option value="" disabled>Pilih lini aktif</option>
                {lines.map((line) => <option key={line.id} value={line.id}>{line.code} · {line.name} — {line.site_name}</option>)}
              </select>
              <label htmlFor="planned_quantity">Jumlah rencana (satuan dasar produk)</label>
              <input id="planned_quantity" name="planned_quantity" type="number" min="0.0001" max="1000000000" step="0.0001" required placeholder="Contoh: 1000" />
              <label htmlFor="planned_start">Jadwal mulai (opsional)</label>
              <input id="planned_start" name="planned_start" type="datetime-local" />
              <button type="submit" className="primary">Simpan rencana batch</button>
            </form>
          </section>
        )}
        <p className="workspaceFoot"><Link href="/workspace/production">← Kembali ke kontrol produksi</Link></p>
      </section>
    </main>
  );
}
