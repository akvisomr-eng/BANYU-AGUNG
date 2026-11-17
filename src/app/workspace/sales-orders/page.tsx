import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { SignOutButton } from "../sign-out-button";
import { createSalesOrder } from "./actions";

export const dynamic = "force-dynamic";

type Customer = { id:string; name:string; customer_code:string };
type Site = { id:string; name:string; code:string };
type Product = { id:string; name:string; sku:string; unit_code:string|null };
type SalesOrder = { order_number:string; order_date:string; status:string; total_amount:string|number; customer_name:string; site_name:string };

export default async function SalesOrdersPage({ searchParams }: { searchParams: Promise<{created?:string;error?:string}> }) {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");
  const { sql } = await import("@/lib/db");
  const actors = await sql`
    SELECT p.organization_id,r.name AS role_name FROM user_profiles p
    JOIN user_role_assignments a ON a.user_id=p.id JOIN roles r ON r.id=a.role_id
    WHERE p.auth_subject=${session.user.id} AND p.status='active' AND r.code IN ('OWNER','ADMIN')
    ORDER BY r.code LIMIT 1
  `;
  const actor = actors[0] as {organization_id:string;role_name:string}|undefined;
  if (!actor) redirect("/workspace?access=denied");
  const customers = await sql`SELECT id,name,customer_code FROM customers WHERE organization_id=${actor.organization_id}::uuid AND status='active' ORDER BY name` as Customer[];
  const sites = await sql`SELECT id,name,code FROM sites WHERE organization_id=${actor.organization_id}::uuid AND is_active=true ORDER BY name` as Site[];
  const products = await sql`
    SELECT p.id,p.name,p.sku,u.code AS unit_code FROM products p
    LEFT JOIN units_of_measure u ON u.id=p.base_unit_id
    WHERE p.organization_id=${actor.organization_id}::uuid AND p.is_active=true AND p.is_sellable=true ORDER BY p.name
  ` as Product[];
  const orders = await sql`
    SELECT so.order_number,so.order_date,so.status,so.total_amount,c.name AS customer_name,s.name AS site_name
    FROM sales_orders so JOIN customers c ON c.id=so.customer_id JOIN sites s ON s.id=so.site_id
    WHERE so.organization_id=${actor.organization_id}::uuid ORDER BY so.created_at DESC LIMIT 100
  `;
  const typedOrders = orders as SalesOrder[];
  const params = await searchParams;
  const ready = customers.length>0 && sites.length>0 && products.length>0;

  return (
    <main className="workspace">
      <aside className="side">
        <Link className="brand" href="/">BANYU <span>AGUNG</span></Link>
        <p className="sideLabel">SALES & CRM</p>
        <Link className="sideLink" href="/workspace">← Ringkasan</Link>
        <Link className="sideActive" href="/workspace/sales-orders">Sales Orders</Link>
        <Link className="sideLink" href="/workspace/customers">Master Pelanggan</Link>
        <Link className="sideLink" href="/workspace/products">Produk & Barang</Link>
        <Link className="sideLink" href="/workspace/setup">Konfigurasi Operasional</Link>
        <Link className="sideLink" href="/">Kembali ke Website</Link>
      </aside>
      <section className="workMain">
        <header className="workHeader"><div><p className="eyebrow">BANYU AGUNG / SALES</p><h1>Sales Orders</h1><p className="muted">Pencatatan pesanan pelanggan dalam status draft · {actor.role_name}</p></div><SignOutButton /></header>
        {params.created==="1" && <p className="authSuccess" role="status">Sales order draft berhasil dibuat. Belum ada stok yang dialokasikan atau pengiriman yang dijadwalkan.</p>}
        {params.error && <p className="authError" role="alert">{params.error==="invalid" ? "Periksa pelanggan, lokasi, tanggal, dan rincian pesanan." : params.error==="master" ? "Pelanggan, lokasi, atau produk tidak aktif/tidak cocok dengan organisasi." : "Sales order tidak dapat disimpan. Periksa kembali data dan coba lagi."}</p>}
        <div className="metricGrid">
          <article className="metric"><span>Total pesanan</span><strong>{typedOrders.length}</strong><small>Maksimal 100 terbaru</small></article>
          <article className="metric"><span>Pelanggan aktif</span><strong>{customers.length}</strong><small>Master pelanggan</small></article>
          <article className="metric"><span>Produk dapat dijual</span><strong>{products.length}</strong><small>Master produk aktif</small></article>
          <article className="metric"><span>Status awal</span><strong className="metricText">DRAFT</strong><small>Perlu persetujuan terpisah</small></article>
        </div>
        <section className="metric orderCreatePanel">
          <h2 style={{marginTop:0}}>Buat sales order</h2>
          <p className="muted">Harga, diskon, dan pajak diisi sesuai penawaran yang telah disetujui. Pesanan tersimpan sebagai draft.</p>
          {!ready ? <div className="setupNotice">Lengkapi master pelanggan, lokasi aktif, dan produk yang dapat dijual terlebih dahulu. <Link href="/workspace/customers">Pelanggan</Link> · <Link href="/workspace/products">Produk</Link> · <Link href="/workspace/setup">Lokasi</Link>.</div> : (
            <form action={createSalesOrder} className="authForm orderForm">
              <label htmlFor="customer_id">Pelanggan</label><select id="customer_id" name="customer_id" required defaultValue=""><option value="" disabled>Pilih pelanggan</option>{customers.map(c=><option key={c.id} value={c.id}>{c.customer_code} · {c.name}</option>)}</select>
              <label htmlFor="site_id">Lokasi pemrosesan</label><select id="site_id" name="site_id" required defaultValue=""><option value="" disabled>Pilih lokasi</option>{sites.map(s=><option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</select>
              <label htmlFor="channel">Kanal penjualan</label><select id="channel" name="channel" defaultValue="direct"><option value="direct">Langsung</option><option value="whatsapp">WhatsApp</option><option value="reseller">Reseller</option><option value="distributor">Distributor</option><option value="institutional">Institusi</option></select>
              <label htmlFor="requested_delivery_date">Tanggal permintaan pengiriman (opsional)</label><input id="requested_delivery_date" name="requested_delivery_date" type="date" />
              <h3>Rincian barang (maksimal 5 baris)</h3>
              {Array.from({length:5},(_,i)=><div className="orderLine" key={i}>
                <label htmlFor={`product-${i}`}>Produk {i+1}</label>
                <select id={`product-${i}`} name="product_id" required={i===0} defaultValue=""><option value="">Pilih produk</option>{products.map(p=><option key={p.id} value={p.id}>{p.sku} · {p.name}{p.unit_code ? ` (${p.unit_code})` : ""}</option>)}</select>
                <div className="orderNumbers">
                  <label>Qty<input name="quantity" type="number" min="0.001" step="0.001" required={i===0} placeholder="0" /></label>
                  <label>Harga satuan (Rp)<input name="unit_price" type="number" min="0" step="0.01" required={i===0} placeholder="0" /></label>
                  <label>Diskon (Rp)<input name="discount_amount" type="number" min="0" step="0.01" defaultValue="0" /></label>
                  <label>Pajak (%)<input name="tax_rate" type="number" min="0" max="100" step="0.01" defaultValue="0" /></label>
                </div>
              </div>)}
              <label htmlFor="notes">Catatan (opsional)</label><textarea id="notes" name="notes" rows={3} maxLength={1500} placeholder="Catatan kesepakatan atau kebutuhan pelanggan" />
              <button className="primary authSubmit" type="submit">Simpan sales order draft</button>
            </form>
          )}
        </section>
        <h2>Daftar sales order</h2>
        {typedOrders.length===0 ? <article className="moduleCard"><strong>Belum ada pesanan</strong><small>Pesanan pertama akan muncul setelah master data dan harga disepakati.</small></article> :
          <div className="orderList">{typedOrders.map((o)=><article className="orderItem" key={o.order_number}><div><span className="inquiryType">{o.order_number} · {o.status}</span><h3>{o.customer_name}</h3><small>{o.site_name} · {new Intl.DateTimeFormat("id-ID",{dateStyle:"medium",timeZone:"Asia/Jakarta"}).format(new Date(o.order_date))}</small></div><strong>{Number(o.total_amount).toLocaleString("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:2})}</strong></article>)}</div>
        }
        <p className="workspaceFoot"><Link href="/workspace">Kembali ke dashboard</Link> · Draft belum mengubah stok atau jurnal keuangan.</p>
      </section>
    </main>
  );
}
