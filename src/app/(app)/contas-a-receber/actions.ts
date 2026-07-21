"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { contaReceberSchema } from "@/lib/validations";
import { emitirCobranca } from "@/lib/gateway";

export type ContaReceberState = { error?: string };

export async function criarContaReceber(
  _prevState: ContaReceberState,
  formData: FormData
): Promise<ContaReceberState> {
  const session = await requireSession();

  const parsed = contaReceberSchema.safeParse({
    clienteId: formData.get("clienteId"),
    descricao: formData.get("descricao"),
    valor: formData.get("valor"),
    dataVencimento: formData.get("dataVencimento"),
    reguaCobrancaId: formData.get("reguaCobrancaId") || undefined,
    emitirCobranca: formData.get("emitirCobranca") === "on",
    tipoCobranca: formData.get("tipoCobranca") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const [cliente, empresa] = await Promise.all([
    prisma.cliente.findFirst({
      where: { id: parsed.data.clienteId, empresaId: session.user.empresaId },
    }),
    prisma.empresa.findUniqueOrThrow({ where: { id: session.user.empresaId } }),
  ]);
  if (!cliente) {
    return { error: "Cliente inválido" };
  }

  const conta = await prisma.contaReceber.create({
    data: {
      empresaId: session.user.empresaId,
      clienteId: cliente.id,
      descricao: parsed.data.descricao,
      valor: parsed.data.valor,
      dataVencimento: new Date(parsed.data.dataVencimento),
      reguaCobrancaId: parsed.data.reguaCobrancaId || null,
    },
  });

  if (parsed.data.emitirCobranca) {
    try {
      await emitirCobranca({
        contaReceberId: conta.id,
        tipo: parsed.data.tipoCobranca ?? "PIX",
        empresa,
        cliente,
        valor: parsed.data.valor,
        dataVencimento: conta.dataVencimento,
      });
    } catch (err) {
      // A conta já foi criada; a emissão pode ser tentada novamente depois.
      console.error("Falha ao emitir cobrança:", err);
    }
  }

  revalidatePath("/contas-a-receber");
  redirect("/contas-a-receber");
}

export async function marcarContaReceberComoPaga(id: string) {
  const session = await requireSession();

  await prisma.contaReceber.updateMany({
    where: { id, empresaId: session.user.empresaId },
    data: { status: "PAGO", dataRecebimento: new Date() },
  });

  revalidatePath("/contas-a-receber");
}

export async function excluirContaReceber(id: string) {
  const session = await requireSession();

  await prisma.contaReceber.deleteMany({
    where: { id, empresaId: session.user.empresaId },
  });

  revalidatePath("/contas-a-receber");
}
