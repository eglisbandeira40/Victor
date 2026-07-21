import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { formatBRL, formatDate } from "@/lib/format";
import { ArrowDownCircle, ArrowUpCircle, AlertTriangle, Wallet } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";

export default async function DashboardPage() {
  const session = await requireSession();
  const empresaId = session.user.empresaId;

  const [receberAberto, pagarAberto, receberAtrasado, proximos] =
    await Promise.all([
      prisma.contaReceber.aggregate({
        where: { empresaId, status: { in: ["PENDENTE", "ATRASADO"] } },
        _sum: { valor: true },
        _count: true,
      }),
      prisma.contaPagar.aggregate({
        where: { empresaId, status: { in: ["PENDENTE", "ATRASADO"] } },
        _sum: { valor: true },
        _count: true,
      }),
      prisma.contaReceber.aggregate({
        where: { empresaId, status: "ATRASADO" },
        _sum: { valor: true },
        _count: true,
      }),
      prisma.contaReceber.findMany({
        where: { empresaId, status: { in: ["PENDENTE", "ATRASADO"] } },
        orderBy: { dataVencimento: "asc" },
        take: 6,
        include: { cliente: true },
      }),
    ]);

  const saldoProjetado =
    Number(receberAberto._sum.valor ?? 0) - Number(pagarAberto._sum.valor ?? 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Dashboard</h1>
        <p className="text-sm text-zinc-500">
          Visão geral do seu fluxo de caixa
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          icon={<ArrowDownCircle className="text-emerald-600" size={20} />}
          label="A receber (em aberto)"
          value={formatBRL(Number(receberAberto._sum.valor ?? 0))}
          sub={`${receberAberto._count} título(s)`}
        />
        <Card
          icon={<ArrowUpCircle className="text-rose-600" size={20} />}
          label="A pagar (em aberto)"
          value={formatBRL(Number(pagarAberto._sum.valor ?? 0))}
          sub={`${pagarAberto._count} título(s)`}
        />
        <Card
          icon={<AlertTriangle className="text-amber-600" size={20} />}
          label="Recebíveis atrasados"
          value={formatBRL(Number(receberAtrasado._sum.valor ?? 0))}
          sub={`${receberAtrasado._count} título(s)`}
        />
        <Card
          icon={<Wallet className="text-zinc-700" size={20} />}
          label="Saldo projetado"
          value={formatBRL(saldoProjetado)}
          sub="Receber − Pagar"
        />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <h2 className="font-medium text-zinc-900">Próximos vencimentos</h2>
          <Link
            href="/contas-a-receber"
            className="text-sm font-medium text-emerald-600"
          >
            Ver todas
          </Link>
        </div>
        {proximos.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-zinc-500">
            Nenhuma conta a receber em aberto.
          </p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {proximos.map((conta) => (
                <tr key={conta.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-6 py-3 text-zinc-800">{conta.cliente.nome}</td>
                  <td className="px-6 py-3 text-zinc-500">{conta.descricao}</td>
                  <td className="px-6 py-3 text-zinc-500">
                    {formatDate(conta.dataVencimento)}
                  </td>
                  <td className="px-6 py-3 text-right font-medium text-zinc-900">
                    {formatBRL(Number(conta.valor))}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <StatusBadge status={conta.status} />
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

function Card({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <span className="text-sm text-zinc-500">{label}</span>
      </div>
      <p className="text-xl font-semibold text-zinc-900">{value}</p>
      <p className="text-xs text-zinc-400">{sub}</p>
    </div>
  );
}
