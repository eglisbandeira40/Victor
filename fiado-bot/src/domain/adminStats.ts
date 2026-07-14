import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client.js";
import { merchants } from "../db/schema.js";
import { formatPhoneDisplay } from "../utils/phone.js";

export type MerchantRow = typeof merchants.$inferSelect;

export const NEW_MERCHANT_WINDOW_DAYS = 7;
export const TRIAL_ALERT_WINDOW_DAYS = 2;

export async function getRecentMerchants(days: number): Promise<MerchantRow[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return db.query.merchants.findMany({
    where: gte(merchants.createdAt, since),
    orderBy: desc(merchants.createdAt),
  });
}

/** Merchants em trial cujo vencimento cai dentro dos proximos `days` dias (ainda nao vencido). */
export async function getMerchantsWithTrialEndingSoon(days: number): Promise<MerchantRow[]> {
  const now = new Date();
  const limit = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return db.query.merchants.findMany({
    where: and(eq(merchants.plan, "trial"), gte(merchants.trialEndsAt, now), lte(merchants.trialEndsAt, limit)),
    orderBy: merchants.trialEndsAt,
  });
}

export async function getAllMerchantsOrdered(): Promise<MerchantRow[]> {
  return db.query.merchants.findMany({ orderBy: desc(merchants.createdAt) });
}

export interface MerchantStats {
  trial: number;
  active: number;
  blocked: number;
  total: number;
}

export async function getMerchantStats(): Promise<MerchantStats> {
  const rows = await db.query.merchants.findMany({ columns: { plan: true } });
  const stats: MerchantStats = { trial: 0, active: 0, blocked: 0, total: rows.length };

  for (const row of rows) {
    if (row.plan === "trial") stats.trial++;
    else if (row.plan === "active") stats.active++;
    else if (row.plan === "blocked") stats.blocked++;
  }

  return stats;
}

function planLabel(plan: string): string {
  if (plan === "active") return "✅ Ativo";
  if (plan === "blocked") return "🔒 Bloqueado";
  return "🕐 Trial";
}

function merchantLine(m: MerchantRow): string {
  const name = m.businessName ?? "(sem nome)";
  const phone = formatPhoneDisplay(m.whatsappPhone);
  const date = m.createdAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${name} — ${phone}\n${planLabel(m.plan)} — desde ${date}`;
}

export function formatRecentMerchantsMessage(rows: MerchantRow[], days: number): string {
  if (rows.length === 0) return `Nenhum comerciante novo nos últimos ${days} dias.`;

  const lines = rows.map((m, i) => `${i + 1}) ${merchantLine(m)}`);
  return `🆕 *Novos comerciantes (${days} dias)*\n\n${lines.join("\n\n")}\n\nTotal: ${rows.length}`;
}

export function formatTrialEndingMessage(rows: MerchantRow[], days: number): string {
  if (rows.length === 0) return `Nenhum trial vencendo nos próximos ${days} dias.`;

  const lines = rows.map((m, i) => {
    const daysLeft = m.trialEndsAt
      ? Math.max(0, Math.ceil((m.trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
      : 0;
    const name = m.businessName ?? "(sem nome)";
    const phone = formatPhoneDisplay(m.whatsappPhone);
    const venceEm = daysLeft === 0 ? "hoje" : `${daysLeft} dia(s)`;
    return `${i + 1}) ${name} — ${phone}\nVence em ${venceEm}`;
  });

  return `⏳ *Trials vencendo (${days} dias)*\n\n${lines.join("\n\n")}\n\nTotal: ${rows.length}`;
}

export function formatAllMerchantsMessage(rows: MerchantRow[]): string {
  if (rows.length === 0) return "Nenhum comerciante cadastrado ainda.";

  const lines = rows.map((m, i) => `${i + 1}) ${merchantLine(m)}`);
  return `📋 *Todos os comerciantes*\n\n${lines.join("\n\n")}\n\nTotal: ${rows.length}`;
}

export function formatMerchantStatsMessage(stats: MerchantStats): string {
  return (
    `📊 *Resumo geral do Fiado*\n\n` +
    `🕐 Trial: ${stats.trial}\n` +
    `✅ Ativo: ${stats.active}\n` +
    `🔒 Bloqueado: ${stats.blocked}\n\n` +
    `Total: ${stats.total} comerciante(s)`
  );
}
