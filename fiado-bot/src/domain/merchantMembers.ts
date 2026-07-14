import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { merchantMembers, merchants } from "../db/schema.js";

export async function findOwnerMerchantIdByMemberPhone(phone: string): Promise<string | null> {
  const found = await db.query.merchantMembers.findFirst({ where: eq(merchantMembers.phone, phone) });
  return found?.merchantId ?? null;
}

/** Mapa telefone -> nome dos funcionarios autorizados de um comerciante, pra resolver quem lancou o que. */
export async function getMemberNamesByPhone(merchantId: string): Promise<Map<string, string | null>> {
  const rows = await db.query.merchantMembers.findMany({ where: eq(merchantMembers.merchantId, merchantId) });
  return new Map(rows.map((row) => [row.phone, row.name]));
}

export async function getMemberName(phone: string): Promise<string | null> {
  const found = await db.query.merchantMembers.findFirst({ where: eq(merchantMembers.phone, phone) });
  return found?.name ?? null;
}

export type AddMerchantMemberResult =
  | { status: "added" }
  | { status: "own_account" }
  | { status: "already_member"; sameMerchant: boolean };

export async function addMerchantMember(
  merchantId: string,
  phone: string,
  name: string | undefined
): Promise<AddMerchantMemberResult> {
  const existingMerchant = await db.query.merchants.findFirst({ where: eq(merchants.whatsappPhone, phone) });
  if (existingMerchant) return { status: "own_account" };

  const existingMember = await db.query.merchantMembers.findFirst({ where: eq(merchantMembers.phone, phone) });
  if (existingMember) {
    return { status: "already_member", sameMerchant: existingMember.merchantId === merchantId };
  }

  await db.insert(merchantMembers).values({ merchantId, phone, name });
  return { status: "added" };
}
