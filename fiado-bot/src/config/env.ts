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
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Variaveis de ambiente invalidas:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
