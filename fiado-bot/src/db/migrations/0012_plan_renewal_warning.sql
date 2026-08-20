-- Fiado - controla se ja avisamos "plano vence em 3 dias" nesse ciclo de renovacao
alter table merchants add column if not exists plan_renewal_warning_sent_at timestamptz;
