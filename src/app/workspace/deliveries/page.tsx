import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { SignOutButton } from "../sign-out-button";
import { confirmDelivery, createDelivery, dispatchDelivery } from "./actions";

export const dynamic = "force-dynamic";

type ApprovedOrder={id:string;order_number:string;customer_name:string;total_amount:string|number;requested_delivery_date:string|null};
type Delivery={id:string;delivery_number:string;sales_order_number:string;customer_name:string;status:string;planned_date:string|null;dispatched_at:string|null;delivered_at:string|null;vehicle_plate:string|null;driver_name:string|null;proof_of_delivery_url:string|null;line_count:number;quantity_total:string|number};

const statusLabels:Record<string,string>={planned:"Terjadwal",picked:"Disiapkan",dispatched:"Dalam perjalanan",delivered:"Terkirim",failed:"Gagal",returned:"Retur"};

export default async function DeliveriesPage({searchParams}:{searchParams:Promise<{created?:string;dispatched?:string;delivered?:string;error?:string}>}) {
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
  const orders=await sql`
    SELECT so.id,so.order_number,c.name AS customer_name,so.total_amount,so.requested_delivery_date
    FROM sales_orders so JOIN customers c ON c.id=so.customer_id
    WHERE so.organization_id=${actor.organization_id}::uuid AND so.status='approved'
      AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.sales_order_id=so.id AND d.status NOT IN ('failed','returned'))
      AND EXISTS (SELECT 1 FROM sales_order_allocations a WHERE a.sales_order_id=so.id AND a.status='reserved')
    ORDER BY so.requested_delivery_date NULLS LAST,so.order_date LIMIT 100
  ` as ApprovedOrder[];
  const deliveries=await sql`
    SELECT d.id,d.delivery_number,so.order_number,c.name AS customer_name,d.status,d.planned_date,d.dispatched_at,
      d.delivered_at,d.vehicle_plate,d.driver_name,d.proof_of_delivery_url,
      count(di.id)::int AS line_count,coalesce(sum(di.quantity),0) AS quantity_total
    FROM deliveries d JOIN sales_orders so ON so.id=d.sales_order_id
    JOIN customers c ON c.id=so.customer_id
    LEFT JOIN delivery_items di ON di.delivery_id=d.id
    WHERE d.organization_id=${actor.organization_id}::uuid
    GROUP BY d.id,so.order_number,c.name
    ORDER BY d.created_at DESC LIMIT 100
  ` as Delivery[];
  const params=await searchParams;

  return (
    <main className="workspace">
      <aside className="side">
        <Link className="brand" href="/">BANYU <span>AGUNG</span></Link>
        <p className="sideLabel">DISTRIBUTION</p>
        <Link className="sideLink" href="/workspace">← Ringkasan</Link>
        <Link className="sideActive" href="/workspace/deliveries">Delivery</Link>
        <Link className="sideLink" href="/workspace/sales-orders">Sales Orders</Link>
        <Link className="sideLink" href="/workspace/invoices">Invoices</Link>
        <Link className="sideLink" href="/workspace/inventory">Inventory</Link>
      </aside>
      <section className="workMain">
        <header className="workHeader"><div><p className="eyebrow">BANYU AGUNG / DISTRIBUTION</p><h1>Delivery & Pengiriman</h1><p className="muted">Pengiriman dari sales order yang sudah disetujui dan stoknya direservasi · {actor.role_name}</p></div><SignOutButton /></header>
        {params.created==="1" && <p className="authSuccess" role="status">Dokumen delivery terjadwal berhasil dibuat. Stok belum dikurangi sampai dispatch.</p>}
        {params.dispatched==="1" && <p className="authSuccess" role="status">Pengiriman berhasil didispatch. Stok dan reservasi telah dikurangi serta pergerakan stok dicatat.</p>}
        {params.delivered==="1" && <p className="authSuccess" role="status">Pengiriman berhasil dikonfirmasi delivered.</p>}
        {params.error && <p className="authError" role="alert">{params.error==="invalid" ? "Periksa nomor kendaraan, pengemudi, tanggal dan catatan." : params.error==="allocation" ? "Delivery hanya dapat dibuat dari sales order approved dengan reservasi stok lengkap." : params.error==="dispatch_invalid" ? "Nomor kendaraan dan nama pengemudi wajib diisi saat dispatch." : params.error==="dispatch_stock" ? "Dispatch dibatalkan karena saldo/reservasi stok tidak mencukupi. Tidak ada stok yang dikurangi." : params.error==="proof" ? "Tautan bukti pengiriman harus berupa HTTPS dan maksimal 1.000 karakter." : "Konfirmasi delivery gagal. Periksa status dokumen."}</p>}
        <div className="metricGrid">
          <article className="metric"><span>Siap dibuat delivery</span><strong>{orders.length}</strong><small>Sales order approved</small></article>
          <article className="metric"><span>Dokumen pengiriman</span><strong>{deliveries.length}</strong><small>Maksimal 100 terbaru</small></article>
          <article className="metric"><span>Dalam perjalanan</span><strong>{deliveries.filter(d=>d.status==="dispatched").length}</strong><small>Menunggu konfirmasi diterima</small></article>
          <article className="metric"><span>Terkirim</span><strong>{deliveries.filter(d=>d.status==="delivered").length}</strong><small>Konfirmasi penerima</small></article>
        </div>
        <h2>Buat dokumen delivery</h2>
        {orders.length===0 ? <article className="moduleCard"><strong>Belum ada pesanan siap dikirim</strong><small>Sales order harus disetujui OWNER dan stok sudah direservasi.</small><Link className="moduleOpen" href="/workspace/sales-orders">Buka sales orders ↗</Link></article> :
          <div className="deliverySourceList">{orders.map(order=><article className="deliverySource" key={order.id}><div><span className="inquiryType">{order.order_number}</span><h3>{order.customer_name}</h3><small>{Number(order.total_amount).toLocaleString("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:2})}</small></div><form action={createDelivery} className="deliveryCreateForm"><input type="hidden" name="sales_order_id" value={order.id}/><label>Tanggal rencana<input name="planned_date" type="date" defaultValue={order.requested_delivery_date??""}/></label><label>Nomor kendaraan (opsional)<input name="vehicle_plate" maxLength={24} placeholder="Nomor polisi"/></label><label>Nama pengemudi (opsional)<input name="driver_name" maxLength={120} placeholder="Nama pengemudi"/></label><label>Catatan<input name="notes" maxLength={1000} placeholder="Catatan pengiriman"/></label><button className="primary" type="submit">Buat delivery</button></form></article>)}</div>
        }
        <h2>Daftar pengiriman</h2>
        {deliveries.length===0 ? <article className="moduleCard"><small>Belum ada dokumen pengiriman.</small></article> :
          <div className="deliveryList">{deliveries.map(d=><article className="deliveryItem" key={d.id}>
            <div className="deliveryHead"><div><span className="inquiryType">{d.delivery_number} · {statusLabels[d.status]??d.status}</span><h3>{d.sales_order_number} · {d.customer_name}</h3><small>{d.line_count} baris · {Number(d.quantity_total).toLocaleString("id-ID")} unit{d.vehicle_plate ? " · "+d.vehicle_plate : ""}{d.driver_name ? " · "+d.driver_name : ""}</small></div><strong>{d.status==="delivered"?"Selesai":d.status==="dispatched"?"Berjalan":"Terjadwal"}</strong></div>
            {d.status==="planned" && <form action={dispatchDelivery} className="deliveryActionForm"><input type="hidden" name="delivery_id" value={d.id}/><label>Kendaraan<input name="vehicle_plate" required maxLength={24} defaultValue={d.vehicle_plate??""} placeholder="Nomor polisi"/></label><label>Pengemudi<input name="driver_name" required maxLength={120} defaultValue={d.driver_name??""} placeholder="Nama pengemudi"/></label><button className="primary" type="submit">Dispatch & keluarkan stok</button></form>}
            {d.status==="dispatched" && <form action={confirmDelivery} className="deliveryActionForm"><input type="hidden" name="delivery_id" value={d.id}/><label>Bukti pengiriman (URL HTTPS, opsional)<input name="proof_of_delivery_url" type="url" maxLength={1000} defaultValue={d.proof_of_delivery_url??""} placeholder="https://..." /></label><button className="primary" type="submit">Konfirmasi diterima</button></form>}
            {d.status==="delivered" && d.proof_of_delivery_url && <p className="deliveryProof"><a href={d.proof_of_delivery_url} target="_blank" rel="noreferrer">Buka bukti pengiriman ↗</a></p>}
          </article>)}</div>
        }
        <p className="workspaceFoot"><Link href="/workspace/invoices">Lanjut ke invoice</Link> · Dispatch mengurangi stok; konfirmasi delivered membuka proses penagihan.</p>
      </section>
    </main>
  );
}
