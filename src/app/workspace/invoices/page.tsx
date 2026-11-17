import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { SignOutButton } from "../sign-out-button";
import { createInvoice, postInvoice } from "./actions";

export const dynamic = "force-dynamic";

type DeliveredOrder={id:string;order_number:string;customer_name:string;delivered_at:string;total_amount:string|number};
type Invoice={id:string;invoice_number:string;customer_name:string;sales_order_number:string|null;invoice_date:string;due_date:string|null;total_amount:string|number;paid_amount:string|number;status:string};

export default async function InvoicesPage({searchParams}:{searchParams:Promise<{created?:string;posted?:string;error?:string}>}) {
  const {data:session}=await auth.getSession();
  if(!session?.user) redirect("/auth/sign-in");
  const {sql}=await import("@/lib/db");
  const actors=await sql`
    SELECT p.organization_id,r.name AS role_name,r.code AS role_code
    FROM user_profiles p JOIN user_role_assignments a ON a.user_id=p.id JOIN roles r ON r.id=a.role_id
    WHERE p.auth_subject=${session.user.id} AND p.status='active' AND r.code IN ('OWNER','ADMIN')
    ORDER BY r.code LIMIT 1
  `;
  const actor=actors[0] as {organization_id:string;role_name:string;role_code:string}|undefined;
  if(!actor) redirect("/workspace?access=denied");
  const delivered=await sql`
    SELECT so.id,so.order_number,c.name AS customer_name,so.total_amount,
      (SELECT max(d.delivered_at) FROM deliveries d WHERE d.sales_order_id=so.id AND d.status='delivered') AS delivered_at
    FROM sales_orders so JOIN customers c ON c.id=so.customer_id
    WHERE so.organization_id=${actor.organization_id}::uuid AND so.status='delivered'
      AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.sales_order_id=so.id AND i.status<>'void')
    ORDER BY so.order_date DESC LIMIT 100
  ` as DeliveredOrder[];
  const invoices=await sql`
    SELECT i.id,i.invoice_number,c.name AS customer_name,so.order_number AS sales_order_number,
      i.invoice_date,i.due_date,i.total_amount,i.paid_amount,i.status
    FROM invoices i JOIN customers c ON c.id=i.customer_id
    LEFT JOIN sales_orders so ON so.id=i.sales_order_id
    WHERE i.organization_id=${actor.organization_id}::uuid
    ORDER BY i.created_at DESC LIMIT 100
  ` as Invoice[];
  const params=await searchParams;

  return (
    <main className="workspace">
      <aside className="side">
        <Link className="brand" href="/">BANYU <span>AGUNG</span></Link>
        <p className="sideLabel">FINANCE / AR</p>
        <Link className="sideLink" href="/workspace">← Ringkasan</Link>
        <Link className="sideLink" href="/workspace/deliveries">Delivery</Link>
        <Link className="sideActive" href="/workspace/invoices">Invoices</Link>
        <Link className="sideLink" href="/workspace/sales-orders">Sales Orders</Link>
      </aside>
      <section className="workMain">
        <header className="workHeader"><div><p className="eyebrow">BANYU AGUNG / FINANCE</p><h1>Invoices / Piutang</h1><p className="muted">Invoice dibuat dari pesanan yang sudah dikonfirmasi terkirim · {actor.role_name}</p></div><SignOutButton /></header>
        {params.created==="1" && <p className="authSuccess" role="status">Invoice draft berhasil dibuat. Posting akan membuat jurnal piutang, pendapatan, dan pajak sesuai pemetaan akun.</p>}
        {params.posted==="1" && <p className="authSuccess" role="status">Invoice berhasil diposting bersama jurnal piutang, pendapatan, dan pajak.</p>}
        {params.error && <p className="authError" role="alert">{params.error==="invalid" ? "Tanggal jatuh tempo atau referensi pesanan tidak valid." : params.error==="order" ? "Invoice hanya dapat dibuat satu kali dari sales order berstatus delivered." : "Invoice tidak dapat diposting. Pastikan status masih draft dan hak akses sesuai."}</p>}
        <div className="metricGrid">
          <article className="metric"><span>Invoice tercatat</span><strong>{invoices.length}</strong><small>Maksimal 100 terbaru</small></article>
          <article className="metric"><span>Siap ditagih</span><strong>{delivered.length}</strong><small>Sales order delivered tanpa invoice</small></article>
          <article className="metric"><span>Draft invoice</span><strong>{invoices.filter(i=>i.status==="draft").length}</strong><small>Menunggu posting OWNER</small></article>
          <article className="metric"><span>Hak posting</span><strong className="metricText">{actor.role_code==="OWNER"?"OWNER":"TERBATAS"}</strong><small>Posting invoice hanya OWNER</small></article>
        </div>
        <h2>Buat invoice dari pengiriman selesai</h2>
        {delivered.length===0 ? <article className="moduleCard"><strong>Belum ada pesanan terkirim yang siap ditagih</strong><small>Invoice hanya dibuat setelah delivery dikonfirmasi delivered.</small></article> :
          <div className="invoiceSourceList">{delivered.map(order=><article className="invoiceSource" key={order.id}><div><span className="inquiryType">{order.order_number}</span><h3>{order.customer_name}</h3><small>Terkirim {order.delivered_at ? new Intl.DateTimeFormat("id-ID",{dateStyle:"medium",timeZone:"Asia/Jakarta"}).format(new Date(order.delivered_at)) : "—"}</small></div><strong>{Number(order.total_amount).toLocaleString("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:2})}</strong><form action={createInvoice} className="invoiceCreateForm"><input type="hidden" name="sales_order_id" value={order.id}/><label>Jatuh tempo (opsional)<input name="due_date" type="date"/></label><button className="primary" type="submit">Buat invoice draft</button></form></article>)}</div>
        }
        <h2>Daftar invoice</h2>
        {invoices.length===0 ? <article className="moduleCard"><small>Belum ada invoice.</small></article> :
          <div className="invoiceList">{invoices.map(invoice=><article className="invoiceItem" key={invoice.id}><div><span className="inquiryType">{invoice.invoice_number} · {invoice.status}</span><h3>{invoice.customer_name}</h3><small>{invoice.sales_order_number??"Invoice manual"} · Tanggal {new Intl.DateTimeFormat("id-ID",{dateStyle:"medium",timeZone:"Asia/Jakarta"}).format(new Date(invoice.invoice_date))}{invoice.due_date ? " · Jatuh tempo "+new Intl.DateTimeFormat("id-ID",{dateStyle:"medium",timeZone:"Asia/Jakarta"}).format(new Date(invoice.due_date)) : ""}</small></div><div className="invoiceAmount"><strong>{Number(invoice.total_amount).toLocaleString("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:2})}</strong><small>Terbayar {Number(invoice.paid_amount).toLocaleString("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:2})}</small></div>{actor.role_code==="OWNER" && invoice.status==="draft" && <form action={postInvoice}><input type="hidden" name="invoice_id" value={invoice.id}/><button className="primary" type="submit">Posting invoice</button></form>}</article>)}</div>
        }
        <p className="workspaceFoot"><Link href="/workspace">Kembali ke dashboard</Link> · Posting invoice membuat jurnal otomatis setelah pemetaan akun tersedia. Penerimaan pelanggan masih memerlukan modul pembayaran AR.</p>
      </section>
    </main>
  );
}
