import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

/** Comando por voz so fica ativo com a OPENAI_API_KEY configurada - sem ela, o Claude nao transcreve audio. */
export function isVoiceTranscriptionEnabled(): boolean {
  return Boolean(env.OPENAI_API_KEY);
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  return "ogg"; // WhatsApp manda audio de voz como audio/ogg (codec opus) por padrao
}

/** Transcreve audio pra texto via OpenAI. So chamar depois de confirmar isVoiceTranscriptionEnabled(). */
export async function transcribeAudio(buffer: Buffer, mimeType: string): Promise<string> {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY nao configurada");
  }

  const form = new FormData();
  const ext = extensionForMimeType(mimeType);
  form.append("file", new Blob([buffer], { type: mimeType }), `audio.${ext}`);
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("language", "pt");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form,
  });

  if (!res.ok) {
    const errorBody = await res.text();
    logger.error("Falha ao transcrever audio via OpenAI", { status: res.status, errorBody });
    throw new Error(`Transcricao falhou: ${res.status}`);
  }

  const data = (await res.json()) as { text: string };
  return data.text.trim();
}
