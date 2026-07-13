import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { customers } from "../db/schema.js";

export async function getOrCreateCustomer(merchantId: string, name: string) {
  const existing = await db.query.customers.findFirst({
    where: and(eq(customers.merchantId, merchantId), sql`lower(unaccent(${customers.name})) = lower(unaccent(${name}))`),
  });

  if (existing) return existing;

  // Conflito so pode vir do indice unico (merchant_id, lower(name)) - nao ha outra constraint aqui.
  const [created] = await db.insert(customers).values({ merchantId, name }).onConflictDoNothing().returning();

  if (created) return created;

  const fallback = await db.query.customers.findFirst({
    where: and(eq(customers.merchantId, merchantId), sql`lower(unaccent(${customers.name})) = lower(unaccent(${name}))`),
  });

  if (!fallback) throw new Error(`Nao foi possivel obter/criar cliente "${name}" para merchant ${merchantId}`);
  return fallback;
}

export async function findCustomerByName(merchantId: string, name: string) {
  const found = await db.query.customers.findFirst({
    where: and(eq(customers.merchantId, merchantId), sql`lower(unaccent(${customers.name})) = lower(unaccent(${name}))`),
  });
  return found ?? null;
}

export async function registerCustomer(customerId: string, phone: string) {
  const [updated] = await db
    .update(customers)
    .set({ phone, updatedAt: new Date() })
    .where(eq(customers.id, customerId))
    .returning();

  return updated;
}

export async function setCustomerInstallments(customerId: string, installments: number) {
  const [updated] = await db
    .update(customers)
    .set({ installments, updatedAt: new Date() })
    .where(eq(customers.id, customerId))
    .returning();

  return updated;
}

/** "Exclui" a conta antiga de um cliente sem apagar nada: dividas/pagamentos anteriores a este momento
 * deixam de contar pro saldo atual, mas continuam no banco pra consulta futura. */
export async function archiveCustomerBalance(customerId: string) {
  const [updated] = await db
    .update(customers)
    .set({ balanceResetAt: new Date(), installments: null, updatedAt: new Date() })
    .where(eq(customers.id, customerId))
    .returning();

  return updated;
}
