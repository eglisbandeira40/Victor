import { env } from "../config/env.js";

const GRAPH_API_VERSION = "v21.0";

export interface DownloadedMedia {
  buffer: Buffer;
  mimeType: string;
}

/** Baixa uma midia do WhatsApp (ex: audio de voz) a partir do `id` que vem no webhook. */
export async function downloadWhatsAppMedia(mediaId: string): Promise<DownloadedMedia> {
  const metaRes = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` },
  });

  if (!metaRes.ok) {
    throw new Error(`Falha ao buscar metadados da midia: ${metaRes.status}`);
  }

  const meta = (await metaRes.json()) as { url: string; mime_type: string };

  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` },
  });

  if (!fileRes.ok) {
    throw new Error(`Falha ao baixar midia: ${fileRes.status}`);
  }

  const arrayBuffer = await fileRes.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), mimeType: meta.mime_type };
}
