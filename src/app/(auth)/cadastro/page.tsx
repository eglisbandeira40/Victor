"use client";

import { useActionState } from "react";
import Link from "next/link";
import { cadastrar, type CadastroState } from "./actions";

const initialState: CadastroState = {};

export default function CadastroPage() {
  const [state, formAction, pending] = useActionState(cadastrar, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <h1 className="text-lg font-semibold text-zinc-900">Crie sua conta</h1>

      <Field label="Nome da empresa" name="empresaNome" type="text" required />
      <Field label="Seu nome" name="nome" type="text" required />
      <Field label="E-mail" name="email" type="email" required />
      <Field label="Senha" name="password" type="password" required minLength={8} />

      {state?.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending ? "Criando conta..." : "Criar conta"}
      </button>

      <p className="text-center text-sm text-zinc-500">
        Já tem uma conta?{" "}
        <Link href="/login" className="font-medium text-emerald-600">
          Entrar
        </Link>
      </p>
    </form>
  );
}

function Field({
  label,
  name,
  type,
  required,
  minLength,
}: {
  label: string;
  name: string;
  type: string;
  required?: boolean;
  minLength?: number;
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
        minLength={minLength}
        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
      />
    </label>
  );
}
