"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";

export async function createPurchaseOrder(formData: FormData) {
  const supplierId = String(formData.get("supplier_id") ?? "");
  const siteId = String(formData.get("site_id") ?? "");
  const expectedDate = String(formData.get("expected_date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const ids = formData.getAll("product_id").map(String);
  const quantities = formData.getAll("quantity_ordered").map(String);
  const prices = formData.getAll("unit_price").map(String);
  const taxes = formData.getAll("tax_rate").map(String);
  const lines = ids.map((id,i)=>({id,quantity:Number(quantities[i]),price:Number(prices[i]),tax:Number(taxes[i]||0)})).filter(x=>x.id);

  if (!/^[0-9a-f-]{36}$/i.test(supplierId) || !/^[0-9a-f-]{36}$/i.test(siteId) ||
      notes.length>1500 || (expectedDate && !/^\d{4}-\d{2}-\d{2}$/.test(expectedDate)) ||
      lines.length<1 || lines.length>5 || new Set(lines.map(x=>x.id)).size!==lines.length ||
      lines.some(x=>!/^[0-9a-f-]{36}$/i.test(x.id)||!Number.isFinite(x.quantity)||x.quantity<=0||
        !Number.isFinite(x.price)||x.price<0||!Number.isFinite(x.tax)||x.tax<0||x.tax>100)) {
    redirect("/workspace/purchase-orders?error=invalid");
  }

  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");
  const { sql } = await import("@/lib/db");
  const actors = await sql`
    SELECT p.id AS actor_id,p.organization_id FROM user_profiles p
    JOIN user_role_assignments a ON a.user_id=p.id JOIN roles r ON r.id=a.role_id
    WHERE p.auth_subject=${session.user.id} AND p.status='active' AND r.code IN ('OWNER','ADMIN')
    ORDER BY r.code LIMIT 1
  `;
  const actor=actors[0] as {actor_id:string;organization_id:string}|undefined;
  if(!actor) redirect("/workspace?access=denied");

  try {
    const rows=await sql`
      WITH valid_context AS (
        SELECT sup.id AS supplier_id,site.id AS site_id,actor.actor_id,actor.organization_id
        FROM suppliers sup
        JOIN sites site ON site.organization_id=sup.organization_id
        CROSS JOIN (SELECT ${actor.actor_id}::uuid AS actor_id,${actor.organization_id}::uuid AS organization_id) actor
        WHERE sup.id=${supplierId}::uuid AND sup.organization_id=actor.organization_id AND sup.status='active'
          AND site.id=${siteId}::uuid AND site.is_active=true
      ),
      requested AS (
        SELECT * FROM jsonb_to_recordset(${JSON.stringify(lines.map(x=>({product_id:x.id,quantity_ordered:x.quantity,unit_price:x.price,tax_rate:x.tax})))}::jsonb)
        AS x(product_id uuid,quantity_ordered numeric,unit_price numeric,tax_rate numeric)
      ),
      valid_lines AS (
        SELECT r.product_id,r.quantity_ordered,r.unit_price,r.tax_rate
        FROM requested r JOIN products p ON p.id=r.product_id
        CROSS JOIN valid_context v
        WHERE p.organization_id=v.organization_id AND p.is_active=true AND p.is_purchasable=true AND p.product_type<>'service'
      ),
      totals AS (
        SELECT count(*) AS line_count,coalesce(sum(quantity_ordered*unit_price),0) AS subtotal,
          coalesce(sum(round(quantity_ordered*unit_price*tax_rate/100,2)),0) AS tax_total
        FROM valid_lines
      ),
      created AS (
        INSERT INTO purchase_orders (
          organization_id,site_id,po_number,supplier_id,expected_date,status,
          subtotal,tax_amount,total_amount,notes,created_by
        )
        SELECT v.organization_id,v.site_id,
          'PO-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),
          v.supplier_id,${expectedDate||null}::date,'draft',t.subtotal,t.tax_total,t.subtotal+t.tax_total,
          ${notes||null},v.actor_id
        FROM valid_context v CROSS JOIN totals t
        WHERE t.line_count=${lines.length}
        RETURNING id,organization_id,po_number,total_amount,created_by
      ),
      items AS (
        INSERT INTO purchase_order_items (purchase_order_id,product_id,quantity_ordered,unit_price,tax_rate,line_total)
        SELECT c.id,l.product_id,l.quantity_ordered,l.unit_price,l.tax_rate,
          l.quantity_ordered*l.unit_price+round(l.quantity_ordered*l.unit_price*l.tax_rate/100,2)
        FROM created c CROSS JOIN valid_lines l RETURNING id
      ),
      logged AS (
        INSERT INTO audit_logs (organization_id,actor_user_id,action,entity_type,entity_id,after_data)
        SELECT organization_id,created_by,'CREATE_DRAFT','purchase_order',id::text,
          jsonb_build_object('po_number',po_number,'total_amount',total_amount)
        FROM created RETURNING id
      )
      SELECT po_number FROM created
    `;
    if(rows.length===0) redirect("/workspace/purchase-orders?error=master");
  } catch(error) {
    if(error instanceof Error && error.message.includes("NEXT_REDIRECT")) throw error;
    redirect("/workspace/purchase-orders?error=save");
  }
  redirect("/workspace/purchase-orders?created=1");
}

"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";

export async function approvePurchaseOrder(formData: FormData) {
  const id = String(formData.get("purchase_order_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/workspace/purchase-orders?error=approval");

  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");
  const { sql } = await import("@/lib/db");

  const result = await sql`
    WITH actor AS (
      SELECT p.id AS actor_id,p.organization_id
      FROM user_profiles p
      JOIN user_role_assignments a ON a.user_id=p.id
      JOIN roles r ON r.id=a.role_id
      WHERE p.auth_subject=${session.user.id} AND p.status='active' AND r.code='OWNER'
      LIMIT 1
    ),
    updated AS (
      UPDATE purchase_orders po
      SET status='approved',approved_by=actor.actor_id
      FROM actor
      WHERE po.id=${id}::uuid AND po.organization_id=actor.organization_id AND po.status='draft'
      RETURNING po.id,po.organization_id,po.po_number,actor.actor_id
    ),
    logged AS (
      INSERT INTO audit_logs (organization_id,actor_user_id,action,entity_type,entity_id,after_data)
      SELECT organization_id,actor_id,'APPROVE','purchase_order',id::text,jsonb_build_object('po_number',po_number,'status','approved')
      FROM updated RETURNING id
    )
    SELECT id FROM updated
  `;
  if (result.length===0) redirect("/workspace/purchase-orders?error=approval");
  redirect("/workspace/purchase-orders?approved=1");
}
