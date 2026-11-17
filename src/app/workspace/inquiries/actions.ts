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
