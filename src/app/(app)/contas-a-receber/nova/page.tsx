import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { ContaReceberForm } from "./conta-receber-form";

export default async function NovaContaReceberPage() {
  const session = await requireSession();

  const [clientes, reguas, empresa] = await Promise.all([
    prisma.cliente.findMany({
      where: { empresaId: session.user.empresaId },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
    prisma.reguaCobranca.findMany({
      where: { empresaId: session.user.empresaId, ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
    prisma.empresa.findUniqueOrThrow({
      where: { id: session.user.empresaId },
      select: { gatewayStatus: true },
    }),
  ]);

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold text-zinc-900">
        Nova conta a receber
      </h1>

      {clientes.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
          Cadastre um cliente antes de lançar uma conta a receber.{" "}
          <Link href="/clientes/novo" className="font-medium text-emerald-600">
            Cadastrar cliente
          </Link>
        </div>
      ) : (
        <ContaReceberForm
          clientes={clientes}
          reguas={reguas}
          gatewayAtivo={empresa.gatewayStatus === "ATIVO"}
        />
      )}
    </div>
  );
}
