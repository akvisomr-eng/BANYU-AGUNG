import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { SignOutButton } from "../../sign-out-button";

export const dynamic = "force-dynamic";

type Summary = {
  employee_count: number;
  attendance_count: number;
  present_count: number;
  late_count: number;
  absent_count: number;
  sick_count: number;
  off_count: number;
  pending_leave_count: number;
  approved_leave_count: number;
  approved_leave_days: number;
};
type EmployeeRow = {
  employee_number: string;
  full_name: string;
  department_name: string | null;
  present_days: number;
  late_days: number;
  absent_days: number;
  sick_days: number;
  off_days: number;
};
type LeaveRow = {
  employee_number: string;
  full_name: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: string;
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const leaveNames: Record<string, string> = {
  annual: "Tahunan", sick: "Sakit", maternity: "Melahirkan",
  paternity: "Ayah", unpaid: "Tanpa upah", other: "Lainnya",
};
const statusNames: Record<string, string> = {
  submitted: "Menunggu", approved: "Disetujui", rejected: "Ditolak", cancelled: "Dibatalkan",
};

export default async function HRReportsPage({ searchParams }: {
  searchParams: Promise<{ from?: string; to?: string }>;
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

  const params = await searchParams;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const defaultFrom = today.slice(0, 7) + "-01";
  const from = params.from && datePattern.test(params.from) ? params.from : defaultFrom;
  const to = params.to && datePattern.test(params.to) ? params.to : today;
  if (from > to) redirect("/workspace/hr/reports");

  const [summaryRows, employeeRows, leaveRows] = await Promise.all([
    sql`
      SELECT
        (SELECT count(*)::int FROM employees
          WHERE organization_id = ${actor.organization_id}::uuid
            AND employment_status = 'active') AS employee_count,
        count(a.id)::int AS attendance_count,
        count(a.id) FILTER (WHERE a.attendance_status = 'present')::int AS present_count,
        count(a.id) FILTER (WHERE a.attendance_status = 'late')::int AS late_count,
        count(a.id) FILTER (WHERE a.attendance_status = 'absent')::int AS absent_count,
        count(a.id) FILTER (WHERE a.attendance_status = 'sick')::int AS sick_count,
        count(a.id) FILTER (WHERE a.attendance_status = 'off')::int AS off_count,
        (SELECT count(*)::int FROM leave_requests
          WHERE organization_id = ${actor.organization_id}::uuid
            AND status = 'submitted'
            AND daterange(start_date, end_date, '[]') && daterange(${from}::date, ${to}::date, '[]')) AS pending_leave_count,
        (SELECT count(*)::int FROM leave_requests
          WHERE organization_id = ${actor.organization_id}::uuid
            AND status = 'approved'
            AND daterange(start_date, end_date, '[]') && daterange(${from}::date, ${to}::date, '[]')) AS approved_leave_count,
        (SELECT COALESCE(sum(LEAST(end_date, ${to}::date) - GREATEST(start_date, ${from}::date) + 1), 0)::int
          FROM leave_requests
          WHERE organization_id = ${actor.organization_id}::uuid
            AND status = 'approved'
            AND daterange(start_date, end_date, '[]') && daterange(${from}::date, ${to}::date, '[]')) AS approved_leave_days
      FROM attendance_records a
      WHERE a.organization_id = ${actor.organization_id}::uuid
        AND a.work_date BETWEEN ${from}::date AND ${to}::date
    `,
    sql`
      SELECT e.employee_number, e.full_name, d.name AS department_name,
        count(a.id) FILTER (WHERE a.attendance_status = 'present')::int AS present_days,
        count(a.id) FILTER (WHERE a.attendance_status = 'late')::int AS late_days,
        count(a.id) FILTER (WHERE a.attendance_status = 'absent')::int AS absent_days,
        count(a.id) FILTER (WHERE a.attendance_status = 'sick')::int AS sick_days,
        count(a.id) FILTER (WHERE a.attendance_status = 'off')::int AS off_days
      FROM employees e
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN attendance_records a ON a.employee_id = e.id
        AND a.organization_id = e.organization_id
        AND a.work_date BETWEEN ${from}::date AND ${to}::date
      WHERE e.organization_id = ${actor.organization_id}::uuid
        AND e.employment_status = 'active'
      GROUP BY e.id, e.employee_number, e.full_name, d.name
      ORDER BY e.full_name
      LIMIT 500
    `,
    sql`
      SELECT e.employee_number, e.full_name, l.leave_type,
        to_char(l.start_date, 'YYYY-MM-DD') AS start_date,
        to_char(l.end_date, 'YYYY-MM-DD') AS end_date, l.status
      FROM leave_requests l
      JOIN employees e ON e.id = l.employee_id
      WHERE l.organization_id = ${actor.organization_id}::uuid
        AND daterange(l.start_date, l.end_date, '[]') && daterange(${from}::date, ${to}::date, '[]')
      ORDER BY CASE l.status WHEN 'submitted' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
        l.start_date, e.full_name
      LIMIT 300
    `,
  ]) as [Summary[], EmployeeRow[], LeaveRow[]];
  const summary = summaryRows[0];

  return <main className="workspace">
    <aside className="side">
      <Link className="brand" href="/">BANYU <span>AGUNG</span></Link>
      <p className="sideLabel">HUMAN RESOURCES</p>
      <Link className="sideLink" href="/workspace">← Ringkasan</Link>
      <Link className="sideLink" href="/workspace/hr">Data Karyawan</Link>
      <Link className="sideLink" href="/workspace/hr/operations">Absensi & Cuti</Link>
      <Link className="sideLink" href="/workspace/hr/shifts">Jadwal Shift</Link>
      <Link className="sideActive" href="/workspace/hr/reports">Laporan HR</Link>
      <Link className="sideLink" href="/workspace/enterprise">Pusat Enterprise</Link>
    </aside>
    <section className="workMain">
      <header className="workHeader">
        <div><p className="eyebrow">BANYU AGUNG / HUMAN RESOURCES</p><h1>Laporan HR</h1>
          <p className="muted">Rekap kehadiran dan cuti · {actor.role_name}</p></div>
        <SignOutButton />
      </header>
      <div className="inventoryNotice">
        Laporan dihitung dari catatan absensi dan permohonan cuti yang tersimpan. Hari tanpa catatan tidak otomatis
        dianggap hadir atau tidak hadir. Perhitungan ini belum menjadi dasar payroll, lembur, potongan, atau saldo cuti.
      </div>
      <section className="moduleCard">
        <form method="get" className="deliveryCreateForm">
          <label>Dari tanggal<input type="date" name="from" defaultValue={from} required /></label>
          <label>Sampai tanggal<input type="date" name="to" defaultValue={to} required /></label>
          <button className="primary" type="submit">Tampilkan laporan</button>
        </form>
      </section>
      <p className="muted">Periode laporan: <strong>{from}</strong> sampai <strong>{to}</strong></p>
      <div className="metricGrid">
        <article className="metric"><span>Karyawan aktif</span><strong>{summary?.employee_count ?? 0}</strong><small>Snapshot status saat ini</small></article>
        <article className="metric"><span>Catatan kehadiran</span><strong>{summary?.attendance_count ?? 0}</strong><small>Record dalam periode</small></article>
        <article className="metric"><span>Hadir / terlambat</span><strong>{summary?.present_count ?? 0} / {summary?.late_count ?? 0}</strong><small>Catatan status</small></article>
        <article className="metric"><span>Absen / sakit / libur</span><strong>{summary?.absent_count ?? 0} / {summary?.sick_count ?? 0} / {summary?.off_count ?? 0}</strong><small>Catatan status</small></article>
        <article className="metric"><span>Cuti menunggu</span><strong>{summary?.pending_leave_count ?? 0}</strong><small>Permohonan overlap periode</small></article>
        <article className="metric"><span>Cuti disetujui</span><strong>{summary?.approved_leave_count ?? 0}</strong><small>{summary?.approved_leave_days ?? 0} hari kalender dalam periode</small></article>
      </div>
      <h2>Rekap per karyawan</h2>
      {employeeRows.length === 0 ? <div className="moduleCard">Belum ada data karyawan.</div> :
        <div className="inventoryTableWrap"><table className="inventoryTable">
          <thead><tr><th>Nomor</th><th>Nama</th><th>Departemen</th><th>Hadir</th><th>Terlambat</th><th>Absen</th><th>Sakit</th><th>Libur</th></tr></thead>
          <tbody>{employeeRows.map((e) => <tr key={e.employee_number}>
            <td>{e.employee_number}</td><td><strong>{e.full_name}</strong></td><td>{e.department_name ?? "—"}</td>
            <td>{e.present_days}</td><td>{e.late_days}</td><td>{e.absent_days}</td><td>{e.sick_days}</td><td>{e.off_days}</td>
          </tr>)}</tbody>
        </table></div>}
      <h2>Daftar permohonan cuti dalam periode</h2>
      {leaveRows.length === 0 ? <div className="moduleCard">Tidak ada permohonan cuti yang beririsan dengan periode ini.</div> :
        <div className="inventoryTableWrap"><table className="inventoryTable">
          <thead><tr><th>Karyawan</th><th>Jenis</th><th>Periode cuti</th><th>Status</th></tr></thead>
          <tbody>{leaveRows.map((l, index) => <tr key={l.employee_number + l.start_date + index}>
            <td><strong>{l.employee_number}</strong><small>{l.full_name}</small></td>
            <td>{leaveNames[l.leave_type] ?? l.leave_type}</td><td>{l.start_date} – {l.end_date}</td>
            <td>{statusNames[l.status] ?? l.status}</td>
          </tr>)}</tbody>
        </table></div>}
      <p className="workspaceFoot">Data dibatasi pada organisasi aktif dan hanya dapat dilihat OWNER/ADMIN. Gunakan fungsi cetak browser untuk menyimpan laporan sebagai PDF. Belum ada penghitungan payroll atau kepatuhan ketenagakerjaan otomatis.</p>
    </section>
  </main>;
}
