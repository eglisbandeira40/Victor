-- Fiado MVP - schema inicial
-- Rode isso no SQL editor do Supabase (ou via drizzle-kit migrate assim que houver conexao com o banco).

create extension if not exists pgcrypto;

create table if not exists merchants (
  id uuid primary key default gen_random_uuid(),
  whatsapp_phone text not null unique,
  business_name text,
  plan text not null default 'trial',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  name text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists customers_merchant_id_lower_name_key
  on customers (merchant_id, lower(name));

create index if not exists customers_merchant_id_idx on customers (merchant_id);

create table if not exists debts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  merchant_id uuid not null references merchants(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  description text,
  created_at timestamptz not null default now()
);

create index if not exists debts_customer_id_idx on debts (customer_id);
create index if not exists debts_merchant_id_idx on debts (merchant_id);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  merchant_id uuid not null references merchants(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists payments_customer_id_idx on payments (customer_id);
create index if not exists payments_merchant_id_idx on payments (merchant_id);

-- Dedup de retries do webhook do WhatsApp
create table if not exists processed_messages (
  wa_message_id text primary key,
  created_at timestamptz not null default now()
);
