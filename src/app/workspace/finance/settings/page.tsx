import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { SignOutButton } from "../../sign-out-button";
import { saveAccountingConfig, seedStandardChartOfAccounts } from "../actions";

export const dynamic = "force-dynamic";

type Account = { id: string; account_code: string; account_name: string; account_type: string };
type Config = {
  accounts_receivable_id: string | null; accounts_payable_id: string | null;
  sales_revenue_id: string | null; purchase_expense_id: string | null;
  output_tax_id: string | null; input_tax_id: string | null;
  cash_account_id: string | null; bank_account_id: string | null;
  inventory_asset_id: string | null; goods_received_not_invoiced_id: string | null;
  cost_of_goods_sold_id: string | null; inventory_opening_equity_id: string | null;
};

export default async function AccountingSettingsPage({
  searchParams
}: { searchParams: Promise<{ saved?: string; seeded?: string; error?: string }> }) {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");
  const { sql } = await import("@/lib/db");
  const actors = await sql`
    SELECT p.organization_id, r.code AS role_code, r.name AS role_name
    FROM user_profiles p
    JOIN user_role_assignments a ON a.user_id = p.id
    JOIN roles r ON r.id = a.role_id
    WHERE p.auth_subject = ${session.user.id} AND p.status = 'active'
      AND r.code IN ('OWNER','ADMIN')
    ORDER BY CASE WHEN r.code = 'OWNER' THEN 0 ELSE 1 END LIMIT 1
  `;
  const actor = actors[0] as { organization_id: string; role_code: string; role_name: string } | undefined;
  if (!actor || actor.role_code !== "OWNER") redirect("/workspace?access=denied");
  const [accountRows, configRows] = await Promise.all([
    sql`SELECT id,account_code,account_name,account_type FROM chart_of_accounts
      WHERE organization_id = ${actor.organization_id}::uuid AND is_active = true
      ORDER BY account_code`,
    sql`SELECT accounts_receivable_id,accounts_payable_id,sales_revenue_id,purchase_expense_id,
      output_tax_id,input_tax_id,cash_account_id,bank_account_id,
      inventory_asset_id,goods_received_not_invoiced_id,cost_of_goods_sold_id,inventory_opening_equity_id
      FROM accounting_config WHERE organization_id = ${actor.organization_id}::uuid`
  ]);
  const accounts = accountRows as Account[];
  const config = (configRows[0] ?? {}) as Config;
  const params = await searchParams;
  const fields = [
    { name: "accounts_receivable_id", label: "Piutang usaha", type: "asset", required: true },
    { name: "accounts_payable_id", label: "Utang usaha", type: "liability", required: true },
    { name: "sales_revenue_id", label: "Pendapatan penjualan", type: "revenue", required: true },
    { name: "purchase_expense_id", label: "Pembelian / biaya pemasok", type: "expense", required: true },
    { name: "output_tax_id", label: "Pajak keluaran (opsional)", type: "liability", required: false },
    { name: "input_tax_id", label: "Pajak masukan (opsional)", type: "asset", required: false },
    { name: "cash_account_id", label: "Kas", type: "asset", required: true },
    { name: "bank_account_id", label: "Bank", type: "asset", required: true },
    { name: "inventory_asset_id", label: "Persediaan", type: "asset", required: true },
    { name: "goods_received_not_invoiced_id", label: "GR/IR — Barang diterima belum ditagih", type: "liability", required: true },
    { name: "cost_of_goods_sold_id", label: "Harga Pokok Penjualan (HPP)", type: "expense", required: true },
    { name: "inventory_opening_equity_id", label: "Ekuitas saldo awal persediaan", type: "equity", required: true }
  ] as const;
  const ready = fields.filter(f => f.required).every(f => Boolean(config[f.name as keyof Config]));
  return <main className="workspace">
    <aside className="side">
      <Link className="brand" href="/">BANYU <span>AGUNG</span></Link>
      <p className="sideLabel">FINANCE & ACCOUNTING</p>
      <Link className="sideLink" href="/workspace">← Ringkasan</Link>
      <Link className="sideLink" href="/workspace/finance">Buku Besar</Link>
      <Link className="sideLink" href="/workspace/invoices">Piutang Pelanggan</Link>
      <Link className="sideLink" href="/workspace/payables">Utang Pemasok</Link>
      <Link className="sideActive" href="/workspace/finance/settings">Pemetaan Akun</Link>
    </aside>
    <section className="workMain">
      <header className="workHeader"><div><p className="eyebrow">BANYU AGUNG / ACCOUNTING CONTROL</p><h1>Pemetaan Akun Otomatis</h1><p className="muted">Pengaturan OWNER untuk jurnal otomatis penjualan, pembelian, valuasi persediaan, GR/IR, HPP, dan saldo awal.</p></div><SignOutButton /></header>
      {params.saved === "1" && <p className="authSuccess" role="status">Pemetaan akun berhasil disimpan.</p>}
      {params.seeded === "1" && <p className="authSuccess" role="status">12 akun standar dibuat atau dilengkapi. Pemetaan yang sudah ada tidak ditimpa.</p>}
      {params.error === "seed" && <p className="authError" role="alert">Template tidak dapat diterapkan. Periksa apakah kode akun standar sudah digunakan dengan tipe akun berbeda.</p>}
      <article className="moduleCard">
        <strong>Setup awal BANYU AGUNG</strong>
        <p className="muted">Buat atau lengkapi 12 akun dasar untuk kas, bank, piutang, persediaan, utang, GR/IR, pajak, ekuitas saldo awal, pendapatan, pembelian, dan HPP. Akun yang sudah ada dan pemetaan nonkosong tidak akan ditimpa.</p>
        <form action={seedStandardChartOfAccounts}>
          <button className="primary" type="submit">Buat / lengkapi akun standar</button>
        </form>
      </article>
      {params.error && <p className="authError" role="alert">Pemetaan tidak valid. Pastikan akun aktif, satu organisasi, dan memiliki tipe yang sesuai.</p>}
      <article className="moduleCard">
        <strong>{ready ? "Pemetaan inti sudah tersedia" : "Pemetaan akun belum lengkap"}</strong>
        <p className="muted">Invoice, penerimaan barang, faktur pemasok, dan pengiriman tidak dapat diposting sebelum akun wajib dipetakan. Setiap transaksi menghasilkan jurnal berimbang dalam transaksi database yang sama.</p>
      </article>
      {accounts.length === 0 ? <p className="notice">Buat akun pada Chart of Accounts terlebih dahulu.</p> :
      <form action={saveAccountingConfig} className="deliveryCreateForm">
        {fields.map(field => <label key={field.name}>{field.label}
          <select name={field.name} required={field.required} defaultValue={config[field.name as keyof Config] ?? ""}>
            <option value="">Pilih akun {field.required ? "(wajib)" : "(tidak digunakan)"}</option>
            {accounts.filter(a => a.account_type === field.type).map(a =>
              <option key={a.id} value={a.id}>{a.account_code} · {a.account_name}</option>
            )}
          </select>
        </label>)}
        <button className="primary" type="submit">Simpan pemetaan akun</button>
      </form>}
      <p className="workspaceFoot">Penerimaan barang mendebit Persediaan dan mengkredit GR/IR. Faktur pemasok yang terkait PO menghapus GR/IR; pengiriman mendebit HPP dan mengkredit Persediaan. Saldo awal lot lama diposting ke akun ekuitas setelah nilainya diverifikasi OWNER. <Link href="/workspace/finance">Kembali ke keuangan</Link></p>
    </section>
  </main>;
}
