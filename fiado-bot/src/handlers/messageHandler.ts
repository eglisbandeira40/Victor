import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { processedMessages } from "../db/schema.js";
import { extractDebt } from "../ai/claude.js";
import { getOrCreateMerchant } from "../domain/merchants.js";
import { getOrCreateCustomer } from "../domain/customers.js";
import { createDebt, getCustomerBalanceCents } from "../domain/debts.js";
import { sendWhatsAppText } from "../whatsapp/client.js";
import { formatBRL, reaisToCents } from "../utils/currency.js";
import { logger } from "../utils/logger.js";
import type { WhatsAppInboundMessage } from "../whatsapp/types.js";

const FALLBACK_MESSAGE =
  "Nao entendi 🤔\n" +
  "Me manda assim: *Nome, valor, o que foi*\n" +
  "Tipo: _Ze Carlos, 45 reais, almoco de hoje_";

const ERROR_MESSAGE = "Ops, deu ruim aqui do meu lado 😕 Tenta de novo em instantes.";

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

  try {
    if (message.type !== "text" || !message.text?.body?.trim()) {
      await sendWhatsAppText(merchantPhone, FALLBACK_MESSAGE);
      return;
    }

    const merchant = await getOrCreateMerchant(merchantPhone);
    const extracted = await extractDebt(message.text.body.trim());

    if (!extracted) {
      await sendWhatsAppText(merchantPhone, FALLBACK_MESSAGE);
      return;
    }

    const customer = await getOrCreateCustomer(merchant.id, extracted.customerName);
    const amountCents = reaisToCents(extracted.amount);

    await createDebt({
      customerId: customer.id,
      merchantId: merchant.id,
      amountCents,
      description: extracted.description,
    });

    const balanceCents = await getCustomerBalanceCents(customer.id);
    const firstName = customer.name.split(" ")[0];

    const descriptionPart = extracted.description ? ` (${extracted.description})` : "";
    const reply =
      `Anotado ✅ ${customer.name} deve ${formatBRL(amountCents)}${descriptionPart}. ` +
      `No total ${firstName} te deve ${formatBRL(balanceCents)}`;

    await sendWhatsAppText(merchantPhone, reply);
  } catch (err) {
    logger.error("Erro ao processar mensagem", { error: err instanceof Error ? err.message : err });
    await sendWhatsAppText(merchantPhone, ERROR_MESSAGE).catch(() => {
      logger.error("Falha ao enviar mensagem de erro ao comerciante", { merchantPhone });
    });
  }
}
