import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { formatBRL, formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { marcarContaPagarComoPaga, excluirContaPagar } from "./actions";

export default async function ContasAPagarPage() {
  const session = await requireSession();

  const contas = await prisma.contaPagar.findMany({
    where: { empresaId: session.user.empresaId },
    orderBy: { dataVencimento: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Contas a Pagar</h1>
          <p className="text-sm text-zinc-500">
            Controle suas despesas e obrigações
          </p>
        </div>
        <Link
          href="/contas-a-pagar/nova"
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          <Plus size={16} />
          Nova conta
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {contas.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-zinc-500">
            Nenhuma conta a pagar cadastrada.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-400">
                <th className="px-6 py-3 font-medium">Descrição</th>
                <th className="px-6 py-3 font-medium">Fornecedor</th>
                <th className="px-6 py-3 font-medium">Vencimento</th>
                <th className="px-6 py-3 font-medium text-right">Valor</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {contas.map((conta) => (
                <tr key={conta.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-6 py-3 text-zinc-800">
                    {conta.descricao}
                    {conta.categoria && (
                      <span className="ml-2 text-xs text-zinc-400">
                        {conta.categoria}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-zinc-500">
                    {conta.fornecedor ?? "—"}
                  </td>
                  <td className="px-6 py-3 text-zinc-500">
                    {formatDate(conta.dataVencimento)}
                  </td>
                  <td className="px-6 py-3 text-right font-medium text-zinc-900">
                    {formatBRL(Number(conta.valor))}
                  </td>
                  <td className="px-6 py-3">
                    <StatusBadge status={conta.status} />
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      {conta.status !== "PAGO" && (
                        <form action={marcarContaPagarComoPaga.bind(null, conta.id)}>
                          <button className="text-xs font-medium text-emerald-600 hover:underline">
                            Marcar paga
                          </button>
                        </form>
                      )}
                      <form action={excluirContaPagar.bind(null, conta.id)}>
                        <button className="text-xs font-medium text-rose-600 hover:underline">
                          Excluir
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
