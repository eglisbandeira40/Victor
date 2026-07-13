import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL e obrigatorio"),
  WHATSAPP_TOKEN: z.string().min(1, "WHATSAPP_TOKEN e obrigatorio"),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1, "WHATSAPP_PHONE_NUMBER_ID e obrigatorio"),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1, "WHATSAPP_VERIFY_TOKEN e obrigatorio"),
  WHATSAPP_APP_SECRET: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY e obrigatorio"),
  ANTHROPIC_MODEL: z.string().default("claude-haiku-4-5-20251001"),

  // Templates aprovados pela Meta pra mensagens proativas (fora da janela de 24h de conversa).
  // Sem eles configurados, os jobs automaticos caem pra texto livre (funciona so dentro da janela de 24h).
  WHATSAPP_TEMPLATE_LANGUAGE: z.string().default("pt_BR"),
  WHATSAPP_TEMPLATE_WEEKLY_SUMMARY: z.string().optional(),
  WHATSAPP_TEMPLATE_COLLECTION_ALERT: z.string().optional(),
  WHATSAPP_TEMPLATE_DUE_REMINDER: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Variaveis de ambiente invalidas:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
