"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";

export async function createSalesOrder(formData: FormData) {
  const customerId = String(formData.get("customer_id") ?? "");
  const siteId = String(formData.get("site_id") ?? "");
  const channel = String(formData.get("channel") ?? "direct");
  const requestedDate = String(formData.get("requested_delivery_date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const ids = formData.getAll("product_id").map(String);
  const quantities = formData.getAll("quantity").map(String);
  const prices = formData.getAll("unit_price").map(String);
  const discounts = formData.getAll("discount_amount").map(String);
  const taxes = formData.getAll("tax_rate").map(String);
  const lines = ids.map((id, i) => ({ id, quantity: Number(quantities[i]), price: Number(prices[i]), discount: Number(discounts[i] || 0), tax: Number(taxes[i] || 0) })).filter(x => x.id);
  const channels = ["direct", "whatsapp", "reseller", "distributor", "institutional"];

  if (!/^[0-9a-f-]{36}$/i.test(customerId) || !/^[0-9a-f-]{36}$/i.test(siteId) ||
      !channels.includes(channel) || notes.length > 1500 ||
      (requestedDate && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) ||
      lines.length < 1 || lines.length > 5 ||
      new Set(lines.map(x=>x.id)).size !== lines.length ||
      lines.some(x => !/^[0-9a-f-]{36}$/i.test(x.id) || !Number.isFinite(x.quantity) || x.quantity <= 0 ||
        !Number.isFinite(x.price) || x.price < 0 || !Number.isFinite(x.discount) ||
        x.discount < 0 || x.discount > x.quantity * x.price ||
        !Number.isFinite(x.tax) || x.tax < 0 || x.tax > 100)) {
    redirect("/workspace/sales-orders?error=invalid");
  }

  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");
  const { sql } = await import("@/lib/db");
  const actors = await sql`
    SELECT p.id AS actor_id, p.organization_id
    FROM user_profiles p
    JOIN user_role_assignments a ON a.user_id=p.id
    JOIN roles r ON r.id=a.role_id
    WHERE p.auth_subject=${session.user.id} AND p.status='active' AND r.code IN ('OWNER','ADMIN')
    ORDER BY r.code LIMIT 1
  `;
  const actor = actors[0] as {actor_id:string;organization_id:string}|undefined;
  if (!actor) redirect("/workspace?access=denied");

  try {
    const rows = await sql`
      WITH valid_context AS (
        SELECT c.id AS customer_id, s.id AS site_id, actor.actor_id, actor.organization_id
        FROM customers c
        JOIN sites s ON s.organization_id=c.organization_id
        CROSS JOIN (SELECT ${actor.actor_id}::uuid AS actor_id, ${actor.organization_id}::uuid AS organization_id) actor
        WHERE c.id=${customerId}::uuid AND c.organization_id=actor.organization_id AND c.status='active'
          AND s.id=${siteId}::uuid AND s.is_active=true
      ),
      requested AS (
        SELECT * FROM jsonb_to_recordset(${JSON.stringify(lines.map(x=>({product_id:x.id,quantity:x.quantity,unit_price:x.price,discount_amount:x.discount,tax_rate:x.tax})))}::jsonb)
        AS x(product_id uuid, quantity numeric, unit_price numeric, discount_amount numeric, tax_rate numeric)
      ),
      valid_lines AS (
        SELECT r.product_id,r.quantity,r.unit_price,r.discount_amount,r.tax_rate
        FROM requested r
        JOIN products p ON p.id=r.product_id
        CROSS JOIN valid_context v
        WHERE p.organization_id=v.organization_id AND p.is_active=true AND p.is_sellable=true
      ),
      totals AS (
        SELECT count(*) AS line_count,
          coalesce(sum(quantity*unit_price),0) AS subtotal,
          coalesce(sum(discount_amount),0) AS discount_total,
          coalesce(sum(round((quantity*unit_price-discount_amount)*tax_rate/100,2)),0) AS tax_total
        FROM valid_lines
      ),
      created AS (
        INSERT INTO sales_orders (
          organization_id,site_id,order_number,customer_id,requested_delivery_date,
          channel,status,subtotal,discount_amount,tax_amount,total_amount,notes,created_by
        )
        SELECT v.organization_id,v.site_id,
          'SO-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),
          v.customer_id,${requestedDate || null}::date,${channel},'draft',
          t.subtotal,t.discount_total,t.tax_total,t.subtotal-t.discount_total+t.tax_total,
          ${notes || null},v.actor_id
        FROM valid_context v CROSS JOIN totals t
        WHERE t.line_count=${lines.length}
        RETURNING id,organization_id,order_number,total_amount,created_by
      ),
      items AS (
        INSERT INTO sales_order_items (sales_order_id,product_id,quantity,unit_price,discount_amount,tax_rate,line_total)
        SELECT c.id,l.product_id,l.quantity,l.unit_price,l.discount_amount,l.tax_rate,
          l.quantity*l.unit_price-l.discount_amount+round((l.quantity*l.unit_price-l.discount_amount)*l.tax_rate/100,2)
        FROM created c CROSS JOIN valid_lines l
        RETURNING id
      ),
      logged AS (
        INSERT INTO audit_logs (organization_id,actor_user_id,action,entity_type,entity_id,after_data)
        SELECT organization_id,created_by,'CREATE_DRAFT','sales_order',id::text,
          jsonb_build_object('order_number',order_number,'total_amount',total_amount)
        FROM created RETURNING id
      )
      SELECT order_number FROM created
    `;
    if (rows.length === 0) redirect("/workspace/sales-orders?error=master");
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) throw error;
    redirect("/workspace/sales-orders?error=save");
  }
  redirect("/workspace/sales-orders?created=1");
}
