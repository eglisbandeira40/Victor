import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { formatBRL, formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { marcarContaReceberComoPaga, excluirContaReceber } from "./actions";

export default async function ContasAReceberPage() {
  const session = await requireSession();

  const contas = await prisma.contaReceber.findMany({
    where: { empresaId: session.user.empresaId },
    orderBy: { dataVencimento: "asc" },
    include: { cliente: true, cobrancas: { orderBy: { dataEmissao: "desc" }, take: 1 } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Contas a Receber</h1>
          <p className="text-sm text-zinc-500">
            Acompanhe recebíveis e cobranças emitidas
          </p>
        </div>
        <Link
          href="/contas-a-receber/nova"
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          <Plus size={16} />
          Nova conta
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {contas.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-zinc-500">
            Nenhuma conta a receber cadastrada.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-400">
                <th className="px-6 py-3 font-medium">Cliente</th>
                <th className="px-6 py-3 font-medium">Descrição</th>
                <th className="px-6 py-3 font-medium">Vencimento</th>
                <th className="px-6 py-3 font-medium text-right">Valor</th>
                <th className="px-6 py-3 font-medium">Cobrança</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {contas.map((conta) => {
                const cobranca = conta.cobrancas[0];
                return (
                  <tr key={conta.id} className="border-b border-zinc-100 last:border-0">
                    <td className="px-6 py-3 text-zinc-800">{conta.cliente.nome}</td>
                    <td className="px-6 py-3 text-zinc-500">{conta.descricao}</td>
                    <td className="px-6 py-3 text-zinc-500">
                      {formatDate(conta.dataVencimento)}
                    </td>
                    <td className="px-6 py-3 text-right font-medium text-zinc-900">
                      {formatBRL(Number(conta.valor))}
                    </td>
                    <td className="px-6 py-3">
                      {cobranca ? (
                        <a
                          href={`/cobranca/${cobranca.publicToken}`}
                          target="_blank"
                          className="text-xs font-medium text-emerald-600 hover:underline"
                        >
                          {cobranca.tipo}
                        </a>
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <StatusBadge status={conta.status} />
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex justify-end gap-3">
                        {conta.status !== "PAGO" && (
                          <form action={marcarContaReceberComoPaga.bind(null, conta.id)}>
                            <button className="text-xs font-medium text-emerald-600 hover:underline">
                              Marcar paga
                            </button>
                          </form>
                        )}
                        <form action={excluirContaReceber.bind(null, conta.id)}>
                          <button className="text-xs font-medium text-rose-600 hover:underline">
                            Excluir
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
