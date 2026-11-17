import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { SignOutButton } from "../sign-out-button";
import { approvePurchaseOrder, createPurchaseOrder } from "./actions";

export const dynamic = "force-dynamic";

type Supplier={id:string;supplier_code:string;name:string};
type Site={id:string;code:string;name:string};
type Product={id:string;sku:string;name:string;unit_code:string|null};
type PurchaseOrder={id:string;site_id:string;po_number:string;order_date:string;expected_date:string|null;status:string;total_amount:string|number;supplier_name:string;site_name:string};
type Warehouse={id:string;site_id:string;code:string;name:string};

export default async function PurchaseOrdersPage({searchParams}:{searchParams:Promise<{created?:string;approved?:string;error?:string}>}) {
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
  const suppliers=await sql`SELECT id,supplier_code,name FROM suppliers WHERE organization_id=${actor.organization_id}::uuid AND status='active' ORDER BY name` as Supplier[];
  const sites=await sql`SELECT id,code,name FROM sites WHERE organization_id=${actor.organization_id}::uuid AND is_active=true ORDER BY name` as Site[];
  const products=await sql`
    SELECT p.id,p.sku,p.name,u.code AS unit_code FROM products p
    LEFT JOIN units_of_measure u ON u.id=p.base_unit_id
    WHERE p.organization_id=${actor.organization_id}::uuid AND p.is_active=true AND p.is_purchasable=true AND p.product_type<>'service' ORDER BY p.name
  ` as Product[];
  const orders=await sql`
    SELECT po.id,po.site_id,po.po_number,po.order_date,po.expected_date,po.status,po.total_amount,sup.name AS supplier_name,site.name AS site_name
    FROM purchase_orders po JOIN suppliers sup ON sup.id=po.supplier_id JOIN sites site ON site.id=po.site_id
    WHERE po.organization_id=${actor.organization_id}::uuid ORDER BY po.created_at DESC LIMIT 100
  `;
  const typedOrders = orders as PurchaseOrder[];
  const warehouses = await sql`SELECT id,site_id,code,name FROM warehouses WHERE organization_id=${actor.organization_id}::uuid AND is_active=true ORDER BY name` as Warehouse[];
  const params=await searchParams;
  const ready=suppliers.length>0&&sites.length>0&&products.length>0;

  return (
    <main className="workspace">
      <aside className="side">
        <Link className="brand" href="/">BANYU <span>AGUNG</span></Link>
        <p className="sideLabel">PROCUREMENT</p>
        <Link className="sideLink" href="/workspace">← Ringkasan</Link>
        <Link className="sideActive" href="/workspace/purchase-orders">Purchase Orders</Link>
        <Link className="sideLink" href="/workspace/suppliers">Master Pemasok</Link>
        <Link className="sideLink" href="/workspace/products">Produk & Barang</Link>
        <Link className="sideLink" href="/workspace/setup">Konfigurasi Operasional</Link>
        <Link className="sideLink" href="/workspace/goods-receipts">Goods Receipts</Link>
        <Link className="sideLink" href="/workspace/inventory">Inventory</Link>
        <Link className="sideLink" href="/">Kembali ke Website</Link>
      </aside>
      <section className="workMain">
        <header className="workHeader"><div><p className="eyebrow">BANYU AGUNG / PROCUREMENT</p><h1>Purchase Orders</h1><p className="muted">Pencatatan pesanan pembelian dalam status draft · {actor.role_name}</p></div><SignOutButton /></header>
        {params.created==="1" && <p className="authSuccess" role="status">Purchase order draft berhasil dibuat. Stok belum bertambah sampai penerimaan barang dicatat.</p>}{params.approved==="1" && <p className="authSuccess" role="status">Purchase order disetujui OWNER. Proses penerimaan barang kini dapat dilakukan.</p>}{params.error==="approval" && <p className="authError" role="alert">Persetujuan gagal. Hanya OWNER yang dapat menyetujui purchase order berstatus draft.</p>}
        {params.error && <p className="authError" role="alert">{params.error==="invalid" ? "Periksa pemasok, lokasi, tanggal, dan rincian pembelian." : params.error==="master" ? "Pemasok, lokasi, atau produk tidak aktif/tidak cocok dengan organisasi." : "Purchase order tidak dapat disimpan. Periksa kembali data dan coba lagi."}</p>}
        <div className="metricGrid">
          <article className="metric"><span>Total purchase order</span><strong>{typedOrders.length}</strong><small>Maksimal 100 terbaru</small></article>
          <article className="metric"><span>Pemasok aktif</span><strong>{suppliers.length}</strong><small>Master pemasok</small></article>
          <article className="metric"><span>Produk dapat dibeli</span><strong>{products.length}</strong><small>Master produk aktif</small></article>
          <article className="metric"><span>Status awal</span><strong className="metricText">DRAFT</strong><small>Perlu persetujuan terpisah</small></article>
        </div>
        <section className="metric orderCreatePanel">
          <h2 style={{marginTop:0}}>Buat purchase order</h2>
          <p className="muted">Harga dan pajak diisi berdasarkan penawaran pemasok. Draft tidak menambah stok dan belum menjadi kewajiban pembayaran.</p>
          {!ready ? <div className="setupNotice">Lengkapi master pemasok, lokasi aktif, dan produk yang dapat dibeli terlebih dahulu. <Link href="/workspace/suppliers">Pemasok</Link> · <Link href="/workspace/products">Produk</Link> · <Link href="/workspace/setup">Lokasi</Link>.</div> : (
            <form action={createPurchaseOrder} className="authForm orderForm">
              <label htmlFor="supplier_id">Pemasok</label><select id="supplier_id" name="supplier_id" required defaultValue=""><option value="" disabled>Pilih pemasok</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.supplier_code} · {s.name}</option>)}</select>
              <label htmlFor="site_id">Lokasi penerimaan</label><select id="site_id" name="site_id" required defaultValue=""><option value="" disabled>Pilih lokasi</option>{sites.map(s=><option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</select>
              <label htmlFor="expected_date">Tanggal perkiraan tiba (opsional)</label><input id="expected_date" name="expected_date" type="date" />
              <h3>Rincian pembelian (maksimal 5 baris)</h3>
              {Array.from({length:5},(_,i)=><div className="orderLine" key={i}>
                <label htmlFor={`purchase-product-${i}`}>Produk {i+1}</label>
                <select id={`purchase-product-${i}`} name="product_id" required={i===0} defaultValue=""><option value="">Pilih produk</option>{products.map(p=><option key={p.id} value={p.id}>{p.sku} · {p.name}{p.unit_code ? ` (${p.unit_code})` : ""}</option>)}</select>
                <div className="orderNumbers">
                  <label>Qty<input name="quantity_ordered" type="number" min="0.001" step="0.001" required={i===0} placeholder="0" /></label>
                  <label>Harga satuan (Rp)<input name="unit_price" type="number" min="0" step="0.01" required={i===0} placeholder="0" /></label>
                  <label>Pajak (%)<input name="tax_rate" type="number" min="0" max="100" step="0.01" defaultValue="0" /></label>
                </div>
              </div>)}
              <label htmlFor="notes">Catatan (opsional)</label><textarea id="notes" name="notes" rows={3} maxLength={1500} placeholder="Nomor penawaran atau catatan pembelian" />
              <button className="primary authSubmit" type="submit">Simpan purchase order draft</button>
            </form>
          )}
        </section>
        <h2>Daftar purchase order</h2>
        {typedOrders.length===0 ? <article className="moduleCard"><strong>Belum ada purchase order</strong><small>PO pertama akan muncul setelah master data dan penawaran pemasok tersedia.</small></article> :
          <div className="orderList">{typedOrders.map((o)=><article className="orderItem orderItemStack" key={o.po_number}><div><span className="inquiryType">{o.po_number} · {o.status}</span><h3>{o.supplier_name}</h3><small>{o.site_name} · {new Intl.DateTimeFormat("id-ID",{dateStyle:"medium",timeZone:"Asia/Jakarta"}).format(new Date(o.order_date))}{o.expected_date ? ` · Tiba ${new Intl.DateTimeFormat("id-ID",{dateStyle:"medium",timeZone:"Asia/Jakarta"}).format(new Date(o.expected_date))}` : ""}</small></div><strong>{Number(o.total_amount).toLocaleString("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:2})}</strong><div className="orderActions">{o.status==="draft" && <form action={approvePurchaseOrder}><input type="hidden" name="purchase_order_id" value={o.id}/><button className="primary" type="submit">Setujui (OWNER)</button></form>}{["approved","partially_received"].includes(o.status) && warehouses.filter(w=>w.site_id===o.site_id).map(w=><Link className="orderActionLink" key={w.id} href={`/workspace/goods-receipts/new?po_id=${o.id}&warehouse_id=${w.id}`}>Terima di {w.name} ↗</Link>)}</div></article>)}</div>
        }
        <p className="workspaceFoot"><Link href="/workspace">Kembali ke dashboard</Link> · Stok bertambah hanya melalui proses penerimaan barang.</p>
      </section>
    </main>
  );
}
