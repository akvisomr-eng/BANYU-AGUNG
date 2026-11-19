import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { SignOutButton } from "../sign-out-button";

export const dynamic = "force-dynamic";

type Batch = {
  batch_number: string;
  product_sku: string;
  product_name: string;
  line_name: string | null;
  planned_quantity: string | number;
  produced_quantity: string | number;
  rejected_quantity: string | number;
  status: string;
  quality_status: string;
  planned_start: string | null;
  started_at: string | null;
  completed_at: string | null;
  supervisor_name: string | null;
  bom_version: string | null;
  input_count: string | number;
  consumed_quantity: string | number;
};

type Line = {
  code: string;
  name: string;
  site_name: string;
  nominal_capacity_per_hour: string | number | null;
  capacity_unit: string | null;
  active_batches: string | number;
};

type Summary = {
  total_batches: string | number;
  active_batches: string | number;
  waiting_quality: string | number;
  completed_batches: string | number;
  planned_quantity: string | number;
  produced_quantity: string | number;
  rejected_quantity: string | number;
  approved_boms: string | number;
  draft_boms: string | number;
};

const statusLabels: Record<string, string> = {
  planned: "Terencana",
  released: "Siap dijalankan",
  in_progress: "Sedang berjalan",
  quality_hold: "Ditahan QC",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

const qualityLabels: Record<string, string> = {
  pending: "Menunggu QC",
  released: "Lulus QC",
  rejected: "Ditolak QC",
};

const number = (value: string | number) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(Number(value ?? 0));

export default async function ProductionPage() {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");

  const { sql } = await import("@/lib/db");
  const actors = await sql`
    SELECT p.organization_id, r.name AS role_name, r.code AS role_code
    FROM user_profiles p
    JOIN user_role_assignments a ON a.user_id = p.id
    JOIN roles r ON r.id = a.role_id
    WHERE p.auth_subject = ${session.user.id}
      AND p.status = 'active'
      AND r.code IN ('OWNER', 'ADMIN')
    ORDER BY CASE r.code WHEN 'OWNER' THEN 0 ELSE 1 END
    LIMIT 1
  `;
  const actor = actors[0] as
    | { organization_id: string; role_name: string; role_code: string }
    | undefined;
  if (!actor) redirect("/workspace?access=denied");

  const [summaryRows, batches, lines] = await Promise.all([
    sql`
      SELECT
        count(*) AS total_batches,
        count(*) FILTER (WHERE status IN ('released','in_progress','quality_hold')) AS active_batches,
        count(*) FILTER (WHERE status = 'completed' AND quality_status = 'pending') AS waiting_quality,
        count(*) FILTER (WHERE status = 'completed' AND quality_status = 'released') AS completed_batches,
        coalesce(sum(planned_quantity), 0) AS planned_quantity,
        coalesce(sum(produced_quantity), 0) AS produced_quantity,
        coalesce(sum(rejected_quantity), 0) AS rejected_quantity,
        (SELECT count(*) FROM product_boms WHERE organization_id = ${actor.organization_id}::uuid AND status = 'approved') AS approved_boms,
        (SELECT count(*) FROM product_boms WHERE organization_id = ${actor.organization_id}::uuid AND status = 'draft') AS draft_boms
      FROM production_batches
      WHERE organization_id = ${actor.organization_id}::uuid
        AND created_at >= date_trunc('month', now())
    `,
    sql`
      SELECT b.batch_number, p.sku AS product_sku, p.name AS product_name,
        pl.name AS line_name, b.planned_quantity, b.produced_quantity, b.rejected_quantity,
        b.status, b.quality_status, b.planned_start, b.started_at, b.completed_at,
        up.full_name AS supervisor_name, pb.version AS bom_version,
        count(DISTINCT i.id) AS input_count,
        coalesce(sum(i.quantity_consumed), 0) AS consumed_quantity
      FROM production_batches b
      JOIN products p ON p.id = b.product_id
      LEFT JOIN production_lines pl ON pl.id = b.production_line_id
      LEFT JOIN user_profiles up ON up.id = b.supervisor_id
      LEFT JOIN product_boms pb ON pb.id = b.bom_id
      LEFT JOIN production_batch_inputs i ON i.batch_id = b.id
      WHERE b.organization_id = ${actor.organization_id}::uuid
      GROUP BY b.id, p.sku, p.name, pl.name, up.full_name, pb.version
      ORDER BY b.created_at DESC
      LIMIT 30
    `,
    sql`
      SELECT pl.code, pl.name, s.name AS site_name, pl.nominal_capacity_per_hour,
        u.code AS capacity_unit,
        count(b.id) FILTER (WHERE b.status IN ('released','in_progress','quality_hold')) AS active_batches
      FROM production_lines pl
      JOIN sites s ON s.id = pl.site_id
      LEFT JOIN units_of_measure u ON u.id = pl.capacity_unit_id
      LEFT JOIN production_batches b ON b.production_line_id = pl.id
        AND b.organization_id = pl.organization_id
        AND b.status IN ('released','in_progress','quality_hold')
      WHERE pl.organization_id = ${actor.organization_id}::uuid
      GROUP BY pl.id, s.name, u.code
      ORDER BY pl.name
    `,
  ]) as [Summary[], Batch[], Line[]];

  const summary = summaryRows[0] as Summary;
  const yieldRate = Number(summary.planned_quantity) > 0
    ? (Number(summary.produced_quantity) / Number(summary.planned_quantity)) * 100
    : 0;
  const rejectRate = Number(summary.produced_quantity) > 0
    ? (Number(summary.rejected_quantity) / Number(summary.produced_quantity)) * 100
    : 0;

  return (
    <main className="workspace">
      <aside className="side">
        <Link className="brand" href="/">BANYU <span>AGUNG</span></Link>
        <p className="sideLabel">OPERATIONS</p>
        <Link className="sideLink" href="/workspace">← Ringkasan</Link>
        <Link className="sideActive" href="/workspace/production">Kontrol Produksi</Link>
        <Link className="sideLink" href="/workspace/products">Produk & BOM</Link>
        <Link className="sideLink" href="/workspace/inventory">Persediaan</Link>
        <Link className="sideLink" href="/workspace/quality">Quality Control</Link>
        <Link className="sideLink" href="/workspace/goods-receipts">Penerimaan Bahan</Link>
      </aside>
      <section className="workMain">
        <header className="workHeader">
          <div>
            <p className="eyebrow">BANYU AGUNG / OPERATIONS</p>
            <h1>Kontrol Produksi</h1>
            <p className="muted">Pemantauan batch, kapasitas lini, konsumsi bahan dan kesiapan mutu · {actor.role_name}</p>
          </div>
          <SignOutButton />
        </header>

        <div className="inventoryNotice">
          Halaman ini merupakan fondasi pemantauan baca-saja. Belum ada perintah mulai produksi, pemakaian stok,
          penutupan batch, atau penerimaan hasil produksi. Pergerakan persediaan harus dibuat melalui alur produksi
          tervalidasi agar lot, biaya, dan jurnal tetap dapat ditelusuri.
        </div>

        <div className="metricGrid">
          <article className="metric"><span>Batch bulan ini</span><strong>{number(summary.total_batches)}</strong><small>Seluruh status batch</small></article>
          <article className="metric"><span>Batch aktif</span><strong>{number(summary.active_batches)}</strong><small>Dirilis, berjalan, atau ditahan</small></article>
          <article className="metric"><span>Menunggu keputusan QC</span><strong>{number(summary.waiting_quality)}</strong><small>Batch selesai, mutu belum dilepas</small></article>
          <article className="metric"><span>BOM disetujui</span><strong>{number(summary.approved_boms)}</strong><small>{number(summary.draft_boms)} BOM masih draft</small></article>
        </div>

        <div className="metricGrid">
          <article className="metric"><span>Rencana produksi bulan ini</span><strong className="metricText">{number(summary.planned_quantity)}</strong><small>Total kuantitas rencana</small></article>
          <article className="metric"><span>Hasil tercatat</span><strong className="metricText">{number(summary.produced_quantity)}</strong><small>Belum otomatis berarti lolos QC</small></article>
          <article className="metric"><span>Rasio hasil / rencana</span><strong className="metricText">{yieldRate.toFixed(1)}%</strong><small>Indikator kuantitas, bukan yield mutu</small></article>
          <article className="metric"><span>Rasio reject tercatat</span><strong className="metricText">{rejectRate.toFixed(1)}%</strong><small>Reject dibagi hasil tercatat</small></article>
        </div>

        <h2>Lini produksi</h2>
        {lines.length === 0 ? (
          <article className="moduleCard"><strong>Belum ada lini produksi terdaftar</strong><small>Tambahkan data lini dan kapasitas setelah lokasi, satuan, dan penanggung jawab diverifikasi.</small></article>
        ) : (
          <div className="moduleGrid">
            {lines.map((line) => (
              <article className="moduleCard" key={line.code}>
                <span className="inquiryType">{line.code} · {line.site_name}</span>
                <h3>{line.name}</h3>
                <p>{line.nominal_capacity_per_hour == null ? "Kapasitas belum ditetapkan" : number(line.nominal_capacity_per_hour) + " " + (line.capacity_unit ?? "unit") + " / jam"}</p>
                <small>{number(line.active_batches)} batch aktif</small>
              </article>
            ))}
          </div>
        )}

        <h2>Batch produksi terbaru</h2>
        {batches.length === 0 ? (
          <article className="moduleCard"><strong>Belum ada batch produksi</strong><small>Batch akan tampil setelah dibuat melalui proses produksi yang telah disetujui.</small></article>
        ) : (
          <div className="inventoryTableWrap">
            <table className="inventoryTable">
              <thead><tr><th>Batch / Produk</th><th>Lini / Supervisor</th><th>Rencana</th><th>Hasil</th><th>Bahan terpakai</th><th>Status</th><th>Mutu</th></tr></thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.batch_number}>
                    <td><strong>{batch.batch_number}</strong><br />{batch.product_sku} · {batch.product_name}<br /><small>BOM {batch.bom_version ?? "belum ditautkan"}</small></td>
                    <td>{batch.line_name ?? "Belum ditentukan"}<br /><small>{batch.supervisor_name ?? "Supervisor belum ditentukan"}</small></td>
                    <td>{number(batch.planned_quantity)}</td>
                    <td>{number(batch.produced_quantity)}<br /><small>Reject: {number(batch.rejected_quantity)}</small></td>
                    <td>{number(batch.consumed_quantity)}<br /><small>{number(batch.input_count)} lot/baris input</small></td>
                    <td>{statusLabels[batch.status] ?? batch.status}</td>
                    <td>{qualityLabels[batch.quality_status] ?? batch.quality_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="workspaceFoot">
          <Link href="/workspace/inventory">Lihat kartu stok</Link> · <Link href="/workspace/quality">Buka pemeriksaan mutu</Link> · <Link href="/workspace/finance">Lihat dampak biaya di keuangan</Link>
        </p>
      </section>
    </main>
  );
}
