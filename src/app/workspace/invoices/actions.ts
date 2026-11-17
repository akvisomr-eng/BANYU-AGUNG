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
      AND r.code=ANY(${ownersOnly?["OWNER"]:["OWNER","ADMIN"]}::text[])
    ORDER BY r.code LIMIT 1
  `;
  const row=actor[0] as {actor_id:string;organization_id:string;role_code:string}|undefined;
  if(!row) redirect("/workspace?access=denied");
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
