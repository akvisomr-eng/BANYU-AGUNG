"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";

const employmentTypes = new Set(["permanent", "contract", "daily", "intern"]);
const codePattern = /^[A-Z0-9][A-Z0-9._-]{1,29}$/;

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
    ORDER BY CASE r.code WHEN 'OWNER' THEN 0 ELSE 1 END
    LIMIT 1
  `;
  const actor = rows[0] as { actor_id: string; organization_id: string } | undefined;
  if (!actor) redirect("/workspace?access=denied");
  return { actor, sql };
}

export async function createEmployee(formData: FormData) {
  const employeeNumber = String(formData.get("employee_number") ?? "").trim().toUpperCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const departmentId = String(formData.get("department_id") ?? "").trim();
  const siteId = String(formData.get("site_id") ?? "").trim();
  const jobTitle = String(formData.get("job_title") ?? "").trim();
  const employmentType = String(formData.get("employment_type") ?? "").trim();
  const hireDate = String(formData.get("hire_date") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (
    !codePattern.test(employeeNumber) ||
    fullName.length < 2 || fullName.length > 160 ||
    jobTitle.length > 120 || phone.length > 40 || email.length > 254 ||
    (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
    !employmentTypes.has(employmentType) ||
    (hireDate && !/^\d{4}-\d{2}-\d{2}$/.test(hireDate)) ||
    (departmentId && !/^[0-9a-f-]{36}$/i.test(departmentId)) ||
    (siteId && !/^[0-9a-f-]{36}$/i.test(siteId))
  ) redirect("/workspace/hr?error=invalid");

  const { actor, sql } = await getActor();
  try {
    const rows = await sql`
      WITH valid_department AS (
        SELECT id FROM departments
        WHERE id = NULLIF(${departmentId}, '')::uuid
          AND organization_id = ${actor.organization_id}::uuid
          AND is_active = true
      ), valid_site AS (
        SELECT id FROM sites
        WHERE id = NULLIF(${siteId}, '')::uuid
          AND organization_id = ${actor.organization_id}::uuid
          AND is_active = true
      ), created AS (
        INSERT INTO employees (
          organization_id, employee_number, full_name, department_id, site_id,
          job_title, employment_type, hire_date, phone, email
        )
        SELECT
          ${actor.organization_id}::uuid, ${employeeNumber}, ${fullName},
          CASE WHEN ${departmentId} = '' THEN NULL ELSE (SELECT id FROM valid_department) END,
          CASE WHEN ${siteId} = '' THEN NULL ELSE (SELECT id FROM valid_site) END,
          NULLIF(${jobTitle}, ''), ${employmentType},
          NULLIF(${hireDate}, '')::date, NULLIF(${phone}, ''), NULLIF(${email}, '')
        WHERE (${departmentId} = '' OR EXISTS (SELECT 1 FROM valid_department))
          AND (${siteId} = '' OR EXISTS (SELECT 1 FROM valid_site))
        RETURNING id, organization_id, employee_number, full_name, employment_status
      ), logged AS (
        INSERT INTO audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
        SELECT organization_id, ${actor.actor_id}::uuid, 'CREATE', 'employee', id::text,
          jsonb_build_object(
            'employee_number', employee_number,
            'full_name', full_name,
            'employment_status', employment_status
          )
        FROM created RETURNING id
      )
      SELECT id FROM created
    `;
    if (rows.length === 0) redirect("/workspace/hr?error=scope");
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) throw error;
    redirect("/workspace/hr?error=duplicate");
  }
  redirect("/workspace/hr?created=1");
}
