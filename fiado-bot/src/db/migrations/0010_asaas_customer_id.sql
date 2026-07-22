-- Fiado - liga o comerciante ao customer dele no Asaas, pra cobranca Pix automatica
alter table merchants add column if not exists asaas_customer_id text;

-- Cache da ultima cobranca Pix gerada, pra nao criar cobranca nova a cada mensagem enquanto bloqueado
alter table merchants add column if not exists pending_pix_payload text;
alter table merchants add column if not exists pending_pix_expires_at timestamptz;
