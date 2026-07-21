"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { gatewayOnboardingSchema } from "@/lib/validations";
import { provisionarContaGateway } from "@/lib/gateway";

export type GatewayOnboardingState = { error?: string; success?: boolean };

export async function ativarGateway(
  _prevState: GatewayOnboardingState,
  formData: FormData
): Promise<GatewayOnboardingState> {
  const session = await requireSession();

  const parsed = gatewayOnboardingSchema.safeParse({
    nome: formData.get("nome"),
    cpfCnpj: formData.get("cpfCnpj"),
    email: formData.get("email"),
    telefone: formData.get("telefone"),
    dataNascimentoOuFundacao: formData.get("dataNascimentoOuFundacao"),
    endereco: formData.get("endereco"),
    numeroEndereco: formData.get("numeroEndereco"),
    complemento: formData.get("complemento") || undefined,
    bairro: formData.get("bairro"),
    cep: formData.get("cep"),
    faturamentoMensal: formData.get("faturamentoMensal"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await provisionarContaGateway(session.user.empresaId, parsed.data);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Não foi possível ativar o gateway: ${err.message}`
          : "Não foi possível ativar o gateway.",
    };
  }

  revalidatePath("/configuracoes/gateway");
  return { success: true };
}
