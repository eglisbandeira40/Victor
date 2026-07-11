import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const merchants = pgTable("merchants", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  whatsappPhone: text("whatsapp_phone").notNull(),
  businessName: text("business_name"),
  plan: text("plan").notNull().default("trial"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("merchants_whatsapp_phone_key").on(table.whatsappPhone),
]);

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("customers_merchant_id_lower_name_key").on(table.merchantId, sql`lower(${table.name})`),
  index("customers_merchant_id_idx").on(table.merchantId),
]);

export const debts = pgTable("debts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  amountCents: integer("amount_cents").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("debts_customer_id_idx").on(table.customerId),
  index("debts_merchant_id_idx").on(table.merchantId),
]);

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  amountCents: integer("amount_cents").notNull(),
  note: text("note"),
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
