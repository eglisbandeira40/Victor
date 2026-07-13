import { listMerchants } from "../domain/merchants.js";
import { getMerchantSummary, formatSummaryMessage } from "../domain/summary.js";
import { sendProactiveMessage } from "../whatsapp/client.js";
import { formatBRL } from "../utils/currency.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

/** Manda o resumo geral (total em aberto, clientes devendo, recebido na semana) pra todo comerciante, sempre. */
export async function runWeeklySummaryBroadcast(): Promise<void> {
  const merchants = await listMerchants();

  for (const merchant of merchants) {
    try {
      const summary = await getMerchantSummary(merchant.id);

      await sendProactiveMessage(merchant.whatsappPhone, {
        templateName: env.WHATSAPP_TEMPLATE_WEEKLY_SUMMARY,
        templateParams: [
          formatBRL(summary.totalOpenCents),
          String(summary.debtorsCount),
          formatBRL(summary.receivedWeekCents),
        ],
        fallbackText: formatSummaryMessage(summary),
      });
    } catch (err) {
      logger.error("Erro ao mandar resumo semanal de um merchant", {
        merchantId: merchant.id,
        error: err instanceof Error ? err.message : err,
      });
    }
  }
}
