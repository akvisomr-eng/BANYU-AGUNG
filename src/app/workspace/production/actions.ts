"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";

export async function createProductionBatch(formData: FormData) {
  const bomId = String(formData.get("bom_id") ?? "");
  const lineId = String(formData.get("production_line_id") ?? "");
  const quantityRaw = String(formData.get("planned_quantity") ?? "").trim();
  const plannedStartRaw = String(formData.get("planned_start") ?? "").trim();
  const quantity = Number(quantityRaw);

  if (!/^[0-9a-f-]{36}$/i.test(bomId) ||
      !/^[0-9a-f-]{36}$/i.test(lineId) ||
      !/^\d{1,12}(\.\d{1,4})?$/.test(quantityRaw) ||
      !Number.isFinite(quantity) || quantity <= 0 || quantity > 1000000000 ||
      (plannedStartRaw && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(plannedStartRaw))) {
    redirect("/workspace/production/planning?error=invalid");
  }

  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");
  const { sql } = await import("@/lib/db");
  const actors = await sql`
    SELECT p.id AS actor_id, p.organization_id
    FROM user_profiles p
    JOIN user_role_assignments a ON a.user_id = p.id
    JOIN roles r ON r.id = a.role_id
    WHERE p.auth_subject = ${session.user.id}
      AND p.status = 'active'
      AND r.code IN ('OWNER', 'ADMIN')
    ORDER BY CASE r.code WHEN 'OWNER' THEN 0 ELSE 1 END
    LIMIT 1
  `;
  const actor = actors[0] as { actor_id: string; organization_id: string } | undefined;
  if (!actor) redirect("/workspace?access=denied");

  try {
    const inserted = await sql`
      WITH valid_plan AS (
        SELECT pb.id AS bom_id, pb.product_id, pl.id AS line_id
        FROM product_boms pb
        JOIN products p ON p.id = pb.product_id
        JOIN production_lines pl ON pl.id = ${lineId}::uuid
          AND pl.organization_id = pb.organization_id
          AND pl.is_active = true
        WHERE pb.id = ${bomId}::uuid
          AND pb.organization_id = ${actor.organization_id}::uuid
          AND pb.status = 'approved'
          AND p.organization_id = pb.organization_id
          AND p.product_type = 'finished_good'
          AND p.is_active = true
          AND (pb.effective_from IS NULL OR pb.effective_from <= current_date)
          AND (pb.effective_to IS NULL OR pb.effective_to >= current_date)
      ),
      created AS (
        INSERT INTO production_batches (
          organization_id, batch_number, product_id, bom_id, production_line_id,
          planned_quantity, planned_start, supervisor_id, status, quality_status
        )
        SELECT
          ${actor.organization_id}::uuid,
          'BA-' || to_char(current_date, 'YYYYMMDD') || '-' ||
            upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
          valid_plan.product_id, valid_plan.bom_id, valid_plan.line_id,
          ${quantity}, ${plannedStartRaw || null}::timestamptz,
          ${actor.actor_id}::uuid, 'planned', 'pending'
        FROM valid_plan
        RETURNING id, organization_id, batch_number, product_id, bom_id,
          production_line_id, planned_quantity, planned_start
      ),
      logged AS (
        INSERT INTO audit_logs (
          organization_id, actor_user_id, action, entity_type, entity_id, after_data
        )
        SELECT created.organization_id, ${actor.actor_id}::uuid,
          'CREATE_PRODUCTION_PLAN', 'production_batch', created.id::text,
          jsonb_build_object(
            'batch_number', created.batch_number,
            'product_id', created.product_id,
            'bom_id', created.bom_id,
            'production_line_id', created.production_line_id,
            'planned_quantity', created.planned_quantity,
            'planned_start', created.planned_start
          )
        FROM created
        RETURNING id
      )
      SELECT batch_number FROM created
    `;
    if (inserted.length === 0) redirect("/workspace/production/planning?error=reference");
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) throw error;
    redirect("/workspace/production/planning?error=save");
  }

  redirect("/workspace/production/planning?planned=1");
}
