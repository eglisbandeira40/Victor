"use client";

import { useActionState } from "react";
import { ativarGateway, type GatewayOnboardingState } from "./actions";

const initialState: GatewayOnboardingState = {};

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(ativarGateway, initialState);

  if (state?.success) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-800">
        Gateway de pagamento ativado! Você já pode emitir cobranças (boleto e
        PIX) nas contas a receber.
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6"
    >
      <Field label="Razão social / Nome completo" name="nome" type="text" required />

      <div className="grid grid-cols-2 gap-4">
        <Field label="CPF ou CNPJ" name="cpfCnpj" type="text" required />
        <Field
          label="Data de nascimento / fundação"
          name="dataNascimentoOuFundacao"
          type="date"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="E-mail" name="email" type="email" required />
        <Field label="Telefone" name="telefone" type="tel" required />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Endereço" name="endereco" type="text" required />
        <Field label="Número" name="numeroEndereco" type="text" required />
        <Field label="Complemento" name="complemento" type="text" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Bairro" name="bairro" type="text" required />
        <Field label="CEP" name="cep" type="text" required />
      </div>

      <Field
        label="Faturamento mensal estimado (R$)"
        name="faturamentoMensal"
        type="number"
        step="0.01"
        required
      />

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending ? "Ativando..." : "Ativar gateway de pagamento"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  type,
  required,
  step,
}: {
  label: string;
  name: string;
  type: string;
  required?: boolean;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-700">
        {label}
      </span>
      <input
        name={name}
        type={type}
        step={step}
        required={required}
        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
      />
    </label>
  );
}
