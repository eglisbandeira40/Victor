import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { env } from "../config/env.js";
import { findMerchantById, setMerchantPlan } from "../domain/merchants.js";
import { notifyAdminOfPixPayment } from "../handlers/adminHandler.js";
import { sendWhatsAppText } from "../whatsapp/client.js";
import { formatBRL } from "../utils/currency.js";
import { logger } from "../utils/logger.js";

const CONFIRMED_EVENTS = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"]);

interface AsaasWebhookPayload {
  event?: string;
  payment?: {
    id: string;
    value: number;
    externalReference?: string | null;
  };
}

/**
 * Recebe a confirmacao de pagamento do Asaas e libera o comerciante automaticamente. Protegido pelo
 * token configurado em ASAAS_WEBHOOK_TOKEN (tem que bater com o "Token de autenticacao" cadastrado no
 * painel do Asaas em Configuracoes > Integracoes > Webhooks).
 */
export async function registerAsaasWebhookRoutes(app: FastifyInstance) {
  app.post("/webhooks/asaas", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!env.ASAAS_WEBHOOK_TOKEN) {
      logger.warn("Webhook do Asaas recebido mas ASAAS_WEBHOOK_TOKEN nao esta configurado - ignorando");
      return reply.status(503).send({ ok: false });
    }

    const receivedToken = request.headers["asaas-access-token"];
    if (receivedToken !== env.ASAAS_WEBHOOK_TOKEN) {
      logger.warn("Webhook do Asaas com token invalido");
      return reply.status(401).send({ ok: false });
    }

    // Confirma rapido pro Asaas nao ficar reenviando.
    reply.status(200).send({ ok: true });

    const payload = request.body as AsaasWebhookPayload;

    if (!payload.event || !CONFIRMED_EVENTS.has(payload.event)) {
      return;
    }

    const merchantId = payload.payment?.externalReference;
    if (!merchantId) {
      logger.warn("Webhook do Asaas confirmado sem externalReference", { event: payload.event });
      return;
    }

    try {
      const merchant = await findMerchantById(merchantId);
      if (!merchant) {
        logger.warn("Webhook do Asaas: merchant nao encontrado pelo externalReference", { merchantId });
        return;
      }

      if (merchant.plan === "active") return; // ja liberado, evita mensagem duplicada em reenvio

      const valueCents = Math.round((payload.payment?.value ?? 0) * 100);

      await setMerchantPlan(merchant.id, "active");

      await sendWhatsAppText(
        merchant.whatsappPhone,
        `✅ Pagamento confirmado! Seu acesso ao Fiado foi renovado — ${formatBRL(valueCents)} recebidos. Obrigado por continuar com a gente 🧾`
      );

      await notifyAdminOfPixPayment(merchant, valueCents);
    } catch (err) {
      logger.error("Erro ao processar webhook de pagamento do Asaas", {
        error: err instanceof Error ? err.message : err,
        merchantId,
      });
    }
  });
}
