import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export interface RecordDebtExtraction {
  customerName: string;
  amount: number;
  description?: string;
}

const RECORD_DEBT_TOOL: Anthropic.Tool = {
  name: "record_debt",
  description:
    "Registra uma nova divida (fiado) de um cliente do comerciante. So chame essa ferramenta quando a mensagem " +
    "descrever claramente uma venda ou consumo fiado: quem comprou/consumiu e quanto ficou devendo. " +
    "Nao chame para perguntas, pagamentos ou mensagens que nao tragam um nome de cliente e um valor.",
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

const SYSTEM_PROMPT = `
Voce e um extrator de dados para o Fiado, um bot de WhatsApp que ajuda donos de pequeno comercio
(mercadinho, padaria, bar) a controlar fiado dos clientes.

O comerciante manda mensagens curtas e informais em portugues, tipo:
"Ze Carlos, 45 reais, o almoco de hoje"
"anota 20 pro Joao, refrigerante"

Sua unica tarefa e decidir se a mensagem esta registrando uma nova divida (fiado) e, se estiver,
chamar a ferramenta record_debt com os dados extraidos. Se a mensagem nao for claramente um registro
de divida (por exemplo for uma pergunta de saldo, um aviso de pagamento, ou algo sem nome+valor),
NAO chame nenhuma ferramenta.
`.trim();

export async function extractDebt(message: string): Promise<RecordDebtExtraction | null> {
  const response = await anthropic.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    tools: [RECORD_DEBT_TOOL],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: message }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === "record_debt"
  );

  if (!toolUse) {
    return null;
  }

  const input = toolUse.input as { customer_name?: unknown; amount?: unknown; description?: unknown };

  if (typeof input.customer_name !== "string" || typeof input.amount !== "number") {
    logger.warn("record_debt chamado com input invalido", { input });
    return null;
  }

  if (!input.customer_name.trim() || !(input.amount > 0)) {
    return null;
  }

  return {
    customerName: input.customer_name.trim(),
    amount: input.amount,
    description: typeof input.description === "string" ? input.description.trim() || undefined : undefined,
  };
}
