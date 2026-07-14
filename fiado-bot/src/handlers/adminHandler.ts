import {
  getRecentMerchants,
  getMerchantsWithTrialEndingSoon,
  getAllMerchantsOrdered,
  getMerchantStats,
  getActiveMerchants,
  getMonthlyRevenueStats,
  formatRecentMerchantsMessage,
  formatTrialEndingMessage,
  formatAllMerchantsMessage,
  formatMerchantStatsMessage,
  formatActiveMerchantsMessage,
  formatMonthlyRevenueMessage,
  NEW_MERCHANT_WINDOW_DAYS,
  TRIAL_ALERT_WINDOW_DAYS,
  type MerchantRow,
} from "../domain/adminStats.js";
import { sendWhatsAppText, sendWhatsAppList, type InteractiveListSection } from "../whatsapp/client.js";
import { formatPhoneDisplay } from "../utils/phone.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import type { WhatsAppInboundMessage } from "../whatsapp/types.js";

const ADMIN_MENU_SECTIONS: InteractiveListSection[] = [
  {
    title: "Comerciantes",
    rows: [
      {
        id: "admin_new",
        title: "Novos comerciantes",
        description: `Cadastrados nos últimos ${NEW_MERCHANT_WINDOW_DAYS} dias`,
      },
      {
        id: "admin_trials",
        title: "Trials vencendo",
        description: `Vencem nos próximos ${TRIAL_ALERT_WINDOW_DAYS} dias`,
      },
      { id: "admin_all", title: "Todos os comerciantes", description: "Lista completa com plano e desde quando" },
      { id: "admin_stats", title: "Resumo geral", description: "Quantos em trial, ativo e bloqueado" },
    ],
  },
  {
    title: "Carteira e faturamento",
    rows: [
      { id: "admin_wallet", title: "Carteira de clientes", description: "Comerciantes pagantes (plano ativo)" },
      { id: "admin_revenue", title: "Faturamento do mês", description: "MRR e novos pagantes esse mês" },
    ],
  },
];

async function sendAdminMenu(adminPhone: string): Promise<void> {
  await sendWhatsAppList(adminPhone, {
    header: "Fiado — Admin",
    body: "Toca numa opção pra acompanhar os comerciantes.",
    buttonText: "Ver opções",
    sections: ADMIN_MENU_SECTIONS,
  });
}

async function handleAdminMenuSelection(adminPhone: string, rowId: string): Promise<void> {
  switch (rowId) {
    case "admin_new": {
      const rows = await getRecentMerchants(NEW_MERCHANT_WINDOW_DAYS);
      await sendWhatsAppText(adminPhone, formatRecentMerchantsMessage(rows, NEW_MERCHANT_WINDOW_DAYS));
      return;
    }
    case "admin_trials": {
      const rows = await getMerchantsWithTrialEndingSoon(TRIAL_ALERT_WINDOW_DAYS);
      await sendWhatsAppText(adminPhone, formatTrialEndingMessage(rows, TRIAL_ALERT_WINDOW_DAYS));
      return;
    }
    case "admin_all": {
      const rows = await getAllMerchantsOrdered();
      await sendWhatsAppText(adminPhone, formatAllMerchantsMessage(rows));
      return;
    }
    case "admin_stats": {
      const stats = await getMerchantStats();
      await sendWhatsAppText(adminPhone, formatMerchantStatsMessage(stats));
      return;
    }
    case "admin_wallet": {
      const rows = await getActiveMerchants();
      await sendWhatsAppText(adminPhone, formatActiveMerchantsMessage(rows));
      return;
    }
    case "admin_revenue": {
      const stats = await getMonthlyRevenueStats();
      await sendWhatsAppText(adminPhone, formatMonthlyRevenueMessage(stats));
      return;
    }
    default:
      await sendAdminMenu(adminPhone);
  }
}

/**
 * Fluxo do numero configurado em ADMIN_WHATSAPP_PHONE - inteiramente separado do fluxo de comerciante
 * (nao cria merchant, nao passa por trial/plano). Qualquer mensagem de texto abre o menu; toque no
 * menu executa a consulta na hora.
 */
export async function handleAdminMessage(message: WhatsAppInboundMessage): Promise<void> {
  const adminPhone = message.from;

  if (message.type === "interactive" && message.interactive?.list_reply) {
    await handleAdminMenuSelection(adminPhone, message.interactive.list_reply.id);
    return;
  }

  await sendAdminMenu(adminPhone);
}

/** Avisa o admin quando um comerciante novo se cadastra. Best-effort: falha aqui nao pode quebrar o cadastro do comerciante. */
export async function notifyAdminOfNewMerchant(merchant: MerchantRow): Promise<void> {
  const name = merchant.businessName ?? "(sem nome ainda)";
  const phone = formatPhoneDisplay(merchant.whatsappPhone);

  try {
    await sendWhatsAppText(
      env.ADMIN_WHATSAPP_PHONE,
      `🆕 *Novo comerciante no Fiado*\n\n${name} — ${phone}\nTrial de 7 dias iniciado.`
    );
  } catch (err) {
    logger.error("Falha ao notificar admin sobre novo comerciante", {
      error: err instanceof Error ? err.message : err,
      merchantId: merchant.id,
    });
  }
}
