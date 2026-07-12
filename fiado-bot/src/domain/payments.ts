import { db } from "../db/client.js";
import { payments } from "../db/schema.js";

export async function createPayment(params: { customerId: string; merchantId: string; amountCents: number }) {
  const [created] = await db
    .insert(payments)
    .values({
      customerId: params.customerId,
      merchantId: params.merchantId,
      amountCents: params.amountCents,
    })
    .returning();

  return created;
}
