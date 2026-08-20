import { listMerchants } from "../domain/merchants.js";
import { getDebtsDueTodayForMerchant, markDueReminderSent, type DueTodayDebt } from "../domain/dueDates.js";
import { getCustomerBalanceCents } from "../domain/debts.js";
import { buildCollectionMessage } from "./weeklyCollectionReminder.js";
import { sendProactiveMessage } from "../whatsapp/client.js";
import { formatBRL } from "../utils/currency.js";
import { buildWhatsAppLink } from "../utils/phone.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

function buildDueTodayLine(debt: DueTodayDebt, businessName: string | null): string {
  if (!debt.customerPhone) {
    return `❓ Sem telefone salvo. Manda assim: telefone do ${debt.customerName}, DDD e número`;
  }

  return buildWhatsAppLink(
    debt.customerPhone,
    buildCollectionMessage(businessName, { name: debt.customerName, balanceCents: debt.amountCents })
  );
}

function buildDueTodayMessage(businessName: string | null, debt: DueTodayDebt): string {
  const descriptionPart = debt.description ? ` (${debt.description})` : "";
  const header = `🔔 *A dívida de ${debt.customerName} vence hoje*\n\n${formatBRL(debt.amountCents)}${descriptionPart}`;
  const line = buildDueTodayLine(debt, businessName);
  return debt.customerPhone ? `${header}\n👉 ${line}` : `${header}\n\n${line}`;
}

/** Roda todo dia: avisa o comerciante sobre dividas que vencem hoje, uma vez cada. */
export async function runDueDateReminders(): Promise<void> {
  const merchants = await listMerchants();

  for (const merchant of merchants) {
    try {
      const dueToday = await getDebtsDueTodayForMerchant(merchant.id);

      for (const debt of dueToday) {
        const balanceCents = await getCustomerBalanceCents(debt.customerId, debt.customerBalanceResetAt);

        if (balanceCents <= 0) {
          // Cliente ja quitou tudo - nao faz sentido lembrar dessa divida especifica.
          await markDueReminderSent(debt.debtId);
          continue;
        }

        const descriptionPart = debt.description ? ` (${debt.description})` : "";

        await sendProactiveMessage(merchant.whatsappPhone, {
          templateName: env.WHATSAPP_TEMPLATE_DUE_REMINDER,
          templateParams: [
            debt.customerName,
            `${formatBRL(debt.amountCents)}${descriptionPart}`,
            buildDueTodayLine(debt, merchant.businessName),
          ],
          fallbackText: buildDueTodayMessage(merchant.businessName, debt),
        });

        await markDueReminderSent(debt.debtId);
      }
    } catch (err) {
      logger.error("Erro ao processar lembrete de vencimento de um merchant", {
        merchantId: merchant.id,
        error: err instanceof Error ? err.message : err,
      });
    }
  }
}
