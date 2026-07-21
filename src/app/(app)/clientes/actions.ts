"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { clienteSchema } from "@/lib/validations";

export type ClienteState = { error?: string };

export async function criarCliente(
  _prevState: ClienteState,
  formData: FormData
): Promise<ClienteState> {
  const session = await requireSession();

  const parsed = clienteSchema.safeParse({
    nome: formData.get("nome"),
    documento: formData.get("documento") || undefined,
    email: formData.get("email") || undefined,
    telefone: formData.get("telefone") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  await prisma.cliente.create({
    data: {
      empresaId: session.user.empresaId,
      nome: parsed.data.nome,
      documento: parsed.data.documento || null,
      email: parsed.data.email || null,
      telefone: parsed.data.telefone || null,
    },
  });

  revalidatePath("/clientes");
  redirect("/clientes");
}

export async function excluirCliente(id: string) {
  const session = await requireSession();

  try {
    await prisma.cliente.deleteMany({
      where: { id, empresaId: session.user.empresaId },
    });
  } catch {
    // Cliente possui contas a receber vinculadas; exclusão bloqueada.
  }

  revalidatePath("/clientes");
}
