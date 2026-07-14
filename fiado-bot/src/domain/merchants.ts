import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { merchants, type PendingAction } from "../db/schema.js";

export interface GetOrCreateMerchantResult {
  merchant: typeof merchants.$inferSelect;
  isNew: boolean;
}

export async function getOrCreateMerchant(whatsappPhone: string): Promise<GetOrCreateMerchantResult> {
  const existing = await db.query.merchants.findFirst({
    where: eq(merchants.whatsappPhone, whatsappPhone),
  });

  if (existing) return { merchant: existing, isNew: false };

  const [created] = await db
    .insert(merchants)
    .values({ whatsappPhone })
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

/** plan: "trial" | "active" | "blocked". Vira "active" grava plan_activated_at (carteira/faturamento). */
export async function setMerchantPlan(merchantId: string, plan: string) {
  const extra = plan === "active" ? { planActivatedAt: new Date() } : {};
  await db.update(merchants).set({ plan, updatedAt: new Date(), ...extra }).where(eq(merchants.id, merchantId));
}
