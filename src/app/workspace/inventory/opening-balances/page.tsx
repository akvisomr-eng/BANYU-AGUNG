import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { SignOutButton } from "../../sign-out-button";
import { postInventoryOpeningBalance } from "../actions";

export const dynamic = "force-dynamic";

type OpeningLot = {
  lot_id: string; sku: string; product_name: string; lot_code: string;
  quantity_on_hand: string | number; estimated_value: string | number;
  warehouses: string;
};

const money = (value: number) => new Intl.NumberFormat("id-ID", {
  style: "currency", currency: "IDR", maximumFractionDigits: 0
}).format(value);

export default async function InventoryOpeningBalancesPage({
  searchParams
}: { searchParams: Promise<{ posted?: string; error?: string }> }) {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");
  const { sql } = await import("@/lib/db");
  const actors = await sql`
    SELECT p.organization_id,r.code AS role_code
    FROM user_profiles p
    JOIN user_role_assignments a ON a.user_id=p.id
    JOIN roles r ON r.id=a.role_id
    WHERE p.auth_subject=${session.user.id} AND p.status='active' AND r.code='OWNER'
    LIMIT 1
  `;
  const actor = actors[0] as { organization_id: string; role_code: string } | undefined;
  if (!actor) redirect("/workspace?access=denied");
  const [rowsResult,configRows] = await Promise.all([
    sql`
      SELECT c.lot_id,p.sku,p.name AS product_name,l.lot_code,
        c.quantity_on_hand,
        c.carrying_value AS estimated_value,
        string_agg(DISTINCT w.code||' · '||w.name, ', ' ORDER BY w.code||' · '||w.name) AS warehouses
      FROM inventory_lot_costs c
      JOIN products p ON p.id=c.product_id AND p.organization_id=c.organization_id
      JOIN inventory_lots l ON l.id=c.lot_id AND l.organization_id=c.organization_id
      JOIN inventory_balances ib ON ib.organization_id=c.organization_id
        AND ib.product_id=c.product_id AND ib.lot_id=c.lot_id
      JOIN warehouses w ON w.id=ib.warehouse_id
      WHERE c.organization_id=${actor.organization_id}::uuid
        AND c.opening_balance_pending=true
      GROUP BY c.lot_id,p.sku,p.name,l.lot_code,c.quantity_on_hand,c.carrying_value
      ORDER BY p.name,l.lot_code
    `,
    sql`SELECT inventory_opening_equity_id FROM accounting_config
      WHERE organization_id=${actor.organization_id}::uuid`
  ]);
  const rows = rowsResult as unknown as OpeningLot[];
  const params = await searchParams;
  const mappingReady = Boolean(configRows[0]?.inventory_opening_equity_id);

  return <main className="workspace">
    <aside className="side">
      <Link className="brand" href="/">BANYU <span>AGUNG</span></Link>
      <p className="sideLabel">INVENTORY</p>
      <Link className="sideLink" href="/workspace">← Ringkasan</Link>
      <Link className="sideLink" href="/workspace/purchase-orders">Purchase Orders</Link>
      <Link className="sideLink" href="/workspace/goods-receipts">Goods Receipts</Link>
      <Link className="sideLink" href="/workspace/inventory">Posisi Stok</Link>
      <Link className="sideActive" href="/workspace/inventory/opening-balances">Rekonsiliasi Saldo Awal</Link>
      <Link className="sideLink" href="/workspace/finance/settings">Pemetaan Akun</Link>
    </aside>
    <section className="workMain">
      <header className="workHeader">
        <div><p className="eyebrow">BANYU AGUNG / INVENTORY CONTROL</p><h1>Rekonsiliasi Saldo Awal</h1>
          <p className="muted">Verifikasi nilai persediaan lot lama sebelum lot dapat digunakan untuk pengiriman.</p></div>
        <SignOutButton />
      </header>
      {params.posted==="1" && <p className="authSuccess" role="status">Saldo awal berhasil diposting ke buku besar.</p>}
      {params.error==="invalid" && <p className="authError" role="alert">Nilai harus berupa angka positif dengan maksimal dua angka desimal.</p>}
      {params.error==="stale" && <p className="authError" role="alert">Lot sudah berubah, tidak ditemukan, atau kuantitas tidak cocok. Muat ulang sebelum mencoba lagi.</p>}
      {!mappingReady && <article className="moduleCard"><strong>Pemetaan akun belum lengkap</strong>
        <p className="muted">OWNER harus memilih akun Ekuitas Saldo Awal Persediaan pada pengaturan akuntansi.</p>
        <Link className="moduleOpen" href="/workspace/finance/settings">Buka pemetaan akun ↗</Link>
      </article>}
      <div className="inventoryNotice">Nilai estimasi sistem hanya referensi dari harga penerimaan sebelumnya. Masukkan nilai perolehan yang sudah diverifikasi dari dokumen pembelian atau catatan akuntansi. Setelah diposting, dokumen dan jurnal tidak dapat diedit.</div>
      <h2>Lot menunggu rekonsiliasi · {rows.length}</h2>
      {rows.length===0 ? <article className="moduleCard"><strong>Tidak ada saldo awal yang tertunda</strong>
        <small>Lot baru akan memperoleh valuasi otomatis saat goods receipt diposting.</small>
        <Link className="moduleOpen" href="/workspace/inventory">Kembali ke persediaan ↗</Link>
      </article> : <div className="orderList">
        {rows.map(row=><article className="moduleCard" key={row.lot_id}>
          <strong>{row.sku} · {row.product_name}</strong>
          <p className="muted">Lot {row.lot_code} · {row.warehouses}</p>
          <div className="metricGrid">
            <article className="metric"><span>Stok aktual</span><strong>{Number(row.quantity_on_hand).toLocaleString("id-ID")}</strong><small>Unit sesuai saldo gudang</small></article>
            <article className="metric"><span>Estimasi sistem</span><strong>{money(Number(row.estimated_value))}</strong><small>Bukan nilai final</small></article>
          </div>
          <form action={postInventoryOpeningBalance} className="deliveryCreateForm">
            <input type="hidden" name="lot_id" value={row.lot_id}/>
            <label>Nilai saldo awal terverifikasi (Rp)
              <input name="total_value" type="number" min="0.01" step="0.01" required placeholder="Masukkan nilai yang diverifikasi"/>
            </label>
            <button className="primary" type="submit" disabled={!mappingReady}>Sahkan dan posting saldo awal</button>
          </form>
        </article>)}
      </div>}
    </section>
  </main>;
}
