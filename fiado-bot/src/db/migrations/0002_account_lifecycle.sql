-- Fiado - cadastro completo, pagamento, fechar/excluir conta
-- Rode isso no console psql do fiado-db (mesmo processo da 0001_init.sql).

alter table customers add column if not exists address text;
alter table customers add column if not exists installments integer;
alter table customers add column if not exists balance_reset_at timestamptz;

alter table merchants add column if not exists pending_action jsonb;
