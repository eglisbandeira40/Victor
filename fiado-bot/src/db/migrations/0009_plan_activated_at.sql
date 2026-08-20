-- Fiado - registra quando o comerciante virou pagante (plan = active), pra carteira de clientes e faturamento do mes
alter table merchants add column if not exists plan_activated_at timestamptz;

-- Comerciantes ja ativos (antes dessa migration) ganham a data de hoje como referencia, ja que nao tem o dado real.
update merchants set plan_activated_at = now() where plan = 'active' and plan_activated_at is null;
