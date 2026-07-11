import { eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { debts, payments } from "../db/schema.js";

export async function createDebt(params: {
  customerId: string;
  merchantId: string;
  amountCents: number;
  description?: string;
}) {
  const [created] = await db
    .insert(debts)
    .values({
      customerId: params.customerId,
      merchantId: params.merchantId,
      amountCents: params.amountCents,
      description: params.description,
    })
    .returning();

  return created;
}

/** Saldo devedor = soma de todas as dividas menos soma de todos os pagamentos do cliente. */
export async function getCustomerBalanceCents(customerId: string): Promise<number> {
  const [debtSum] = await db
    .select({ total: sql<number>`coalesce(sum(${debts.amountCents}), 0)::int` })
    .from(debts)
    .where(eq(debts.customerId, customerId));

  const [paymentSum] = await db
    .select({ total: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` })
    .from(payments)
    .where(eq(payments.customerId, customerId));

  return (debtSum?.total ?? 0) - (paymentSum?.total ?? 0);
}
