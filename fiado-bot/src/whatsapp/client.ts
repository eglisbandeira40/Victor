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
