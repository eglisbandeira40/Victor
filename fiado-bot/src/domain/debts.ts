import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { customers, debts, payments } from "../db/schema.js";

export async function createDebt(params: {
  customerId: string;
  merchantId: string;
  amountCents: number;
  description?: string;
  dueDate?: string;
  createdByPhone?: string;
}) {
  const [created] = await db
    .insert(debts)
    .values({
      customerId: params.customerId,
      merchantId: params.merchantId,
      amountCents: params.amountCents,
      description: params.description,
      dueDate: params.dueDate,
      createdByPhone: params.createdByPhone,
    })
    .returning();

  return created;
}

/**
 * Saldo devedor = soma de todas as dividas menos soma de todos os pagamentos do cliente.
 * Se `since` for informado (data em que a conta antiga foi arquivada), so conta o que aconteceu depois.
 */
export async function getCustomerBalanceCents(customerId: string, since?: Date | null): Promise<number> {
  const debtWhere = since
    ? and(eq(debts.customerId, customerId), gt(debts.createdAt, since))
    : eq(debts.customerId, customerId);

  const paymentWhere = since
    ? and(eq(payments.customerId, customerId), gt(payments.createdAt, since))
    : eq(payments.customerId, customerId);

  const [debtSum] = await db
    .select({ total: sql<number>`coalesce(sum(${debts.amountCents}), 0)::int` })
    .from(debts)
    .where(debtWhere);

  const [paymentSum] = await db
    .select({ total: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` })
    .from(payments)
    .where(paymentWhere);

  return (debtSum?.total ?? 0) - (paymentSum?.total ?? 0);
}

export interface OverdueCustomer {
  customerId: string;
  name: string;
  phone: string | null;
  balanceCents: number;
  daysOverdue: number;
}

/** Clientes com saldo em aberto cuja divida mais antiga (depois de balance_reset_at) passou de `minDays` dias. */
export async function getOverdueCustomersForMerchant(
  merchantId: string,
  minDays: number
): Promise<OverdueCustomer[]> {
  const rows = await db.execute<{
    customer_id: string;
    name: string;
    phone: string | null;
    balance_cents: number;
    days_overdue: number;
  }>(sql`
    select
      c.id as customer_id,
      c.name as name,
      c.phone as phone,
      (coalesce(d.total_debt, 0) - coalesce(p.total_paid, 0))::int as balance_cents,
      extract(day from now() - d.oldest_debt_at)::int as days_overdue
    from ${customers} c
    join lateral (
      select sum(amount_cents) as total_debt, min(created_at) as oldest_debt_at
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
    ) p on true
    where c.merchant_id = ${merchantId}
      and d.oldest_debt_at is not null
      and (coalesce(d.total_debt, 0) - coalesce(p.total_paid, 0)) > 0
      and d.oldest_debt_at <= now() - make_interval(days => ${minDays})
    order by d.oldest_debt_at asc
  `);

  return rows.map((row) => ({
    customerId: row.customer_id,
    name: row.name,
    phone: row.phone,
    balanceCents: row.balance_cents,
    daysOverdue: row.days_overdue,
  }));
}

export interface CustomerBalance {
  customerId: string;
  name: string;
  balanceCents: number;
}

/** Saldo (positivo, zero ou negativo) de cada cliente do merchant, respeitando balance_reset_at. */
export async function getCustomerBalancesForMerchant(merchantId: string): Promise<CustomerBalance[]> {
  const rows = await db.execute<{ customer_id: string; name: string; balance_cents: number }>(sql`
    select
      c.id as customer_id,
      c.name as name,
      (coalesce(d.total_debt, 0) - coalesce(p.total_paid, 0))::int as balance_cents
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
    ) p on true
    where c.merchant_id = ${merchantId}
  `);

  return rows.map((row) => ({
    customerId: row.customer_id,
    name: row.name,
    balanceCents: row.balance_cents,
  }));
}
