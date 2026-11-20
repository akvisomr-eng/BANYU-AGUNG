import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { SignOutButton } from "../../sign-out-button";
import { assignEmployeeShift, createShiftTemplate } from "./actions";

export const dynamic = "force-dynamic";

type Employee = { id: string; employee_number: string; full_name: string };
type Shift = {
  id: string; code: string; name: string; start_time: string; end_time: string;
  break_minutes: number; grace_minutes: number;
};
type Assignment = {
  id: string; employee_number: string; full_name: string; shift_name: string;
  start_time: string; end_time: string; effective_from: string; effective_to: string | null;
  notes: string | null;
};

export default async function HRShiftsPage({ searchParams }: {
  searchParams: Promise<{ created?: string; error?: string }>;
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

  const [employees, shifts, assignments] = await Promise.all([
    sql`SELECT id, employee_number, full_name FROM employees
      WHERE organization_id = ${actor.organization_id}::uuid AND employment_status = 'active'
      ORDER BY full_name LIMIT 500`,
    sql`SELECT id, code, name, to_char(start_time, 'HH24:MI') AS start_time,
      to_char(end_time, 'HH24:MI') AS end_time, break_minutes, grace_minutes
      FROM hr_shift_templates
      WHERE organization_id = ${actor.organization_id}::uuid AND is_active = true
      ORDER BY name LIMIT 200`,
    sql`SELECT a.id, e.employee_number, e.full_name, s.name AS shift_name,
      to_char(s.start_time, 'HH24:MI') AS start_time,
      to_char(s.end_time, 'HH24:MI') AS end_time,
      to_char(a.effective_from, 'YYYY-MM-DD') AS effective_from,
      to_char(a.effective_to, 'YYYY-MM-DD') AS effective_to, a.notes
      FROM hr_employee_shift_assignments a
      JOIN employees e ON e.id = a.employee_id AND e.organization_id = a.organization_id
      JOIN hr_shift_templates s ON s.id = a.shift_template_id AND s.organization_id = a.organization_id
      WHERE a.organization_id = ${actor.organization_id}::uuid
      ORDER BY a.effective_from DESC, e.full_name LIMIT 300`,
  ]) as [Employee[], Shift[], Assignment[]];
  const params = await searchParams;

  return <main className="workspace">
    <aside className="side">
      <Link className="brand" href="/">BANYU <span>AGUNG</span></Link>
      <p className="sideLabel">HUMAN RESOURCES</p>
      <Link className="sideLink" href="/workspace">← Ringkasan</Link>
      <Link className="sideLink" href="/workspace/hr">Data Karyawan</Link>
      <Link className="sideLink" href="/workspace/hr/operations">Absensi & Cuti</Link>
      <Link className="sideActive" href="/workspace/hr/shifts">Jadwal Shift</Link>
      <Link className="sideLink" href="/workspace/hr/reports">Laporan HR</Link>
      <Link className="sideLink" href="/workspace/enterprise">Pusat Enterprise</Link>
    </aside>
    <section className="workMain">
      <header className="workHeader">
        <div><p className="eyebrow">BANYU AGUNG / HUMAN RESOURCES</p><h1>Jadwal Shift</h1>
          <p className="muted">Pola jam kerja dan penugasan karyawan · {actor.role_name}</p></div>
        <SignOutButton />
      </header>
      <div className="inventoryNotice">
        Buat pola shift, lalu tetapkan kepada karyawan dengan tanggal berlaku. Shift lintas tengah malam didukung
        (contoh 22:00–06:00). Rentang penugasan untuk karyawan yang sama tidak boleh tumpang tindih.
        Jadwal yang baru dibuat tidak mengubah absensi historis.
      </div>
      {params.created === "template" && <p className="authSuccess" role="status">Pola shift berhasil disimpan dan diaudit.</p>}
      {params.created === "assignment" && <p className="authSuccess" role="status">Penugasan shift berhasil disimpan dan diaudit.</p>}
      {params.error && <p className="authError" role="alert">
        {params.error === "template-invalid" ? "Periksa kode, nama, jam, waktu istirahat, dan toleransi keterlambatan." :
         params.error === "template-duplicate" ? "Kode shift sudah digunakan atau penyimpanan gagal." :
         params.error === "assignment-invalid" ? "Periksa karyawan, pola shift, dan tanggal berlaku." :
         params.error === "assignment-scope" ? "Karyawan aktif atau pola shift tidak ditemukan dalam organisasi ini." :
         params.error === "assignment-overlap" ? "Penugasan bertabrakan dengan jadwal shift karyawan pada periode lain." :
         "Penugasan tidak dapat disimpan. Periksa data dan coba kembali."}
      </p>}
      <div className="metricGrid">
        <article className="metric"><span>Pola shift aktif</span><strong>{shifts.length}</strong><small>Template organisasi</small></article>
        <article className="metric"><span>Karyawan aktif</span><strong>{employees.length}</strong><small>Dapat diberi penugasan</small></article>
        <article className="metric"><span>Riwayat penugasan</span><strong>{assignments.length}</strong><small>Termasuk periode lampau</small></article>
      </div>
      <h2>Buat pola shift</h2>
      <section className="moduleCard">
        <form action={createShiftTemplate} className="deliveryCreateForm">
          <label>Kode shift<input name="code" required maxLength={30} placeholder="PAGI" /></label>
          <label>Nama shift<input name="name" required maxLength={120} placeholder="Shift Pagi" /></label>
          <label>Mulai<input name="start_time" type="time" required /></label>
          <label>Selesai<input name="end_time" type="time" required /></label>
          <label>Istirahat (menit)<input name="break_minutes" type="number" min="0" max="480" defaultValue="60" required /></label>
          <label>Toleransi terlambat (menit)<input name="grace_minutes" type="number" min="0" max="240" defaultValue="5" required /></label>
          <button className="primary" type="submit">Simpan pola shift</button>
        </form>
      </section>
      <h2>Daftarkan pola shift ke karyawan</h2>
      <section className="moduleCard">
        {employees.length === 0 ? <p>Belum ada karyawan aktif. Daftarkan karyawan terlebih dahulu.</p> :
         shifts.length === 0 ? <p>Buat pola shift terlebih dahulu.</p> :
         <form action={assignEmployeeShift} className="deliveryCreateForm">
          <label>Karyawan<select name="employee_id" required defaultValue="">
            <option value="" disabled>Pilih karyawan</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.employee_number} · {e.full_name}</option>)}
          </select></label>
          <label>Pola shift<select name="shift_template_id" required defaultValue="">
            <option value="" disabled>Pilih shift</option>
            {shifts.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name} ({s.start_time}–{s.end_time})</option>)}
          </select></label>
          <label>Berlaku mulai<input name="effective_from" type="date" required /></label>
          <label>Berlaku sampai<input name="effective_to" type="date" /></label>
          <label>Catatan<input name="notes" maxLength={500} placeholder="Opsional" /></label>
          <button className="primary" type="submit">Tetapkan shift</button>
         </form>}
      </section>
      <h2>Daftar pola shift</h2>
      {shifts.length === 0 ? <div className="moduleCard">Belum ada pola shift.</div> :
       <div className="inventoryTableWrap"><table className="inventoryTable">
        <thead><tr><th>Kode / Nama</th><th>Jam kerja</th><th>Istirahat</th><th>Toleransi</th><th>Keterangan</th></tr></thead>
        <tbody>{shifts.map((s) => <tr key={s.id}>
          <td><strong>{s.code}</strong><small>{s.name}</small></td>
          <td>{s.start_time} – {s.end_time}{s.end_time <= s.start_time ? " · lintas hari" : ""}</td>
          <td>{s.break_minutes} menit</td><td>{s.grace_minutes} menit</td><td>Aktif</td>
        </tr>)}</tbody>
       </table></div>}
      <h2>Riwayat penugasan karyawan</h2>
      {assignments.length === 0 ? <div className="moduleCard">Belum ada penugasan shift.</div> :
       <div className="inventoryTableWrap"><table className="inventoryTable">
        <thead><tr><th>Karyawan</th><th>Shift</th><th>Jam</th><th>Berlaku mulai</th><th>Berlaku sampai</th><th>Catatan</th></tr></thead>
        <tbody>{assignments.map((a) => <tr key={a.id}>
          <td><strong>{a.employee_number}</strong><small>{a.full_name}</small></td>
          <td>{a.shift_name}</td><td>{a.start_time} – {a.end_time}</td>
          <td>{a.effective_from}</td><td>{a.effective_to ?? "Tanpa batas akhir"}</td><td>{a.notes ?? "—"}</td>
        </tr>)}</tbody>
       </table></div>}
      <p className="workspaceFoot">Akses OWNER / ADMIN, data tenant-scoped, dan seluruh pembuatan pola serta penugasan dicatat pada audit log. Perhitungan keterlambatan berdasarkan shift menjadi tahap integrasi berikutnya.</p>
    </section>
  </main>;
}
