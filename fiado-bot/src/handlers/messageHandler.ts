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
} from "../domain/merchants.js";
import {
  findOwnerMerchantIdByMemberPhone,
  addMerchantMember,
  getMemberName,
  getMemberNamesByPhone,
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
} from "../domain/debts.js";
import { createPayment } from "../domain/payments.js";
import { getCustomerHistory } from "../domain/history.js";
import { getMerchantSummary, formatSummaryMessage } from "../domain/summary.js";
import { getMonthlyStatement, formatMonthlyStatement } from "../domain/monthlyStatement.js";
import { OVERDUE_THRESHOLD_DAYS, buildOverdueList, buildCollectionMessage } from "../jobs/weeklyCollectionReminder.js";
import { sendWhatsAppText } from "../whatsapp/client.js";
import { formatBRL, reaisToCents } from "../utils/currency.js";
import { normalizePhoneBR, formatPhoneDisplay, buildWhatsAppLink } from "../utils/phone.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import type { WhatsAppInboundMessage, WhatsAppSharedContact } from "../whatsapp/types.js";

const FALLBACK_MESSAGE =
  "Nao entendi 🤔\n" +
  "Me manda assim: *Nome, valor, o que foi*\n" +
  "Tipo: _Ze Carlos, 45 reais, almoco de hoje_";

const ERROR_MESSAGE = "Ops, deu ruim aqui do meu lado 😕 Tenta de novo em instantes.";

const WELCOME_MESSAGE =
  "👋 Oi! Eu sou o *Fiado* 🧾\n" +
  "Vou te ajudar a controlar o fiado dos seus clientes direto aqui no WhatsApp — sem app, sem planilha.\n\n" +
  "Pra anotar uma dívida, é só mandar assim:\n" +
  "_Zé Carlos, 45 reais, almoço de hoje_\n\n" +
  "Quando alguém pagar:\n" +
  "_Zé Carlos pagou 20 reais_\n\n" +
  "Isso já resolve o principal! Vamos nessa 😊";

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

export async function handleInboundMessage(message: WhatsAppInboundMessage): Promise<void> {
  const alreadyProcessed = await db.query.processedMessages.findFirst({
    where: eq(processedMessages.waMessageId, message.id),
  });

  if (alreadyProcessed) {
    logger.info("Mensagem ja processada, ignorando (retry do webhook)", { waMessageId: message.id });
    return;
  }

  await db.insert(processedMessages).values({ waMessageId: message.id }).onConflictDoNothing();

  const merchantPhone = message.from;
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
      const result = await getOrCreateMerchant(merchantPhone);
      merchant = result.merchant;
      isNew = result.isNew;
    }

    if (!merchant) {
      throw new Error(`Nao foi possivel resolver merchant para ${merchantPhone}`);
    }

    if (isNew) {
      await sendWhatsAppText(merchantPhone, WELCOME_MESSAGE);
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

    if (message.type === "contacts" && message.contacts?.length) {
      await handleSharedContact(merchant.id, merchantPhone, message.contacts[0]);
      return;
    }

    if (!bodyText) {
      await sendWhatsAppText(merchantPhone, FALLBACK_MESSAGE);
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
        const minCents = intent.minAmount ? reaisToCents(intent.minAmount) : 0;
        const balances = await getCustomerBalancesForMerchant(merchant.id);
        const debtors = balances.filter((b) => b.balanceCents > minCents).sort((a, b) => b.balanceCents - a.balanceCents);

        if (debtors.length === 0) {
          const reply = intent.minAmount
            ? `Ninguém devendo mais de ${formatBRL(minCents)} no momento 👍`
            : `Ninguém te deve nada agora 🎉`;
          await sendWhatsAppText(merchantPhone, reply);
          break;
        }

        const lines = debtors.map((d, i) => `${i + 1}) ${d.name} — ${formatBRL(d.balanceCents)}`);
        const total = debtors.reduce((sum, d) => sum + d.balanceCents, 0);

        await sendWhatsAppText(
          merchantPhone,
          `Quem tá devendo:\n\n${lines.join("\n")}\n\nTotal: ${formatBRL(total)} com ${debtors.length} cliente(s)`
        );
        break;
      }

      case "weekly_summary": {
        const summary = await getMerchantSummary(merchant.id);
        await sendWhatsAppText(merchantPhone, formatSummaryMessage(summary));
        break;
      }

      case "monthly_statement": {
        const statement = await getMonthlyStatement(merchant.id);
        await sendWhatsAppText(merchantPhone, formatMonthlyStatement(statement));
        break;
      }

      case "list_defaulters": {
        const overdue = await getOverdueCustomersForMerchant(merchant.id, OVERDUE_THRESHOLD_DAYS);

        if (overdue.length === 0) {
          await sendWhatsAppText(
            merchantPhone,
            `Nenhum cliente inadimplente (mais de ${OVERDUE_THRESHOLD_DAYS} dias) no momento 👍`
          );
          break;
        }

        await sendWhatsAppText(merchantPhone, buildOverdueList(merchant.businessName, overdue));
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
    }
  } catch (err) {
    logger.error("Erro ao processar mensagem", { error: err instanceof Error ? err.message : err });
    await sendWhatsAppText(merchantPhone, ERROR_MESSAGE).catch(() => {
      logger.error("Falha ao enviar mensagem de erro ao comerciante", { merchantPhone });
    });
  }
}
