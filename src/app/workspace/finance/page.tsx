import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { SignOutButton } from "../sign-out-button";
import { createAccount, createJournal, postJournal } from "./actions";

export const dynamic = "force-dynamic";
type Account = { id: string; account_code: string; account_name: string; account_type: string; parent_id: string | null };
type Journal = { id: string; journal_number: string; journal_date: string; description: string; status: string; total_debit: string | number; total_credit: string | number; created_by_name: string | null };
type Balance = { account_code: string; account_name: string; account_type: string; debit: string | number; credit: string | number };
const money = (value: number | string) => Number(value || 0).toLocaleString("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const typeLabels: Record<string, string> = { asset: "Aset", liability: "Liabilitas", equity: "Ekuitas", revenue: "Pendapatan", expense: "Beban" };

export default async function FinancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");
  const { sql } = await import("@/lib/db");
  const actors = await sql`
    SELECT p.organization_id, r.code AS role_code, r.name AS role_name
    FROM user_profiles p JOIN user_role_assignments a ON a.user_id = p.id
    JOIN roles r ON r.id = a.role_id
    WHERE p.auth_subject = ${session.user.id} AND p.status = 'active'
      AND r.code IN ('OWNER', 'ADMIN', 'FINANCE')
    ORDER BY CASE WHEN r.code = 'OWNER' THEN 0 ELSE 1 END LIMIT 1
  `;
  const actor = actors[0] as { organization_id: string; role_code: string; role_name: string } | undefined;
  if (!actor) redirect("/workspace?access=denied");
  const [accountsRaw, journalsRaw, balancesRaw, arRaw, paymentRaw] = await Promise.all([
    sql`SELECT id, account_code, account_name, account_type, parent_id
        FROM chart_of_accounts WHERE organization_id = ${actor.organization_id}::uuid
        ORDER BY account_code LIMIT 300`,
    sql`SELECT j.id, j.journal_number, j.journal_date, j.description, j.status, j.total_debit, j.total_credit,
          p.full_name AS created_by_name
        FROM journal_entries j LEFT JOIN user_profiles p ON p.id = j.created_by
        WHERE j.organization_id = ${actor.organization_id}::uuid
        ORDER BY j.journal_date DESC, j.created_at DESC LIMIT 100`,
    sql`SELECT a.account_code, a.account_name, a.account_type,
          COALESCE(sum(CASE WHEN j.status = 'posted' THEN l.debit ELSE 0 END),0) AS debit,
          COALESCE(sum(CASE WHEN j.status = 'posted' THEN l.credit ELSE 0 END),0) AS credit
        FROM chart_of_accounts a
        LEFT JOIN journal_lines l ON l.account_id = a.id
        LEFT JOIN journal_entries j ON j.id = l.journal_entry_id AND j.organization_id = a.organization_id
        WHERE a.organization_id = ${actor.organization_id}::uuid AND a.is_active = true
        GROUP BY a.id ORDER BY a.account_code`,
    sql`SELECT count(*)::int AS count, COALESCE(sum(total_amount-paid_amount),0) AS outstanding
        FROM invoices WHERE organization_id = ${actor.organization_id}::uuid
          AND status IN ('posted','partially_paid','overdue')`,
    sql`SELECT count(*)::int AS count, COALESCE(sum(amount),0) AS amount
        FROM payments WHERE organization_id = ${actor.organization_id}::uuid AND status = 'settled' AND payment_type = 'customer_receipt'`
  ]);
  const accounts = accountsRaw as Account[];
  const journals = journalsRaw as Journal[];
  const balances = balancesRaw as Balance[];
  const ar = arRaw[0] as { count: number; outstanding: string | number };
  const payments = paymentRaw[0] as { count: number; amount: string | number };
  const params = await searchParams;
  const totalDebit = balances.reduce((sum, row) => sum + Number(row.debit), 0);
  const totalCredit = balances.reduce((sum, row) => sum + Number(row.credit), 0);
  return <main className="workspace">
    <aside className="side">
      <Link className="brand" href="/">BANYU <span>AGUNG</span></Link>
      <p className="sideLabel">FINANCE & ACCOUNTING</p>
      <Link className="sideLink" href="/workspace">← Ringkasan</Link>
      <Link className="sideActive" href="/workspace/finance">Keuangan</Link>
      <Link className="sideLink" href="/workspace/invoices">Piutang / Invoice</Link>
      <Link className="sideLink" href="/workspace/payables">Utang Pemasok</Link>
      <Link className="sideLink" href="/workspace/purchase-orders">Pembelian</Link>
      <Link className="sideLink" href="/workspace/finance/settings">Pemetaan Akun</Link>
      <Link className="sideLink" href="/workspace/reports">Laporan</Link>
    </aside>
    <section className="workMain">
      <header className="workHeader"><div><p className="eyebrow">BANYU AGUNG / FINANCE</p><h1>Keuangan & Akuntansi</h1><p className="muted">Buku besar hanya menghitung jurnal yang sudah diposting · {actor.role_name}</p></div><SignOutButton /></header>
      {params.account_created === "1" && <p className="authSuccess" role="status">Akun berhasil disimpan.</p>}
      {params.journal_created === "1" && <p className="authSuccess" role="status">Jurnal draft tersimpan. Periksa sebelum posting.</p>}
      {params.journal_posted === "1" && <p className="authSuccess" role="status">Jurnal berhasil diposting.</p>}
      {params.error && <p className="notice" role="alert">Transaksi tidak dapat diproses. Periksa data, hak akses, dan keseimbangan jurnal.</p>}
      <div className="metricGrid">
        <article className="metric"><span>Piutang invoice</span><strong className="metricText">{money(ar.outstanding)}</strong><small>{ar.count} invoice posted / belum lunas</small></article>
        <article className="metric"><span>Penerimaan settled</span><strong className="metricText">{money(payments.amount)}</strong><small>{payments.count} transaksi settled</small></article>
        <article className="metric"><span>Total debit buku besar</span><strong className="metricText">{money(totalDebit)}</strong><small>Jurnal posted</small></article>
        <article className="metric"><span>Total kredit buku besar</span><strong className="metricText">{money(totalCredit)}</strong><small>Jurnal posted</small></article>
      </div>
      <h2>Chart of Accounts</h2>
      <div className="moduleCard"><form action={createAccount} className="deliveryCreateForm">
        <label>Kode akun<input name="account_code" required maxLength={20} placeholder="1101" /></label>
        <label>Nama akun<input name="account_name" required maxLength={120} placeholder="Kas Operasional" /></label>
        <label>Kelompok<select name="account_type" required><option value="asset">Aset</option><option value="liability">Liabilitas</option><option value="equity">Ekuitas</option><option value="revenue">Pendapatan</option><option value="expense">Beban</option></select></label>
        <label>Akun induk<select name="parent_id"><option value="">Tanpa induk</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}</select></label>
        <button className="primary" type="submit">Tambah akun</button>
      </form></div>
      {accounts.length === 0 ? <p className="notice">Chart of Accounts kosong. Tambahkan akun sesuai kebijakan akuntansi perusahaan sebelum mencatat jurnal.</p> :
        <div className="tableWrap"><table><thead><tr><th>Kode</th><th>Nama akun</th><th>Kelompok</th></tr></thead><tbody>{accounts.map(a=><tr key={a.id}><td>{a.account_code}</td><td>{a.account_name}</td><td>{typeLabels[a.account_type] ?? a.account_type}</td></tr>)}</tbody></table></div>}
      <h2>Jurnal umum</h2>
      <div className="moduleCard">
        {accounts.length < 2 ? <p className="muted">Buat minimal dua akun aktif sebelum menyusun jurnal.</p> :
          <form action={createJournal} className="deliveryCreateForm">
            <label>Tanggal jurnal<input name="journal_date" type="date" required defaultValue={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" })} /></label>
            <label>Keterangan<input name="description" required maxLength={500} placeholder="Setoran modal awal" /></label>
            {[0,1,2,3].map(i=><div key={i} className="deliveryItem">
              <label>Akun<select name="account_id" required={i<2}><option value="">Pilih akun</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}</select></label>
              <label>Debit<input name="debit" type="number" min="0" step="0.01" defaultValue="0" /></label>
              <label>Kredit<input name="credit" type="number" min="0" step="0.01" defaultValue="0" /></label>
              <input type="hidden" name="line_description" value="" />
            </div>)}
            <button className="primary" type="submit">Simpan jurnal draft</button>
          </form>}
      </div>
      <h2>Neraca saldo — jurnal posted</h2>
      {balances.length === 0 ? <p className="notice">Belum ada saldo buku besar terposting.</p> :
        <div className="tableWrap"><table><thead><tr><th>Kode</th><th>Akun</th><th>Kelompok</th><th>Debit</th><th>Kredit</th></tr></thead><tbody>{balances.map(b=><tr key={b.account_code}><td>{b.account_code}</td><td>{b.account_name}</td><td>{typeLabels[b.account_type] ?? b.account_type}</td><td>{money(b.debit)}</td><td>{money(b.credit)}</td></tr>)}<tr><th colSpan={3}>Total</th><th>{money(totalDebit)}</th><th>{money(totalCredit)}</th></tr></tbody></table></div>}
      <h2>Daftar jurnal</h2>
      {journals.length === 0 ? <p className="notice">Belum ada jurnal.</p> :
        <div className="invoiceList">{journals.map(j=><article className="invoiceItem" key={j.id}>
          <div><span className="inquiryType">{j.journal_number} · {j.status}</span><h3>{j.description}</h3><small>{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" }).format(new Date(j.journal_date))} · {j.created_by_name ?? "Pengguna"}</small></div>
          <div className="invoiceAmount"><strong>{money(j.total_debit)}</strong><small>Debit = Kredit</small></div>
          {actor.role_code === "OWNER" && j.status === "draft" && <form action={postJournal}><input type="hidden" name="journal_id" value={j.id}/><button className="primary" type="submit">Posting jurnal</button></form>}
        </article>)}</div>}
      <p className="workspaceFoot"><Link href="/workspace">Kembali ke dashboard</Link> · Piutang dihitung dari invoice posted. Pengelolaan utang pemasok tersedia pada modul <Link href="/workspace/payables">Utang Pemasok</Link>. Atur jurnal otomatis melalui <Link href="/workspace/finance/settings">Pemetaan Akun</Link>.</p>
    </section>
  </main>;
}
