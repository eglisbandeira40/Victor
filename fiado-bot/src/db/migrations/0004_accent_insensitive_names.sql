-- Fiado - nomes de cliente sem distincao de acento (Claudia = Cláudia)
create extension if not exists unaccent;

-- unaccent() e STABLE, mas indice unico exige funcao IMMUTABLE - wrapper padrao pra contornar isso.
create or replace function immutable_unaccent(text)
returns text as $$
  select unaccent('unaccent', $1)
$$ language sql immutable parallel safe;

drop index if exists customers_merchant_id_lower_name_key;
create unique index customers_merchant_id_lower_name_key
  on customers (merchant_id, lower(immutable_unaccent(name)));
