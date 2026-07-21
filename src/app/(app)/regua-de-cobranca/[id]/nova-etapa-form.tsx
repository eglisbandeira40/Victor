"use client";

import { useActionState } from "react";
import { criarEtapa, type EtapaState } from "../actions";

const initialState: EtapaState = {};

export function NovaEtapaForm({ reguaId }: { reguaId: string }) {
  const action = criarEtapa.bind(null, reguaId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6"
    >
      <h2 className="font-medium text-zinc-900">Adicionar etapa</h2>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700">
            Dias em relação ao vencimento
          </span>
          <input
            name="diasOffset"
            type="number"
            required
            placeholder="-3"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <span className="mt-1 block text-xs text-zinc-400">
            Negativo = antes do vencimento, positivo = depois
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700">
            Canal
          </span>
          <select
            name="canal"
            defaultValue="EMAIL"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="EMAIL">E-mail</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="SMS">SMS</option>
          </select>
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-zinc-700">
          Assunto
        </span>
        <input
          name="assunto"
          type="text"
          required
          placeholder="Seu boleto vence em breve"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-zinc-700">
          Mensagem
        </span>
        <textarea
          name="mensagemTemplate"
          required
          rows={4}
          placeholder="Olá {{cliente}}, sua conta de {{valor}} vence em {{vencimento}}."
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <span className="mt-1 block text-xs text-zinc-400">
          Variáveis disponíveis: {"{{cliente}}"}, {"{{descricao}}"},{" "}
          {"{{valor}}"}, {"{{vencimento}}"}, {"{{empresa}}"}
        </span>
      </label>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending ? "Salvando..." : "Adicionar etapa"}
      </button>
    </form>
  );
}
