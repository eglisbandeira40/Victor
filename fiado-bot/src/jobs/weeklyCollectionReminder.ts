import { listMerchants } from "../domain/merchants.js";
import { getOverdueCustomersForMerchant, type OverdueCustomer } from "../domain/debts.js";
import { sendProactiveMessage } from "../whatsapp/client.js";
import { formatBRL } from "../utils/currency.js";
import { buildWhatsAppLink } from "../utils/phone.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export const OVERDUE_THRESHOLD_DAYS = 7;

export function buildCollectionMessage(
  businessName: string | null,
  customer: { name: string; balanceCents: number }
): string {
  const firstName = customer.name.split(" ")[0];
  const biz = businessName ? `da ${businessName}` : "do comércio";
  return (
    `Oi ${firstName}! Aqui é ${biz} 😊 Só passando pra lembrar que você tem uma continha de ` +
    `${formatBRL(customer.balanceCents)} em aberto aqui. Quando puder dar uma passada ou mandar um Pix, ` +
    `a gente agradece! 🙏`
  );
}

function buildOverdueLines(businessName: string | null, overdue: OverdueCustomer[]): string[] {
  return overdue.map((customer, i) => {
    const header = `${i + 1}) ${customer.name} — ${formatBRL(customer.balanceCents)} (${customer.daysOverdue} dias)`;

    if (!customer.phone) {
      return `${header}\n❓ Sem telefone salvo. Manda assim: telefone do ${customer.name}, DDD e número`;
    }

    const link = buildWhatsAppLink(customer.phone, buildCollectionMessage(businessName, customer));
    return `${header}\n👉 ${link}`;
  });
}

/** Lista de inadimplentes (7+ dias sem pagamento), cada um ja com link wa.me de cobranca pronto. */
export function buildOverdueList(businessName: string | null, overdue: OverdueCustomer[]): string {
  const lines = buildOverdueLines(businessName, overdue);
  const totalCents = overdue.reduce((sum, c) => sum + c.balanceCents, 0);

  return (
    `📋 *Clientes inadimplentes*\n\n` +
    `Esses clientes estão devendo há mais de ${OVERDUE_THRESHOLD_DAYS} dias:\n\n` +
    `${lines.join("\n\n")}\n\n` +
    `Total parado: ${formatBRL(totalCents)} com ${overdue.length} cliente(s)`
  );
}

export async function runWeeklyCollectionCheck(): Promise<void> {
  const merchants = await listMerchants();

  for (const merchant of merchants) {
    try {
      const overdue = await getOverdueCustomersForMerchant(merchant.id, OVERDUE_THRESHOLD_DAYS);
      if (overdue.length === 0) continue;

      const lines = buildOverdueLines(merchant.businessName, overdue);
      const totalCents = overdue.reduce((sum, c) => sum + c.balanceCents, 0);

      await sendProactiveMessage(merchant.whatsappPhone, {
        templateName: env.WHATSAPP_TEMPLATE_COLLECTION_ALERT,
        templateParams: [lines.join("\n\n"), formatBRL(totalCents)],
        fallbackText: buildOverdueList(merchant.businessName, overdue),
      });
    } catch (err) {
      logger.error("Erro ao processar cobranca semanal de um merchant", {
        merchantId: merchant.id,
        error: err instanceof Error ? err.message : err,
      });
    }
  }
}
