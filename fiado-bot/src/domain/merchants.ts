import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { merchants } from "../db/schema.js";

export async function getOrCreateMerchant(whatsappPhone: string) {
  const existing = await db.query.merchants.findFirst({
    where: eq(merchants.whatsappPhone, whatsappPhone),
  });

  if (existing) return existing;

  const [created] = await db
    .insert(merchants)
    .values({ whatsappPhone })
    .onConflictDoNothing({ target: merchants.whatsappPhone })
    .returning();

  if (created) return created;

  // Corrida rara: outra requisicao criou entre o SELECT e o INSERT.
  const fallback = await db.query.merchants.findFirst({
    where: eq(merchants.whatsappPhone, whatsappPhone),
  });

  if (!fallback) throw new Error(`Nao foi possivel obter/criar merchant para ${whatsappPhone}`);
  return fallback;
}
