"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";

async function getActor(roles: string[]) {
  const {data:session}=await auth.getSession();
  if(!session?.user) redirect("/auth/sign-in");
  const {sql}=await import("@/lib/db");
  const actor=await sql`
    SELECT p.id AS actor_id,p.organization_id,r.code AS role_code
    FROM user_profiles p JOIN user_role_assignments a ON a.user_id=p.id JOIN roles r ON r.id=a.role_id
    WHERE p.auth_subject=${session.user.id} AND p.status='active' AND r.code=ANY(${roles}::text[])
    ORDER BY r.code LIMIT 1
  `;
  const row=actor[0] as {actor_id:string;organization_id:string;role_code:string}|undefined;
  if(!row) redirect("/workspace?access=denied");
  return {row,sql};
}

export async function createDelivery(formData:FormData) {
  const salesOrderId=String(formData.get("sales_order_id")??"");
  const plannedDate=String(formData.get("planned_date")??"").trim();
  const vehicle=String(formData.get("vehicle_plate")??"").trim().toUpperCase();
  const driver=String(formData.get("driver_name")??"").trim();
  const notes=String(formData.get("notes")??"").trim();
  if(!/^[0-9a-f-]{36}$/i.test(salesOrderId) || (plannedDate&&!/^\d{4}-\d{2}-\d{2}$/.test(plannedDate)) ||
    vehicle.length>24 || driver.length>120 || notes.length>1000) redirect("/workspace/deliveries?error=invalid");
  const {row,sql}=await getActor(["OWNER","ADMIN"]);
  const result=await sql`
    WITH order_context AS (
      SELECT so.id,so.organization_id,so.order_number,${row.actor_id}::uuid AS actor_id
      FROM sales_orders so
      WHERE so.id=${salesOrderId}::uuid AND so.organization_id=${row.organization_id}::uuid
        AND so.status='approved'
        AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.sales_order_id=so.id AND d.status NOT IN ('failed','returned'))
    ),
    allocation_totals AS (
      SELECT sales_order_item_id,sum(quantity_reserved) AS reserved_qty
      FROM sales_order_allocations
      WHERE sales_order_id=${salesOrderId}::uuid AND status='reserved'
      GROUP BY sales_order_item_id
    ),
    ready AS (
      SELECT count(*) AS item_count,
        NOT EXISTS (
          SELECT 1 FROM sales_order_items soi
          LEFT JOIN allocation_totals a ON a.sales_order_item_id=soi.id
          WHERE soi.sales_order_id=${salesOrderId}::uuid AND COALESCE(a.reserved_qty,0)<soi.quantity
        ) AS all_reserved
      FROM sales_order_items soi WHERE soi.sales_order_id=${salesOrderId}::uuid
    ),
    created AS (
      INSERT INTO deliveries (
        organization_id,delivery_number,sales_order_id,planned_date,vehicle_plate,driver_name,notes,status
      )
      SELECT oc.organization_id,
        'DO-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),
        oc.id,${plannedDate||null}::date,${vehicle||null},${driver||null},${notes||null},'planned'
      FROM order_context oc CROSS JOIN ready
      WHERE ready.item_count>0 AND ready.all_reserved
      RETURNING id,organization_id,delivery_number,sales_order_id
    ),
    items AS (
      INSERT INTO delivery_items (delivery_id,sales_order_item_id,allocation_id,product_id,lot_id,quantity)
      SELECT d.id,a.sales_order_item_id,a.id,a.product_id,a.lot_id,a.quantity_reserved
      FROM created d JOIN sales_order_allocations a ON a.sales_order_id=d.sales_order_id AND a.status='reserved'
      RETURNING id
    ),
    logged AS (
      INSERT INTO audit_logs (organization_id,actor_user_id,action,entity_type,entity_id,after_data)
      SELECT d.organization_id,${row.actor_id}::uuid,'CREATE_DELIVERY','delivery',d.id::text,
        jsonb_build_object('delivery_number',d.delivery_number,'sales_order_id',d.sales_order_id)
      FROM created d RETURNING id
    )
    SELECT delivery_number FROM created
  `;
  if(result.length===0) redirect("/workspace/deliveries?error=allocation");
  redirect("/workspace/deliveries?created=1");
}

export async function dispatchDelivery(formData:FormData) {
  const deliveryId=String(formData.get("delivery_id")??"");
  const vehicle=String(formData.get("vehicle_plate")??"").trim().toUpperCase();
  const driver=String(formData.get("driver_name")??"").trim();
  if(!/^[0-9a-f-]{36}$/i.test(deliveryId) || vehicle.length<3 || vehicle.length>24 || driver.length<2 || driver.length>120) {
    redirect("/workspace/deliveries?error=dispatch_invalid");
  }
  const {row,sql}=await getActor(["OWNER","ADMIN"]);
  const result=await sql`
    WITH context AS (
      SELECT d.id AS delivery_id,d.organization_id,d.sales_order_id,${row.actor_id}::uuid AS actor_id
      FROM deliveries d
      JOIN sales_orders so ON so.id=d.sales_order_id
      WHERE d.id=${deliveryId}::uuid AND d.organization_id=${row.organization_id}::uuid
        AND d.status='planned' AND so.status='approved'
    ),
    locked AS (
      SELECT di.id AS delivery_item_id,di.quantity,di.allocation_id,a.inventory_balance_id,
        ib.quantity_on_hand,ib.quantity_reserved
      FROM delivery_items di
      JOIN sales_order_allocations a ON a.id=di.allocation_id AND a.status='reserved'
      JOIN inventory_balances ib ON ib.id=a.inventory_balance_id
      JOIN context c ON c.delivery_id=di.delivery_id
      FOR UPDATE OF ib
    ),
    ready AS (
      SELECT count(*) AS item_count,
        NOT EXISTS (
          SELECT 1 FROM delivery_items di
          LEFT JOIN locked l ON l.delivery_item_id=di.id
          JOIN context c ON c.delivery_id=di.delivery_id
          WHERE l.delivery_item_id IS NULL OR l.quantity_on_hand<di.quantity OR l.quantity_reserved<di.quantity
        ) AS enough
      FROM delivery_items di JOIN context c ON c.delivery_id=di.delivery_id
    ),
    deducted AS (
      UPDATE inventory_balances ib
      SET quantity_on_hand=ib.quantity_on_hand-l.quantity,
          quantity_reserved=ib.quantity_reserved-l.quantity,
          updated_at=now()
      FROM locked l CROSS JOIN ready
      WHERE ib.id=l.inventory_balance_id AND ready.item_count>0 AND ready.enough
      RETURNING ib.id
    ),
    allocation_updates AS (
      UPDATE sales_order_allocations a SET status='dispatched'
      FROM locked l CROSS JOIN (SELECT count(*) AS n FROM deducted) d
      WHERE a.id=l.allocation_id AND d.n>0
      RETURNING a.id
    ),
    movement AS (
      INSERT INTO stock_movements (
        organization_id,movement_no,movement_type,warehouse_id,product_id,lot_id,quantity,
        unit_cost,reference_type,reference_id,occurred_at,posted_by
      )
      SELECT c.organization_id,
        'DSP-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
        'sales_pick',a.warehouse_id,di.product_id,di.lot_id,di.quantity,cost.unit_cost,
        'delivery',di.delivery_id,now(),c.actor_id
      FROM delivery_items di
      JOIN sales_order_allocations a ON a.id=di.allocation_id
      JOIN context c ON c.delivery_id=di.delivery_id
      CROSS JOIN (SELECT count(*) AS n FROM deducted) d
      LEFT JOIN LATERAL (
        SELECT sm.unit_cost FROM stock_movements sm
        WHERE sm.lot_id=di.lot_id AND sm.movement_type='receipt'
        ORDER BY sm.occurred_at DESC LIMIT 1
      ) cost ON true
      WHERE d.n>0
      RETURNING id
    ),
    updated_delivery AS (
      UPDATE deliveries d
      SET status='dispatched',dispatched_at=now(),vehicle_plate=${vehicle},driver_name=${driver}
      FROM context c CROSS JOIN ready
      WHERE d.id=c.delivery_id AND ready.item_count>0 AND ready.enough
        AND EXISTS (SELECT 1 FROM deducted)
      RETURNING d.id,d.sales_order_id,d.delivery_number
    ),
    updated_order AS (
      UPDATE sales_orders so SET status='dispatched'
      FROM updated_delivery d WHERE so.id=d.sales_order_id RETURNING so.id
    ),
    logged AS (
      INSERT INTO audit_logs (organization_id,actor_user_id,action,entity_type,entity_id,after_data)
      SELECT c.organization_id,c.actor_id,'DISPATCH','delivery',d.id::text,
        jsonb_build_object('delivery_number',d.delivery_number,'vehicle_plate',${vehicle},'driver_name',${driver})
      FROM updated_delivery d JOIN context c ON c.delivery_id=d.id RETURNING id
    )
    SELECT delivery_number FROM updated_delivery
  `;
  if(result.length===0) redirect("/workspace/deliveries?error=dispatch_stock");
  redirect("/workspace/deliveries?dispatched=1");
}

export async function confirmDelivery(formData:FormData) {
  const deliveryId=String(formData.get("delivery_id")??"");
  const proof=String(formData.get("proof_of_delivery_url")??"").trim();
  if(!/^[0-9a-f-]{36}$/i.test(deliveryId) || proof.length>1000 || (proof && !/^https:\/\//i.test(proof))) {
    redirect("/workspace/deliveries?error=proof");
  }
  const {row,sql}=await getActor(["OWNER","ADMIN"]);
  const result=await sql`
    WITH updated AS (
      UPDATE deliveries d
      SET status='delivered',delivered_at=now(),proof_of_delivery_url=${proof||null}
      WHERE d.id=${deliveryId}::uuid AND d.organization_id=${row.organization_id}::uuid AND d.status='dispatched'
      RETURNING d.id,d.organization_id,d.sales_order_id,d.delivery_number
    ),
    order_updated AS (
      UPDATE sales_orders so SET status='delivered'
      FROM updated d WHERE so.id=d.sales_order_id RETURNING so.id
    ),
    logged AS (
      INSERT INTO audit_logs (organization_id,actor_user_id,action,entity_type,entity_id,after_data)
      SELECT organization_id,${row.actor_id}::uuid,'CONFIRM_DELIVERY','delivery',id::text,
        jsonb_build_object('delivery_number',delivery_number,'proof_of_delivery_url',${proof||null})
      FROM updated RETURNING id
    )
    SELECT delivery_number FROM updated
  `;
  if(result.length===0) redirect("/workspace/deliveries?error=confirm");
  redirect("/workspace/deliveries?delivered=1");
}
