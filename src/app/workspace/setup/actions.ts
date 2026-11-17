"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";

const siteTypes = new Set(["office", "factory", "warehouse", "distribution", "source"]);
const warehouseTypes = new Set(["raw_material", "packaging", "work_in_progress", "finished_goods", "quarantine", "returns"]);
const dimensions = new Set(["count", "volume", "mass", "length", "area", "time", "other"]);
const codePattern = /^[A-Z0-9][A-Z0-9_-]{1,19}$/;

async function getActor() {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");
  const { sql } = await import("@/lib/db");
  const rows = await sql`
    SELECT p.id AS actor_id, p.organization_id
    FROM user_profiles p
    JOIN user_role_assignments a ON a.user_id = p.id
    JOIN roles r ON r.id = a.role_id
    WHERE p.auth_subject = ${session.user.id}
      AND p.status = 'active'
      AND r.code IN ('OWNER', 'ADMIN')
    ORDER BY r.code
    LIMIT 1
  `;
  const actor = rows[0] as { actor_id: string; organization_id: string } | undefined;
  if (!actor) redirect("/workspace?access=denied");
  return { actor, sql };
}

export async function createSite(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const siteType = String(formData.get("site_type") ?? "");
  const address = String(formData.get("address") ?? "").trim();
  if (!codePattern.test(code) || name.length < 2 || name.length > 120 || address.length > 500 || !siteTypes.has(siteType)) {
    redirect("/workspace/setup?error=site_invalid");
  }
  const { actor, sql } = await getActor();
  try {
    await sql`
      WITH created AS (
        INSERT INTO sites (organization_id, code, name, site_type, address)
        VALUES (
          ${actor.organization_id}::uuid, ${code}, ${name}, ${siteType},
          CASE WHEN ${address} = '' THEN '{}'::jsonb ELSE jsonb_build_object('label', ${address}) END
        )
        RETURNING id, organization_id, code, name, site_type
      ),
      logged AS (
        INSERT INTO audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
        SELECT organization_id, ${actor.actor_id}::uuid, 'CREATE', 'site', id::text,
          jsonb_build_object('code', code, 'name', name, 'site_type', site_type)
        FROM created RETURNING id
      )
      SELECT id FROM created
    `;
  } catch {
    redirect("/workspace/setup?error=site_duplicate");
  }
  redirect("/workspace/setup?created=site");
}

export async function createWarehouse(formData: FormData) {
  const siteId = String(formData.get("site_id") ?? "");
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const warehouseType = String(formData.get("warehouse_type") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(siteId) || !codePattern.test(code) || name.length < 2 || name.length > 120 || !warehouseTypes.has(warehouseType)) {
    redirect("/workspace/setup?error=warehouse_invalid");
  }
  const { actor, sql } = await getActor();
  try {
    const rows = await sql`
      WITH valid_site AS (
        SELECT id FROM sites
        WHERE id = ${siteId}::uuid
          AND organization_id = ${actor.organization_id}::uuid
          AND is_active = true
      ),
      created AS (
        INSERT INTO warehouses (organization_id, site_id, code, name, warehouse_type)
        SELECT ${actor.organization_id}::uuid, valid_site.id, ${code}, ${name}, ${warehouseType}
        FROM valid_site
        RETURNING id, organization_id, code, name, warehouse_type
      ),
      logged AS (
        INSERT INTO audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
        SELECT organization_id, ${actor.actor_id}::uuid, 'CREATE', 'warehouse', id::text,
          jsonb_build_object('code', code, 'name', name, 'warehouse_type', warehouse_type)
        FROM created RETURNING id
      )
      SELECT id FROM created
    `;
    if (rows.length === 0) redirect("/workspace/setup?error=warehouse_site");
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) throw error;
    redirect("/workspace/setup?error=warehouse_duplicate");
  }
  redirect("/workspace/setup?created=warehouse");
}

export async function createUnit(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const dimension = String(formData.get("dimension") ?? "");
  if (!codePattern.test(code) || name.length < 2 || name.length > 80 || !dimensions.has(dimension)) {
    redirect("/workspace/setup?error=unit_invalid");
  }
  const { actor, sql } = await getActor();
  try {
    await sql`
      WITH created AS (
        INSERT INTO units_of_measure (organization_id, code, name, dimension)
        VALUES (${actor.organization_id}::uuid, ${code}, ${name}, ${dimension})
        RETURNING id, organization_id, code, name, dimension
      ),
      logged AS (
        INSERT INTO audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
        SELECT organization_id, ${actor.actor_id}::uuid, 'CREATE', 'unit_of_measure', id::text,
          jsonb_build_object('code', code, 'name', name, 'dimension', dimension)
        FROM created RETURNING id
      )
      SELECT id FROM created
    `;
  } catch {
    redirect("/workspace/setup?error=unit_duplicate");
  }
  redirect("/workspace/setup?created=unit");
}
