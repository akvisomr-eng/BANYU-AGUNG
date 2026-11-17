import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { SignOutButton } from "../sign-out-button";

export const dynamic = "force-dynamic";

type Balance={warehouse_code:string;warehouse_name:string;sku:string;product_name:string;unit_code:string|null;lot_code:string|null;quality_status:string|null;expires_at:string|null;quantity_on_hand:string|number;quantity_reserved:string|number;available_released:string|number};
type Movement={movement_no:string;movement_type:string;warehouse_name:string;sku:string;product_name:string;lot_code:string|null;quantity:string|number;occurred_at:string};

const qualityLabels:Record<string,string>={pending:"Menunggu QC",released:"Lulus QC",quarantined:"Karantina",rejected:"Ditolak",expired:"Kedaluwarsa"};
const movementLabels:Record<string,string>={receipt:"Penerimaan",issue:"Pengeluaran",transfer_in:"Transfer masuk",transfer_out:"Transfer keluar",adjustment_in:"Penyesuaian masuk",adjustment_out:"Penyesuaian keluar",production_consume:"Pemakaian produksi",production_output:"Hasil produksi",sales_pick:"Pengambilan penjualan",sales_return:"Retur penjualan"};

export default async function InventoryPage() {
  const {data:session}=await auth.getSession();
  if(!session?.user) redirect("/auth/sign-in");
  const {sql}=await import("@/lib/db");
  const actors=await sql`
    SELECT p.organization_id,r.name AS role_name FROM user_profiles p
    JOIN user_role_assignments a ON a.user_id=p.id JOIN roles r ON r.id=a.role_id
    WHERE p.auth_subject=${session.user.id} AND p.status='active' AND r.code IN ('OWNER','ADMIN')
    ORDER BY r.code LIMIT 1
  `;
  const actor=actors[0] as {organization_id:string;role_name:string}|undefined;
  if(!actor) redirect("/workspace?access=denied");
  const balances=await sql`
    SELECT w.code AS warehouse_code,w.name AS warehouse_name,p.sku,p.name AS product_name,u.code AS unit_code,
      l.lot_code,l.quality_status,l.expires_at,ib.quantity_on_hand,ib.quantity_reserved,
      CASE WHEN l.quality_status='released' THEN ib.quantity_on_hand-ib.quantity_reserved ELSE 0 END AS available_released
    FROM inventory_balances ib
    JOIN warehouses w ON w.id=ib.warehouse_id
    JOIN products p ON p.id=ib.product_id
    LEFT JOIN units_of_measure u ON u.id=p.base_unit_id
    LEFT JOIN inventory_lots l ON l.id=ib.lot_id
    WHERE ib.organization_id=${actor.organization_id}::uuid
    ORDER BY w.name,p.name,l.expires_at NULLS LAST LIMIT 500
  ` as Balance[];
  const movements=await sql`
    SELECT sm.movement_no,sm.movement_type,w.name AS warehouse_name,p.sku,p.name AS product_name,
      l.lot_code,sm.quantity,sm.occurred_at
    FROM stock_movements sm
    JOIN warehouses w ON w.id=sm.warehouse_id
    JOIN products p ON p.id=sm.product_id
    LEFT JOIN inventory_lots l ON l.id=sm.lot_id
    WHERE sm.organization_id=${actor.organization_id}::uuid
    ORDER BY sm.occurred_at DESC LIMIT 50
  ` as Movement[];
  const total=balances.reduce((sum,row)=>sum+Number(row.quantity_on_hand),0);
  const available=balances.reduce((sum,row)=>sum+Number(row.available_released),0);
  const pending=balances.filter(row=>row.quality_status==="pending").reduce((sum,row)=>sum+Number(row.quantity_on_hand),0);

  return (
    <main className="workspace">
      <aside className="side">
        <Link className="brand" href="/">BANYU <span>AGUNG</span></Link>
        <p className="sideLabel">INVENTORY</p>
        <Link className="sideLink" href="/workspace">← Ringkasan</Link>
        <Link className="sideLink" href="/workspace/purchase-orders">Purchase Orders</Link>
        <Link className="sideLink" href="/workspace/goods-receipts">Goods Receipts</Link>
        <Link className="sideActive" href="/workspace/inventory">Inventory</Link>
        <Link className="sideLink" href="/workspace/setup">Konfigurasi Operasional</Link>
      </aside>
      <section className="workMain">
        <header className="workHeader"><div><p className="eyebrow">BANYU AGUNG / INVENTORY</p><h1>Posisi Stok</h1><p className="muted">Stok per gudang, produk, dan lot · {actor.role_name}</p></div><SignOutButton /></header>
        <div className="metricGrid">
          <article className="metric"><span>Total stok tercatat</span><strong>{total.toLocaleString("id-ID")}</strong><small>Semua status mutu</small></article>
          <article className="metric"><span>Stok siap tersedia</span><strong>{available.toLocaleString("id-ID")}</strong><small>Hanya lot lulus QC, dikurangi reservasi</small></article>
          <article className="metric"><span>Menunggu QC</span><strong>{pending.toLocaleString("id-ID")}</strong><small>Belum boleh dipakai untuk pemenuhan</small></article>
          <article className="metric"><span>Baris stok</span><strong>{balances.length}</strong><small>Per gudang dan lot</small></article>
        </div>
        <div className="inventoryNotice">Lot yang baru diterima otomatis berstatus <b>Menunggu QC</b>. Angka “siap tersedia” hanya menghitung lot berstatus lulus QC; penerimaan barang tidak otomatis menyatakan produk layak edar.</div>
        <h2>Saldo stok</h2>
        {balances.length===0 ? <article className="moduleCard"><strong>Belum ada saldo stok</strong><small>Stok akan muncul setelah purchase order disetujui dan penerimaan barang diposting.</small><Link className="moduleOpen" href="/workspace/purchase-orders">Buka purchase orders ↗</Link></article> :
          <div className="inventoryTableWrap"><table className="inventoryTable"><thead><tr><th>Produk / Lot</th><th>Gudang</th><th>On hand</th><th>Reserved</th><th>Siap tersedia</th><th>Status mutu</th><th>Kedaluwarsa</th></tr></thead><tbody>
            {balances.map((row)=><tr key={row.warehouse_code+row.sku+(row.lot_code??"")}>
              <td><b>{row.sku}</b><small>{row.product_name} · {row.lot_code ?? "Tanpa lot"} · {row.unit_code ?? "Satuan belum diisi"}</small></td>
              <td>{row.warehouse_code}<small>{row.warehouse_name}</small></td>
              <td>{Number(row.quantity_on_hand).toLocaleString("id-ID")}</td>
              <td>{Number(row.quantity_reserved).toLocaleString("id-ID")}</td>
              <td>{Number(row.available_released).toLocaleString("id-ID")}</td>
              <td><span className={`inquiryStatus ${row.quality_status==="released"?"inquiryStatus-converted":row.quality_status==="pending"?"inquiryStatus-new":"inquiryStatus-spam"}`}>{qualityLabels[row.quality_status??""]??"Tidak diketahui"}</span></td>
              <td>{row.expires_at ? new Intl.DateTimeFormat("id-ID",{dateStyle:"medium",timeZone:"Asia/Jakarta"}).format(new Date(row.expires_at)) : "—"}</td>
            </tr>)}
          </tbody></table></div>
        }
        <h2>Pergerakan stok terbaru</h2>
        {movements.length===0 ? <article className="moduleCard"><small>Belum ada pergerakan stok.</small></article> :
          <div className="orderList">{movements.map(row=><article className="orderItem" key={row.movement_no}><div><span className="inquiryType">{row.movement_no} · {movementLabels[row.movement_type]??row.movement_type}</span><h3>{row.sku} · {row.product_name}</h3><small>{row.warehouse_name} · {row.lot_code??"Tanpa lot"} · {new Intl.DateTimeFormat("id-ID",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Jakarta"}).format(new Date(row.occurred_at))}</small></div><strong>{Number(row.quantity).toLocaleString("id-ID")} {row.movement_type.endsWith("_out")||row.movement_type==="issue"?"keluar":"masuk"}</strong></article>)}</div>
        }
        <p className="workspaceFoot"><Link href="/workspace/goods-receipts">Riwayat penerimaan</Link> · Penyesuaian stok manual dan pengeluaran akan menggunakan dokumen transaksi terpisah.</p>
      </section>
    </main>
  );
}
