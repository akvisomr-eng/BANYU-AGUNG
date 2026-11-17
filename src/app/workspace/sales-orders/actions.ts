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


export async function approveSalesOrder(formData: FormData) {
  const id=String(formData.get("sales_order_id")??"");
  if(!/^[0-9a-f-]{36}$/i.test(id)) redirect("/workspace/sales-orders?error=approval");
  const {data:session}=await auth.getSession();
  if(!session?.user) redirect("/auth/sign-in");
  const {sql}=await import("@/lib/db");
  const rows=await sql`
    WITH actor AS (
      SELECT p.id AS actor_id,p.organization_id
      FROM user_profiles p JOIN user_role_assignments a ON a.user_id=p.id JOIN roles r ON r.id=a.role_id
      WHERE p.auth_subject=${session.user.id} AND p.status='active' AND r.code='OWNER'
      LIMIT 1
    ),
    order_context AS (
      SELECT so.id,so.organization_id,so.site_id,so.order_number,actor.actor_id
      FROM sales_orders so JOIN actor ON actor.organization_id=so.organization_id
      WHERE so.id=${id}::uuid AND so.status='draft'
    ),
    requested AS (
      SELECT soi.id AS sales_order_item_id,soi.product_id,soi.quantity
      FROM sales_order_items soi JOIN order_context oc ON oc.id=soi.sales_order_id
    ),
    locked_balances AS (
      SELECT ib.id AS balance_id,ib.organization_id,ib.warehouse_id,ib.product_id,ib.lot_id,
        ib.quantity_on_hand-ib.quantity_reserved AS available,l.expires_at,l.received_at
      FROM inventory_balances ib
      JOIN inventory_lots l ON l.id=ib.lot_id AND l.quality_status='released'
      JOIN warehouses w ON w.id=ib.warehouse_id
      JOIN order_context oc ON oc.organization_id=ib.organization_id AND oc.site_id=w.site_id
      WHERE ib.quantity_on_hand>ib.quantity_reserved
      FOR UPDATE OF ib
    ),
    allocation_candidates AS (
      SELECT r.sales_order_item_id,r.product_id,r.quantity AS requested_quantity,
        lb.balance_id,lb.warehouse_id,lb.lot_id,lb.available,
        GREATEST(0,LEAST(lb.available,r.quantity-COALESCE(
          SUM(lb.available) OVER (
            PARTITION BY r.sales_order_item_id
            ORDER BY lb.expires_at NULLS LAST,lb.received_at NULLS LAST,lb.balance_id
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
          ),0
        ))) AS allocation_quantity
      FROM requested r JOIN locked_balances lb ON lb.product_id=r.product_id
    ),
    allocated_totals AS (
      SELECT sales_order_item_id,sum(allocation_quantity) AS allocated_quantity
      FROM allocation_candidates GROUP BY sales_order_item_id
    ),
    ready AS (
      SELECT count(*) AS item_count,
        NOT EXISTS (
          SELECT 1 FROM requested r
          LEFT JOIN allocated_totals t ON t.sales_order_item_id=r.sales_order_item_id
          WHERE COALESCE(t.allocated_quantity,0)<r.quantity
        ) AS enough
      FROM requested
    ),
    approved AS (
      UPDATE sales_orders so
      SET status='approved',approved_by=oc.actor_id
      FROM order_context oc CROSS JOIN ready
      WHERE so.id=oc.id AND ready.item_count>0 AND ready.enough=true
      RETURNING so.id,so.organization_id,so.order_number,so.approved_by
    ),
    allocations AS (
      INSERT INTO sales_order_allocations (
        organization_id,sales_order_id,sales_order_item_id,inventory_balance_id,
        warehouse_id,product_id,lot_id,quantity_reserved
      )
      SELECT a.organization_id,a.id,c.sales_order_item_id,c.balance_id,c.warehouse_id,
        c.product_id,c.lot_id,c.allocation_quantity
      FROM approved a CROSS JOIN allocation_candidates c
      WHERE c.allocation_quantity>0
      RETURNING id
    ),
    reserved AS (
      UPDATE inventory_balances ib
      SET quantity_reserved=ib.quantity_reserved+c.allocation_quantity,updated_at=now()
      FROM allocation_candidates c CROSS JOIN approved a
      WHERE ib.id=c.balance_id AND c.allocation_quantity>0
      RETURNING ib.id
    ),
    logged AS (
      INSERT INTO audit_logs (organization_id,actor_user_id,action,entity_type,entity_id,after_data)
      SELECT organization_id,approved_by,'APPROVE_AND_RESERVE','sales_order',id::text,
        jsonb_build_object('order_number',order_number,'reservation_count',(SELECT count(*) FROM allocations))
      FROM approved RETURNING id
    )
    SELECT order_number FROM approved
  `;
  if(rows.length===0) redirect("/workspace/sales-orders?error=stock");
  redirect("/workspace/sales-orders?approved=1");
}
