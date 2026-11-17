"use server";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
async function getActor(ownerOnly=false) {
 const {data:session}=await auth.getSession(); if(!session?.user) redirect("/auth/sign-in");
 const {sql}=await import("@/lib/db");
 const rows=await sql`SELECT p.id AS actor_id,p.organization_id,r.code AS role_code FROM user_profiles p JOIN user_role_assignments a ON a.user_id=p.id JOIN roles r ON r.id=a.role_id WHERE p.auth_subject=${session.user.id} AND p.status='active' AND r.code IN ('OWNER','ADMIN') ORDER BY CASE WHEN r.code='OWNER' THEN 0 ELSE 1 END LIMIT 1`;
 const user=rows[0] as {actor_id:string;organization_id:string;role_code:string}|undefined;
 if(!user||(ownerOnly&&user.role_code!=="OWNER")) redirect("/workspace?access=denied");
 return {user,sql};
}
export async function createSupplierBill(f:FormData) {
 const supplier=String(f.get("supplier_id")??""), po=String(f.get("purchase_order_id")??"").trim(), number=String(f.get("supplier_invoice_number")??"").trim(), date=String(f.get("invoice_date")??""), due=String(f.get("due_date")??"").trim(), subtotal=Number(f.get("subtotal")), tax=Number(f.get("tax_amount")||0);
 if(!/^[0-9a-f-]{36}$/i.test(supplier)||(po&&!/^[0-9a-f-]{36}$/i.test(po))||number.length<2||number.length>100||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)||(due&&!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(due))||!Number.isFinite(subtotal)||!Number.isFinite(tax)||subtotal<0||tax<0||subtotal+tax<=0) redirect("/workspace/payables?error=invalid");
 const {user,sql}=await getActor();
 const rows=await sql`WITH valid AS (SELECT s.id,s.organization_id FROM suppliers s WHERE s.id=${supplier}::uuid AND s.organization_id=${user.organization_id}::uuid AND s.status='active' AND (${po||null}::text IS NULL OR EXISTS(SELECT 1 FROM purchase_orders p WHERE p.id=${po||null}::uuid AND p.organization_id=s.organization_id AND p.supplier_id=s.id AND p.status IN ('approved','partially_received','received')))), created AS (INSERT INTO supplier_bills(organization_id,supplier_id,purchase_order_id,supplier_invoice_number,invoice_date,due_date,subtotal,tax_amount,total_amount,created_by) SELECT organization_id,id,${po||null}::uuid,${number},${date}::date,${due||null}::date,${subtotal},${tax},${subtotal+tax},${user.actor_id}::uuid FROM valid RETURNING id,supplier_invoice_number,total_amount), logged AS (INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,after_data) SELECT ${user.organization_id}::uuid,${user.actor_id}::uuid,'CREATE_DRAFT','supplier_bill',id::text,jsonb_build_object('supplier_invoice_number',supplier_invoice_number,'total_amount',total_amount) FROM created RETURNING id) SELECT id FROM created`;
 if(!rows.length) redirect("/workspace/payables?error=supplier"); redirect("/workspace/payables?created=1");
}
export async function postSupplierBill(f:FormData) {
 const id=String(f.get("supplier_bill_id")??""); if(!/^[0-9a-f-]{36}$/i.test(id)) redirect("/workspace/payables?error=post");
 const {user,sql}=await getActor(true);
 const rows=await sql`WITH updated AS (UPDATE supplier_bills SET status='posted',posted_by=${user.actor_id}::uuid WHERE id=${id}::uuid AND organization_id=${user.organization_id}::uuid AND status='draft' RETURNING id,supplier_invoice_number,total_amount), logged AS (INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,after_data) SELECT ${user.organization_id}::uuid,${user.actor_id}::uuid,'POST','supplier_bill',id::text,jsonb_build_object('supplier_invoice_number',supplier_invoice_number,'total_amount',total_amount) FROM updated RETURNING id) SELECT id FROM updated`;
 if(!rows.length) redirect("/workspace/payables?error=post"); redirect("/workspace/payables?posted=1");
}
export async function settleSupplierBill(f:FormData) {
 const id=String(f.get("supplier_bill_id")??""), amount=Number(f.get("amount")), method=String(f.get("method")??""), ref=String(f.get("reference_number")??"").trim(), date=String(f.get("payment_date")??"");
 if(!/^[0-9a-f-]{36}$/i.test(id)||!Number.isFinite(amount)||amount<=0||!["cash","bank_transfer","card","other"].includes(method)||ref.length>120||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)) redirect("/workspace/payables?error=payment");
 const {user,sql}=await getActor();
 const rows=await sql`WITH bill AS (SELECT id,supplier_id,total_amount-paid_amount AS outstanding FROM supplier_bills WHERE id=${id}::uuid AND organization_id=${user.organization_id}::uuid AND status IN ('posted','partially_paid')), inserted AS (INSERT INTO payments(organization_id,payment_number,payment_type,party_type,party_id,supplier_bill_id,payment_date,amount,method,reference_number,status) SELECT ${user.organization_id}::uuid,'PAY-'||to_char(${date}::date,'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),'supplier_payment','supplier',supplier_id,id,${date}::date,${amount},${method},${ref||null},'settled' FROM bill WHERE ${amount}<=outstanding RETURNING id,payment_number,amount), logged AS (INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,after_data) SELECT ${user.organization_id}::uuid,${user.actor_id}::uuid,'SETTLE','supplier_payment',id::text,jsonb_build_object('payment_number',payment_number,'amount',amount) FROM inserted RETURNING id) SELECT id FROM inserted`;
 if(!rows.length) redirect("/workspace/payables?error=balance"); redirect("/workspace/payables?paid=1");
}
