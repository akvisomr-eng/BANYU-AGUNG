"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";

async function getFinanceActor(ownerOnly = false) {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");
  const { sql } = await import("@/lib/db");
  const rows = await sql`
    SELECT p.id AS actor_id, p.organization_id, r.code AS role_code
    FROM user_profiles p
    JOIN user_role_assignments a ON a.user_id = p.id
    JOIN roles r ON r.id = a.role_id
    WHERE p.auth_subject = ${session.user.id} AND p.status = 'active'
      AND r.code IN ('OWNER', 'ADMIN')
    ORDER BY CASE WHEN r.code = 'OWNER' THEN 0 ELSE 1 END
    LIMIT 1
  `;
  const actor = rows[0] as { actor_id: string; organization_id: string; role_code: string } | undefined;
  if (!actor || (ownerOnly && actor.role_code !== "OWNER")) redirect("/workspace?access=denied");
  return { actor, sql };
}

export async function createAccount(formData: FormData) {
  const code = String(formData.get("account_code") ?? "").trim();
  const name = String(formData.get("account_name") ?? "").trim();
  const type = String(formData.get("account_type") ?? "");
  const parentId = String(formData.get("parent_id") ?? "").trim();
  if (!/^[0-9A-Za-z.-]{2,20}$/.test(code) || name.length < 2 || name.length > 120 ||
      !["asset", "liability", "equity", "revenue", "expense"].includes(type) ||
      (parentId && !/^[0-9a-f-]{36}$/i.test(parentId))) {
    redirect("/workspace/finance?error=account");
  }
  const { actor, sql } = await getFinanceActor();
  const result = await sql`
    WITH parent AS (
      SELECT id FROM chart_of_accounts
      WHERE id = ${parentId || null}::uuid
        AND organization_id = ${actor.organization_id}::uuid AND is_active = true
    ), created AS (
      INSERT INTO chart_of_accounts (organization_id, account_code, account_name, account_type, parent_id)
      SELECT ${actor.organization_id}::uuid, ${code}, ${name}, ${type},
        CASE WHEN ${parentId || null}::text IS NULL THEN NULL ELSE (SELECT id FROM parent) END
      WHERE ${parentId || null}::text IS NULL OR EXISTS (SELECT 1 FROM parent)
      RETURNING id, account_code
    ), logged AS (
      INSERT INTO audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
      SELECT ${actor.organization_id}::uuid, ${actor.actor_id}::uuid, 'CREATE', 'chart_of_account', id::text,
        jsonb_build_object('account_code', account_code)
      FROM created RETURNING id
    )
    SELECT id FROM created
  `;
  if (!result.length) redirect("/workspace/finance?error=parent");
  redirect("/workspace/finance?account_created=1");
}

export async function createJournal(formData: FormData) {
  const date = String(formData.get("journal_date") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const accountIds = formData.getAll("account_id").map(String);
  const debits = formData.getAll("debit").map(String);
  const credits = formData.getAll("credit").map(String);
  const descriptions = formData.getAll("line_description").map(String);
  const lines = accountIds.map((account_id, i) => ({
    account_id,
    debit: Number(debits[i] || 0),
    credit: Number(credits[i] || 0),
    description: (descriptions[i] || "").trim().slice(0, 180)
  })).filter(line => line.account_id || line.debit || line.credit);
  const debitTotal = lines.reduce((sum, line) => sum + line.debit, 0);
  const creditTotal = lines.reduce((sum, line) => sum + line.credit, 0);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || description.length < 3 || description.length > 500 ||
      lines.length < 2 || lines.length > 30 ||
      lines.some(line => !/^[0-9a-f-]{36}$/i.test(line.account_id) ||
        !Number.isFinite(line.debit) || !Number.isFinite(line.credit) ||
        line.debit < 0 || line.credit < 0 ||
        !((line.debit > 0 && line.credit === 0) || (line.credit > 0 && line.debit === 0))) ||
      Math.round(debitTotal * 100) !== Math.round(creditTotal * 100) || debitTotal <= 0) {
    redirect("/workspace/finance?error=journal");
  }
  const { actor, sql } = await getFinanceActor();
  const payload = JSON.stringify(lines);
  const result = await sql`
    WITH requested AS (
      SELECT * FROM jsonb_to_recordset(${payload}::jsonb)
      AS x(account_id uuid, debit numeric, credit numeric, description text)
    ), valid AS (
      SELECT r.* FROM requested r
      JOIN chart_of_accounts a ON a.id = r.account_id
      WHERE a.organization_id = ${actor.organization_id}::uuid AND a.is_active = true
        AND ((r.debit > 0 AND r.credit = 0) OR (r.credit > 0 AND r.debit = 0))
    ), totals AS (
      SELECT count(*)::int AS n, sum(debit) AS debit, sum(credit) AS credit FROM valid
    ), created AS (
      INSERT INTO journal_entries (
        organization_id, journal_number, journal_date, description, status,
        total_debit, total_credit, created_by
      )
      SELECT ${actor.organization_id}::uuid,
        'JU-' || to_char(${date}::date, 'YYYYMMDD') || '-' ||
          upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
        ${date}::date, ${description}, 'draft', t.debit, t.credit, ${actor.actor_id}::uuid
      FROM totals t
      WHERE t.n = ${lines.length} AND t.debit = t.credit AND t.debit > 0
      RETURNING id, organization_id, journal_number
    ), inserted AS (
      INSERT INTO journal_lines (journal_entry_id, account_id, description, debit, credit)
      SELECT c.id, v.account_id, v.description, v.debit, v.credit
      FROM created c CROSS JOIN valid v
      RETURNING id
    ), logged AS (
      INSERT INTO audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
      SELECT c.organization_id, ${actor.actor_id}::uuid, 'CREATE_DRAFT', 'journal_entry', c.id::text,
        jsonb_build_object('journal_number', c.journal_number, 'line_count', (SELECT count(*) FROM inserted))
      FROM created c RETURNING id
    )
    SELECT journal_number FROM created
  `;
  if (!result.length) redirect("/workspace/finance?error=accounts");
  redirect("/workspace/finance?journal_created=1");
}

export async function postJournal(formData: FormData) {
  const journalId = String(formData.get("journal_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(journalId)) redirect("/workspace/finance?error=post");
  const { actor, sql } = await getFinanceActor(true);
  const result = await sql`
    WITH updated AS (
      UPDATE journal_entries j SET status = 'posted', posted_by = ${actor.actor_id}::uuid
      WHERE j.id = ${journalId}::uuid AND j.organization_id = ${actor.organization_id}::uuid
        AND j.status = 'draft'
      RETURNING j.id, j.organization_id, j.journal_number, j.total_debit, j.total_credit
    ), logged AS (
      INSERT INTO audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
      SELECT organization_id, ${actor.actor_id}::uuid, 'POST', 'journal_entry', id::text,
        jsonb_build_object('journal_number', journal_number, 'total_debit', total_debit, 'total_credit', total_credit)
      FROM updated RETURNING id
    )
    SELECT journal_number FROM updated
  `;
  if (!result.length) redirect("/workspace/finance?error=post");
  redirect("/workspace/finance?journal_posted=1");
}


export async function saveAccountingConfig(formData: FormData) {
  const fields = [
    "accounts_receivable_id", "accounts_payable_id", "sales_revenue_id",
    "purchase_expense_id", "cash_account_id", "bank_account_id",
    "inventory_asset_id", "goods_received_not_invoiced_id", "cost_of_goods_sold_id"
  ] as const;
  const optionalFields = ["output_tax_id", "input_tax_id"] as const;
  const values = Object.fromEntries([...fields, ...optionalFields].map(key => [key, String(formData.get(key) ?? "").trim()]));
  if (fields.some(key => !/^[0-9a-f-]{36}$/i.test(values[key])) ||
      optionalFields.some(key => values[key] && !/^[0-9a-f-]{36}$/i.test(values[key]))) {
    redirect("/workspace/finance/settings?error=mapping");
  }
  const { actor, sql } = await getFinanceActor(true);
  const saved = await sql`
    INSERT INTO accounting_config (
      organization_id, accounts_receivable_id, accounts_payable_id,
      sales_revenue_id, purchase_expense_id, output_tax_id, input_tax_id,
      cash_account_id, bank_account_id, inventory_asset_id,
      goods_received_not_invoiced_id, cost_of_goods_sold_id, updated_by
    ) VALUES (
      ${actor.organization_id}::uuid, ${values.accounts_receivable_id}::uuid,
      ${values.accounts_payable_id}::uuid, ${values.sales_revenue_id}::uuid,
      ${values.purchase_expense_id}::uuid, ${values.output_tax_id || null}::uuid,
      ${values.input_tax_id || null}::uuid, ${values.cash_account_id}::uuid,
      ${values.bank_account_id}::uuid, ${values.inventory_asset_id}::uuid,
      ${values.goods_received_not_invoiced_id}::uuid, ${values.cost_of_goods_sold_id}::uuid,
      ${actor.actor_id}::uuid
    )
    ON CONFLICT (organization_id) DO UPDATE SET
      accounts_receivable_id = EXCLUDED.accounts_receivable_id,
      accounts_payable_id = EXCLUDED.accounts_payable_id,
      sales_revenue_id = EXCLUDED.sales_revenue_id,
      purchase_expense_id = EXCLUDED.purchase_expense_id,
      output_tax_id = EXCLUDED.output_tax_id,
      input_tax_id = EXCLUDED.input_tax_id,
      cash_account_id = EXCLUDED.cash_account_id,
      bank_account_id = EXCLUDED.bank_account_id,
      inventory_asset_id = EXCLUDED.inventory_asset_id,
      goods_received_not_invoiced_id = EXCLUDED.goods_received_not_invoiced_id,
      cost_of_goods_sold_id = EXCLUDED.cost_of_goods_sold_id,
      updated_by = EXCLUDED.updated_by,
      updated_at = now()
    RETURNING organization_id
  `;
  if (!saved.length) redirect("/workspace/finance/settings?error=mapping");
  redirect("/workspace/finance/settings?saved=1");
}
