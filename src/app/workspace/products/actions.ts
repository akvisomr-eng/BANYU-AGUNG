"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";

const allowedTypes = new Set(["finished_good", "raw_material", "packaging", "spare_part", "service"]);

export async function createProduct(formData: FormData) {
  const sku = String(formData.get("sku") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const productType = String(formData.get("product_type") ?? "");
  const baseUnitId = String(formData.get("base_unit_id") ?? "");
  const netContentRaw = String(formData.get("net_content_ml") ?? "").trim();
  const shelfLifeRaw = String(formData.get("shelf_life_days") ?? "").trim();
  const netContent = netContentRaw ? Number(netContentRaw) : null;
  const shelfLife = shelfLifeRaw ? Number(shelfLifeRaw) : null;
  const isSellable = formData.get("is_sellable") === "on";
  const isPurchasable = formData.get("is_purchasable") === "on";
  const isReturnablePackaging = formData.get("is_returnable_packaging") === "on";

  if (!/^[A-Z0-9][A-Z0-9._/-]{1,39}$/.test(sku) || name.length < 2 || name.length > 160 ||
      description.length > 1000 || !allowedTypes.has(productType) ||
      !/^[0-9a-f-]{36}$/i.test(baseUnitId) ||
      (netContent !== null && (!Number.isInteger(netContent) || netContent <= 0 || netContent > 1000000)) ||
      (shelfLife !== null && (!Number.isInteger(shelfLife) || shelfLife <= 0 || shelfLife > 3650))) {
    redirect("/workspace/products?error=invalid");
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
    ORDER BY r.code
    LIMIT 1
  `;
  const actor = actors[0] as { actor_id: string; organization_id: string } | undefined;
  if (!actor) redirect("/workspace?access=denied");

  try {
    const created = await sql`
      WITH valid_unit AS (
        SELECT id FROM units_of_measure
        WHERE id = ${baseUnitId}::uuid
          AND organization_id = ${actor.organization_id}::uuid
      ),
      created AS (
        INSERT INTO products (
          organization_id, sku, name, description, product_type, base_unit_id,
          net_content_ml, shelf_life_days, is_returnable_packaging,
          is_sellable, is_purchasable, is_active
        )
        SELECT
          ${actor.organization_id}::uuid, ${sku}, ${name},
          ${description || null}, ${productType}, valid_unit.id,
          ${netContent}, ${shelfLife}, ${isReturnablePackaging},
          ${isSellable}, ${isPurchasable}, true
        FROM valid_unit
        RETURNING id, organization_id, sku, name, product_type, base_unit_id
      ),
      logged AS (
        INSERT INTO audit_logs (
          organization_id, actor_user_id, action, entity_type, entity_id, after_data
        )
        SELECT
          created.organization_id, ${actor.actor_id}::uuid, 'CREATE',
          'product', created.id::text,
          jsonb_build_object(
            'sku', created.sku, 'name', created.name,
            'product_type', created.product_type, 'base_unit_id', created.base_unit_id
          )
        FROM created
        RETURNING id
      )
      SELECT id FROM created
    `;
    if (created.length === 0) redirect("/workspace/products?error=unit");
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) throw error;
    redirect("/workspace/products?error=save");
  }

  redirect("/workspace/products?created=1");
}
