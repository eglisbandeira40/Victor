import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { debts, payments } from "../db/schema.js";

export interface HistoryEntry {
  type: "debt" | "payment";
  amountCents: number;
  description: string | null;
  createdAt: Date;
}

/** Ultimas `limit` movimentacoes (dividas e pagamentos) de um cliente, da mais antiga pra mais recente. */
export async function getCustomerHistory(customerId: string, limit = 15): Promise<HistoryEntry[]> {
  const rows = await db.execute<{
    type: "debt" | "payment";
    amount_cents: number;
    description: string | null;
    created_at: string;
  }>(sql`
    (select 'debt' as type, amount_cents, description, created_at
     from ${debts} where customer_id = ${customerId})
    union all
    (select 'payment' as type, amount_cents, note as description, created_at
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
    }))
    .reverse();
}
