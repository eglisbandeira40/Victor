import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { customers } from "../db/schema.js";

export async function getOrCreateCustomer(merchantId: string, name: string) {
  const existing = await db.query.customers.findFirst({
    where: and(eq(customers.merchantId, merchantId), sql`lower(${customers.name}) = lower(${name})`),
  });

  if (existing) return existing;

  // Conflito so pode vir do indice unico (merchant_id, lower(name)) - nao ha outra constraint aqui.
  const [created] = await db.insert(customers).values({ merchantId, name }).onConflictDoNothing().returning();

  if (created) return created;

  const fallback = await db.query.customers.findFirst({
    where: and(eq(customers.merchantId, merchantId), sql`lower(${customers.name}) = lower(${name})`),
  });

  if (!fallback) throw new Error(`Nao foi possivel obter/criar cliente "${name}" para merchant ${merchantId}`);
  return fallback;
}

export async function setCustomerPhone(customerId: string, phone: string) {
  const [updated] = await db
    .update(customers)
    .set({ phone, updatedAt: new Date() })
    .where(eq(customers.id, customerId))
    .returning();

  return updated;
}
