import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { env } from "../config/env.js";
import { isValidSignature } from "../whatsapp/verify.js";
import { handleInboundMessage } from "../handlers/messageHandler.js";
import { logger } from "../utils/logger.js";
import type { WhatsAppWebhookPayload } from "../whatsapp/types.js";

export async function registerWebhookRoutes(app: FastifyInstance) {
  // Verificacao do webhook (Meta chama isso uma vez ao configurar)
  app.get("/webhook", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;
    const mode = query["hub.mode"];
    const token = query["hub.verify_token"];
    const challenge = query["hub.challenge"];

    if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN) {
      return reply.status(200).send(challenge);
    }

    return reply.status(403).send("Forbidden");
  });

  // Recebimento de mensagens
  app.post("/webhook", async (request: FastifyRequest, reply: FastifyReply) => {
    const signature = request.headers["x-hub-signature-256"] as string | undefined;
    const rawBody = request.rawBody as Buffer | undefined;

    if (!rawBody || !isValidSignature(rawBody, signature)) {
      logger.warn("Assinatura invalida no webhook do WhatsApp");
      return reply.status(401).send("Invalid signature");
    }

    // Sempre confirma rapido pro Meta nao ficar reenviando
    reply.status(200).send("EVENT_RECEIVED");

    const payload = request.body as WhatsAppWebhookPayload;

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes) {
        // `contacts` traz o nome de exibicao do WhatsApp de quem mandou - usado pra preencher o
        // business_name do comerciante sem ele precisar fazer nada (ver handleInboundMessage).
        const profileNames = new Map((change.value.contacts ?? []).map((c) => [c.wa_id, c.profile.name]));

        for (const message of change.value.messages ?? []) {
          const profileName = profileNames.get(message.from);
          handleInboundMessage(message, profileName).catch((err) => {
            logger.error("Erro nao tratado ao processar mensagem inbound", {
              error: err instanceof Error ? err.message : err,
            });
          });
        }
      }
    }
  });
}
