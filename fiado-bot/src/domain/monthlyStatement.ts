import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { customers, debts, payments } from "../db/schema.js";
import { formatBRL } from "../utils/currency.js";

export interface MonthlyStatementEntry {
  customerId: string;
  name: string;
  paidMonthCents: number;
  remainingCents: number;
}

export interface MonthlyStatement {
  entries: MonthlyStatementEntry[];
  totalPaidMonthCents: number;
  totalRemainingCents: number;
}

/** Extrato do mes corrente: quanto cada cliente pagou nesse mes e quanto ainda falta (saldo atual). */
export async function getMonthlyStatement(merchantId: string): Promise<MonthlyStatement> {
  const rows = await db.execute<{
    customer_id: string;
    name: string;
    paid_month_cents: number;
    remaining_cents: number;
  }>(sql`
    select
      c.id as customer_id,
      c.name as name,
      coalesce(p_month.total_paid_month, 0)::int as paid_month_cents,
      (coalesce(d.total_debt, 0) - coalesce(p_all.total_paid, 0))::int as remaining_cents
    from ${customers} c
    left join lateral (
      select sum(amount_cents) as total_debt
      from ${debts}
      where merchant_id = ${merchantId}
        and customer_id = c.id
        and created_at > coalesce(c.balance_reset_at, '-infinity'::timestamptz)
    ) d on true
    left join lateral (
      select sum(amount_cents) as total_paid
      from ${payments}
      where merchant_id = ${merchantId}
        and customer_id = c.id
        and created_at > coalesce(c.balance_reset_at, '-infinity'::timestamptz)
    ) p_all on true
    left join lateral (
      select sum(amount_cents) as total_paid_month
      from ${payments}
      where merchant_id = ${merchantId}
        and customer_id = c.id
        and created_at >= date_trunc('month', now())
    ) p_month on true
    where c.merchant_id = ${merchantId}
      and (
        coalesce(d.total_debt, 0) - coalesce(p_all.total_paid, 0) > 0
        or coalesce(p_month.total_paid_month, 0) > 0
      )
    order by remaining_cents desc
  `);

  const entries = rows.map((row) => ({
    customerId: row.customer_id,
    name: row.name,
    paidMonthCents: row.paid_month_cents,
    remainingCents: row.remaining_cents,
  }));

  return {
    entries,
    totalPaidMonthCents: entries.reduce((sum, e) => sum + e.paidMonthCents, 0),
    totalRemainingCents: entries.reduce((sum, e) => sum + e.remainingCents, 0),
  };
}

export function formatMonthlyStatement(statement: MonthlyStatement): string {
  const monthLabel = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const capitalizedMonth = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  if (statement.entries.length === 0) {
    return `🧾 *Extrato de ${capitalizedMonth}*\n\nNada pago nem em aberto esse mês ainda.`;
  }

  const lines = statement.entries.map(
    (e) => `${e.name} — pagou ${formatBRL(e.paidMonthCents)} | falta ${formatBRL(e.remainingCents)}`
  );

  return (
    `🧾 *Extrato de ${capitalizedMonth}*\n\n${lines.join("\n")}\n\n` +
    `Total pago no mês: ${formatBRL(statement.totalPaidMonthCents)}\n` +
    `Total em aberto: ${formatBRL(statement.totalRemainingCents)}`
  );
}
