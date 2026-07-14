import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { customers, debts, payments } from "../db/schema.js";

export interface HistoryEntry {
  type: "debt" | "payment";
  amountCents: number;
  description: string | null;
  createdAt: Date;
  createdByPhone: string | null;
}

/** Ultimas `limit` movimentacoes (dividas e pagamentos) de um cliente, da mais antiga pra mais recente. */
export async function getCustomerHistory(customerId: string, limit = 15): Promise<HistoryEntry[]> {
  const rows = await db.execute<{
    type: "debt" | "payment";
    amount_cents: number;
    description: string | null;
    created_at: string;
    created_by_phone: string | null;
  }>(sql`
    (select 'debt' as type, amount_cents, description, created_at, created_by_phone
     from ${debts} where customer_id = ${customerId})
    union all
    (select 'payment' as type, amount_cents, note as description, created_at, created_by_phone
     from ${payments} where customer_id = ${customerId})
    order by created_at desc
    limit ${limit}
  `);

  return rows
    .map((row) => ({
      type: row.type,
      amountCents: row.amount_cents,
      description: row.description,
      createdAt: new Date(row.created_at),
      createdByPhone: row.created_by_phone,
    }))
    .reverse();
}

export interface MemberActivityEntry {
  type: "debt" | "payment";
  customerName: string;
  amountCents: number;
  description: string | null;
  createdAt: Date;
}

/** Ultimos `limit` lancamentos (dividas e pagamentos) feitos por um numero especifico, em qualquer cliente. */
export async function getMemberActivity(
  merchantId: string,
  createdByPhone: string,
  limit = 20
): Promise<MemberActivityEntry[]> {
  const rows = await db.execute<{
    type: "debt" | "payment";
    customer_name: string;
    amount_cents: number;
    description: string | null;
    created_at: string;
  }>(sql`
    (select 'debt' as type, c.name as customer_name, d.amount_cents, d.description, d.created_at
     from ${debts} d
     join ${customers} c on c.id = d.customer_id
     where d.merchant_id = ${merchantId} and d.created_by_phone = ${createdByPhone})
    union all
    (select 'payment' as type, c.name as customer_name, p.amount_cents, p.note as description, p.created_at
     from ${payments} p
     join ${customers} c on c.id = p.customer_id
     where p.merchant_id = ${merchantId} and p.created_by_phone = ${createdByPhone})
    order by created_at desc
    limit ${limit}
  `);

  return rows.map((row) => ({
    type: row.type,
    customerName: row.customer_name,
    amountCents: row.amount_cents,
    description: row.description,
    createdAt: new Date(row.created_at),
  }));
}
