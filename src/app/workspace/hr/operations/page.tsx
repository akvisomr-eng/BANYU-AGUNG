import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { SignOutButton } from "../../sign-out-button";
import { createLeaveRequest, recordAttendance, reviewLeaveRequest } from "./actions";

export const dynamic = "force-dynamic";

type Employee = { id: string; employee_number: string; full_name: string };
type Attendance = {
  id: string; employee_number: string; full_name: string; work_date: string;
  check_in: string | null; check_out: string | null; attendance_status: string;
};
type LeaveRequest = {
  id: string; employee_number: string; full_name: string; leave_type: string;
  start_date: string; end_date: string; reason: string | null; status: string;
  created_at: string;
};

const attendanceLabels: Record<string, string> = {
  present: "Hadir", late: "Terlambat", absent: "Tidak hadir", sick: "Sakit", off: "Libur",
};
const leaveLabels: Record<string, string> = {
  annual: "Tahunan", sick: "Sakit", maternity: "Melahirkan", paternity: "Ayah",
  unpaid: "Tanpa upah", other: "Lainnya",
};
const leaveStatus: Record<string, string> = {
  submitted: "Menunggu", approved: "Disetujui", rejected: "Ditolak", cancelled: "Dibatalkan",
};

export default async function HROperationsPage({ searchParams }: {
  searchParams: Promise<{ attendance?: string; leave?: string; error?: string }>;
}) {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");
  const { sql } = await import("@/lib/db");
  const actors = await sql`
    SELECT p.organization_id, r.name AS role_name
    FROM user_profiles p
    JOIN user_role_assignments a ON a.user_id = p.id
    JOIN roles r ON r.id = a.role_id
    WHERE p.auth_subject = ${session.user.id}
      AND p.status = 'active'
      AND r.code IN ('OWNER', 'ADMIN')
    ORDER BY CASE r.code WHEN 'OWNER' THEN 0 ELSE 1 END
    LIMIT 1
  `;
  const actor = actors[0] as { organization_id: string; role_name: string } | undefined;
  if (!actor) redirect("/workspace?access=denied");

  const [employees, attendance, leaves] = await Promise.all([
    sql`
      SELECT id, employee_number, full_name FROM employees
      WHERE organization_id = ${actor.organization_id}::uuid
        AND employment_status = 'active'
      ORDER BY full_name LIMIT 500
    `,
    sql`
      SELECT e.employee_number, e.full_name, a.id,
        to_char(a.work_date, 'YYYY-MM-DD') AS work_date,
        CASE WHEN a.check_in IS NULL THEN NULL ELSE to_char(a.check_in AT TIME ZONE 'Asia/Jakarta', 'HH24:MI') END AS check_in,
        CASE WHEN a.check_out IS NULL THEN NULL ELSE to_char(a.check_out AT TIME ZONE 'Asia/Jakarta', 'HH24:MI') END AS check_out,
        a.attendance_status
      FROM attendance_records a
      JOIN employees e ON e.id = a.employee_id
      WHERE a.organization_id = ${actor.organization_id}::uuid
      ORDER BY a.work_date DESC, e.full_name LIMIT 100
    `,
    sql`
      SELECT e.employee_number, e.full_name, l.id, l.leave_type,
        to_char(l.start_date, 'YYYY-MM-DD') AS start_date,
        to_char(l.end_date, 'YYYY-MM-DD') AS end_date,
        l.reason, l.status, l.created_at::text
      FROM leave_requests l
      JOIN employees e ON e.id = l.employee_id
      WHERE l.organization_id = ${actor.organization_id}::uuid
      ORDER BY CASE l.status WHEN 'submitted' THEN 0 ELSE 1 END, l.created_at DESC
      LIMIT 100
    `,
  ]) as [Employee[], Attendance[], LeaveRequest[]];
  const params = await searchParams;

  return (
    <main className="workspace">
      <aside className="side">
        <Link className="brand" href="/">BANYU <span>AGUNG</span></Link>
        <p className="sideLabel">HUMAN RESOURCES</p>
        <Link className="sideLink" href="/workspace">← Ringkasan</Link>
        <Link className="sideLink" href="/workspace/hr">Data Karyawan</Link>
        <Link className="sideActive" href="/workspace/hr/operations">Absensi & Cuti</Link>
        <Link className="sideLink" href="/workspace/hr/shifts">Jadwal Shift</Link>
        <Link className="sideLink" href="/workspace/hr/reports">Laporan HR</Link>
        <Link className="sideLink" href="/workspace/enterprise">Pusat Enterprise</Link>
      </aside>
      <section className="workMain">
        <header className="workHeader">
          <div><p className="eyebrow">BANYU AGUNG / HUMAN RESOURCES</p><h1>Absensi & Cuti</h1>
            <p className="muted">Operasional HR terkontrol · {actor.role_name}</p></div>
          <SignOutButton />
        </header>
        <div className="inventoryNotice">
          Pencatatan dan persetujuan tahap awal dilakukan OWNER / ADMIN. Waktu absensi dicatat dalam zona WIB.
          Jam keterlambatan dihitung otomatis dari shift aktif karyawan jika tersedia; tanpa penugasan shift, status mengikuti pilihan operator. Perangkat biometrik, saldo cuti, dan payroll belum tersedia.
          Persetujuan cuti belum otomatis mengubah catatan absensi.
        </div>
        {params.attendance === "created" && <p className="authSuccess" role="status">Catatan kehadiran tersimpan dan masuk audit.</p>}
        {params.leave === "created" && <p className="authSuccess" role="status">Permohonan cuti berhasil dicatat.</p>}
        {params.leave === "reviewed" && <p className="authSuccess" role="status">Keputusan cuti berhasil disimpan dan diaudit.</p>}
        {params.error && <p className="authError" role="alert">
          {params.error === "attendance-invalid" ? "Periksa tanggal, waktu, pegawai, dan status kehadiran." :
           params.error === "employee-scope" ? "Pegawai tidak aktif atau bukan bagian organisasi ini." :
           params.error === "attendance-duplicate" ? "Catatan pegawai pada tanggal tersebut sudah ada atau gagal disimpan." :
           params.error === "leave-invalid" ? "Periksa pegawai, jenis, tanggal, dan alasan cuti." :
           params.error === "leave-conflict" ? "Pegawai tidak ditemukan atau tanggal cuti bertabrakan dengan permohonan aktif." :
           "Permohonan tidak lagi menunggu keputusan atau tidak ditemukan."}
        </p>}
        <h2>Catat kehadiran harian</h2>
        <section className="moduleCard">
          {employees.length === 0 ? <p>Daftarkan karyawan aktif terlebih dahulu.</p> : <form action={recordAttendance} className="deliveryCreateForm">
            <label>Karyawan<select name="employee_id" required defaultValue="">
              <option value="" disabled>Pilih karyawan</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.employee_number} · {e.full_name}</option>)}
            </select></label>
            <label>Tanggal kerja<input type="date" name="work_date" required /></label>
            <label>Jam masuk (WIB)<input type="time" name="check_in" /></label>
            <label>Jam pulang (WIB)<input type="time" name="check_out" /></label>
            <label>Status<select name="attendance_status" defaultValue="present">
              <option value="present">Hadir</option><option value="late">Terlambat</option>
              <option value="absent">Tidak hadir</option><option value="sick">Sakit</option><option value="off">Libur</option>
            </select></label>
            <label>Catatan<input name="notes" maxLength={500} placeholder="Opsional" /></label>
            <button className="primary" type="submit">Simpan kehadiran</button>
          </form>}
        </section>
        <h2>Catat permohonan cuti</h2>
        <section className="moduleCard">
          {employees.length === 0 ? <p>Belum ada karyawan aktif.</p> : <form action={createLeaveRequest} className="deliveryCreateForm">
            <label>Karyawan<select name="employee_id" required defaultValue="">
              <option value="" disabled>Pilih karyawan</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.employee_number} · {e.full_name}</option>)}
            </select></label>
            <label>Jenis cuti<select name="leave_type" defaultValue="annual">
              <option value="annual">Tahunan</option><option value="sick">Sakit</option>
              <option value="maternity">Melahirkan</option><option value="paternity">Ayah</option>
              <option value="unpaid">Tanpa upah</option><option value="other">Lainnya</option>
            </select></label>
            <label>Tanggal mulai<input type="date" name="start_date" required /></label>
            <label>Tanggal selesai<input type="date" name="end_date" required /></label>
            <label>Alasan<input name="reason" maxLength={1000} placeholder="Keterangan permohonan" /></label>
            <button className="primary" type="submit">Ajukan permohonan</button>
          </form>}
        </section>
        <h2>Permohonan cuti & persetujuan</h2>
        {leaves.length === 0 ? <div className="moduleCard">Belum ada permohonan cuti.</div> :
          <div className="inventoryTableWrap"><table className="inventoryTable">
            <thead><tr><th>Karyawan</th><th>Jenis</th><th>Periode</th><th>Alasan</th><th>Status</th><th>Keputusan</th></tr></thead>
            <tbody>{leaves.map((l) => <tr key={l.id}>
              <td><strong>{l.employee_number}</strong><small>{l.full_name}</small></td>
              <td>{leaveLabels[l.leave_type] ?? l.leave_type}</td>
              <td>{l.start_date} – {l.end_date}</td>
              <td>{l.reason ?? "—"}</td>
              <td>{leaveStatus[l.status] ?? l.status}</td>
              <td>{l.status === "submitted" ? <form action={reviewLeaveRequest} className="inlineActions">
                <input type="hidden" name="request_id" value={l.id} />
                <button className="primary" name="decision" value="approved" type="submit">Setujui</button>
                <button className="secondary" name="decision" value="rejected" type="submit">Tolak</button>
              </form> : "—"}</td>
            </tr>)}</tbody>
          </table></div>}
        <h2>Riwayat kehadiran</h2>
        {attendance.length === 0 ? <div className="moduleCard">Belum ada catatan kehadiran.</div> :
          <div className="inventoryTableWrap"><table className="inventoryTable">
            <thead><tr><th>Tanggal</th><th>Karyawan</th><th>Masuk</th><th>Pulang</th><th>Status</th></tr></thead>
            <tbody>{attendance.map((a) => <tr key={a.id}>
              <td>{a.work_date}</td><td><strong>{a.employee_number}</strong><small>{a.full_name}</small></td>
              <td>{a.check_in ?? "—"}</td><td>{a.check_out ?? "—"}</td>
              <td>{attendanceLabels[a.attendance_status] ?? a.attendance_status}</td>
            </tr>)}</tbody>
          </table></div>}
        <p className="workspaceFoot">Semua pencatatan dan keputusan dibatasi per organisasi dan dicatat ke audit log. Akses mandiri karyawan dan alur persetujuan bertingkat menjadi tahap berikutnya.</p>
      </section>
    </main>
  );
}
