import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { excluirCliente } from "./actions";

export default async function ClientesPage() {
  const session = await requireSession();

  const clientes = await prisma.cliente.findMany({
    where: { empresaId: session.user.empresaId },
    orderBy: { nome: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Clientes</h1>
          <p className="text-sm text-zinc-500">Sua base de clientes</p>
        </div>
        <Link
          href="/clientes/novo"
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          <Plus size={16} />
          Novo cliente
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {clientes.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-zinc-500">
            Nenhum cliente cadastrado.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-400">
                <th className="px-6 py-3 font-medium">Nome</th>
                <th className="px-6 py-3 font-medium">Documento</th>
                <th className="px-6 py-3 font-medium">E-mail</th>
                <th className="px-6 py-3 font-medium">Telefone</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((cliente) => (
                <tr key={cliente.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-6 py-3 text-zinc-800">{cliente.nome}</td>
                  <td className="px-6 py-3 text-zinc-500">
                    {cliente.documento ?? "—"}
                  </td>
                  <td className="px-6 py-3 text-zinc-500">{cliente.email ?? "—"}</td>
                  <td className="px-6 py-3 text-zinc-500">
                    {cliente.telefone ?? "—"}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <form action={excluirCliente.bind(null, cliente.id)}>
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
    </div>
  );
}
