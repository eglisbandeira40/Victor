-- Fiado - CPF/CNPJ do comerciante, exigido pelo Asaas pra criar cobranca Pix
alter table merchants add column if not exists cpf_cnpj text;
