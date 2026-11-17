import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { SignOutButton } from "../../sign-out-button";
import { postGoodsReceipt } from "../actions";

export const dynamic = "force-dynamic";

type ReceiptLine={purchase_order_item_id:string;product_id:string;sku:string;name:string;product_type:string;unit_code:string|null;quantity_ordered:string|number;quantity_received:string|number;remaining:string|number;unit_cost:string|number;shelf_life_days:number|null};

export default async function NewGoodsReceiptPage({searchParams}:{searchParams:Promise<{po_id?:string;warehouse_id?:string}>}) {
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
  const params=await searchParams;
  if(!params.po_id || !params.warehouse_id || !/^[0-9a-f-]{36}$/i.test(params.po_id) || !/^[0-9a-f-]{36}$/i.test(params.warehouse_id)) redirect("/workspace/purchase-orders");
  const context=await sql`
    SELECT po.id,po.po_number,po.status,po.site_id,sup.name AS supplier_name,
      w.id AS warehouse_id,w.name AS warehouse_name,w.warehouse_type
    FROM purchase_orders po
    JOIN suppliers sup ON sup.id=po.supplier_id
    JOIN warehouses w ON w.organization_id=po.organization_id AND w.site_id=po.site_id
    WHERE po.id=${params.po_id}::uuid AND po.organization_id=${actor.organization_id}::uuid
      AND po.status IN ('approved','partially_received')
      AND w.id=${params.warehouse_id}::uuid AND w.is_active=true
    LIMIT 1
  `;
  const ctx=context[0] as {id:string;po_number:string;status:string;site_id:string;supplier_name:string;warehouse_id:string;warehouse_name:string;warehouse_type:string}|undefined;
  if(!ctx) redirect("/workspace/purchase-orders?error=receipt_context");
  const lines=await sql`
    SELECT poi.id AS purchase_order_item_id,p.id AS product_id,p.sku,p.name,p.product_type,
      u.code AS unit_code,poi.quantity_ordered,poi.quantity_received,
      poi.quantity_ordered-poi.quantity_received AS remaining,poi.unit_price AS unit_cost,p.shelf_life_days
    FROM purchase_order_items poi
    JOIN products p ON p.id=poi.product_id
    LEFT JOIN units_of_measure u ON u.id=p.base_unit_id
    WHERE poi.purchase_order_id=${ctx.id}::uuid
      AND poi.quantity_received<poi.quantity_ordered
      AND p.product_type<>'service'
      AND (
        ${ctx.warehouse_type}='quarantine'
        OR (p.product_type='raw_material' AND ${ctx.warehouse_type}='raw_material')
        OR (p.product_type='packaging' AND ${ctx.warehouse_type}='packaging')
        OR (p.product_type='finished_good' AND ${ctx.warehouse_type}='finished_goods')
        OR (p.product_type='spare_part' AND ${ctx.warehouse_type}='raw_material')
      )
    ORDER BY p.name
  ` as ReceiptLine[];

  return (
    <main className="workspace">
      <aside className="side">
        <Link className="brand" href="/">BANYU <span>AGUNG</span></Link>
        <p className="sideLabel">INVENTORY / RECEIVING</p>
        <Link className="sideLink" href="/workspace">← Ringkasan</Link>
        <Link className="sideLink" href="/workspace/purchase-orders">Purchase Orders</Link>
        <Link className="sideActive" href="/workspace/goods-receipts">Goods Receipts</Link>
        <Link className="sideLink" href="/workspace/inventory">Inventory</Link>
        <Link className="sideLink" href="/workspace/setup">Konfigurasi Operasional</Link>
      </aside>
      <section className="workMain">
        <header className="workHeader"><div><p className="eyebrow">BANYU AGUNG / INVENTORY</p><h1>Penerimaan Barang</h1><p className="muted">{ctx.po_number} · {ctx.supplier_name} · {ctx.warehouse_name} · {actor.role_name}</p></div><SignOutButton /></header>
        <div className="metricGrid">
          <article className="metric"><span>Purchase order</span><strong className="metricText">{ctx.po_number}</strong><small>Status: {ctx.status}</small></article>
          <article className="metric"><span>Gudang penerimaan</span><strong className="metricText">{ctx.warehouse_name}</strong><small>{ctx.warehouse_type}</small></article>
          <article className="metric"><span>Baris belum diterima</span><strong>{lines.length}</strong><small>Hanya barang fisik yang dapat diterima</small></article>
          <article className="metric"><span>Kontrol mutu</span><strong className="metricText">PENDING</strong><small>Lot menunggu pemeriksaan kualitas</small></article>
        </div>
        <section className="metric">
          <h2 style={{marginTop:0}}>Catat kuantitas aktual</h2>
          <p className="muted">Masukkan jumlah yang benar-benar diterima. Setiap baris membutuhkan kode lot; tanggal produksi dan kedaluwarsa diisi sesuai label/ dokumen pemasok.</p>
          {lines.length===0 ? <div className="setupNotice">Tidak ada barang tersisa yang sesuai dengan jenis gudang ini. Pilih gudang lain atau periksa status PO.</div> : (
            <form action={postGoodsReceipt} className="authForm receiptForm">
              <input type="hidden" name="purchase_order_id" value={ctx.id} />
              <input type="hidden" name="warehouse_id" value={ctx.warehouse_id} />
              {lines.map((line,i)=><div className="receiptLine" key={line.purchase_order_item_id}>
                <input type="hidden" name="purchase_order_item_id" value={line.purchase_order_item_id} />
                <div className="receiptLineTitle"><strong>{line.sku} · {line.name}</strong><small>{line.product_type} · {line.unit_code ?? "Satuan belum diisi"}</small></div>
                <div className="receiptFacts"><span>Dipesan: {Number(line.quantity_ordered).toLocaleString("id-ID")}</span><span>Sudah diterima: {Number(line.quantity_received).toLocaleString("id-ID")}</span><b>Sisa: {Number(line.remaining).toLocaleString("id-ID")}</b><span>Harga PO: {Number(line.unit_cost).toLocaleString("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:2})}</span></div>
                <div className="receiptFields">
                  <label>Qty diterima<input name="quantity_received" type="number" min="0" max={Number(line.remaining)} step="0.001" placeholder="0 = lewati baris" /></label>
                  <label>Kode lot<input name="lot_code" maxLength={40} placeholder="Kode pada kemasan" /></label>
                  <label>Tanggal produksi<input name="manufactured_at" type="date" /></label>
                  <label>Tanggal kedaluwarsa<input name="expires_at" type="date" /></label>
                </div>
                {line.shelf_life_days && <small className="receiptHint">Produk memiliki masa simpan {line.shelf_life_days} hari. Isi tanggal kedaluwarsa sesuai label resmi.</small>}
              </div>)}
              <label htmlFor="receipt-notes">Catatan penerimaan (opsional)</label>
              <textarea id="receipt-notes" name="notes" rows={3} maxLength={1000} placeholder="Nomor surat jalan, kondisi kemasan, atau catatan penerimaan" />
              <button className="primary authSubmit" type="submit">Posting penerimaan barang</button>
            </form>
          )}
        </section>
        <p className="workspaceFoot"><Link href="/workspace/purchase-orders">Kembali ke purchase orders</Link> · Lot masuk berstatus pending sampai QC melepaskannya.</p>
      </section>
    </main>
  );
}
