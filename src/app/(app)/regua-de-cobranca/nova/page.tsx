"use client";

import { useActionState } from "react";
import Link from "next/link";
import { criarRegua, type ReguaState } from "../actions";

const initialState: ReguaState = {};

export default function NovaReguaPage() {
  const [state, formAction, pending] = useActionState(criarRegua, initialState);

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold text-zinc-900">
        Nova régua de cobrança
      </h1>

      <form action={formAction} className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700">
            Nome
          </span>
          <input
            name="nome"
            type="text"
            required
            placeholder="Ex: Régua padrão"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </label>

        <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
          <input type="checkbox" name="padrao" className="h-4 w-4 rounded border-zinc-300" />
          Usar como régua padrão da empresa
        </label>

        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {pending ? "Salvando..." : "Salvar e adicionar etapas"}
          </button>
          <Link
            href="/regua-de-cobranca"
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
