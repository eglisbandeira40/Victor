-- Fiado - rastrear quem (qual numero) lancou cada divida/pagamento (dono ou funcionario)
alter table debts add column if not exists created_by_phone text;
alter table payments add column if not exists created_by_phone text;
