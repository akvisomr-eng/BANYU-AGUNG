"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";

const allowedStatuses = new Set(["new", "assigned", "contacted", "qualified", "converted", "closed", "spam"]);

export async function updateInquiryStatus(formData: FormData) {
  const inquiryId = String(formData.get("inquiry_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(inquiryId) || !allowedStatuses.has(status)) {
    redirect("/workspace/inquiries?error=invalid");
  }

  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");
  const { sql } = await import("@/lib/db");

  const result = await sql`
    WITH updated AS (
      UPDATE customer_inquiries i
      SET status = ${status}, updated_at = now()
      FROM user_profiles p
      JOIN user_role_assignments a ON a.user_id = p.id
      JOIN roles r ON r.id = a.role_id
      WHERE i.id = ${inquiryId}::uuid
        AND i.organization_id = p.organization_id
        AND p.auth_subject = ${session.user.id}
        AND p.status = 'active'
        AND r.code IN ('OWNER', 'ADMIN')
      RETURNING i.id, i.organization_id, i.status
    ),
    logged AS (
      INSERT INTO audit_logs (
        organization_id, actor_user_id, action, entity_type, entity_id, after_data
      )
      SELECT
        u.organization_id, p.id, 'UPDATE_INQUIRY_STATUS',
        'customer_inquiry', u.id::text, jsonb_build_object('status', u.status)
      FROM updated u
      JOIN user_profiles p ON p.auth_subject = ${session.user.id}
      RETURNING id
    )
    SELECT id FROM updated
  `;

  if (result.length === 0) redirect("/workspace/inquiries?error=update");
  redirect("/workspace/inquiries?updated=1");
}

export async function convertInquiryToCustomer(formData: FormData) {
  const inquiryId = String(formData.get("inquiry_id") ?? "");
  const customerType = String(formData.get("customer_type") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(inquiryId) || !["retail", "wholesale", "reseller", "distributor", "institutional"].includes(customerType)) {
    redirect("/workspace/inquiries?error=convert");
  }

  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");
  const { sql } = await import("@/lib/db");

  const result = await sql\`
    WITH actor AS (
      SELECT p.id AS actor_id, p.organization_id
      FROM user_profiles p
      JOIN user_role_assignments a ON a.user_id = p.id
      JOIN roles r ON r.id = a.role_id
      WHERE p.auth_subject = \${session.user.id}
        AND p.status = 'active'
        AND r.code IN ('OWNER', 'ADMIN')
      ORDER BY r.code
      LIMIT 1
    ),
    source AS (
      SELECT i.id, i.organization_id, i.contact_name, i.phone, i.email
      FROM customer_inquiries i
      JOIN actor ON actor.organization_id = i.organization_id
      WHERE i.id = \${inquiryId}::uuid
        AND i.customer_id IS NULL
        AND i.status NOT IN ('closed', 'spam', 'converted')
      FOR UPDATE OF i
    ),
    matched AS (
      SELECT c.id
      FROM customers c
      JOIN source s ON s.organization_id = c.organization_id
      WHERE (
        regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') =
          regexp_replace(s.phone, '[^0-9]', '', 'g')
        OR (s.email IS NOT NULL AND lower(c.email) = lower(s.email))
      )
      ORDER BY c.created_at ASC
      LIMIT 1
    ),
    created AS (
      INSERT INTO customers (
        organization_id, customer_code, customer_type, name, phone, email
      )
      SELECT
        s.organization_id,
        'CUST-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
        \${customerType}, s.contact_name, s.phone, s.email
      FROM source s
      WHERE NOT EXISTS (SELECT 1 FROM matched)
      RETURNING id, organization_id
    ),
    resolved AS (
      SELECT id FROM matched
      UNION ALL
      SELECT id FROM created
    ),
    updated AS (
      UPDATE customer_inquiries i
      SET customer_id = (SELECT id FROM resolved LIMIT 1),
          status = 'converted',
          updated_at = now()
      FROM source s
      WHERE i.id = s.id
        AND i.customer_id IS NULL
        AND EXISTS (SELECT 1 FROM resolved)
      RETURNING i.id, i.organization_id, i.customer_id
    ),
    logged AS (
      INSERT INTO audit_logs (
        organization_id, actor_user_id, action, entity_type, entity_id, after_data
      )
      SELECT
        u.organization_id, actor.actor_id, 'CONVERT_INQUIRY_TO_CUSTOMER',
        'customer_inquiry', u.id::text,
        jsonb_build_object('customer_id', u.customer_id)
      FROM updated u
      CROSS JOIN actor
      RETURNING id
    )
    SELECT customer_id FROM updated
  \`;

  if (result.length === 0) redirect("/workspace/inquiries?error=convert");
  redirect("/workspace/inquiries?converted=1");
}
