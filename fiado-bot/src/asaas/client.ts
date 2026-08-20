import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { setAsaasCustomerId } from "../domain/merchants.js";
import { formatPhoneDisplay } from "../utils/phone.js";
import type { merchants } from "../db/schema.js";

const ASAAS_API_BASE = "https://api.asaas.com/v3";

type MerchantRow = typeof merchants.$inferSelect;

function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    access_token: env.ASAAS_API_KEY ?? "",
  };
}

/**
 * Cria o customer no Asaas na primeira cobranca desse comerciante, ou reaproveita o que ja existe.
 * O Asaas exige CPF/CNPJ pra cobranca Pix - so chamar depois de confirmar que merchant.cpfCnpj existe.
 */
export async function createOrGetAsaasCustomer(merchant: MerchantRow): Promise<string> {
  if (merchant.asaasCustomerId) return merchant.asaasCustomerId;

  const res = await fetch(`${ASAAS_API_BASE}/customers`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      name: merchant.businessName ?? formatPhoneDisplay(merchant.whatsappPhone),
      cpfCnpj: merchant.cpfCnpj,
      mobilePhone: merchant.whatsappPhone,
      externalReference: merchant.id,
      notificationDisabled: true,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    logger.error("Falha ao criar customer no Asaas", { status: res.status, errorBody, merchantId: merchant.id });
    throw new Error(`Asaas customer create failed: ${res.status}`);
  }

  const data = (await res.json()) as { id: string };
  await setAsaasCustomerId(merchant.id, data.id);
  return data.id;
}

export interface PixCharge {
  paymentId: string;
  payload: string;
  qrCodeBase64: string;
  expirationDate: string;
}

/** Cria uma cobranca Pix (dueDate hoje) pro valor do plano e ja devolve o QR/copia-e-cola dela. */
export async function createPixCharge(merchant: MerchantRow, valueCents: number): Promise<PixCharge> {
  const asaasCustomerId = await createOrGetAsaasCustomer(merchant);
  const dueDate = new Date().toISOString().slice(0, 10);

  const paymentRes = await fetch(`${ASAAS_API_BASE}/payments`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      customer: asaasCustomerId,
      billingType: "PIX",
      value: valueCents / 100,
      dueDate,
      externalReference: merchant.id,
      description: "Fiado - assinatura mensal",
    }),
  });

  if (!paymentRes.ok) {
    const errorBody = await paymentRes.text();
    logger.error("Falha ao criar cobranca Pix no Asaas", { status: paymentRes.status, errorBody, merchantId: merchant.id });
    throw new Error(`Asaas payment create failed: ${paymentRes.status}`);
  }

  const payment = (await paymentRes.json()) as { id: string };

  const qrRes = await fetch(`${ASAAS_API_BASE}/payments/${payment.id}/pixQrCode`, {
    headers: headers(),
  });

  if (!qrRes.ok) {
    const errorBody = await qrRes.text();
    logger.error("Falha ao buscar QR Code Pix no Asaas", { status: qrRes.status, errorBody, paymentId: payment.id });
    throw new Error(`Asaas Pix QR Code fetch failed: ${qrRes.status}`);
  }

  const qr = (await qrRes.json()) as { encodedImage: string; payload: string; expirationDate: string };

  return {
    paymentId: payment.id,
    payload: qr.payload,
    qrCodeBase64: qr.encodedImage,
    expirationDate: qr.expirationDate,
  };
}
