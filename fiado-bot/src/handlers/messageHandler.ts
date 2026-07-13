import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { processedMessages, type PendingAction } from "../db/schema.js";
import { extractIntent } from "../ai/claude.js";
import { getOrCreateMerchant, setPendingAction } from "../domain/merchants.js";
import {
  getOrCreateCustomer,
  findCustomerByName,
  registerCustomer,
  setCustomerInstallments,
  archiveCustomerBalance,
} from "../domain/customers.js";
import { createDebt, getCustomerBalanceCents } from "../domain/debts.js";
import { createPayment } from "../domain/payments.js";
import { sendWhatsAppText } from "../whatsapp/client.js";
import { formatBRL, reaisToCents } from "../utils/currency.js";
import { normalizePhoneBR, formatPhoneDisplay } from "../utils/phone.js";
import { logger } from "../utils/logger.js";
import type { WhatsAppInboundMessage, WhatsAppSharedContact } from "../whatsapp/types.js";

const FALLBACK_MESSAGE =
  "Nao entendi 🤔\n" +
  "Me manda assim: *Nome, valor, o que foi*\n" +
  "Tipo: _Ze Carlos, 45 reais, almoco de hoje_";

const ERROR_MESSAGE = "Ops, deu ruim aqui do meu lado 😕 Tenta de novo em instantes.";

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
    const merchant = await getOrCreateMerchant(merchantPhone);

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
        });

        const balanceCents = await getCustomerBalanceCents(customer.id, customer.balanceResetAt);
        const firstName = customer.name.split(" ")[0];
        const descriptionPart = intent.description ? ` (${intent.description})` : "";

        await sendWhatsAppText(
          merchantPhone,
          `Anotado ✅ ${customer.name} deve ${formatBRL(amountCents)}${descriptionPart}. ` +
            `No total ${firstName} te deve ${formatBRL(balanceCents)}`
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

        await createPayment({ customerId: customer.id, merchantId: merchant.id, amountCents });

        const balanceCents = await getCustomerBalanceCents(customer.id, customer.balanceResetAt);
        const firstName = customer.name.split(" ")[0];

        const reply =
          balanceCents <= 0
            ? `Recebido ✅ ${customer.name} pagou ${formatBRL(amountCents)}. Tá quitado! 🎉`
            : `Recebido ✅ ${customer.name} pagou ${formatBRL(amountCents)}. Agora ${firstName} te deve ${formatBRL(balanceCents)}`;

        await sendWhatsAppText(merchantPhone, reply);
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
    }
  } catch (err) {
    logger.error("Erro ao processar mensagem", { error: err instanceof Error ? err.message : err });
    await sendWhatsAppText(merchantPhone, ERROR_MESSAGE).catch(() => {
      logger.error("Falha ao enviar mensagem de erro ao comerciante", { merchantPhone });
    });
  }
}
