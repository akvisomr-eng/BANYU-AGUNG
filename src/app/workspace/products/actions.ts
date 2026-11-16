"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { sql } from "@/lib/db";

const allowedTypes = new Set(["finished_good", "raw_material", "packaging", "spare_part", "service"]);

export async function createProduct(formData: FormData) {
  const sku = String(formData.get("sku") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const productType = String(formData.get("product_type") ?? "");
  const isSellable = formData.get("is_sellable") === "on";
  const isPurchasable = formData.get("is_purchasable") === "on";

  if (!/^[A-Z0-9][A-Z0-9._/-]{1,39}$/.test(sku) || name.length < 2 || name.length > 160 || description.length > 1000 || !allowedTypes.has(productType)) {
    redirect("/workspace/products?error=invalid");
  }

  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");

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
    await sql`
      WITH created AS (
        INSERT INTO products (
          organization_id, sku, name, description, product_type,
          is_sellable, is_purchasable, is_active
        )
        VALUES (
          ${actor.organization_id}::uuid, ${sku}, ${name},
          ${description || null}, ${productType},
          ${isSellable}, ${isPurchasable}, true
        )
        RETURNING id, organization_id, sku, name, product_type
      ),
      logged AS (
        INSERT INTO audit_logs (
          organization_id, actor_user_id, action, entity_type, entity_id, after_data
        )
        SELECT
          created.organization_id, ${actor.actor_id}::uuid, 'CREATE',
          'product', created.id::text,
          jsonb_build_object(
            'sku', created.sku,
            'name', created.name,
            'product_type', created.product_type
          )
        FROM created
        RETURNING id
      )
      SELECT created.id FROM created
    `;
  } catch {
    redirect("/workspace/products?error=save");
  }

  redirect("/workspace/products?created=1");
}
