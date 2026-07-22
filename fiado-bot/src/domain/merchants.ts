import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { merchants, type PendingAction } from "../db/schema.js";

export interface GetOrCreateMerchantResult {
  merchant: typeof merchants.$inferSelect;
  isNew: boolean;
}

/**
 * `profileName` vem do campo `contacts[].profile.name` que o WhatsApp manda em todo webhook - o nome de
 * exibicao da pessoa. Usado como business_name inicial pra nao ficar "(sem nome)" sem o comerciante
 * precisar fazer nada.
 */
export async function getOrCreateMerchant(
  whatsappPhone: string,
  profileName?: string
): Promise<GetOrCreateMerchantResult> {
  const existing = await db.query.merchants.findFirst({
    where: eq(merchants.whatsappPhone, whatsappPhone),
  });

  if (existing) return { merchant: existing, isNew: false };

  const [created] = await db
    .insert(merchants)
    .values({ whatsappPhone, businessName: profileName })
    .onConflictDoNothing({ target: merchants.whatsappPhone })
    .returning();

  if (created) return { merchant: created, isNew: true };

  // Corrida rara: outra requisicao criou entre o SELECT e o INSERT.
  const fallback = await db.query.merchants.findFirst({
    where: eq(merchants.whatsappPhone, whatsappPhone),
  });

  if (!fallback) throw new Error(`Nao foi possivel obter/criar merchant para ${whatsappPhone}`);
  return { merchant: fallback, isNew: false };
}

export async function listMerchants() {
  return db.select().from(merchants);
}

export async function setPendingAction(merchantId: string, action: PendingAction | null) {
  await db.update(merchants).set({ pendingAction: action, updatedAt: new Date() }).where(eq(merchants.id, merchantId));
}

export async function findMerchantByPhone(whatsappPhone: string) {
  const found = await db.query.merchants.findFirst({ where: eq(merchants.whatsappPhone, whatsappPhone) });
  return found ?? null;
}

export async function findMerchantById(id: string) {
  const found = await db.query.merchants.findFirst({ where: eq(merchants.id, id) });
  return found ?? null;
}

/** plan: "trial" | "active" | "lifetime" | "blocked". Vira "active"/"lifetime" grava plan_activated_at (carteira/faturamento). */
export async function setMerchantPlan(merchantId: string, plan: string) {
  const extra = plan === "active" || plan === "lifetime" ? { planActivatedAt: new Date() } : {};
  await db.update(merchants).set({ plan, updatedAt: new Date(), ...extra }).where(eq(merchants.id, merchantId));
}

/** Preenche business_name com o nome de exibicao do WhatsApp pra merchant antigo que ainda esta "(sem nome)". */
export async function backfillBusinessNameIfMissing(merchantId: string, profileName: string): Promise<void> {
  await db
    .update(merchants)
    .set({ businessName: profileName, updatedAt: new Date() })
    .where(and(eq(merchants.id, merchantId), isNull(merchants.businessName)));
}

export async function setBusinessName(merchantId: string, businessName: string): Promise<void> {
  await db.update(merchants).set({ businessName, updatedAt: new Date() }).where(eq(merchants.id, merchantId));
}

export async function setAsaasCustomerId(merchantId: string, asaasCustomerId: string): Promise<void> {
  await db.update(merchants).set({ asaasCustomerId, updatedAt: new Date() }).where(eq(merchants.id, merchantId));
}

export async function setCpfCnpj(merchantId: string, cpfCnpj: string): Promise<void> {
  await db.update(merchants).set({ cpfCnpj, updatedAt: new Date() }).where(eq(merchants.id, merchantId));
}

/** Cacheia o copia-e-cola da cobranca Pix gerada, pra reaproveitar em vez de criar cobranca nova a cada mensagem. */
export async function cachePendingPix(merchantId: string, payload: string, expiresAt: Date): Promise<void> {
  await db
    .update(merchants)
    .set({ pendingPixPayload: payload, pendingPixExpiresAt: expiresAt, updatedAt: new Date() })
    .where(eq(merchants.id, merchantId));
}
