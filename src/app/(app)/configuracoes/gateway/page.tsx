import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { OnboardingForm } from "./onboarding-form";

const STATUS_INFO: Record<string, { label: string; className: string }> = {
  NAO_CONFIGURADO: { label: "Não configurado", className: "bg-zinc-100 text-zinc-700" },
  PENDENTE: { label: "Em análise", className: "bg-amber-100 text-amber-700" },
  ATIVO: { label: "Ativo", className: "bg-emerald-100 text-emerald-700" },
  REJEITADO: { label: "Recusado", className: "bg-rose-100 text-rose-700" },
};

export default async function GatewayConfigPage() {
  const session = await requireSession();

  const empresa = await prisma.empresa.findUniqueOrThrow({
    where: { id: session.user.empresaId },
  });

  const status = STATUS_INFO[empresa.gatewayStatus];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">
          Gateway de Pagamento
        </h1>
        <p className="text-sm text-zinc-500">
          Emita boletos e PIX diretamente pelo HubFinance
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-zinc-600">Status:</span>
        <span className={`rounded-full px-2 py-1 text-xs font-medium ${status.className}`}>
          {status.label}
        </span>
      </div>

      {empresa.gatewayStatus === "ATIVO" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-800">
          Seu gateway de pagamento está ativo. As contas a receber podem
          emitir cobranças em boleto e PIX diretamente.
        </div>
      ) : empresa.gatewayStatus === "PENDENTE" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          Seu cadastro está em análise. Isso costuma levar poucos minutos.
        </div>
      ) : (
        <>
          <p className="text-sm text-zinc-600">
            Preencha os dados abaixo para habilitar a emissão de cobranças
            (boleto e PIX) diretamente pelo HubFinance. É um cadastro único.
          </p>
          <OnboardingForm />
        </>
      )}
    </div>
  );
}
