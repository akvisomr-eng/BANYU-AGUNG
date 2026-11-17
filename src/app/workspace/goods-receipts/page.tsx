import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { SignOutButton } from "../sign-out-button";

export const dynamic = "force-dynamic";

type Receipt={receipt_number:string;po_number:string;supplier_name:string;warehouse_name:string;received_at:string;status:string;line_count:number;quantity_total:string|number};

export default async function GoodsReceiptsPage({searchParams}:{searchParams:Promise<{created?:string;error?:string}>}) {
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
  const rows=await sql`
    SELECT gr.receipt_number,po.po_number,sup.name AS supplier_name,w.name AS warehouse_name,
      gr.received_at,gr.status,count(gri.id)::int AS line_count,coalesce(sum(gri.quantity_received),0) AS quantity_total
    FROM goods_receipts gr
    JOIN purchase_orders po ON po.id=gr.purchase_order_id
    JOIN suppliers sup ON sup.id=po.supplier_id
    JOIN warehouses w ON w.id=gr.warehouse_id
    LEFT JOIN goods_receipt_items gri ON gri.goods_receipt_id=gr.id
    WHERE gr.organization_id=${actor.organization_id}::uuid
    GROUP BY gr.id,po.po_number,sup.name,w.name
    ORDER BY gr.received_at DESC LIMIT 100
  ` as Receipt[];
  const params=await searchParams;
  return (
    <main className="workspace">
      <aside className="side">
        <Link className="brand" href="/">BANYU <span>AGUNG</span></Link>
        <p className="sideLabel">INVENTORY</p>
        <Link className="sideLink" href="/workspace">← Ringkasan</Link>
        <Link className="sideLink" href="/workspace/purchase-orders">Purchase Orders</Link>
        <Link className="sideActive" href="/workspace/goods-receipts">Goods Receipts</Link>
        <Link className="sideLink" href="/workspace/inventory">Inventory</Link>
        <Link className="sideLink" href="/">Kembali ke Website</Link>
      </aside>
      <section className="workMain">
        <header className="workHeader"><div><p className="eyebrow">BANYU AGUNG / INVENTORY</p><h1>Goods Receipts</h1><p className="muted">Riwayat penerimaan barang dan pelacakan lot · {actor.role_name}</p></div><SignOutButton /></header>
        {params.created==="1" && <p className="authSuccess" role="status">Penerimaan berhasil diposting. Stok tercatat dan lot menunggu QC.</p>}
        {params.error && <p className="authError" role="alert">{params.error==="invalid" ? "Periksa jumlah, kode lot, dan tanggal pada baris penerimaan." : params.error==="lines" ? "Tidak ada baris valid. Pastikan PO disetujui, kuantitas belum melebihi sisa, dan lot tidak ditolak." : "Penerimaan tidak dapat diposting. Periksa status PO, gudang, dan data lot."}</p>}
        <div className="metricGrid">
          <article className="metric"><span>Total penerimaan</span><strong>{rows.length}</strong><small>Maksimal 100 terbaru</small></article>
          <article className="metric"><span>Unit diterima</span><strong>{rows.reduce((sum,row)=>sum+Number(row.quantity_total),0).toLocaleString("id-ID")}</strong><small>Akumulasi baris penerimaan</small></article>
          <article className="metric"><span>Lot tercatat</span><strong>{rows.reduce((sum,row)=>sum+row.line_count,0)}</strong><small>Baris lot dalam penerimaan</small></article>
          <article className="metric"><span>Kontrol mutu</span><strong className="metricText">PENDING</strong><small>Perlu pemeriksaan terpisah</small></article>
        </div>
        <h2>Riwayat penerimaan</h2>
        {rows.length===0 ? <article className="moduleCard"><strong>Belum ada penerimaan barang</strong><small>Setujui purchase order terlebih dahulu. Penerimaan akan tersedia dari halaman Purchase Orders.</small><Link className="moduleOpen" href="/workspace/purchase-orders">Buka purchase orders ↗</Link></article> :
          <div className="orderList">{rows.map(row=><article className="orderItem" key={row.receipt_number}><div><span className="inquiryType">{row.receipt_number} · {row.status}</span><h3>{row.supplier_name}</h3><small>{row.po_number} · {row.warehouse_name} · {new Intl.DateTimeFormat("id-ID",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Jakarta"}).format(new Date(row.received_at))}</small></div><strong>{row.line_count} baris · {Number(row.quantity_total).toLocaleString("id-ID")} unit</strong></article>)}</div>
        }
        <p className="workspaceFoot"><Link href="/workspace/inventory">Lihat posisi stok</Link> · Penerimaan tidak otomatis melepaskan lot dari karantina mutu.</p>
      </section>
    </main>
  );
}
