"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";

async function getInvoiceActor(ownersOnly=false) {
  const {data:session}=await auth.getSession();
  if(!session?.user) redirect("/auth/sign-in");
  const {sql}=await import("@/lib/db");
  const actor=await sql`
    SELECT p.id AS actor_id,p.organization_id,r.code AS role_code
    FROM user_profiles p JOIN user_role_assignments a ON a.user_id=p.id JOIN roles r ON r.id=a.role_id
    WHERE p.auth_subject=${session.user.id} AND p.status='active'
      AND r.code IN ('OWNER','ADMIN','FINANCE')
    ORDER BY CASE WHEN r.code='OWNER' THEN 0 ELSE 1 END LIMIT 1
  `;
  const row=actor[0] as {actor_id:string;organization_id:string;role_code:string}|undefined;
  if(!row || (ownersOnly && row.role_code!=="OWNER")) redirect("/workspace?access=denied");
  return {row,sql};
}

export async function createInvoice(formData:FormData) {
  const salesOrderId=String(formData.get("sales_order_id")??"");
  const dueDate=String(formData.get("due_date")??"").trim();
  if(!/^[0-9a-f-]{36}$/i.test(salesOrderId) || (dueDate&&!/^\d{4}-\d{2}-\d{2}$/.test(dueDate))) {
    redirect("/workspace/invoices?error=invalid");
  }
  const {row,sql}=await getInvoiceActor();
  const result=await sql`
    WITH order_context AS (
      SELECT so.id,so.organization_id,so.customer_id,so.subtotal,so.tax_amount,so.total_amount,${row.actor_id}::uuid AS actor_id
      FROM sales_orders so
      WHERE so.id=${salesOrderId}::uuid AND so.organization_id=${row.organization_id}::uuid
        AND so.status='delivered'
        AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.sales_order_id=so.id AND i.status<>'void')
    ),
    created AS (
      INSERT INTO invoices (
        organization_id,invoice_number,customer_id,sales_order_id,due_date,
        subtotal,tax_amount,total_amount,paid_amount,status
      )
      SELECT organization_id,
        'INV-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),
        customer_id,id,${dueDate||null}::date,subtotal,tax_amount,total_amount,0,'draft'
      FROM order_context
      RETURNING id,organization_id,invoice_number,sales_order_id,total_amount
    ),
    items AS (
      INSERT INTO invoice_items (
        invoice_id,sales_order_item_id,product_id,description,quantity,
        unit_price,discount_amount,tax_rate,line_total
      )
      SELECT i.id,soi.id,soi.product_id,p.name,soi.quantity,
        soi.unit_price,soi.discount_amount,soi.tax_rate,soi.line_total
      FROM created i JOIN sales_order_items soi ON soi.sales_order_id=i.sales_order_id
      JOIN products p ON p.id=soi.product_id
      RETURNING id
    ),
    logged AS (
      INSERT INTO audit_logs (organization_id,actor_user_id,action,entity_type,entity_id,after_data)
      SELECT i.organization_id,${row.actor_id}::uuid,'CREATE_DRAFT','invoice',i.id::text,
        jsonb_build_object('invoice_number',i.invoice_number,'sales_order_id',i.sales_order_id,'total_amount',i.total_amount)
      FROM created i RETURNING id
    )
    SELECT invoice_number FROM created
  `;
  if(result.length===0) redirect("/workspace/invoices?error=order");
  redirect("/workspace/invoices?created=1");
}

export async function postInvoice(formData:FormData) {
  const invoiceId=String(formData.get("invoice_id")??"");
  if(!/^[0-9a-f-]{36}$/i.test(invoiceId)) redirect("/workspace/invoices?error=post");
  const {row,sql}=await getInvoiceActor(true);
  const result=await sql`
    WITH updated AS (
      UPDATE invoices i SET status='posted'
      WHERE i.id=${invoiceId}::uuid AND i.organization_id=${row.organization_id}::uuid AND i.status='draft'
      RETURNING i.id,i.organization_id,i.invoice_number,i.total_amount
    ),
    logged AS (
      INSERT INTO audit_logs (organization_id,actor_user_id,action,entity_type,entity_id,after_data)
      SELECT organization_id,${row.actor_id}::uuid,'POST','invoice',id::text,
        jsonb_build_object('invoice_number',invoice_number,'total_amount',total_amount)
      FROM updated RETURNING id
    )
    SELECT invoice_number FROM updated
  `;
  if(result.length===0) redirect("/workspace/invoices?error=post");
  redirect("/workspace/invoices?posted=1");
}


export async function settleInvoice(formData: FormData) {
  const invoiceId = String(formData.get("invoice_id") ?? "");
  const amount = Number(formData.get("amount"));
  const method = String(formData.get("method") ?? "");
  const reference = String(formData.get("reference_number") ?? "").trim();
  const date = String(formData.get("payment_date") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(invoiceId) || !Number.isFinite(amount) || amount <= 0 ||
      !["cash", "bank_transfer", "card"].includes(method) || reference.length > 120 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    redirect("/workspace/invoices?error=payment");
  }
  const { row, sql } = await getInvoiceActor();
  const rows = await sql`
    WITH invoice AS (
      SELECT id, customer_id, total_amount - paid_amount AS outstanding
      FROM invoices
      WHERE id = ${invoiceId}::uuid AND organization_id = ${row.organization_id}::uuid
        AND status IN ('posted','partially_paid')
    ), inserted AS (
      INSERT INTO payments (
        organization_id, payment_number, payment_type, party_type, party_id,
        invoice_id, payment_date, amount, method, reference_number, status
      )
      SELECT ${row.organization_id}::uuid,
        'RCV-' || to_char(${date}::date,'YYYYMMDD') || '-' ||
          upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),
        'customer_receipt','customer',customer_id,id,${date}::date,${amount},
        ${method},${reference || null},'settled'
      FROM invoice WHERE ${amount} <= outstanding
      RETURNING id,payment_number,amount
    ), logged AS (
      INSERT INTO audit_logs (organization_id,actor_user_id,action,entity_type,entity_id,after_data)
      SELECT ${row.organization_id}::uuid,${row.actor_id}::uuid,'SETTLE',
        'customer_receipt',id::text,
        jsonb_build_object('payment_number',payment_number,'amount',amount)
      FROM inserted RETURNING id
    )
    SELECT id FROM inserted
  `;
  if (!rows.length) redirect("/workspace/invoices?error=balance");
  redirect("/workspace/invoices?paid=1");
}
