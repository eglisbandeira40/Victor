import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { processedMessages, type PendingAction } from "../db/schema.js";
import { extractIntent } from "../ai/claude.js";
import { getOrCreateMerchant, setPendingAction } from "../domain/merchants.js";
import { getOrCreateCustomer, registerCustomer, setCustomerInstallments, archiveCustomerBalance } from "../domain/customers.js";
import { createDebt, getCustomerBalanceCents } from "../domain/debts.js";
import { createPayment } from "../domain/payments.js";
import { sendWhatsAppText } from "../whatsapp/client.js";
import { formatBRL, reaisToCents } from "../utils/currency.js";
import { logger } from "../utils/logger.js";
import type { WhatsAppInboundMessage } from "../whatsapp/types.js";

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

async function handlePendingInstallmentReply(
  merchantId: string,
  merchantPhone: string,
  pending: PendingAction,
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
        await registerCustomer(customer.id, { phone: intent.phone, address: intent.address });

        const parts: string[] = [];
        if (intent.phone) parts.push("telefone");
        if (intent.address) parts.push("endereço");
        const details = parts.length ? ` (${parts.join(" e ")} salvos)` : "";

        await sendWhatsAppText(merchantPhone, `Cadastrado ✅ ${customer.name}${details}`);
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
