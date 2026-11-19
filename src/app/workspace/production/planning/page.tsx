import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { SignOutButton } from "../../sign-out-button";
import { ProductionPlannerForm } from "./planner-form";

export const dynamic = "force-dynamic";

type BOM = { id: string; sku: string; product_name: string; version: string; output_quantity: string | number; unit_code: string | null };
type Line = { id: string; code: string; name: string; site_name: string };
type LotReadiness = { lot_code: string; expires_at: string | null; quality_status: string; available_quantity: string | number; warehouse_names: string; readiness_reason: string };
type Material = { bom_id: string; sku: string; name: string; quantity_per_bom: string | number; scrap_factor: string | number; unit_code: string | null; available_quantity: string | number; blocked_quantity: string | number; lots: LotReadiness[] };

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
  const [boms, lines, materials] = await Promise.all([
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
    `,
    sql`
      SELECT pb.id AS bom_id, cp.sku, cp.name,
        bi.quantity AS quantity_per_bom, bi.scrap_factor, u.code AS unit_code,
        coalesce(stock.ready_quantity, 0) AS available_quantity,
        coalesce(stock.blocked_quantity, 0) AS blocked_quantity,
        coalesce(stock.lots, '[]'::jsonb) AS lots
      FROM product_boms pb
      JOIN product_bom_items bi ON bi.bom_id = pb.id
      JOIN products cp ON cp.id = bi.component_product_id
      LEFT JOIN units_of_measure u ON u.id = cp.base_unit_id
      LEFT JOIN LATERAL (
        SELECT
          sum(lot.available_quantity) FILTER (WHERE lot.is_ready) AS ready_quantity,
          sum(lot.available_quantity) FILTER (WHERE NOT lot.is_ready) AS blocked_quantity,
          jsonb_agg(jsonb_build_object(
            'lot_code', lot.lot_code,
            'expires_at', lot.expires_at,
            'quality_status', lot.quality_status,
            'available_quantity', lot.available_quantity,
            'warehouse_names', lot.warehouse_names,
            'readiness_reason', lot.readiness_reason
          ) ORDER BY lot.expires_at NULLS LAST, lot.lot_code) AS lots
        FROM (
          SELECT
            il.lot_code, il.expires_at, il.quality_status,
            sum(ib.quantity_on_hand - ib.quantity_reserved) AS available_quantity,
            string_agg(DISTINCT w.name, ', ' ORDER BY w.name) AS warehouse_names,
            coalesce(lc.quantity_on_hand, 0) AS cost_quantity,
            lc.lot_id IS NOT NULL AS has_cost_record,
            coalesce(lc.opening_balance_pending, true) AS opening_balance_pending,
            coalesce((
              SELECT sum(all_bal.quantity_on_hand)
              FROM inventory_balances all_bal
              WHERE all_bal.organization_id = pb.organization_id
                AND all_bal.product_id = cp.id
                AND all_bal.lot_id IS NOT DISTINCT FROM ib.lot_id
            ), 0) AS total_lot_quantity,
            (
              il.id IS NOT NULL
              AND il.quality_status = 'released'
              AND (il.expires_at IS NULL OR il.expires_at >= current_date)
              AND lc.lot_id IS NOT NULL
              AND lc.opening_balance_pending = false
              AND lc.quantity_on_hand = coalesce((
                SELECT sum(all_bal.quantity_on_hand)
                FROM inventory_balances all_bal
                WHERE all_bal.organization_id = pb.organization_id
                  AND all_bal.product_id = cp.id
                  AND all_bal.lot_id = ib.lot_id
              ), 0)
            ) AS is_ready,
            CASE
              WHEN ib.lot_id IS NULL THEN 'Stok belum memiliki nomor lot'
              WHEN il.id IS NULL THEN 'Data lot tidak ditemukan'
              WHEN il.quality_status <> 'released' THEN 'Lot belum berstatus lulus QC'
              WHEN il.expires_at < current_date THEN 'Lot kedaluwarsa'
              WHEN lc.lot_id IS NULL THEN 'Biaya lot belum tercatat'
              WHEN lc.opening_balance_pending THEN 'Rekonsiliasi saldo awal biaya belum selesai'
              WHEN lc.quantity_on_hand <> coalesce((
                SELECT sum(all_bal.quantity_on_hand)
                FROM inventory_balances all_bal
                WHERE all_bal.organization_id = pb.organization_id
                  AND all_bal.product_id = cp.id
                  AND all_bal.lot_id = ib.lot_id
              ), 0) THEN 'Saldo lot dan biaya persediaan belum cocok'
              ELSE 'Siap'
            END AS readiness_reason
          FROM inventory_balances ib
          JOIN warehouses w ON w.id = ib.warehouse_id
            AND w.organization_id = ib.organization_id
            AND w.is_active = true
            AND w.warehouse_type IN ('raw_material', 'packaging')
          LEFT JOIN inventory_lots il ON il.id = ib.lot_id
            AND il.organization_id = ib.organization_id
            AND il.product_id = ib.product_id
          LEFT JOIN inventory_lot_costs lc ON lc.organization_id = ib.organization_id
            AND lc.product_id = ib.product_id
            AND lc.lot_id = ib.lot_id
          WHERE ib.organization_id = pb.organization_id
            AND ib.product_id = cp.id
          GROUP BY ib.lot_id, il.id, il.lot_code, il.expires_at, il.quality_status,
            lc.lot_id, lc.quantity_on_hand, lc.opening_balance_pending
        ) lot
      ) stock ON true
      WHERE pb.organization_id = ${actor.organization_id}::uuid
        AND pb.status = 'approved'
        AND (pb.effective_from IS NULL OR pb.effective_from <= current_date)
        AND (pb.effective_to IS NULL OR pb.effective_to >= current_date)
        AND cp.organization_id = pb.organization_id
      ORDER BY cp.name
    `
  ]) as [BOM[], Line[], Material[]];
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
          <ProductionPlannerForm boms={boms} lines={lines} materials={materials} />
        )}
        <p className="workspaceFoot"><Link href="/workspace/production">← Kembali ke kontrol produksi</Link></p>
      </section>
    </main>
  );
}
