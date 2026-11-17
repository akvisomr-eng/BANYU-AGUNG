"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";

export async function createSupplier(formData: FormData) {
  const code = String(formData.get("supplier_code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("supplier_type") ?? "");
  const contact = String(formData.get("contact_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const terms = String(formData.get("payment_terms_days") ?? "0").trim();
  const termsDays = Number(terms);
  const allowed = ["general", "raw_material", "packaging", "service", "logistics"];

  if (!/^[A-Z0-9][A-Z0-9_-]{1,19}$/.test(code) || name.length < 2 || name.length > 160 ||
      !allowed.includes(type) || contact.length > 120 || phone.length > 24 ||
      (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
      address.length > 500 || !Number.isInteger(termsDays) || termsDays < 0 || termsDays > 365) {
    redirect("/workspace/suppliers?error=invalid");
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
      AND p.status = 'active' AND r.code IN ('OWNER','ADMIN')
    ORDER BY r.code LIMIT 1
  `;
  const actor = actors[0] as { actor_id: string; organization_id: string } | undefined;
  if (!actor) redirect("/workspace?access=denied");

  try {
    const rows = await sql`
      WITH inserted AS (
        INSERT INTO suppliers (
          organization_id, supplier_code, name, supplier_type, contact_name,
          phone, email, address, payment_terms_days, status
        )
        VALUES (
          ${actor.organization_id}::uuid, ${code}, ${name}, ${type},
          ${contact || null}, ${phone || null}, ${email || null},
          CASE WHEN ${address} = '' THEN '{}'::jsonb ELSE jsonb_build_object('label', ${address}) END,
          ${termsDays}, 'active'
        )
        RETURNING id, organization_id, supplier_code, name, supplier_type
      ),
      logged AS (
        INSERT INTO audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
        SELECT organization_id, ${actor.actor_id}::uuid, 'CREATE', 'supplier', id::text,
          jsonb_build_object('supplier_code', supplier_code, 'name', name, 'supplier_type', supplier_type)
        FROM inserted RETURNING id
      )
      SELECT id FROM inserted
    `;
    if (rows.length === 0) redirect("/workspace/suppliers?error=save");
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) throw error;
    redirect("/workspace/suppliers?error=duplicate");
  }
  redirect("/workspace/suppliers?created=1");
}
