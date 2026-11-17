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
    const created = await sql`
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
      SELECT id FROM inserted
    `;
    if (created.length === 0) redirect("/workspace?access=denied");
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) throw error;
    redirect("/workspace/customers?error=save");
  }
  redirect("/workspace/customers?created=1");
}
