"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";

export async function postInventoryOpeningBalance(formData: FormData) {
  const lotId = String(formData.get("lot_id") ?? "");
  const totalValueRaw = String(formData.get("total_value") ?? "").trim();
  const totalValue = Number(totalValueRaw);
  if (!/^[0-9a-f-]{36}$/i.test(lotId) ||
      !/^\d{1,15}(\.\d{1,2})?$/.test(totalValueRaw) ||
      !Number.isFinite(totalValue) || totalValue <= 0) {
    redirect("/workspace/inventory/opening-balances?error=invalid");
  }

  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");
  const { sql } = await import("@/lib/db");
  const actors = await sql`
    SELECT p.id AS actor_id,p.organization_id
    FROM user_profiles p
    JOIN user_role_assignments a ON a.user_id=p.id
    JOIN roles r ON r.id=a.role_id
    WHERE p.auth_subject=${session.user.id} AND p.status='active' AND r.code='OWNER'
    ORDER BY r.code LIMIT 1
  `;
  const actor = actors[0] as { actor_id: string; organization_id: string } | undefined;
  if (!actor) redirect("/workspace?access=denied");

  const result = await sql`
    WITH lot AS (
      SELECT c.organization_id,c.product_id,c.lot_id,c.quantity_on_hand,
        sum(ib.quantity_on_hand) AS actual_quantity
      FROM inventory_lot_costs c
      JOIN inventory_balances ib ON ib.organization_id=c.organization_id
        AND ib.product_id=c.product_id AND ib.lot_id=c.lot_id
      WHERE c.organization_id=${actor.organization_id}::uuid
        AND c.lot_id=${lotId}::uuid AND c.opening_balance_pending=true
      GROUP BY c.organization_id,c.product_id,c.lot_id,c.quantity_on_hand
      HAVING c.quantity_on_hand=sum(ib.quantity_on_hand)
    ), inserted AS (
      INSERT INTO inventory_opening_balances (
        organization_id,product_id,lot_id,quantity,total_value,posted_by
      )
      SELECT organization_id,product_id,lot_id,quantity_on_hand,${totalValue},${actor.actor_id}::uuid
      FROM lot
      RETURNING id,journal_entry_id
    )
    SELECT id FROM inserted WHERE journal_entry_id IS NOT NULL
  `;
  if (!result.length) redirect("/workspace/inventory/opening-balances?error=stale");
  redirect("/workspace/inventory/opening-balances?posted=1");
}
