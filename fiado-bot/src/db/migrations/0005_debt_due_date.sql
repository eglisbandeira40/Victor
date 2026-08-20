-- Fiado - data de vencimento por divida + lembrete diario
alter table debts add column if not exists due_date date;
alter table debts add column if not exists due_reminder_sent_at timestamptz;

create index if not exists debts_due_date_idx on debts (due_date);
