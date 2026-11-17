"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/server";

const customerSchema = z.object({
  customer_type: z.enum(["retail", "wholesale", "reseller", "distributor", "institutional"]),
  name: z.string().trim().min(2).max(160),
  phone: z.string().trim().regex(/^[0-9+() .-]{8,24}$/),
  email: z.union([z.string().trim().email().max(254), z.literal("")]).optional(),
});

export async function createCustomer(formData: FormData) {
  const parsed = customerSchema.safeParse({
    customer_type: formData.get("customer_type"),
    name: formData.get("name"),
    phone: formData.get("phone"),
    email: formData.get("email") ?? "",
  });
  if (!parsed.success) redirect("/workspace/customers?error=invalid");

  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");
  const { sql } = await import("@/lib/db");

  try {
    const result = await sql`
      WITH actor AS (
        SELECT p.id AS actor_id, p.organization_id
        FROM user_profiles p
        JOIN user_role_assignments a ON a.user_id = p.id
        JOIN roles r ON r.id = a.role_id
        WHERE p.auth_subject = ${session.user.id}
          AND p.status = 'active'
          AND r.code IN ('OWNER', 'ADMIN')
        ORDER BY r.code
        LIMIT 1
      ),
      existing AS (
        SELECT c.id
        FROM customers c
        JOIN actor ON actor.organization_id = c.organization_id
        WHERE regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') =
                regexp_replace(${parsed.data.phone}, '[^0-9]', '', 'g')
           OR (
             ${parsed.data.email || null}::text IS NOT NULL
             AND lower(c.email) = lower(${parsed.data.email || null}::text)
           )
        LIMIT 1
      ),
      inserted AS (
        INSERT INTO customers (
          organization_id, customer_code, customer_type, name, phone, email
        )
        SELECT
          actor.organization_id,
          'CUST-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
          ${parsed.data.customer_type}, ${parsed.data.name},
          ${parsed.data.phone}, ${parsed.data.email || null}
        FROM actor
        WHERE NOT EXISTS (SELECT 1 FROM existing)
        RETURNING id, organization_id, customer_code, name, customer_type
      ),
      logged AS (
        INSERT INTO audit_logs (
          organization_id, actor_user_id, action, entity_type, entity_id, after_data
        )
        SELECT
          inserted.organization_id, actor.actor_id, 'CREATE',
          'customer', inserted.id::text,
          jsonb_build_object(
            'customer_code', inserted.customer_code,
            'name', inserted.name,
            'customer_type', inserted.customer_type
          )
        FROM inserted
        CROSS JOIN actor
        RETURNING id
      )
      SELECT
        (SELECT actor_id FROM actor LIMIT 1) AS actor_id,
        (SELECT id FROM existing LIMIT 1) AS existing_id,
        (SELECT id FROM inserted LIMIT 1) AS id
    `;

    const outcome = result[0] as { actor_id: string | null; existing_id: string | null; id: string | null } | undefined;
    if (!outcome?.actor_id) redirect("/workspace?access=denied");
    if (outcome.existing_id) redirect("/workspace/customers?error=duplicate");
    if (!outcome.id) redirect("/workspace/customers?error=save");
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) throw error;
    redirect("/workspace/customers?error=save");
  }
  redirect("/workspace/customers?created=1");
}
