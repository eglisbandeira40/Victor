import { eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { debts } from "../db/schema.js";

export interface DueTodayDebt {
  debtId: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  customerBalanceResetAt: Date | null;
  amountCents: number;
  description: string | null;
}

/** Dividas de um merchant que vencem hoje e ainda nao tiveram lembrete enviado. */
export async function getDebtsDueTodayForMerchant(merchantId: string): Promise<DueTodayDebt[]> {
  const rows = await db.execute<{
    debt_id: string;
    customer_id: string;
    customer_name: string;
    customer_phone: string | null;
    customer_balance_reset_at: string | null;
    amount_cents: number;
    description: string | null;
  }>(sql`
    select
      d.id as debt_id,
      c.id as customer_id,
      c.name as customer_name,
      c.phone as customer_phone,
      c.balance_reset_at as customer_balance_reset_at,
      d.amount_cents as amount_cents,
      d.description as description
    from debts d
    join customers c on c.id = d.customer_id
    where d.merchant_id = ${merchantId}
      and d.due_date = current_date
      and d.due_reminder_sent_at is null
    order by d.created_at asc
  `);

  return rows.map((row) => ({
    debtId: row.debt_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerBalanceResetAt: row.customer_balance_reset_at ? new Date(row.customer_balance_reset_at) : null,
    amountCents: row.amount_cents,
    description: row.description,
  }));
}

export async function markDueReminderSent(debtId: string): Promise<void> {
  await db.update(debts).set({ dueReminderSentAt: new Date() }).where(eq(debts.id, debtId));
}
