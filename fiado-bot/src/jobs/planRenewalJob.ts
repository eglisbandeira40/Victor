import { getActiveMerchantsDueForRenewalWarning, getActiveMerchantsPastRenewal } from "../domain/planRenewal.js";
import { setMerchantPlan, markPlanRenewalWarningSent } from "../domain/merchants.js";
import { buildPlanRenewalMessage } from "../handlers/messageHandler.js";
import { sendProactiveMessage } from "../whatsapp/client.js";
import { formatBRL } from "../utils/currency.js";
import { PLAN_PRICE_CENTS } from "../domain/adminStats.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

/** Roda todo dia: avisa quem esta a 3 dias do fim do ciclo mensal, uma vez por ciclo. */
export async function runPlanRenewalWarnings(): Promise<void> {
  const merchants = await getActiveMerchantsDueForRenewalWarning();

  for (const merchant of merchants) {
    try {
      await sendProactiveMessage(merchant.whatsappPhone, {
        templateName: env.WHATSAPP_TEMPLATE_PLAN_RENEWAL_WARNING,
        templateParams: [formatBRL(PLAN_PRICE_CENTS)],
        fallbackText:
          `⏳ Seu plano do Fiado vence em 3 dias.\n\n` +
          `Pra não perder o acesso, deixa preparado um Pix de *${formatBRL(PLAN_PRICE_CENTS)}* — quando o ciclo fechar, ` +
          "eu mesmo gero a cobrança automática aqui.",
      });

      await markPlanRenewalWarningSent(merchant.id);
    } catch (err) {
      logger.error("Erro ao mandar aviso de renovacao de um merchant", {
        merchantId: merchant.id,
        error: err instanceof Error ? err.message : err,
      });
    }
  }
}

/** Roda todo dia: bloqueia quem passou dos 30 dias do ciclo pago e ja dispara a cobranca Pix automatica. */
export async function runPlanExpirations(): Promise<void> {
  const merchants = await getActiveMerchantsPastRenewal();

  for (const merchant of merchants) {
    try {
      await setMerchantPlan(merchant.id, "blocked");
      const text = await buildPlanRenewalMessage(merchant);

      await sendProactiveMessage(merchant.whatsappPhone, {
        templateName: env.WHATSAPP_TEMPLATE_PLAN_EXPIRED,
        templateParams: [],
        fallbackText: text,
      });
    } catch (err) {
      logger.error("Erro ao processar vencimento de ciclo mensal de um merchant", {
        merchantId: merchant.id,
        error: err instanceof Error ? err.message : err,
      });
    }
  }
}
