import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { excluirEtapa } from "../actions";
import { NovaEtapaForm } from "./nova-etapa-form";

const CANAL_LABEL: Record<string, string> = {
  EMAIL: "E-mail",
  WHATSAPP: "WhatsApp",
  SMS: "SMS",
};

export default async function ReguaDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();

  const regua = await prisma.reguaCobranca.findFirst({
    where: { id, empresaId: session.user.empresaId },
    include: { etapas: { orderBy: { diasOffset: "asc" } } },
  });

  if (!regua) notFound();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">{regua.nome}</h1>
        <p className="text-sm text-zinc-500">
          {regua.padrao ? "Régua padrão da empresa" : "Régua de cobrança"}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {regua.etapas.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-zinc-500">
            Nenhuma etapa cadastrada ainda.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-400">
                <th className="px-6 py-3 font-medium">Quando</th>
                <th className="px-6 py-3 font-medium">Canal</th>
                <th className="px-6 py-3 font-medium">Assunto</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {regua.etapas.map((etapa) => (
                <tr key={etapa.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-6 py-3 text-zinc-800">
                    {etapa.diasOffset === 0
                      ? "No vencimento"
                      : etapa.diasOffset < 0
                      ? `${Math.abs(etapa.diasOffset)} dia(s) antes`
                      : `${etapa.diasOffset} dia(s) depois`}
                  </td>
                  <td className="px-6 py-3 text-zinc-500">
                    {CANAL_LABEL[etapa.canal]}
                  </td>
                  <td className="px-6 py-3 text-zinc-500">{etapa.assunto}</td>
                  <td className="px-6 py-3 text-right">
                    <form action={excluirEtapa.bind(null, regua.id, etapa.id)}>
                      <button className="text-xs font-medium text-rose-600 hover:underline">
                        Excluir
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <NovaEtapaForm reguaId={regua.id} />
    </div>
  );
}
