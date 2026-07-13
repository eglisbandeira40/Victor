-- Fiado - nomes de cliente sem distincao de acento (Claudia = Cláudia)
create extension if not exists unaccent;

-- unaccent() e STABLE, mas indice unico exige funcao IMMUTABLE - wrapper padrao pra contornar isso.
-- SET search_path fixo evita o Postgres "inlinar" a funcao (o que perdia a referencia
-- ao unaccent() durante a criacao do indice) e torna a resolucao de nomes previsivel.
create or replace function immutable_unaccent(text)
returns text as $$
  select unaccent($1)
$$ language sql immutable parallel safe
set search_path = public, pg_temp;

drop index if exists customers_merchant_id_lower_name_key;
create unique index customers_merchant_id_lower_name_key
  on customers (merchant_id, lower(immutable_unaccent(name)));
