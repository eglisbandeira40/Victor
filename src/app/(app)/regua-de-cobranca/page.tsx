import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { alternarAtivoRegua, excluirRegua } from "./actions";

export default async function ReguaCobrancaPage() {
  const session = await requireSession();

  const reguas = await prisma.reguaCobranca.findMany({
    where: { empresaId: session.user.empresaId },
    orderBy: { createdAt: "asc" },
    include: { etapas: true, _count: { select: { contasReceber: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">
            Régua de Cobrança
          </h1>
          <p className="text-sm text-zinc-500">
            Automatize lembretes antes e depois do vencimento
          </p>
        </div>
        <Link
          href="/regua-de-cobranca/nova"
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          <Plus size={16} />
          Nova régua
        </Link>
      </div>

      {reguas.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white px-6 py-10 text-center text-sm text-zinc-500">
          Nenhuma régua de cobrança cadastrada.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {reguas.map((regua) => (
            <div
              key={regua.id}
              className="rounded-xl border border-zinc-200 bg-white p-5"
            >
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <Link
                    href={`/regua-de-cobranca/${regua.id}`}
                    className="font-medium text-zinc-900 hover:underline"
                  >
                    {regua.nome}
                  </Link>
                  {regua.padrao && (
                    <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      Padrão
                    </span>
                  )}
                </div>
                <form action={excluirRegua.bind(null, regua.id)}>
                  <button className="text-xs font-medium text-rose-600 hover:underline">
                    Excluir
                  </button>
                </form>
              </div>
              <p className="text-xs text-zinc-500">
                {regua.etapas.length} etapa(s) · {regua._count.contasReceber}{" "}
                conta(s) vinculada(s)
              </p>
              <form
                action={alternarAtivoRegua.bind(null, regua.id, !regua.ativo)}
                className="mt-3"
              >
                <button className="text-xs font-medium text-zinc-600 hover:underline">
                  {regua.ativo ? "Desativar" : "Ativar"}
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
