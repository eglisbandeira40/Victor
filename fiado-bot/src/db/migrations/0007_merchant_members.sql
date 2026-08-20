-- Fiado - funcionarios autorizados a lancar fiado na conta do comerciante
create table if not exists merchant_members (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  phone text not null unique,
  name text,
  created_at timestamptz not null default now()
);

create index if not exists merchant_members_merchant_id_idx on merchant_members (merchant_id);
