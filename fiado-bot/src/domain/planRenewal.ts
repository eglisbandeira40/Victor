import { and, eq, isNull, lte, gt } from "drizzle-orm";
import { db } from "../db/client.js";
import { merchants } from "../db/schema.js";

export type MerchantRow = typeof merchants.$inferSelect;

/** Duracao do ciclo do plano pago e quantos dias antes do fim avisamos o comerciante. */
export const PLAN_RENEWAL_DAYS = 30;
export const PLAN_RENEWAL_WARNING_DAYS = 3;

/** Ativos que entraram na janela de aviso (faltam <= 3 dias pro fim do ciclo) e ainda nao foram avisados. */
export async function getActiveMerchantsDueForRenewalWarning(): Promise<MerchantRow[]> {
  const warningStart = new Date(Date.now() - (PLAN_RENEWAL_DAYS - PLAN_RENEWAL_WARNING_DAYS) * 24 * 60 * 60 * 1000);
  const cycleEnd = new Date(Date.now() - PLAN_RENEWAL_DAYS * 24 * 60 * 60 * 1000);

  return db.query.merchants.findMany({
    where: and(
      eq(merchants.plan, "active"),
      lte(merchants.planActivatedAt, warningStart),
      gt(merchants.planActivatedAt, cycleEnd),
      isNull(merchants.planRenewalWarningSentAt)
    ),
  });
}

/** Ativos cujo ciclo de 30 dias ja acabou - hora de bloquear e cobrar de novo. */
export async function getActiveMerchantsPastRenewal(): Promise<MerchantRow[]> {
  const cycleEnd = new Date(Date.now() - PLAN_RENEWAL_DAYS * 24 * 60 * 60 * 1000);

  return db.query.merchants.findMany({
    where: and(eq(merchants.plan, "active"), lte(merchants.planActivatedAt, cycleEnd)),
  });
}
