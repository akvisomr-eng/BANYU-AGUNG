import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { SignOutButton } from "../sign-out-button";
import { createEmployee } from "./actions";

export const dynamic = "force-dynamic";

type Employee = {
  id: string;
  employee_number: string;
  full_name: string;
  department_name: string | null;
  site_name: string | null;
  job_title: string | null;
  employment_type: string | null;
  hire_date: string | null;
  employment_status: string;
};

type Option = { id: string; code: string; name: string };

const statusLabels: Record<string, string> = {
  active: "Aktif", leave: "Cuti", resigned: "Mengundurkan diri", terminated: "Berakhir",
};
const typeLabels: Record<string, string> = {
  permanent: "Tetap", contract: "Kontrak", daily: "Harian", intern: "Magang",
};

export default async function HRPage({ searchParams }: {
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

  const [employeesRaw, departmentsRaw, sitesRaw] = await Promise.all([
    sql`
      SELECT e.id, e.employee_number, e.full_name, d.name AS department_name,
        s.name AS site_name, e.job_title, e.employment_type, e.hire_date,
        e.employment_status
      FROM employees e
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN sites s ON s.id = e.site_id
      WHERE e.organization_id = ${actor.organization_id}::uuid
      ORDER BY e.employment_status, e.full_name
      LIMIT 500
    `,
    sql`SELECT id, code, name FROM departments
      WHERE organization_id = ${actor.organization_id}::uuid AND is_active = true
      ORDER BY name`,
    sql`SELECT id, code, name FROM sites
      WHERE organization_id = ${actor.organization_id}::uuid AND is_active = true
      ORDER BY name`,
  ]) as [Employee[], Option[], Option[]];
  const employees = employeesRaw;
  const departments = departmentsRaw;
  const sites = sitesRaw;
  const params = await searchParams;
  const activeCount = employees.filter((employee) => employee.employment_status === "active").length;

  return (
    <main className="workspace">
      <aside className="side">
        <Link className="brand" href="/">BANYU <span>AGUNG</span></Link>
        <p className="sideLabel">HUMAN RESOURCES</p>
        <Link className="sideLink" href="/workspace">← Ringkasan</Link>
        <Link className="sideActive" href="/workspace/hr">Data Karyawan</Link>
        <Link className="sideLink" href="/workspace/hr/operations">Absensi & Cuti</Link>
        <Link className="sideLink" href="/workspace/enterprise">Pusat Enterprise</Link>
        <Link className="sideLink" href="/workspace/setup">Master Lokasi</Link>
      </aside>
      <section className="workMain">
        <header className="workHeader">
          <div><p className="eyebrow">BANYU AGUNG / HUMAN RESOURCES</p><h1>Data Karyawan</h1>
            <p className="muted">Master pegawai lintas departemen dan lokasi · {actor.role_name}</p></div>
          <SignOutButton />
        </header>
        <div className="inventoryNotice">
          Tahap ini menyediakan registrasi dan direktori dasar karyawan. Data pribadi sensitif, kontrak, absensi,
          cuti, penggajian, BPJS, PPh 21, dan employee self-service belum termasuk dalam tahap ini.
          Hanya data karyawan nyata yang telah diverifikasi perusahaan yang boleh dimasukkan.
        </div>
        {params.created === "1" && <p className="authSuccess" role="status">Data karyawan berhasil disimpan dan dicatat dalam audit.</p>}
        {params.error && <p className="authError" role="alert">
          {params.error === "invalid" ? "Periksa nomor, nama, email, dan data formulir." :
            params.error === "scope" ? "Departemen atau lokasi tidak valid untuk organisasi ini." :
            "Nomor karyawan sudah digunakan atau data gagal disimpan."}
        </p>}
        <div className="metricGrid">
          <article className="metric"><span>Total karyawan terdaftar</span><strong>{employees.length}</strong><small>Data master organisasi</small></article>
          <article className="metric"><span>Karyawan aktif</span><strong>{activeCount}</strong><small>Status aktif pada master pegawai</small></article>
          <article className="metric"><span>Departemen aktif</span><strong>{departments.length}</strong><small>Referensi organisasi</small></article>
          <article className="metric"><span>Lokasi kerja aktif</span><strong>{sites.length}</strong><small>Site yang terdaftar</small></article>
        </div>
        <h2>Registrasi karyawan</h2>
        <section className="moduleCard">
          <form action={createEmployee} className="deliveryCreateForm">
            <label>Nomor karyawan<input name="employee_number" required maxLength={30} placeholder="EMP-0001" /></label>
            <label>Nama lengkap<input name="full_name" required maxLength={160} placeholder="Nama sesuai dokumen perusahaan" /></label>
            <label>Departemen<select name="department_id" defaultValue=""><option value="">Belum ditentukan</option>
              {departments.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
            <label>Lokasi kerja<select name="site_id" defaultValue=""><option value="">Belum ditentukan</option>
              {sites.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
            <label>Jabatan<input name="job_title" maxLength={120} placeholder="Jabatan" /></label>
            <label>Status hubungan kerja<select name="employment_type" required defaultValue="permanent">
              <option value="permanent">Tetap</option><option value="contract">Kontrak</option>
              <option value="daily">Harian</option><option value="intern">Magang</option>
            </select></label>
            <label>Tanggal mulai kerja<input name="hire_date" type="date" /></label>
            <label>Telepon<input name="phone" maxLength={40} placeholder="Nomor telepon kerja" /></label>
            <label>Email<input name="email" type="email" maxLength={254} placeholder="Email kerja" /></label>
            <button className="primary" type="submit">Simpan karyawan</button>
          </form>
        </section>
        <h2>Direktori karyawan</h2>
        {employees.length === 0 ? <div className="moduleCard"><strong>Belum ada data karyawan</strong>
          <small>Direktori akan terisi setelah data karyawan resmi dimasukkan.</small></div> :
          <div className="inventoryTableWrap"><table className="inventoryTable">
            <thead><tr><th>Nomor / Nama</th><th>Departemen</th><th>Jabatan</th><th>Lokasi</th><th>Hubungan kerja</th><th>Mulai kerja</th><th>Status</th></tr></thead>
            <tbody>{employees.map((employee) => <tr key={employee.id}>
              <td><strong>{employee.employee_number}</strong><small>{employee.full_name}</small></td>
              <td>{employee.department_name ?? "Belum ditentukan"}</td>
              <td>{employee.job_title ?? "—"}</td>
              <td>{employee.site_name ?? "Belum ditentukan"}</td>
              <td>{typeLabels[employee.employment_type ?? ""] ?? employee.employment_type ?? "—"}</td>
              <td>{employee.hire_date ? new Date(employee.hire_date).toLocaleDateString("id-ID") : "—"}</td>
              <td>{statusLabels[employee.employment_status] ?? employee.employment_status}</td>
            </tr>)}</tbody>
          </table></div>}
        <p className="workspaceFoot">Perubahan data master dilakukan oleh OWNER / ADMIN dan tercatat dalam audit log. Modul lanjutan: kontrak, payroll, approval bertingkat dan ESS.</p>
      </section>
    </main>
  );
}
