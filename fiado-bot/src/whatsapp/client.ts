import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const GRAPH_API_VERSION = "v21.0";

export async function sendWhatsAppText(to: string, body: string): Promise<void> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body, preview_url: false },
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    logger.error("Falha ao enviar mensagem no WhatsApp", { status: res.status, errorBody, to });
    throw new Error(`WhatsApp send failed: ${res.status}`);
  }
}

/**
 * Manda uma mensagem via Message Template aprovado pela Meta - necessario pra mensagens que a
 * empresa inicia fora da janela de 24h de conversa (o texto livre e rejeitado nesse caso).
 * `bodyParams` preenche as variaveis {{1}}, {{2}}, ... do corpo do template, em ordem.
 */
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  bodyParams: string[]
): Promise<void> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components: [
          {
            type: "body",
            parameters: bodyParams.map((text) => ({ type: "text", text })),
          },
        ],
      },
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    logger.error("Falha ao enviar template no WhatsApp", { status: res.status, errorBody, to, templateName });
    throw new Error(`WhatsApp template send failed: ${res.status}`);
  }
}

/**
 * Manda uma mensagem proativa (iniciada pela empresa, fora de resposta a um usuario): usa o Message
 * Template configurado se houver, senao cai pra texto livre (so funciona dentro da janela de 24h).
 */
export async function sendProactiveMessage(
  to: string,
  params: { templateName: string | undefined; templateParams: string[]; fallbackText: string }
): Promise<void> {
  if (params.templateName) {
    await sendWhatsAppTemplate(to, params.templateName, env.WHATSAPP_TEMPLATE_LANGUAGE, params.templateParams);
    return;
  }

  logger.warn("Template nao configurado - mandando texto livre (falha fora da janela de 24h)", { to });
  await sendWhatsAppText(to, params.fallbackText);
}
