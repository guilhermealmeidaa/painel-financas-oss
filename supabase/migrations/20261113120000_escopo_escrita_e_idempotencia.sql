-- Fase 3: tokens com escopo (os existentes continuam só leitura) e chave de idempotência para lancar_gasto
alter table public.api_tokens add column scopes text[] not null default '{read}';
alter table public.transactions add column idempotency_key text;
create unique index transactions_user_idempotency_key on public.transactions (user_id, idempotency_key) where idempotency_key is not null;
