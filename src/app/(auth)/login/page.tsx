"use client";

import { useActionState } from "react";
import Link from "next/link";
import { entrar, type LoginState } from "./actions";

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(entrar, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <h1 className="text-lg font-semibold text-zinc-900">Entrar</h1>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-zinc-700">
          E-mail
        </span>
        <input
          name="email"
          type="email"
          required
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-zinc-700">
          Senha
        </span>
        <input
          name="password"
          type="password"
          required
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </label>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending ? "Entrando..." : "Entrar"}
      </button>

      <p className="text-center text-sm text-zinc-500">
        Ainda não tem conta?{" "}
        <Link href="/cadastro" className="font-medium text-emerald-600">
          Criar conta
        </Link>
      </p>
    </form>
  );
}
