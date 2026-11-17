"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";

export async function postGoodsReceipt(formData: FormData) {
  const purchaseOrderId = String(formData.get("purchase_order_id") ?? "");
  const warehouseId = String(formData.get("warehouse_id") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const ids = formData.getAll("purchase_order_item_id").map(String);
  const quantities = formData.getAll("quantity_received").map(String);
  const lotCodes = formData.getAll("lot_code").map(String);
  const manufactured = formData.getAll("manufactured_at").map(String);
  const expires = formData.getAll("expires_at").map(String);
  const lines = ids.map((id,i)=>({
    id, quantity:Number(quantities[i]), quantityRaw:quantities[i] ?? "",
    lotCode:(lotCodes[i] ?? "").trim().toUpperCase(),
    manufacturedAt:manufactured[i] || null, expiresAt:expires[i] || null
  })).filter(x=>x.quantityRaw.trim() !== "" && Number(x.quantityRaw) !== 0);

  if (!/^[0-9a-f-]{36}$/i.test(purchaseOrderId) || !/^[0-9a-f-]{36}$/i.test(warehouseId) ||
      notes.length>1000 || lines.length<1 || lines.length>100 ||
      new Set(lines.map(x=>x.id)).size!==lines.length ||
      new Set(lines.map(x=>x.id+":"+x.lotCode)).size!==lines.length ||
      lines.some(x=>!/^[0-9a-f-]{36}$/i.test(x.id) || !Number.isFinite(x.quantity) || x.quantity<=0 ||
        !/^[A-Z0-9][A-Z0-9._/-]{1,39}$/.test(x.lotCode) ||
        (x.manufacturedAt && !/^\d{4}-\d{2}-\d{2}$/.test(x.manufacturedAt)) ||
        (x.expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(x.expiresAt)) ||
        (x.manufacturedAt && x.expiresAt && x.manufacturedAt>x.expiresAt))) {
    redirect("/workspace/goods-receipts?error=invalid");
  }

  const {data:session}=await auth.getSession();
  if(!session?.user) redirect("/auth/sign-in");
  const {sql}=await import("@/lib/db");
  const actors=await sql`
    SELECT p.id AS actor_id,p.organization_id
    FROM user_profiles p JOIN user_role_assignments a ON a.user_id=p.id
    JOIN roles r ON r.id=a.role_id
    WHERE p.auth_subject=${session.user.id} AND p.status='active' AND r.code IN ('OWNER','ADMIN')
    ORDER BY r.code LIMIT 1
  `;
  const actor=actors[0] as {actor_id:string;organization_id:string}|undefined;
  if(!actor) redirect("/workspace?access=denied");

  try {
    const result=await sql`
      WITH context AS (
        SELECT po.id AS po_id,po.organization_id,po.po_number,po.supplier_id,po.site_id,
          w.id AS warehouse_id,w.warehouse_type,${actor.actor_id}::uuid AS actor_id
        FROM purchase_orders po
        JOIN warehouses w ON w.organization_id=po.organization_id AND w.site_id=po.site_id
        WHERE po.id=${purchaseOrderId}::uuid
          AND po.organization_id=${actor.organization_id}::uuid
          AND po.status IN ('approved','partially_received')
          AND w.id=${warehouseId}::uuid AND w.is_active=true
      ),
      requested AS (
        SELECT * FROM jsonb_to_recordset(${JSON.stringify(lines.map(x=>({
          purchase_order_item_id:x.id,quantity_received:x.quantity,lot_code:x.lotCode,
          manufactured_at:x.manufacturedAt,expires_at:x.expiresAt
        })))}::jsonb)
        AS x(purchase_order_item_id uuid,quantity_received numeric,lot_code text,manufactured_at date,expires_at date)
      ),
      base_lines AS (
        SELECT r.purchase_order_item_id,poi.product_id,r.quantity_received,poi.unit_price AS unit_cost,
          r.lot_code,r.manufactured_at,r.expires_at,p.product_type,p.shelf_life_days
        FROM requested r
        JOIN purchase_order_items poi ON poi.id=r.purchase_order_item_id
        JOIN context c ON c.po_id=poi.purchase_order_id
        JOIN products p ON p.id=poi.product_id
        WHERE r.quantity_received>0
          AND poi.quantity_received+r.quantity_received<=poi.quantity_ordered
          AND p.organization_id=c.organization_id AND p.is_active=true AND p.product_type<>'service'
          AND (r.expires_at IS NULL OR r.expires_at>=current_date)
          AND (r.manufactured_at IS NULL OR r.manufactured_at<=current_date)
          AND (p.shelf_life_days IS NULL OR r.expires_at IS NOT NULL)
          AND (
            c.warehouse_type='quarantine'
            OR (p.product_type='raw_material' AND c.warehouse_type='raw_material')
            OR (p.product_type='packaging' AND c.warehouse_type='packaging')
            OR (p.product_type='finished_good' AND c.warehouse_type='finished_goods')
            OR (p.product_type='spare_part' AND c.warehouse_type='raw_material')
          )
      ),
      valid_lines AS (
        SELECT b.*
        FROM base_lines b CROSS JOIN context c
        WHERE NOT EXISTS (
          SELECT 1 FROM inventory_lots l
          WHERE l.organization_id=c.organization_id AND l.product_id=b.product_id AND l.lot_code=b.lot_code
            AND (
              l.quality_status IN ('quarantined','rejected','expired')
              OR (l.manufactured_at IS NOT NULL AND b.manufactured_at IS NOT NULL AND l.manufactured_at<>b.manufactured_at)
              OR (l.expires_at IS NOT NULL AND b.expires_at IS NOT NULL AND l.expires_at<>b.expires_at)
            )
        )
      ),
      line_count AS (SELECT count(*) AS total FROM valid_lines),
      created_receipt AS (
        INSERT INTO goods_receipts (
          organization_id,receipt_number,purchase_order_id,warehouse_id,received_by,notes,status
        )
        SELECT c.organization_id,
          'GR-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),
          c.po_id,c.warehouse_id,c.actor_id,${notes||null},'posted'
        FROM context c CROSS JOIN line_count lc
        WHERE lc.total=${lines.length}
        RETURNING id,organization_id,receipt_number,purchase_order_id,warehouse_id,received_by
      ),
      resolved_lots AS (
        INSERT INTO inventory_lots (
          organization_id,product_id,lot_code,supplier_id,received_at,manufactured_at,expires_at,quality_status,source_document
        )
        SELECT c.organization_id,vl.product_id,vl.lot_code,c.supplier_id,now(),
          vl.manufactured_at,vl.expires_at,'pending',c.po_number
        FROM valid_lines vl CROSS JOIN context c CROSS JOIN created_receipt gr
        ON CONFLICT (organization_id,lot_code,product_id)
        DO UPDATE SET
          received_at=COALESCE(inventory_lots.received_at,EXCLUDED.received_at),
          manufactured_at=COALESCE(inventory_lots.manufactured_at,EXCLUDED.manufactured_at),
          expires_at=COALESCE(inventory_lots.expires_at,EXCLUDED.expires_at)
        WHERE inventory_lots.quality_status NOT IN ('quarantined','rejected','expired')
          AND (inventory_lots.manufactured_at IS NULL OR EXCLUDED.manufactured_at IS NULL OR inventory_lots.manufactured_at=EXCLUDED.manufactured_at)
          AND (inventory_lots.expires_at IS NULL OR EXCLUDED.expires_at IS NULL OR inventory_lots.expires_at=EXCLUDED.expires_at)
        RETURNING id,product_id,lot_code
      ),
      receipt_items AS (
        INSERT INTO goods_receipt_items (
          goods_receipt_id,purchase_order_item_id,product_id,lot_id,quantity_received,unit_cost,line_total
        )
        SELECT gr.id,vl.purchase_order_item_id,vl.product_id,rl.id,vl.quantity_received,vl.unit_cost,
          vl.quantity_received*vl.unit_cost
        FROM created_receipt gr CROSS JOIN valid_lines vl
        JOIN resolved_lots rl ON rl.product_id=vl.product_id AND rl.lot_code=vl.lot_code
        RETURNING id,goods_receipt_id,purchase_order_item_id,product_id,lot_id,quantity_received,unit_cost
      ),
      updated_po_items AS (
        UPDATE purchase_order_items poi
        SET quantity_received=poi.quantity_received+x.received_qty
        FROM (
          SELECT purchase_order_item_id,sum(quantity_received) AS received_qty
          FROM receipt_items GROUP BY purchase_order_item_id
        ) x
        WHERE poi.id=x.purchase_order_item_id
        RETURNING poi.purchase_order_id
      ),
      movements AS (
        INSERT INTO stock_movements (
          organization_id,movement_no,movement_type,warehouse_id,product_id,lot_id,
          quantity,unit_cost,reference_type,reference_id,occurred_at,posted_by
        )
        SELECT c.organization_id,
          'GR-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
          'receipt',c.warehouse_id,ri.product_id,ri.lot_id,ri.quantity_received,ri.unit_cost,
          'goods_receipt',ri.goods_receipt_id,now(),c.actor_id
        FROM receipt_items ri CROSS JOIN context c
        RETURNING id
      ),
      balances AS (
        INSERT INTO inventory_balances (
          organization_id,warehouse_id,product_id,lot_id,quantity_on_hand,quantity_reserved
        )
        SELECT c.organization_id,c.warehouse_id,ri.product_id,ri.lot_id,ri.quantity_received,0
        FROM receipt_items ri CROSS JOIN context c
        ON CONFLICT (warehouse_id,product_id,lot_id)
        DO UPDATE SET quantity_on_hand=inventory_balances.quantity_on_hand+EXCLUDED.quantity_on_hand,updated_at=now()
        RETURNING id
      ),
      po_status AS (
        UPDATE purchase_orders po
        SET status=CASE WHEN NOT EXISTS (
          SELECT 1 FROM purchase_order_items poi
          WHERE poi.purchase_order_id=po.id AND poi.quantity_received<poi.quantity_ordered
        ) THEN 'received' ELSE 'partially_received' END
        FROM context c
        WHERE po.id=c.po_id AND EXISTS (SELECT 1 FROM updated_po_items)
        RETURNING po.id,po.status
      ),
      logged AS (
        INSERT INTO audit_logs (organization_id,actor_user_id,action,entity_type,entity_id,after_data)
        SELECT gr.organization_id,gr.received_by,'POST_GOODS_RECEIPT','goods_receipt',gr.id::text,
          jsonb_build_object('receipt_number',gr.receipt_number,'purchase_order_id',gr.purchase_order_id)
        FROM created_receipt gr RETURNING id
      )
      SELECT receipt_number FROM created_receipt
    `;
    if(result.length===0) redirect("/workspace/goods-receipts?error=lines");
  } catch(error) {
    if(error instanceof Error && error.message.includes("NEXT_REDIRECT")) throw error;
    redirect("/workspace/goods-receipts?error=save");
  }
  redirect("/workspace/goods-receipts?created=1");
}
