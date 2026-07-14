import { getMerchantsWithTrialEndingSoon, formatTrialEndingMessage, TRIAL_ALERT_WINDOW_DAYS } from "../domain/adminStats.js";
import { sendWhatsAppText } from "../whatsapp/client.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

/** Roda todo dia: manda pro admin um resumo de trials vencendo nos proximos dias, se houver algum. */
export async function runAdminTrialAlert(): Promise<void> {
  try {
    const rows = await getMerchantsWithTrialEndingSoon(TRIAL_ALERT_WINDOW_DAYS);
    if (rows.length === 0) return;

    await sendWhatsAppText(env.ADMIN_WHATSAPP_PHONE, formatTrialEndingMessage(rows, TRIAL_ALERT_WINDOW_DAYS));
  } catch (err) {
    logger.error("Erro ao mandar alerta de trials vencendo pro admin", {
      error: err instanceof Error ? err.message : err,
    });
  }
}
