import { getCustomerBalancesForMerchant } from "./debts.js";
import { getReceivedSinceCents } from "./payments.js";
import { formatBRL } from "../utils/currency.js";

export interface MerchantSummary {
  totalOpenCents: number;
  debtorsCount: number;
  receivedWeekCents: number;
}

export async function getMerchantSummary(merchantId: string): Promise<MerchantSummary> {
  const balances = await getCustomerBalancesForMerchant(merchantId);
  const debtors = balances.filter((b) => b.balanceCents > 0);
  const totalOpenCents = debtors.reduce((sum, d) => sum + d.balanceCents, 0);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const receivedWeekCents = await getReceivedSinceCents(merchantId, sevenDaysAgo);

  return { totalOpenCents, debtorsCount: debtors.length, receivedWeekCents };
}

export function formatSummaryMessage(summary: MerchantSummary): string {
  return (
    `📊 *Resumo*\n\n` +
    `Total em aberto: ${formatBRL(summary.totalOpenCents)}\n` +
    `Clientes devendo: ${summary.debtorsCount}\n` +
    `Recebido essa semana: ${formatBRL(summary.receivedWeekCents)}`
  );
}
