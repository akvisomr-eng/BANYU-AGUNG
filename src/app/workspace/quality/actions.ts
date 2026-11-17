"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";

export async function recordLotInspection(formData: FormData) {
  const lotId=String(formData.get("lot_id")??"");
  const result=String(formData.get("result")??"");
  const reportReference=String(formData.get("report_reference")??"").trim();
  const notes=String(formData.get("notes")??"").trim();
  if(!/^[0-9a-f-]{36}$/i.test(lotId) || !["released","quarantined","rejected","expired"].includes(result) ||
    notes.length<(result==="released"?20:10) || notes.length>2000 ||
    (result==="released" && (reportReference.length<3 || reportReference.length>160)) ||
    reportReference.length>160) redirect("/workspace/quality?error=invalid");

  const {data:session}=await auth.getSession();
  if(!session?.user) redirect("/auth/sign-in");
  const {sql}=await import("@/lib/db");
  const rows=await sql`
    WITH actor AS (
      SELECT p.id AS actor_id,p.organization_id,r.code AS role_code
      FROM user_profiles p
      JOIN user_role_assignments a ON a.user_id=p.id
      JOIN roles r ON r.id=a.role_id
      WHERE p.auth_subject=${session.user.id} AND p.status='active' AND r.code IN ('OWNER','ADMIN')
      ORDER BY r.code LIMIT 1
    ),
    updated AS (
      UPDATE inventory_lots l
      SET quality_status=${result}
      FROM actor
      WHERE l.id=${lotId}::uuid AND l.organization_id=actor.organization_id
        AND l.quality_status IN ('pending','quarantined')
        AND (${result} <> 'released' OR actor.role_code='OWNER')
      RETURNING l.id,l.organization_id,l.product_id,l.lot_code
    ),
    inspection AS (
      INSERT INTO quality_inspections (
        organization_id,inspection_number,lot_id,result,report_reference,notes,inspected_by
      )
      SELECT u.organization_id,
        'QC-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),
        u.id,${result},${reportReference||null},${notes},actor.actor_id
      FROM updated u CROSS JOIN actor
      RETURNING id,organization_id,inspection_number,lot_id,result
    ),
    logged AS (
      INSERT INTO audit_logs (organization_id,actor_user_id,action,entity_type,entity_id,after_data)
      SELECT inspection.organization_id,actor.actor_id,'RECORD_QUALITY_INSPECTION','inventory_lot',inspection.lot_id::text,
        jsonb_build_object('inspection_number',inspection.inspection_number,'result',inspection.result)
      FROM inspection CROSS JOIN actor RETURNING id
    )
    SELECT inspection_number FROM inspection
  `;
  if(rows.length===0) redirect("/workspace/quality?error=access");
  redirect("/workspace/quality?recorded=1");
}
