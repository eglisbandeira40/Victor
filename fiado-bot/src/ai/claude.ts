import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export type FiadoIntent =
  | { type: "record_debt"; customerName: string; amount: number; description?: string }
  | { type: "register_customer"; customerName: string; phone: string }
  | { type: "register_payment"; customerName: string; amount: number }
  | { type: "close_account"; customerName: string }
  | { type: "archive_account"; customerName: string }
  | { type: "purchase_history"; customerName: string }
  | { type: "query_balance"; customerName: string }
  | { type: "query_debtors"; minAmount?: number }
  | { type: "weekly_summary" }
  | { type: "monthly_statement" }
  | { type: "list_defaulters" }
  | { type: "collect_customer"; customerName: string };

const RECORD_DEBT_TOOL: Anthropic.Tool = {
  name: "record_debt",
  description:
    "Registra uma nova divida (fiado) de um cliente do comerciante. So chame essa ferramenta quando a mensagem " +
    "descrever claramente uma venda ou consumo fiado: quem comprou/consumiu e quanto ficou devendo. " +
    "Nao chame para pagamentos, cadastro, fechar/excluir conta ou mensagens sem nome+valor.",
  input_schema: {
    type: "object",
    properties: {
      customer_name: { type: "string", description: "Nome do cliente que ficou devendo" },
      amount: { type: "number", description: "Valor da divida em reais (ex: 45.5 para R$ 45,50)" },
      description: { type: "string", description: "O que foi comprado/consumido, se mencionado" },
    },
    required: ["customer_name", "amount"],
  },
};

const REGISTER_CUSTOMER_TOOL: Anthropic.Tool = {
  name: "register_customer",
  description:
    "Cadastra um cliente ou atualiza o telefone dele. So chame quando a mensagem comecar com algo como " +
    "'cadastrar', 'cadastro de', 'telefone do/da', ou claramente estiver informando o telefone de um " +
    "cliente pelo nome, sem mencionar valor de divida ou pagamento.",
  input_schema: {
    type: "object",
    properties: {
      customer_name: { type: "string", description: "Nome do cliente" },
      phone: { type: "string", description: "Telefone do cliente" },
    },
    required: ["customer_name", "phone"],
  },
};

const REGISTER_PAYMENT_TOOL: Anthropic.Tool = {
  name: "register_payment",
  description:
    "Registra que um cliente pagou (deu baixa em) parte ou toda a divida. So chame quando a mensagem disser " +
    "claramente que um cliente pagou/quitou um valor, por exemplo 'Ze Carlos pagou 20 reais'.",
  input_schema: {
    type: "object",
    properties: {
      customer_name: { type: "string", description: "Nome do cliente que pagou" },
      amount: { type: "number", description: "Valor pago em reais (ex: 20 para R$ 20,00)" },
    },
    required: ["customer_name", "amount"],
  },
};

const CLOSE_ACCOUNT_TOOL: Anthropic.Tool = {
  name: "close_account",
  description:
    "Fecha a conta em aberto de um cliente, por exemplo 'fechar a conta do Ze Carlos' ou 'encerrar conta da Maria'. " +
    "So chame quando a mensagem pedir claramente pra fechar/encerrar a conta de alguem (nao e pagamento nem divida nova).",
  input_schema: {
    type: "object",
    properties: {
      customer_name: { type: "string", description: "Nome do cliente cuja conta vai ser fechada" },
    },
    required: ["customer_name"],
  },
};

const ARCHIVE_ACCOUNT_TOOL: Anthropic.Tool = {
  name: "archive_account",
  description:
    "Exclui/arquiva o historico de divida antiga de um cliente ja quitado, mantendo o cadastro dele pra uma " +
    "conta nova. So chame quando a mensagem pedir claramente pra excluir, apagar, resetar ou arquivar a conta " +
    "de alguem, por exemplo 'excluir a conta do Ze Carlos' ou 'apagar conta da Maria'.",
  input_schema: {
    type: "object",
    properties: {
      customer_name: { type: "string", description: "Nome do cliente cuja conta vai ser arquivada" },
    },
    required: ["customer_name"],
  },
};

const PURCHASE_HISTORY_TOOL: Anthropic.Tool = {
  name: "purchase_history",
  description:
    "Mostra o historico de compras e pagamentos de UM cliente especifico, mencionado pelo nome. So chame " +
    "quando a mensagem pedir claramente pra ver o historico ou lista de compras de alguem, por exemplo " +
    "'historico do Ze Carlos'. Nao chame pra registrar divida nova, pagamento, nem para o extrato mensal " +
    "geral do negocio (isso e outra ferramenta, monthly_statement).",
  input_schema: {
    type: "object",
    properties: {
      customer_name: { type: "string", description: "Nome do cliente" },
    },
    required: ["customer_name"],
  },
};

const QUERY_BALANCE_TOOL: Anthropic.Tool = {
  name: "query_balance",
  description:
    "Responde quanto um cliente especifico deve. Chame quando o comerciante perguntar o saldo de alguem, " +
    "por exemplo 'quanto o Ze Carlos me deve?' ou 'saldo do Ze Carlos'.",
  input_schema: {
    type: "object",
    properties: {
      customer_name: { type: "string", description: "Nome do cliente" },
    },
    required: ["customer_name"],
  },
};

const QUERY_DEBTORS_TOOL: Anthropic.Tool = {
  name: "query_debtors",
  description:
    "Lista os clientes que estao devendo no momento, do que mais deve pro que menos deve. Chame quando o " +
    "comerciante perguntar quem esta devendo, por exemplo 'quem ta devendo?' ou 'quem deve mais de 100 reais?'. " +
    "Se a mensagem mencionar um valor minimo, preencha min_amount; senao deixe vazio pra listar todo mundo.",
  input_schema: {
    type: "object",
    properties: {
      min_amount: { type: "number", description: "Valor minimo em reais, se mencionado (ex: 100 para 'mais de 100 reais')" },
    },
    required: [],
  },
};

const WEEKLY_SUMMARY_TOOL: Anthropic.Tool = {
  name: "weekly_summary",
  description:
    "Mostra um resumo geral do negocio: total em aberto, quantos clientes devendo, e quanto foi recebido na " +
    "ultima semana. Chame quando o comerciante pedir um resumo geral, por exemplo 'resumo da semana', 'como " +
    "esta o caixa' ou 'resumo geral'.",
  input_schema: { type: "object", properties: {}, required: [] },
};

const MONTHLY_STATEMENT_TOOL: Anthropic.Tool = {
  name: "monthly_statement",
  description:
    "Mostra o extrato mensal do negocio inteiro: pra cada cliente com movimentacao, quanto ele pagou nesse " +
    "mes e quanto ainda falta (saldo atual), com totais no final. Chame quando o comerciante pedir o extrato " +
    "do mes ou extrato mensal, por exemplo 'extrato do mes', 'extrato mensal', 'quanto foi pago e quanto " +
    "falta esse mes'. Nao chame pra historico de UM cliente especifico (isso e purchase_history).",
  input_schema: { type: "object", properties: {}, required: [] },
};

const LIST_DEFAULTERS_TOOL: Anthropic.Tool = {
  name: "list_defaulters",
  description:
    "Lista os clientes inadimplentes (devendo ha mais dias que o prazo aceitavel), cada um ja com um link " +
    "pronto pra cobrar pelo WhatsApp. Chame quando o comerciante pedir a lista de inadimplentes/atrasados, " +
    "por exemplo 'quem esta inadimplente?', 'clientes inadimplentes', 'quem esta atrasado?'. Diferente de " +
    "query_debtors: inadimplente e sobre atraso no tempo, nao so sobre dever dinheiro.",
  input_schema: { type: "object", properties: {}, required: [] },
};

const COLLECT_CUSTOMER_TOOL: Anthropic.Tool = {
  name: "collect_customer",
  description:
    "Prepara uma mensagem de cobranca pronta (com link do WhatsApp) pra UM cliente especifico, mencionado " +
    "pelo nome. Chame quando o comerciante pedir explicitamente pra cobrar alguem, por exemplo 'cobrar Ze " +
    "Carlos', 'cobra a Suellen Bandeira', 'manda cobranca pro Ze'. Diferente de register_payment (que e " +
    "quando o cliente JA pagou) e de query_balance (que so pergunta o saldo, sem pedir cobranca).",
  input_schema: {
    type: "object",
    properties: {
      customer_name: { type: "string", description: "Nome do cliente a cobrar" },
    },
    required: ["customer_name"],
  },
};

const ALL_TOOLS = [
  RECORD_DEBT_TOOL,
  REGISTER_CUSTOMER_TOOL,
  REGISTER_PAYMENT_TOOL,
  CLOSE_ACCOUNT_TOOL,
  ARCHIVE_ACCOUNT_TOOL,
  PURCHASE_HISTORY_TOOL,
  QUERY_BALANCE_TOOL,
  QUERY_DEBTORS_TOOL,
  WEEKLY_SUMMARY_TOOL,
  MONTHLY_STATEMENT_TOOL,
  LIST_DEFAULTERS_TOOL,
  COLLECT_CUSTOMER_TOOL,
];

const SYSTEM_PROMPT = `
Voce e um extrator de dados para o Fiado, um bot de WhatsApp que ajuda donos de pequeno comercio
(mercadinho, padaria, bar) a controlar fiado dos clientes.

O comerciante manda mensagens curtas e informais em portugues, tipo:
"Ze Carlos, 45 reais, o almoco de hoje" -> nova divida
"cadastrar Ze Carlos, telefone 11987654321" -> cadastro/atualizacao de cliente
"telefone do Ze Carlos, 11987654321" -> cadastro/atualizacao de cliente
"Ze Carlos pagou 20 reais" -> pagamento
"fechar a conta do Ze Carlos" -> fechar conta
"excluir a conta do Ze Carlos" -> arquivar conta antiga
"historico do Ze Carlos" -> historico de compras
"quanto o Ze Carlos me deve?" -> saldo de um cliente
"quem ta devendo mais de 100 reais?" ou "quem ta devendo?" -> lista de devedores
"resumo da semana" ou "como esta o caixa" -> resumo geral
"extrato do mes" ou "extrato mensal" -> extrato mensal do negocio (pago vs falta, por cliente)
"quem esta inadimplente?" ou "clientes inadimplentes" -> lista de inadimplentes com cobranca pronta
"cobrar Ze Carlos" ou "cobra a Suellen Bandeira" -> cobranca pronta de UM cliente especifico

Sua unica tarefa e decidir qual ferramenta chamar (no maximo uma) com base na mensagem, ou nenhuma se a
mensagem nao se encaixar claramente em nenhum desses casos ou faltar os dados necessarios.
`.trim();

function isToolUseBlock(block: Anthropic.ContentBlock): block is Anthropic.ToolUseBlock {
  return block.type === "tool_use";
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function extractIntent(message: string): Promise<FiadoIntent | null> {
  const response = await anthropic.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    tools: ALL_TOOLS,
    tool_choice: { type: "auto", disable_parallel_tool_use: true },
    messages: [{ role: "user", content: message }],
  });

  const toolUse = response.content.find(isToolUseBlock);
  if (!toolUse) return null;

  const input = toolUse.input as Record<string, unknown>;

  if (toolUse.name === "query_debtors") {
    const minAmount = typeof input.min_amount === "number" && input.min_amount > 0 ? input.min_amount : undefined;
    return { type: "query_debtors", minAmount };
  }

  if (toolUse.name === "weekly_summary") {
    return { type: "weekly_summary" };
  }

  if (toolUse.name === "monthly_statement") {
    return { type: "monthly_statement" };
  }

  if (toolUse.name === "list_defaulters") {
    return { type: "list_defaulters" };
  }

  const customerName = str(input.customer_name);
  if (!customerName) {
    logger.warn(`${toolUse.name} chamado sem customer_name valido`, { input });
    return null;
  }

  switch (toolUse.name) {
    case "record_debt": {
      const amount = typeof input.amount === "number" ? input.amount : undefined;
      if (!amount || amount <= 0) return null;
      return { type: "record_debt", customerName, amount, description: str(input.description) };
    }
    case "register_customer": {
      const phone = str(input.phone);
      if (!phone) return null;
      return { type: "register_customer", customerName, phone };
    }
    case "register_payment": {
      const amount = typeof input.amount === "number" ? input.amount : undefined;
      if (!amount || amount <= 0) return null;
      return { type: "register_payment", customerName, amount };
    }
    case "close_account":
      return { type: "close_account", customerName };
    case "archive_account":
      return { type: "archive_account", customerName };
    case "purchase_history":
      return { type: "purchase_history", customerName };
    case "query_balance":
      return { type: "query_balance", customerName };
    case "collect_customer":
      return { type: "collect_customer", customerName };
    default:
      return null;
  }
}
