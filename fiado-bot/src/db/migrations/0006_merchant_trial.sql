-- Fiado - trial de 7 dias por comerciante
alter table merchants add column if not exists trial_ends_at timestamptz default (now() + interval '7 days');

-- Comerciantes ja existentes (testes) ganham mais 7 dias a partir de agora, pra nao bloquear ninguem na hora.
update merchants set trial_ends_at = now() + interval '7 days' where trial_ends_at is null;
