import crypto from "node:crypto";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

/**
 * Confere a assinatura X-Hub-Signature-256 do webhook da Meta.
 * Sem WHATSAPP_APP_SECRET configurado, so avisa e deixa passar (facilita dev local).
 */
export function isValidSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!env.WHATSAPP_APP_SECRET) {
    logger.warn("WHATSAPP_APP_SECRET nao configurado - pulando validacao de assinatura do webhook");
    return true;
  }

  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", env.WHATSAPP_APP_SECRET)
    .update(rawBody)
    .digest("hex");

  const received = signatureHeader.slice("sha256=".length);

  const expectedBuf = Buffer.from(expected, "hex");
  const receivedBuf = Buffer.from(received, "hex");

  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}
