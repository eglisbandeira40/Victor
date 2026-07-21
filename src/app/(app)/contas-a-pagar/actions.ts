"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { contaPagarSchema } from "@/lib/validations";

export type ContaPagarState = { error?: string };

export async function criarContaPagar(
  _prevState: ContaPagarState,
  formData: FormData
): Promise<ContaPagarState> {
  const session = await requireSession();

  const parsed = contaPagarSchema.safeParse({
    descricao: formData.get("descricao"),
    categoria: formData.get("categoria") || undefined,
    fornecedor: formData.get("fornecedor") || undefined,
    valor: formData.get("valor"),
    dataVencimento: formData.get("dataVencimento"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  await prisma.contaPagar.create({
    data: {
      empresaId: session.user.empresaId,
      descricao: parsed.data.descricao,
      categoria: parsed.data.categoria || null,
      fornecedor: parsed.data.fornecedor || null,
      valor: parsed.data.valor,
      dataVencimento: new Date(parsed.data.dataVencimento),
    },
  });

  revalidatePath("/contas-a-pagar");
  redirect("/contas-a-pagar");
}

export async function marcarContaPagarComoPaga(id: string) {
  const session = await requireSession();

  await prisma.contaPagar.updateMany({
    where: { id, empresaId: session.user.empresaId },
    data: { status: "PAGO", dataPagamento: new Date() },
  });

  revalidatePath("/contas-a-pagar");
}

export async function excluirContaPagar(id: string) {
  const session = await requireSession();

  await prisma.contaPagar.deleteMany({
    where: { id, empresaId: session.user.empresaId },
  });

  revalidatePath("/contas-a-pagar");
}
