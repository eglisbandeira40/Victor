"use client";

import { useActionState } from "react";
import Link from "next/link";
import { criarCliente, type ClienteState } from "../actions";

const initialState: ClienteState = {};

export default function NovoClientePage() {
  const [state, formAction, pending] = useActionState(criarCliente, initialState);

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold text-zinc-900">Novo cliente</h1>

      <form action={formAction} className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6">
        <Field label="Nome" name="nome" type="text" required />
        <Field label="CPF/CNPJ" name="documento" type="text" />
        <Field label="E-mail" name="email" type="email" />
        <Field label="Telefone" name="telefone" type="tel" />

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
            href="/clientes"
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  type,
  required,
}: {
  label: string;
  name: string;
  type: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-700">
        {label}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
      />
    </label>
  );
}
