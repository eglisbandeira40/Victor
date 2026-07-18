import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  date,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export type PendingAction =
  | {
      type: "awaiting_installments";
      customerId: string;
      customerName: string;
      balanceCents: number;
    }
  | {
      type: "awaiting_contact_confirmation";
      cardName: string;
      phone: string;
      matchedCustomerId: string | null;
      matchedCustomerName: string | null;
    }
  | { type: "awaiting_business_name" };

export const merchants = pgTable("merchants", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  whatsappPhone: text("whatsapp_phone").notNull(),
  businessName: text("business_name"),
  plan: text("plan").notNull().default("trial"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }).default(sql`now() + interval '7 days'`),
  /** Quando o comerciante virou pagante (plan = "active") pela ultima vez - carteira de clientes / faturamento. */
  planActivatedAt: timestamp("plan_activated_at", { withTimezone: true }),
  pendingAction: jsonb("pending_action").$type<PendingAction | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("merchants_whatsapp_phone_key").on(table.whatsappPhone),
]);

// Funcionarios autorizados a lancar fiado na conta do comerciante, a partir do proprio numero deles.
export const merchantMembers = pgTable("merchant_members", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  phone: text("phone").notNull(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("merchant_members_phone_key").on(table.phone),
  index("merchant_members_merchant_id_idx").on(table.merchantId),
]);

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone"),
  installments: integer("installments"),
  balanceResetAt: timestamp("balance_reset_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("customers_merchant_id_lower_name_key").on(table.merchantId, sql`lower(immutable_unaccent(${table.name}))`),
  index("customers_merchant_id_idx").on(table.merchantId),
]);

export const debts = pgTable("debts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  amountCents: integer("amount_cents").notNull(),
  description: text("description"),
  dueDate: date("due_date"),
  dueReminderSentAt: timestamp("due_reminder_sent_at", { withTimezone: true }),
  createdByPhone: text("created_by_phone"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("debts_customer_id_idx").on(table.customerId),
  index("debts_merchant_id_idx").on(table.merchantId),
  index("debts_due_date_idx").on(table.dueDate),
]);

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  amountCents: integer("amount_cents").notNull(),
  note: text("note"),
  createdByPhone: text("created_by_phone"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("payments_customer_id_idx").on(table.customerId),
  index("payments_merchant_id_idx").on(table.merchantId),
]);

// Dedup de retries do webhook do WhatsApp (Meta reenvia se nao receber 200 rapido)
export const processedMessages = pgTable("processed_messages", {
  waMessageId: text("wa_message_id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
