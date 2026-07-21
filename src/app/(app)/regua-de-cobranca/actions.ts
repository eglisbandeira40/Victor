"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { reguaCobrancaSchema, reguaEtapaSchema } from "@/lib/validations";

export type ReguaState = { error?: string };

export async function criarRegua(
  _prevState: ReguaState,
  formData: FormData
): Promise<ReguaState> {
  const session = await requireSession();

  const parsed = reguaCobrancaSchema.safeParse({
    nome: formData.get("nome"),
    padrao: formData.get("padrao") === "on",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  if (parsed.data.padrao) {
    await prisma.reguaCobranca.updateMany({
      where: { empresaId: session.user.empresaId, padrao: true },
      data: { padrao: false },
    });
  }

  const regua = await prisma.reguaCobranca.create({
    data: {
      empresaId: session.user.empresaId,
      nome: parsed.data.nome,
      padrao: parsed.data.padrao ?? false,
    },
  });

  revalidatePath("/regua-de-cobranca");
  redirect(`/regua-de-cobranca/${regua.id}`);
}

export async function alternarAtivoRegua(id: string, ativo: boolean) {
  const session = await requireSession();

  await prisma.reguaCobranca.updateMany({
    where: { id, empresaId: session.user.empresaId },
    data: { ativo },
  });

  revalidatePath("/regua-de-cobranca");
}

export async function excluirRegua(id: string) {
  const session = await requireSession();

  await prisma.reguaCobranca.deleteMany({
    where: { id, empresaId: session.user.empresaId },
  });

  revalidatePath("/regua-de-cobranca");
}

export type EtapaState = { error?: string };

export async function criarEtapa(
  reguaId: string,
  _prevState: EtapaState,
  formData: FormData
): Promise<EtapaState> {
  const session = await requireSession();

  const regua = await prisma.reguaCobranca.findFirst({
    where: { id: reguaId, empresaId: session.user.empresaId },
  });
  if (!regua) return { error: "Régua não encontrada" };

  const parsed = reguaEtapaSchema.safeParse({
    diasOffset: formData.get("diasOffset"),
    canal: formData.get("canal"),
    assunto: formData.get("assunto"),
    mensagemTemplate: formData.get("mensagemTemplate"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const ultimaOrdem = await prisma.reguaCobrancaEtapa.count({
    where: { reguaCobrancaId: reguaId },
  });

  await prisma.reguaCobrancaEtapa.create({
    data: {
      reguaCobrancaId: reguaId,
      ordem: ultimaOrdem + 1,
      diasOffset: parsed.data.diasOffset,
      canal: parsed.data.canal,
      assunto: parsed.data.assunto,
      mensagemTemplate: parsed.data.mensagemTemplate,
    },
  });

  revalidatePath(`/regua-de-cobranca/${reguaId}`);
  return {};
}

export async function excluirEtapa(reguaId: string, etapaId: string) {
  const session = await requireSession();

  await prisma.reguaCobrancaEtapa.deleteMany({
    where: { id: etapaId, reguaCobranca: { empresaId: session.user.empresaId } },
  });

  revalidatePath(`/regua-de-cobranca/${reguaId}`);
}
