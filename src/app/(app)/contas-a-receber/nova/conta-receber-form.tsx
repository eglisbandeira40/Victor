"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { criarContaReceber, type ContaReceberState } from "../actions";

const initialState: ContaReceberState = {};

type Props = {
  clientes: { id: string; nome: string }[];
  reguas: { id: string; nome: string }[];
  gatewayAtivo: boolean;
};

export function ContaReceberForm({ clientes, reguas, gatewayAtivo }: Props) {
  const [state, formAction, pending] = useActionState(
    criarContaReceber,
    initialState
  );
  const [emitir, setEmitir] = useState(false);

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-zinc-700">
          Cliente
        </span>
        <select
          name="clienteId"
          required
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          <option value="">Selecione um cliente</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-zinc-700">
          Descrição
        </span>
        <input
          name="descricao"
          type="text"
          required
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700">
            Valor (R$)
          </span>
          <input
            name="valor"
            type="number"
            step="0.01"
            required
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700">
            Vencimento
          </span>
          <input
            name="dataVencimento"
            type="date"
            required
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-zinc-700">
          Régua de cobrança
        </span>
        <select
          name="reguaCobrancaId"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          <option value="">Nenhuma</option>
          {reguas.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nome}
            </option>
          ))}
        </select>
      </label>

      <div className="rounded-lg border border-zinc-200 p-3">
        {gatewayAtivo ? (
          <>
            <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
              <input
                type="checkbox"
                name="emitirCobranca"
                checked={emitir}
                onChange={(e) => setEmitir(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300"
              />
              Emitir cobrança (boleto/PIX) agora
            </label>

            {emitir && (
              <label className="mt-3 block">
                <span className="mb-1 block text-sm font-medium text-zinc-700">
                  Tipo
                </span>
                <select
                  name="tipoCobranca"
                  defaultValue="PIX"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="PIX">PIX</option>
                  <option value="BOLETO">Boleto</option>
                </select>
              </label>
            )}
          </>
        ) : (
          <p className="text-sm text-zinc-600">
            Para emitir cobranças (boleto/PIX) direto pelo HubFinance,{" "}
            <Link
              href="/configuracoes/gateway"
              className="font-medium text-emerald-600"
            >
              ative o gateway de pagamento
            </Link>
            .
          </p>
        )}
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending ? "Salvando..." : "Salvar"}
        </button>
        <Link
          href="/contas-a-receber"
          className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
