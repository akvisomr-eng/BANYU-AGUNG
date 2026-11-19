import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { SignOutButton } from "../sign-out-button";

export const dynamic = "force-dynamic";

const money = (value: number | string) =>
  Number(value || 0).toLocaleString("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

type RecentJournal = {
  journal_number: string;
  journal_date: string;
  description: string;
  total_debit: number | string;
  status: string;
};

export default async function ReportsPage() {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");
  const { sql } = await import("@/lib/db");
  const actors = await sql`
    SELECT p.organization_id, r.code AS role_code, r.name AS role_name
    FROM user_profiles p
    JOIN user_role_assignments a ON a.user_id = p.id
    JOIN roles r ON r.id = a.role_id
    WHERE p.auth_subject = ${session.user.id} AND p.status = 'active'
      AND r.code IN ('OWNER', 'ADMIN', 'FINANCE')
    ORDER BY CASE WHEN r.code = 'OWNER' THEN 0 WHEN r.code = 'ADMIN' THEN 1 ELSE 2 END
    LIMIT 1
  `;
  const actor = actors[0] as { organization_id: string; role_code: string; role_name: string } | undefined;
  if (!actor) redirect("/workspace?access=denied");

  const [salesRaw, deliveryRaw, receivablesRaw, payablesRaw, inventoryRaw, journalsRaw] = await Promise.all([
    sql`
      SELECT count(*)::int AS count, COALESCE(sum(total_amount), 0) AS amount
      FROM sales_orders
      WHERE organization_id = ${actor.organization_id}::uuid
        AND order_date >= now() - interval '30 days' AND status <> 'cancelled'
    `,
    sql`
      SELECT count(*) FILTER (WHERE status = 'delivered')::int AS delivered,
        count(*) FILTER (WHERE status = 'dispatched')::int AS in_transit
      FROM deliveries
      WHERE organization_id = ${actor.organization_id}::uuid
        AND created_at >= now() - interval '30 days'
    `,
    sql`
      SELECT count(*)::int AS count, COALESCE(sum(total_amount - paid_amount), 0) AS amount
      FROM invoices
      WHERE organization_id = ${actor.organization_id}::uuid
        AND status IN ('posted', 'partially_paid', 'overdue')
    `,
    sql`
      SELECT count(*)::int AS count, COALESCE(sum(total_amount - paid_amount), 0) AS amount
      FROM supplier_bills
      WHERE organization_id = ${actor.organization_id}::uuid
        AND status IN ('posted', 'partially_paid')
    `,
    sql`
      SELECT COALESCE(sum(quantity_on_hand), 0) AS quantity,
        count(*)::int AS positions
      FROM inventory_balances
      WHERE organization_id = ${actor.organization_id}::uuid
    `,
    sql`
      SELECT journal_number, journal_date, description, total_debit, status
      FROM journal_entries
      WHERE organization_id = ${actor.organization_id}::uuid
        AND status = 'posted'
      ORDER BY journal_date DESC, posted_at DESC NULLS LAST
      LIMIT 12
    `
  ]);

  const sales = salesRaw[0] as { count: number; amount: number | string };
  const deliveries = deliveryRaw[0] as { delivered: number; in_transit: number };
  const receivables = receivablesRaw[0] as { count: number; amount: number | string };
  const payables = payablesRaw[0] as { count: number; amount: number | string };
  const inventory = inventoryRaw[0] as { quantity: number | string; positions: number };
  const journals = journalsRaw as RecentJournal[];

  return (
    <main className="workspace">
      <aside className="side">
        <Link className="brand" href="/">BANYU <span>AGUNG</span></Link>
        <p className="sideLabel">MANAGEMENT REPORTS</p>
        <Link className="sideLink" href="/workspace">← Ringkasan</Link>
        <Link className="sideLink" href="/workspace/enterprise">Pusat Enterprise</Link>
        <Link className="sideLink" href="/workspace/finance">Finance & Accounting</Link>
        <Link className="sideLink" href="/workspace/inventory">Inventory</Link>
        <Link className="sideActive" href="/workspace/reports">Pusat Laporan</Link>
      </aside>
      <section className="workMain">
        <header className="workHeader">
          <div>
            <p className="eyebrow">BANYU AGUNG / MANAGEMENT INFORMATION</p>
            <h1>Pusat Laporan</h1>
            <p className="muted">Ringkasan baca-saja lintas modul · {actor.role_name}</p>
          </div>
          <SignOutButton />
        </header>
        <div className="notice">
          Data berikut berasal dari transaksi dan jurnal yang tersimpan pada organisasi Anda. Penjualan dan pengiriman menampilkan aktivitas 30 hari terakhir; saldo piutang, utang, dan persediaan menampilkan posisi saat ini. Ringkasan ini belum menggantikan laporan keuangan resmi atau rekonsiliasi akhir periode.
        </div>
        <h2>Aktivitas 30 hari terakhir</h2>
        <div className="metricGrid">
          <article className="metric"><span>Pesanan penjualan</span><strong className="metricText">{sales.count}</strong><small>Nilai pesanan {money(sales.amount)} · bukan pendapatan terposting</small></article>
          <article className="metric"><span>Pengiriman selesai</span><strong className="metricText">{deliveries.delivered}</strong><small>{deliveries.in_transit} pengiriman masih dalam perjalanan</small></article>
        </div>
        <h2>Posisi keuangan saat ini</h2>
        <div className="metricGrid">
          <article className="metric"><span>Piutang terbuka</span><strong className="metricText">{money(receivables.amount)}</strong><small>{receivables.count} invoice posted / belum lunas</small></article>
          <article className="metric"><span>Utang pemasok terbuka</span><strong className="metricText">{money(payables.amount)}</strong><small>{payables.count} faktur posted / belum lunas</small></article>
          <article className="metric"><span>Posisi persediaan</span><strong className="metricText">{Number(inventory.quantity).toLocaleString("id-ID")}</strong><small>{inventory.positions} posisi saldo gudang · seluruh status mutu</small></article>
        </div>
        <h2>Jurnal terposting terbaru</h2>
        {journals.length === 0 ? (
          <article className="moduleCard"><strong>Belum ada jurnal terposting</strong><small>Jurnal akan muncul setelah transaksi atau jurnal manual disetujui dan diposting.</small></article>
        ) : (
          <div className="tableWrap">
            <table>
              <thead><tr><th>Tanggal</th><th>Nomor jurnal</th><th>Keterangan</th><th>Total debit</th><th>Status</th></tr></thead>
              <tbody>{journals.map((journal) => (
                <tr key={journal.journal_number}>
                  <td>{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" }).format(new Date(journal.journal_date))}</td>
                  <td>{journal.journal_number}</td>
                  <td>{journal.description}</td>
                  <td>{money(journal.total_debit)}</td>
                  <td>Posted</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <p className="workspaceFoot">
          <Link href="/workspace/finance">Buka buku besar</Link> · <Link href="/workspace/payables">Utang pemasok</Link> · <Link href="/workspace/invoices">Piutang pelanggan</Link>
        </p>
      </section>
    </main>
  );
}
