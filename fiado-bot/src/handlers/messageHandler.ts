import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { processedMessages, type PendingAction } from "../db/schema.js";
import { extractIntent } from "../ai/claude.js";
import {
  getOrCreateMerchant,
  setPendingAction,
  setMerchantPlan,
  findMerchantByPhone,
  findMerchantById,
  backfillBusinessNameIfMissing,
  setBusinessName,
} from "../domain/merchants.js";
import {
  findOwnerMerchantIdByMemberPhone,
  addMerchantMember,
  getMemberName,
  getMemberNamesByPhone,
  findMemberByName,
} from "../domain/merchantMembers.js";
import {
  getOrCreateCustomer,
  findCustomerByName,
  registerCustomer,
  setCustomerInstallments,
  archiveCustomerBalance,
} from "../domain/customers.js";
import {
  createDebt,
  getCustomerBalanceCents,
  getCustomerBalancesForMerchant,
  getOverdueCustomersForMerchant,
  getLastDebtForCustomer,
  updateDebtAmount,
} from "../domain/debts.js";
import { createPayment, getLastPaymentForCustomer, updatePaymentAmount } from "../domain/payments.js";
import { getCustomerHistory, getMemberActivity } from "../domain/history.js";
import { getMerchantSummary, formatSummaryMessage } from "../domain/summary.js";
import { handleAdminMessage, notifyAdminOfNewMerchant } from "./adminHandler.js";
import { getMonthlyStatement, formatMonthlyStatement } from "../domain/monthlyStatement.js";
import { OVERDUE_THRESHOLD_DAYS, buildOverdueList, buildCollectionMessage } from "../jobs/weeklyCollectionReminder.js";
import { sendWhatsAppText, sendWhatsAppList, type InteractiveListSection } from "../whatsapp/client.js";
import { formatBRL, reaisToCents } from "../utils/currency.js";
import { normalizePhoneBR, formatPhoneDisplay, buildWhatsAppLink } from "../utils/phone.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import type { WhatsAppInboundMessage, WhatsAppSharedContact } from "../whatsapp/types.js";

const FALLBACK_MESSAGE =
  "Nao entendi 🤔\n" +
  "Me manda assim: *Nome, valor, o que foi*\n" +
  "Tipo: _Ze Carlos, 45,00, almoco de hoje_\n\n" +
  "Ou digita *menu* pra ver tudo que dá pra fazer.";

const ERROR_MESSAGE = "Ops, deu ruim aqui do meu lado 😕 Tenta de novo em instantes.";

const WELCOME_MESSAGE =
  "👋 Oi! Eu sou o *Fiado* 🧾\n" +
  "Vou te ajudar a controlar o fiado dos seus clientes direto aqui no WhatsApp — sem app, sem planilha.\n\n" +
  "Pra anotar uma dívida, é só mandar assim:\n" +
  "_Zé Carlos, 45,00, almoço de hoje_\n\n" +
  "Quando alguém pagar:\n" +
  "_Zé Carlos pagou 20,00_\n\n" +
  "Isso já resolve o principal! Se quiser ver tudo que dá pra fazer, digita *menu* a qualquer momento. Vamos nessa 😊";

const HELP_TRIGGER_RE =
  /^(ajuda|menu|comandos?|op(c|ç)(ao|oes|ões|ão)|o que (voc[eê]|vc) faz|o que (eu )?posso (fazer|pedir|perguntar)|help)\b/i;

const MENU_SECTIONS: InteractiveListSection[] = [
  {
    title: "Dívidas e pagamentos",
    rows: [
      { id: "menu_debt", title: "Anotar dívida", description: "Nome, valor e o que foi" },
      { id: "menu_payment", title: "Registrar pagamento", description: "Nome do cliente e quanto pagou" },
      { id: "menu_collect", title: "Cobrar um cliente", description: "Manda o link de cobrança pronto" },
      { id: "menu_correct", title: "Corrigir valor", description: "Ajusta o último lançamento errado" },
    ],
  },
  {
    title: "Consultas rápidas",
    rows: [
      { id: "menu_debtors", title: "Quem tá devendo", description: "Lista geral de devedores" },
      { id: "menu_summary", title: "Resumo da semana", description: "Total em aberto e recebido" },
      { id: "menu_statement", title: "Extrato do mês", description: "Pago e saldo por cliente" },
      { id: "menu_defaulters", title: "Inadimplentes", description: "Atrasados, com cobrança pronta" },
    ],
  },
  {
    title: "Equipe",
    rows: [
      { id: "menu_team_add", title: "Autorizar funcionário", description: "Pra ele lançar fiado também" },
      { id: "menu_team_activity", title: "Lançamentos de alguém", description: "Ver o que um funcionário lançou" },
    ],
  },
];

const MENU_INSTRUCTIONS: Record<string, string> = {
  menu_debt: "Pra anotar uma dívida, manda assim:\n_Zé Carlos, 45,00, almoço de hoje_",
  menu_payment: "Pra dar baixa num pagamento, manda assim:\n_Zé Carlos pagou 20,00_",
  menu_collect: "Pra cobrar um cliente, manda assim:\n_cobrar Zé Carlos_",
  menu_correct: "Errou o valor do último lançamento? Manda assim:\n_errei, o certo do Zé Carlos é 30_",
  menu_team_add:
    "Pra autorizar um funcionário, manda assim:\n_meu funcionário Carlos vai lançar fiado também, número 11988887777_",
  menu_team_activity: "Pra ver os lançamentos de alguém, manda assim:\n_lançamentos do Carlos_",
};

async function sendHelpMenu(merchantPhone: string): Promise<void> {
  await sendWhatsAppList(merchantPhone, {
    header: "Fiado — Menu",
    body: "Toca numa opção. Nas consultas eu já respondo na hora; nas outras, te mostro como pedir.",
    buttonText: "Ver opções",
    sections: MENU_SECTIONS,
  });
}

function buildTrialEndedMessage(): string {
  return (
    "⏰ Seu período de teste do Fiado acabou.\n\n" +
    `Pra continuar usando, entre em contato: ${env.SUPPORT_CONTACT}. Assim que confirmar o pagamento, libero seu acesso de novo.`
  );
}

/** Sufixo " (lançado por Fulano)" quando quem mandou a mensagem nao e o numero dono da conta. */
async function actorSuffix(merchant: { whatsappPhone: string }, actorPhone: string): Promise<string> {
  if (actorPhone === merchant.whatsappPhone) return "";
  const name = await getMemberName(actorPhone);
  return ` _(lançado por ${name ?? "funcionário"})_`;
}

function parseInstallmentCount(text: string): number | null {
  const normalized = text.trim().toLowerCase();
  if (/^a\s*vista$/.test(normalized.replace(/[àá]/g, "a"))) return 1;

  const match = normalized.match(/\d+/);
  if (!match) return null;

  const n = parseInt(match[0], 10);
  if (!n || n < 1 || n > 36) return null;
  return n;
}

function parseYesNo(text: string): boolean | null {
  const t = text.trim().toLowerCase();
  if (/^(sim|s|confirma|confirmado|isso|certo|correto|ok)\b/.test(t)) return true;
  if (/^(nao|não|n|cancela|errado)\b/.test(t)) return false;
  return null;
}

async function handlePendingInstallmentReply(
  merchantId: string,
  merchantPhone: string,
  pending: Extract<PendingAction, { type: "awaiting_installments" }>,
  text: string
): Promise<void> {
  const installments = parseInstallmentCount(text);

  if (installments === null) {
    await sendWhatsAppText(
      merchantPhone,
      "Não entendi 🤔 Me manda só o número de vezes (ex: 1 pra à vista, 3 pra em 3x)."
    );
    return;
  }

  await setCustomerInstallments(pending.customerId, installments);
  await setPendingAction(merchantId, null);

  const vezes = installments === 1 ? "à vista" : `em ${installments}x`;
  await sendWhatsAppText(
    merchantPhone,
    `Combinado ✅ ${pending.customerName} vai quitar ${formatBRL(pending.balanceCents)} ${vezes}. ` +
      `Quando ele for pagando, me avisa (ex: "${pending.customerName} pagou 15").`
  );
}

async function handlePendingBusinessNameReply(
  merchantId: string,
  merchantPhone: string,
  text: string
): Promise<void> {
  const name = text.trim();

  if (!name) {
    await sendWhatsAppText(merchantPhone, "Não entendi 🤔 Me manda só o nome (seu ou do comércio).");
    return;
  }

  await setBusinessName(merchantId, name);
  await setPendingAction(merchantId, null);
  await sendWhatsAppText(merchantPhone, `Prontinho ✅ Vou te chamar de *${name}* daqui pra frente.`);
}

async function handlePendingContactConfirmation(
  merchantId: string,
  merchantPhone: string,
  pending: Extract<PendingAction, { type: "awaiting_contact_confirmation" }>,
  text: string
): Promise<void> {
  const answer = parseYesNo(text);

  if (answer === null) {
    await sendWhatsAppText(merchantPhone, "Não entendi 🤔 Responde só *sim* ou *não*.");
    return;
  }

  await setPendingAction(merchantId, null);

  if (!answer) {
    await sendWhatsAppText(merchantPhone, "Ok, não salvei nada 👍 Se precisar, me manda o nome certo do cliente.");
    return;
  }

  if (pending.matchedCustomerId) {
    await registerCustomer(pending.matchedCustomerId, pending.phone);
    await sendWhatsAppText(merchantPhone, `Telefone de ${pending.matchedCustomerName} salvo ✅`);
    return;
  }

  const customer = await getOrCreateCustomer(merchantId, pending.cardName);
  await registerCustomer(customer.id, pending.phone);
  await sendWhatsAppText(merchantPhone, `Cadastrado ✅ ${customer.name} (telefone salvo)`);
}

async function handleSharedContact(
  merchantId: string,
  merchantPhone: string,
  contact: WhatsAppSharedContact
): Promise<void> {
  const cardName = contact.name?.formatted_name?.trim();
  const rawPhone = contact.phones?.[0]?.wa_id ?? contact.phones?.[0]?.phone;

  if (!cardName || !rawPhone) {
    await sendWhatsAppText(merchantPhone, "Recebi um contato mas não consegui ler o nome ou telefone dele 😕");
    return;
  }

  const phone = normalizePhoneBR(rawPhone);
  const matched = await findCustomerByName(merchantId, cardName);

  await setPendingAction(merchantId, {
    type: "awaiting_contact_confirmation",
    cardName,
    phone,
    matchedCustomerId: matched?.id ?? null,
    matchedCustomerName: matched?.name ?? null,
  });

  const phoneDisplay = formatPhoneDisplay(phone);

  if (matched) {
    await sendWhatsAppText(
      merchantPhone,
      `📇 Peguei o contato: *${cardName}* — ${phoneDisplay}\n` +
        `É o telefone do seu cliente *${matched.name}*? Responde *sim* pra eu salvar.`
    );
  } else {
    await sendWhatsAppText(
      merchantPhone,
      `📇 Peguei o contato: *${cardName}* — ${phoneDisplay}\n` +
        `Não tenho nenhum cliente chamado ${cardName} ainda. Quer que eu cadastre ele com esse telefone? ` +
        `Responde *sim* pra confirmar.`
    );
  }
}

async function sendDebtorsList(
  merchant: { id: string },
  merchantPhone: string,
  minAmount?: number
): Promise<void> {
  const minCents = minAmount ? reaisToCents(minAmount) : 0;
  const balances = await getCustomerBalancesForMerchant(merchant.id);
  const debtors = balances.filter((b) => b.balanceCents > minCents).sort((a, b) => b.balanceCents - a.balanceCents);

  if (debtors.length === 0) {
    const reply = minAmount ? `Ninguém devendo mais de ${formatBRL(minCents)} no momento 👍` : `Ninguém te deve nada agora 🎉`;
    await sendWhatsAppText(merchantPhone, reply);
    return;
  }

  const lines = debtors.map((d, i) => `${i + 1}) ${d.name} — ${formatBRL(d.balanceCents)}`);
  const total = debtors.reduce((sum, d) => sum + d.balanceCents, 0);

  await sendWhatsAppText(
    merchantPhone,
    `Quem tá devendo:\n\n${lines.join("\n")}\n\nTotal: ${formatBRL(total)} com ${debtors.length} cliente(s)`
  );
}

async function sendWeeklySummary(merchant: { id: string }, merchantPhone: string): Promise<void> {
  const summary = await getMerchantSummary(merchant.id);
  await sendWhatsAppText(merchantPhone, formatSummaryMessage(summary));
}

async function sendMonthlyStatement(merchant: { id: string }, merchantPhone: string): Promise<void> {
  const statement = await getMonthlyStatement(merchant.id);
  await sendWhatsAppText(merchantPhone, formatMonthlyStatement(statement));
}

async function sendDefaultersList(
  merchant: { id: string; businessName: string | null },
  merchantPhone: string
): Promise<void> {
  const overdue = await getOverdueCustomersForMerchant(merchant.id, OVERDUE_THRESHOLD_DAYS);

  if (overdue.length === 0) {
    await sendWhatsAppText(
      merchantPhone,
      `Nenhum cliente inadimplente (mais de ${OVERDUE_THRESHOLD_DAYS} dias) no momento 👍`
    );
    return;
  }

  await sendWhatsAppText(merchantPhone, buildOverdueList(merchant.businessName, overdue));
}

async function handleMenuSelection(
  merchant: { id: string; businessName: string | null },
  merchantPhone: string,
  rowId: string
): Promise<void> {
  const instruction = MENU_INSTRUCTIONS[rowId];
  if (instruction) {
    await sendWhatsAppText(merchantPhone, instruction);
    return;
  }

  switch (rowId) {
    case "menu_debtors":
      await sendDebtorsList(merchant, merchantPhone);
      return;
    case "menu_summary":
      await sendWeeklySummary(merchant, merchantPhone);
      return;
    case "menu_statement":
      await sendMonthlyStatement(merchant, merchantPhone);
      return;
    case "menu_defaulters":
      await sendDefaultersList(merchant, merchantPhone);
      return;
    default:
      await sendWhatsAppText(merchantPhone, FALLBACK_MESSAGE);
  }
}

export async function handleInboundMessage(message: WhatsAppInboundMessage, profileName?: string): Promise<void> {
  const alreadyProcessed = await db.query.processedMessages.findFirst({
    where: eq(processedMessages.waMessageId, message.id),
  });

  if (alreadyProcessed) {
    logger.info("Mensagem ja processada, ignorando (retry do webhook)", { waMessageId: message.id });
    return;
  }

  await db.insert(processedMessages).values({ waMessageId: message.id }).onConflictDoNothing();

  const merchantPhone = message.from;

  if (merchantPhone === env.ADMIN_WHATSAPP_PHONE) {
    try {
      await handleAdminMessage(message);
    } catch (err) {
      logger.error("Erro ao processar mensagem do admin", { error: err instanceof Error ? err.message : err });
      await sendWhatsAppText(merchantPhone, ERROR_MESSAGE).catch(() => {});
    }
    return;
  }

  const bodyText = message.type === "text" ? message.text?.body?.trim() : undefined;

  try {
    let merchant = await findMerchantByPhone(merchantPhone);
    let isNew = false;

    if (!merchant) {
      const ownerMerchantId = await findOwnerMerchantIdByMemberPhone(merchantPhone);
      if (ownerMerchantId) {
        merchant = await findMerchantById(ownerMerchantId);
      }
    }

    if (!merchant) {
      const result = await getOrCreateMerchant(merchantPhone, profileName);
      merchant = result.merchant;
      isNew = result.isNew;
    }

    if (!isNew && profileName && !merchant.businessName) {
      await backfillBusinessNameIfMissing(merchant.id, profileName);
      merchant = { ...merchant, businessName: profileName };
    }

    if (!merchant) {
      throw new Error(`Nao foi possivel resolver merchant para ${merchantPhone}`);
    }

    if (isNew) {
      await sendWhatsAppText(merchantPhone, WELCOME_MESSAGE);
      await notifyAdminOfNewMerchant(merchant);
    }

    if (merchant.plan === "blocked") {
      await sendWhatsAppText(merchantPhone, buildTrialEndedMessage());
      return;
    }

    if (merchant.plan === "trial" && merchant.trialEndsAt && merchant.trialEndsAt.getTime() <= Date.now()) {
      await setMerchantPlan(merchant.id, "blocked");
      await sendWhatsAppText(merchantPhone, buildTrialEndedMessage());
      return;
    }

    if (merchant.pendingAction?.type === "awaiting_installments") {
      await handlePendingInstallmentReply(merchant.id, merchantPhone, merchant.pendingAction, bodyText ?? "");
      return;
    }

    if (merchant.pendingAction?.type === "awaiting_contact_confirmation") {
      await handlePendingContactConfirmation(merchant.id, merchantPhone, merchant.pendingAction, bodyText ?? "");
      return;
    }

    if (merchant.pendingAction?.type === "awaiting_business_name") {
      await handlePendingBusinessNameReply(merchant.id, merchantPhone, bodyText ?? "");
      return;
    }

    if (message.type === "contacts" && message.contacts?.length) {
      await handleSharedContact(merchant.id, merchantPhone, message.contacts[0]);
      return;
    }

    if (message.type === "interactive" && message.interactive?.list_reply) {
      await handleMenuSelection(merchant, merchantPhone, message.interactive.list_reply.id);
      return;
    }

    if (!bodyText) {
      await sendWhatsAppText(merchantPhone, FALLBACK_MESSAGE);
      return;
    }

    if (HELP_TRIGGER_RE.test(bodyText.trim())) {
      await sendHelpMenu(merchantPhone);
      return;
    }

    const intent = await extractIntent(bodyText);

    if (!intent) {
      await sendWhatsAppText(merchantPhone, FALLBACK_MESSAGE);
      return;
    }

    switch (intent.type) {
      case "record_debt": {
        const customer = await getOrCreateCustomer(merchant.id, intent.customerName);
        const amountCents = reaisToCents(intent.amount);

        await createDebt({
          customerId: customer.id,
          merchantId: merchant.id,
          amountCents,
          description: intent.description,
          dueDate: intent.dueDate,
          createdByPhone: merchantPhone,
        });

        const balanceCents = await getCustomerBalanceCents(customer.id, customer.balanceResetAt);
        const firstName = customer.name.split(" ")[0];
        const descriptionPart = intent.description ? ` (${intent.description})` : "";
        const dueDatePart = intent.dueDate
          ? `, vence dia ${new Date(`${intent.dueDate}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`
          : "";

        await sendWhatsAppText(
          merchantPhone,
          `Anotado ✅ ${customer.name} deve ${formatBRL(amountCents)}${descriptionPart}${dueDatePart}. ` +
            `No total ${firstName} te deve ${formatBRL(balanceCents)}` +
            (await actorSuffix(merchant, merchantPhone))
        );
        break;
      }

      case "register_customer": {
        const customer = await getOrCreateCustomer(merchant.id, intent.customerName);
        const phone = normalizePhoneBR(intent.phone);
        await registerCustomer(customer.id, phone);

        await sendWhatsAppText(merchantPhone, `Cadastrado ✅ ${customer.name} (telefone salvo)`);
        break;
      }

      case "register_payment": {
        const customer = await getOrCreateCustomer(merchant.id, intent.customerName);
        const amountCents = reaisToCents(intent.amount);

        await createPayment({
          customerId: customer.id,
          merchantId: merchant.id,
          amountCents,
          createdByPhone: merchantPhone,
        });

        const balanceCents = await getCustomerBalanceCents(customer.id, customer.balanceResetAt);
        const firstName = customer.name.split(" ")[0];

        const reply =
          balanceCents <= 0
            ? `Recebido ✅ ${customer.name} pagou ${formatBRL(amountCents)}. Tá quitado! 🎉`
            : `Recebido ✅ ${customer.name} pagou ${formatBRL(amountCents)}. Agora ${firstName} te deve ${formatBRL(balanceCents)}`;

        await sendWhatsAppText(merchantPhone, reply + (await actorSuffix(merchant, merchantPhone)));
        break;
      }

      case "close_account": {
        const customer = await getOrCreateCustomer(merchant.id, intent.customerName);
        const balanceCents = await getCustomerBalanceCents(customer.id, customer.balanceResetAt);

        if (balanceCents <= 0) {
          await sendWhatsAppText(merchantPhone, `A conta de ${customer.name} já tá zerada, nada pra fechar 👍`);
          break;
        }

        await setPendingAction(merchant.id, {
          type: "awaiting_installments",
          customerId: customer.id,
          customerName: customer.name,
          balanceCents,
        });

        await sendWhatsAppText(
          merchantPhone,
          `Fechando a conta de ${customer.name}: ${formatBRL(balanceCents)}. ` +
            `Vai pagar em quantas vezes? Me responde só o número (1 pra à vista).`
        );
        break;
      }

      case "archive_account": {
        const customer = await getOrCreateCustomer(merchant.id, intent.customerName);
        const balanceCents = await getCustomerBalanceCents(customer.id, customer.balanceResetAt);

        if (balanceCents > 0) {
          await sendWhatsAppText(
            merchantPhone,
            `${customer.name} ainda deve ${formatBRL(balanceCents)} — só dá pra excluir a conta depois de quitada.`
          );
          break;
        }

        await archiveCustomerBalance(customer.id);
        await sendWhatsAppText(
          merchantPhone,
          `Prontinho ✅ Conta antiga de ${customer.name} arquivada. Ele continua cadastrado, pronto pra uma conta nova.`
        );
        break;
      }

      case "purchase_history": {
        const customer = await getOrCreateCustomer(merchant.id, intent.customerName);
        const history = await getCustomerHistory(customer.id);

        if (history.length === 0) {
          await sendWhatsAppText(merchantPhone, `Ainda não tem nada no histórico de ${customer.name}.`);
          break;
        }

        const memberNames = await getMemberNamesByPhone(merchant.id);
        const lancadoPor = (phone: string | null) => {
          if (!phone || phone === merchant.whatsappPhone) return "";
          return ` — lançado por ${memberNames.get(phone) ?? "funcionário"}`;
        };

        const lines = history.map((entry) => {
          const date = entry.createdAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
          const quem = lancadoPor(entry.createdByPhone);
          if (entry.type === "debt") {
            const desc = entry.description ? ` (${entry.description})` : "";
            return `${date} — Dívida: ${formatBRL(entry.amountCents)}${desc}${quem}`;
          }
          return `${date} — Pagamento: ${formatBRL(entry.amountCents)}${quem}`;
        });

        const balanceCents = await getCustomerBalanceCents(customer.id, customer.balanceResetAt);

        await sendWhatsAppText(
          merchantPhone,
          `🧾 *Histórico de ${customer.name}*\n\n${lines.join("\n")}\n\nSaldo atual: ${formatBRL(balanceCents)}`
        );
        break;
      }

      case "query_balance": {
        const customer = await findCustomerByName(merchant.id, intent.customerName);

        if (!customer) {
          await sendWhatsAppText(merchantPhone, `Não tenho nenhum cliente chamado ${intent.customerName} cadastrado.`);
          break;
        }

        const balanceCents = await getCustomerBalanceCents(customer.id, customer.balanceResetAt);
        const reply =
          balanceCents > 0
            ? `${customer.name} te deve ${formatBRL(balanceCents)}`
            : `${customer.name} não deve nada agora 👍`;

        await sendWhatsAppText(merchantPhone, reply);
        break;
      }

      case "query_debtors": {
        await sendDebtorsList(merchant, merchantPhone, intent.minAmount);
        break;
      }

      case "weekly_summary": {
        await sendWeeklySummary(merchant, merchantPhone);
        break;
      }

      case "monthly_statement": {
        await sendMonthlyStatement(merchant, merchantPhone);
        break;
      }

      case "list_defaulters": {
        await sendDefaultersList(merchant, merchantPhone);
        break;
      }

      case "collect_customer": {
        const customer = await findCustomerByName(merchant.id, intent.customerName);

        if (!customer) {
          await sendWhatsAppText(merchantPhone, `Não tenho nenhum cliente chamado ${intent.customerName} cadastrado.`);
          break;
        }

        const balanceCents = await getCustomerBalanceCents(customer.id, customer.balanceResetAt);

        if (balanceCents <= 0) {
          await sendWhatsAppText(merchantPhone, `${customer.name} não deve nada agora, nada pra cobrar 👍`);
          break;
        }

        if (!customer.phone) {
          await sendWhatsAppText(
            merchantPhone,
            `Não tenho o telefone de ${customer.name} salvo. Manda assim: telefone do ${customer.name}, DDD e número`
          );
          break;
        }

        const link = buildWhatsAppLink(
          customer.phone,
          buildCollectionMessage(merchant.businessName, { name: customer.name, balanceCents })
        );

        await sendWhatsAppText(
          merchantPhone,
          `💰 *Cobrança de ${customer.name}*\n\nSaldo: ${formatBRL(balanceCents)}\n👉 ${link}`
        );
        break;
      }

      case "correct_last_entry": {
        const customer = await findCustomerByName(merchant.id, intent.customerName);

        if (!customer) {
          await sendWhatsAppText(merchantPhone, `Não tenho nenhum cliente chamado ${intent.customerName} cadastrado.`);
          break;
        }

        const [lastDebt, lastPayment] = await Promise.all([
          getLastDebtForCustomer(customer.id),
          getLastPaymentForCustomer(customer.id),
        ]);

        if (!lastDebt && !lastPayment) {
          await sendWhatsAppText(merchantPhone, `Não tem nenhum lançamento de ${customer.name} pra corrigir.`);
          break;
        }

        const correctingDebt = !lastPayment || (lastDebt && lastDebt.createdAt >= lastPayment.createdAt);
        const newAmountCents = reaisToCents(intent.correctAmount);

        if (correctingDebt && lastDebt) {
          await updateDebtAmount(lastDebt.id, newAmountCents);
        } else if (lastPayment) {
          await updatePaymentAmount(lastPayment.id, newAmountCents);
        }

        const balanceCents = await getCustomerBalanceCents(customer.id, customer.balanceResetAt);
        const tipo = correctingDebt ? "Dívida" : "Pagamento";

        await sendWhatsAppText(
          merchantPhone,
          `Corrigido ✅ ${tipo} de ${customer.name} agora é ${formatBRL(newAmountCents)}. ` +
            `Saldo atual: ${formatBRL(balanceCents)}`
        );
        break;
      }

      case "add_team_member": {
        const phone = normalizePhoneBR(intent.phone);
        const result = await addMerchantMember(merchant.id, phone, intent.memberName);

        if (result.status === "own_account") {
          await sendWhatsAppText(
            merchantPhone,
            `Esse número já tem uma conta própria no Fiado, não dá pra usar como funcionário. Confere se é o número certo.`
          );
          break;
        }

        if (result.status === "already_member") {
          const reply = result.sameMerchant
            ? `${intent.memberName} já está autorizado a lançar fiado na sua conta 👍`
            : `Esse número já está vinculado a outro comércio no Fiado.`;
          await sendWhatsAppText(merchantPhone, reply);
          break;
        }

        await sendWhatsAppText(
          merchantPhone,
          `Prontinho ✅ ${intent.memberName} (${formatPhoneDisplay(phone)}) já pode mandar mensagem pro Fiado ` +
            `direto do número dele pra lançar fiado na sua conta.`
        );
        break;
      }

      case "member_activity": {
        const member = await findMemberByName(merchant.id, intent.memberName);

        if (!member) {
          await sendWhatsAppText(merchantPhone, `Não tenho nenhum funcionário chamado ${intent.memberName} cadastrado.`);
          break;
        }

        const activity = await getMemberActivity(merchant.id, member.phone);
        const displayName = member.name ?? intent.memberName;

        if (activity.length === 0) {
          await sendWhatsAppText(merchantPhone, `${displayName} ainda não lançou nada.`);
          break;
        }

        const lines = activity.map((entry) => {
          const date = entry.createdAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
          const desc = entry.description ? ` (${entry.description})` : "";
          return entry.type === "debt"
            ? `${date} — ${entry.customerName}: dívida de ${formatBRL(entry.amountCents)}${desc}`
            : `${date} — ${entry.customerName}: pagamento de ${formatBRL(entry.amountCents)}`;
        });

        await sendWhatsAppText(merchantPhone, `🧾 *Lançamentos de ${displayName}*\n\n${lines.join("\n")}`);
        break;
      }
    }
  } catch (err) {
    logger.error("Erro ao processar mensagem", { error: err instanceof Error ? err.message : err });
    await sendWhatsAppText(merchantPhone, ERROR_MESSAGE).catch(() => {
      logger.error("Falha ao enviar mensagem de erro ao comerciante", { merchantPhone });
    });
  }
}
