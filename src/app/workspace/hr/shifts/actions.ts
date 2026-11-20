"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";

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

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const date = /^\d{4}-\d{2}-\d{2}$/;
const time = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function createShiftTemplate(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const start = String(formData.get("start_time") ?? "").trim();
  const end = String(formData.get("end_time") ?? "").trim();
  const breakMinutes = Number(formData.get("break_minutes") ?? 0);
  const graceMinutes = Number(formData.get("grace_minutes") ?? 0);
  if (!/^[A-Z0-9][A-Z0-9._-]{1,29}$/.test(code) || name.length < 2 || name.length > 120 ||
      !time.test(start) || !time.test(end) || !Number.isInteger(breakMinutes) ||
      breakMinutes < 0 || breakMinutes > 480 || !Number.isInteger(graceMinutes) ||
      graceMinutes < 0 || graceMinutes > 240) {
    redirect("/workspace/hr/shifts?error=template-invalid");
  }
  const { actor, sql } = await getActor();
  try {
    const rows = await sql`
      WITH created AS (
        INSERT INTO hr_shift_templates
          (organization_id, code, name, start_time, end_time, break_minutes, grace_minutes)
        VALUES (${actor.organization_id}::uuid, ${code}, ${name},
          ${start}::time, ${end}::time, ${breakMinutes}, ${graceMinutes})
        RETURNING id, code, name, start_time, end_time, break_minutes, grace_minutes
      ), logged AS (
        INSERT INTO audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
        SELECT ${actor.organization_id}::uuid, ${actor.actor_id}::uuid, 'CREATE',
          'hr_shift_template', id::text,
          jsonb_build_object('code', code, 'name', name, 'start_time', start_time,
            'end_time', end_time, 'break_minutes', break_minutes, 'grace_minutes', grace_minutes)
        FROM created RETURNING id
      )
      SELECT id FROM created
    `;
    if (!rows.length) redirect("/workspace/hr/shifts?error=template-failed");
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) throw error;
    redirect("/workspace/hr/shifts?error=template-duplicate");
  }
  redirect("/workspace/hr/shifts?created=template");
}

export async function assignEmployeeShift(formData: FormData) {
  const employeeId = String(formData.get("employee_id") ?? "").trim();
  const shiftId = String(formData.get("shift_template_id") ?? "").trim();
  const from = String(formData.get("effective_from") ?? "").trim();
  const to = String(formData.get("effective_to") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  if (!uuid.test(employeeId) || !uuid.test(shiftId) || !date.test(from) ||
      (to && (!date.test(to) || to < from)) || notes.length > 500) {
    redirect("/workspace/hr/shifts?error=assignment-invalid");
  }
  const { actor, sql } = await getActor();
  try {
    const rows = await sql`
      WITH valid_employee AS (
        SELECT id FROM employees
        WHERE id = ${employeeId}::uuid
          AND organization_id = ${actor.organization_id}::uuid
          AND employment_status = 'active'
      ), valid_shift AS (
        SELECT id FROM hr_shift_templates
        WHERE id = ${shiftId}::uuid
          AND organization_id = ${actor.organization_id}::uuid
          AND is_active = true
      ), created AS (
        INSERT INTO hr_employee_shift_assignments
          (organization_id, employee_id, shift_template_id, effective_from, effective_to, notes, created_by)
        SELECT ${actor.organization_id}::uuid, e.id, s.id,
          ${from}::date, NULLIF(${to}, '')::date, NULLIF(${notes}, ''), ${actor.actor_id}::uuid
        FROM valid_employee e CROSS JOIN valid_shift s
        RETURNING id, employee_id, shift_template_id, effective_from, effective_to
      ), logged AS (
        INSERT INTO audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
        SELECT ${actor.organization_id}::uuid, ${actor.actor_id}::uuid, 'CREATE',
          'hr_employee_shift_assignment', id::text,
          jsonb_build_object('employee_id', employee_id, 'shift_template_id', shift_template_id,
            'effective_from', effective_from, 'effective_to', effective_to)
        FROM created RETURNING id
      )
      SELECT id FROM created
    `;
    if (!rows.length) redirect("/workspace/hr/shifts?error=assignment-scope");
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) throw error;
    if (error instanceof Error && error.message.includes("HR_SHIFT_ASSIGNMENT_OVERLAP")) {
      redirect("/workspace/hr/shifts?error=assignment-overlap");
    }
    redirect("/workspace/hr/shifts?error=assignment-failed");
  }
  redirect("/workspace/hr/shifts?created=assignment");
}
