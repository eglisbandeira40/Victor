import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export type FiadoIntent =
  | { type: "record_debt"; customerName: string; amount: number; description?: string }
  | { type: "set_customer_phone"; customerName: string; phone: string };

const RECORD_DEBT_TOOL: Anthropic.Tool = {
  name: "record_debt",
  description:
    "Registra uma nova divida (fiado) de um cliente do comerciante. So chame essa ferramenta quando a mensagem " +
    "descrever claramente uma venda ou consumo fiado: quem comprou/consumiu e quanto ficou devendo. " +
    "Nao chame para perguntas, pagamentos, telefone de cliente ou mensagens que nao tragam um nome e um valor.",
  input_schema: {
    type: "object",
    properties: {
      customer_name: {
        type: "string",
        description: "Nome do cliente que ficou devendo, exatamente como mencionado na mensagem",
      },
      amount: {
        type: "number",
        description: "Valor da divida em reais (ex: 45.5 para R$ 45,50)",
      },
      description: {
        type: "string",
        description: "O que foi comprado/consumido, se a mensagem mencionar (ex: 'almoco de hoje')",
      },
    },
    required: ["customer_name", "amount"],
  },
};

const SET_CUSTOMER_PHONE_TOOL: Anthropic.Tool = {
  name: "set_customer_phone",
  description:
    "Salva ou atualiza o telefone de um cliente pelo nome. So chame essa ferramenta quando a mensagem " +
    "informar claramente o telefone de um cliente, por exemplo 'telefone do Ze Carlos: 11987654321' ou " +
    "'Maria, telefone 11912345678'. Nao use pra registrar divida.",
  input_schema: {
    type: "object",
    properties: {
      customer_name: {
        type: "string",
        description: "Nome do cliente dono do telefone, como mencionado na mensagem",
      },
      phone: {
        type: "string",
        description: "Telefone do cliente, como escrito na mensagem (com ou sem DDD/codigo do pais)",
      },
    },
    required: ["customer_name", "phone"],
  },
};

const SYSTEM_PROMPT = `
Voce e um extrator de dados para o Fiado, um bot de WhatsApp que ajuda donos de pequeno comercio
(mercadinho, padaria, bar) a controlar fiado dos clientes.

O comerciante manda mensagens curtas e informais em portugues, tipo:
"Ze Carlos, 45 reais, o almoco de hoje" -> registrar divida
"telefone do Ze Carlos, 11987654321" -> salvar telefone do cliente

Sua unica tarefa e decidir qual ferramenta chamar (no maximo uma) com base na mensagem, ou nenhuma se a
mensagem nao for claramente um desses dois casos (por exemplo for uma pergunta de saldo, um aviso de
pagamento, ou uma mensagem sem os dados necessarios).
`.trim();

function isToolUseBlock(block: Anthropic.ContentBlock): block is Anthropic.ToolUseBlock {
  return block.type === "tool_use";
}

export async function extractIntent(message: string): Promise<FiadoIntent | null> {
  const response = await anthropic.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    tools: [RECORD_DEBT_TOOL, SET_CUSTOMER_PHONE_TOOL],
    tool_choice: { type: "auto", disable_parallel_tool_use: true },
    messages: [{ role: "user", content: message }],
  });

  const toolUse = response.content.find(isToolUseBlock);
  if (!toolUse) return null;

  if (toolUse.name === "record_debt") {
    const input = toolUse.input as { customer_name?: unknown; amount?: unknown; description?: unknown };

    if (typeof input.customer_name !== "string" || typeof input.amount !== "number") {
      logger.warn("record_debt chamado com input invalido", { input });
      return null;
    }
    if (!input.customer_name.trim() || !(input.amount > 0)) return null;

    return {
      type: "record_debt",
      customerName: input.customer_name.trim(),
      amount: input.amount,
      description: typeof input.description === "string" ? input.description.trim() || undefined : undefined,
    };
  }

  if (toolUse.name === "set_customer_phone") {
    const input = toolUse.input as { customer_name?: unknown; phone?: unknown };

    if (typeof input.customer_name !== "string" || typeof input.phone !== "string") {
      logger.warn("set_customer_phone chamado com input invalido", { input });
      return null;
    }
    if (!input.customer_name.trim() || !input.phone.trim()) return null;

    return {
      type: "set_customer_phone",
      customerName: input.customer_name.trim(),
      phone: input.phone.trim(),
    };
  }

  return null;
}
