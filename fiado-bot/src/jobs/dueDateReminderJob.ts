import { listMerchants } from "../domain/merchants.js";
import { getDebtsDueTodayForMerchant, markDueReminderSent, type DueTodayDebt } from "../domain/dueDates.js";
import { getCustomerBalanceCents } from "../domain/debts.js";
import { buildCollectionMessage } from "./weeklyCollectionReminder.js";
import { sendWhatsAppText } from "../whatsapp/client.js";
import { formatBRL } from "../utils/currency.js";
import { buildWhatsAppLink } from "../utils/phone.js";
import { logger } from "../utils/logger.js";

function buildDueTodayMessage(businessName: string | null, debt: DueTodayDebt): string {
  const descriptionPart = debt.description ? ` (${debt.description})` : "";
  const header = `🔔 *A dívida de ${debt.customerName} vence hoje*\n\n${formatBRL(debt.amountCents)}${descriptionPart}`;

  if (!debt.customerPhone) {
    return `${header}\n\n❓ Sem telefone salvo. Manda assim: telefone do ${debt.customerName}, DDD e número`;
  }

  const link = buildWhatsAppLink(
    debt.customerPhone,
    buildCollectionMessage(businessName, { name: debt.customerName, balanceCents: debt.amountCents })
  );
  return `${header}\n👉 ${link}`;
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

        await sendWhatsAppText(merchant.whatsappPhone, buildDueTodayMessage(merchant.businessName, debt));
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
