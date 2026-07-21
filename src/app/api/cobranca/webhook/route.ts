import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type AsaasWebhookPayload = {
  event: string;
  payment: { id: string };
};

const EVENT_TO_STATUS: Record<string, "PAGO" | "VENCIDO" | "CANCELADO"> = {
  PAYMENT_RECEIVED: "PAGO",
  PAYMENT_CONFIRMED: "PAGO",
  PAYMENT_OVERDUE: "VENCIDO",
  PAYMENT_DELETED: "CANCELADO",
  PAYMENT_REFUNDED: "CANCELADO",
};

export async function POST(req: NextRequest) {
  const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;
  if (expectedToken) {
    const receivedToken = req.headers.get("asaas-access-token");
    if (receivedToken !== expectedToken) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const payload = (await req.json()) as AsaasWebhookPayload;
  const status = EVENT_TO_STATUS[payload.event];

  if (!status) {
    return NextResponse.json({ ignored: true });
  }

  const cobranca = await prisma.cobranca.findFirst({
    where: { gatewayId: payload.payment.id },
  });

  if (!cobranca) {
    return NextResponse.json({ ignored: true });
  }

  await prisma.cobranca.update({
    where: { id: cobranca.id },
    data: {
      status,
      dataPagamento: status === "PAGO" ? new Date() : undefined,
    },
  });

  const contaReceberStatus =
    status === "PAGO" ? "PAGO" : status === "VENCIDO" ? "ATRASADO" : undefined;

  if (contaReceberStatus) {
    await prisma.contaReceber.update({
      where: { id: cobranca.contaReceberId },
      data: {
        status: contaReceberStatus,
        dataRecebimento: contaReceberStatus === "PAGO" ? new Date() : undefined,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
