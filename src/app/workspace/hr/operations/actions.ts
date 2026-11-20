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

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function recordAttendance(formData: FormData) {
  const employeeId = String(formData.get("employee_id") ?? "").trim();
  const workDate = String(formData.get("work_date") ?? "").trim();
  const checkIn = String(formData.get("check_in") ?? "").trim();
  const checkOut = String(formData.get("check_out") ?? "").trim();
  const status = String(formData.get("attendance_status") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const allowed = new Set(["present", "late", "absent", "sick", "off"]);

  if (!uuidPattern.test(employeeId) || !datePattern.test(workDate) ||
      !allowed.has(status) || notes.length > 500 ||
      (checkIn && !timePattern.test(checkIn)) ||
      (checkOut && !timePattern.test(checkOut)) ||
      (checkIn && checkOut && checkOut < checkIn)) {
    redirect("/workspace/hr/operations?error=attendance-invalid");
  }

  const { actor, sql } = await getActor();
  try {
    const rows = await sql`
      WITH valid_employee AS (
        SELECT e.id, scheduled.start_time, scheduled.grace_minutes
        FROM employees e
        LEFT JOIN LATERAL (
          SELECT t.start_time, t.grace_minutes
          FROM hr_employee_shift_assignments a
          JOIN hr_shift_templates t
            ON t.id = a.shift_template_id AND t.organization_id = a.organization_id
          WHERE a.employee_id = e.id
            AND a.organization_id = e.organization_id
            AND a.effective_from <= ${workDate}::date
            AND (a.effective_to IS NULL OR a.effective_to >= ${workDate}::date)
            AND t.is_active = true
          ORDER BY a.effective_from DESC
          LIMIT 1
        ) scheduled ON true
        WHERE e.id = ${employeeId}::uuid
          AND e.organization_id = ${actor.organization_id}::uuid
          AND e.employment_status = 'active'
      ), created AS (
        INSERT INTO attendance_records (
          organization_id, employee_id, work_date, check_in, check_out,
          attendance_status, source, approved_by, notes
        )
        SELECT ${actor.organization_id}::uuid, v.id, ${workDate}::date,
          CASE WHEN ${checkIn} = '' THEN NULL
            ELSE ((${workDate}::date + ${checkIn}::time) AT TIME ZONE 'Asia/Jakarta') END,
          CASE WHEN ${checkOut} = '' THEN NULL
            ELSE ((${workDate}::date + ${checkOut}::time) AT TIME ZONE 'Asia/Jakarta') END,
          CASE
            WHEN ${status} IN ('present', 'late') AND ${checkIn} <> ''
              AND v.start_time IS NOT NULL
              AND ${checkIn}::time > (v.start_time + make_interval(mins => v.grace_minutes))::time
              THEN 'late'
            WHEN ${status} IN ('present', 'late') AND ${checkIn} <> ''
              AND v.start_time IS NOT NULL THEN 'present'
            ELSE ${status}
          END,
          'manual', ${actor.actor_id}::uuid, NULLIF(${notes}, '')
        FROM valid_employee v
        RETURNING id, employee_id, work_date, attendance_status
      ), logged AS (
        INSERT INTO audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
        SELECT ${actor.organization_id}::uuid, ${actor.actor_id}::uuid, 'CREATE',
          'attendance_record', id::text,
          jsonb_build_object('employee_id', employee_id, 'work_date', work_date,
            'attendance_status', attendance_status)
        FROM created RETURNING id
      )
      SELECT id FROM created
    `;
    if (rows.length === 0) redirect("/workspace/hr/operations?error=employee-scope");
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) throw error;
    redirect("/workspace/hr/operations?error=attendance-duplicate");
  }
  redirect("/workspace/hr/operations?attendance=created");
}

export async function createLeaveRequest(formData: FormData) {
  const employeeId = String(formData.get("employee_id") ?? "").trim();
  const leaveType = String(formData.get("leave_type") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "").trim();
  const endDate = String(formData.get("end_date") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const allowed = new Set(["annual", "sick", "maternity", "paternity", "unpaid", "other"]);

  if (!uuidPattern.test(employeeId) || !allowed.has(leaveType) ||
      !datePattern.test(startDate) || !datePattern.test(endDate) ||
      endDate < startDate || reason.length > 1000) {
    redirect("/workspace/hr/operations?error=leave-invalid");
  }

  const { actor, sql } = await getActor();
  const rows = await sql`
    WITH valid_employee AS (
      SELECT id FROM employees
      WHERE id = ${employeeId}::uuid
        AND organization_id = ${actor.organization_id}::uuid
        AND employment_status = 'active'
    ), created AS (
      INSERT INTO leave_requests (
        organization_id, employee_id, leave_type, start_date, end_date, reason
      )
      SELECT ${actor.organization_id}::uuid, e.id, ${leaveType},
        ${startDate}::date, ${endDate}::date, NULLIF(${reason}, '')
      FROM valid_employee e
      WHERE NOT EXISTS (
        SELECT 1 FROM leave_requests existing
        WHERE existing.employee_id = e.id
          AND existing.status IN ('submitted', 'approved')
          AND daterange(existing.start_date, existing.end_date, '[]')
              && daterange(${startDate}::date, ${endDate}::date, '[]')
      )
      RETURNING id, employee_id, leave_type, start_date, end_date, status
    ), logged AS (
      INSERT INTO audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
      SELECT ${actor.organization_id}::uuid, ${actor.actor_id}::uuid, 'CREATE',
        'leave_request', id::text,
        jsonb_build_object('employee_id', employee_id, 'leave_type', leave_type,
          'start_date', start_date, 'end_date', end_date, 'status', status)
      FROM created RETURNING id
    )
    SELECT id FROM created
  `;
  if (rows.length === 0) redirect("/workspace/hr/operations?error=leave-conflict");
  redirect("/workspace/hr/operations?leave=created");
}

export async function reviewLeaveRequest(formData: FormData) {
  const requestId = String(formData.get("request_id") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();
  if (!uuidPattern.test(requestId) || !["approved", "rejected"].includes(decision)) {
    redirect("/workspace/hr/operations?error=leave-invalid");
  }
  const { actor, sql } = await getActor();
  const rows = await sql`
    WITH changed AS (
      UPDATE leave_requests
      SET status = ${decision}, approver_id = ${actor.actor_id}::uuid
      WHERE id = ${requestId}::uuid
        AND organization_id = ${actor.organization_id}::uuid
        AND status = 'submitted'
      RETURNING id, employee_id, leave_type, start_date, end_date, status
    ), logged AS (
      INSERT INTO audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
      SELECT ${actor.organization_id}::uuid, ${actor.actor_id}::uuid, 'UPDATE',
        'leave_request', id::text,
        jsonb_build_object('status', 'submitted'),
        jsonb_build_object('status', status, 'employee_id', employee_id,
          'start_date', start_date, 'end_date', end_date)
      FROM changed RETURNING id
    )
    SELECT id FROM changed
  `;
  if (rows.length === 0) redirect("/workspace/hr/operations?error=leave-not-pending");
  redirect("/workspace/hr/operations?leave=reviewed");
}
