import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { payments } from "../db/schema.js";

export async function createPayment(params: {
  customerId: string;
  merchantId: string;
  amountCents: number;
  createdByPhone?: string;
}) {
  const [created] = await db
    .insert(payments)
    .values({
      customerId: params.customerId,
      merchantId: params.merchantId,
      amountCents: params.amountCents,
      createdByPhone: params.createdByPhone,
    })
    .returning();

  return created;
}

export interface LastPayment {
  id: string;
  amountCents: number;
  createdAt: Date;
}

/** Pagamento mais recente de um cliente (qualquer data), pra correcao de valor digitado errado. */
export async function getLastPaymentForCustomer(customerId: string): Promise<LastPayment | null> {
  const found = await db.query.payments.findFirst({
    where: eq(payments.customerId, customerId),
    orderBy: desc(payments.createdAt),
  });
  return found ?? null;
}

export async function updatePaymentAmount(paymentId: string, amountCents: number): Promise<void> {
  await db.update(payments).set({ amountCents }).where(eq(payments.id, paymentId));
}

export async function getReceivedSinceCents(merchantId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` })
    .from(payments)
    .where(and(eq(payments.merchantId, merchantId), gt(payments.createdAt, since)));

  return row?.total ?? 0;
}
