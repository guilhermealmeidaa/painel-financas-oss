-- Painel de finanças: schema completo (uma migração só para instalar do zero).
-- RLS em todas as tabelas: cada linha tem user_id e só o dono enxerga (user_id = auth.uid()).
-- Dados bancários entram pelo sync da Pluggy (servidor, service role) e pelas telas do painel.

-- ===== schema inicial =====
-- Schema inicial do painel de finanças.
-- Regras gerais:
--   * valores em centavos (integer)
--   * meses de referência como date no dia 1 (ex.: 2026-12-01)
--   * toda tabela tem user_id (default auth.uid()) e RLS user_id = auth.uid()

create type public.account_kind as enum ('credit_card', 'checking');
create type public.income_kind as enum ('salario', '13o', 'freela', 'outro');
create type public.fixed_category as enum ('cartao', 'emprestimo', 'veiculo', 'conta');
create type public.installment_status as enum ('ativa', 'planejada', 'quitada');
create type public.payment_method as enum ('credito', 'debito', 'pix');
create type public.budget_method as enum ('credito', 'debito_pix');
create type public.bucket as enum ('lazer', 'mercado', 'fixo', 'assinatura', 'parcela', 'ignorar', 'sem_categoria');
create type public.tx_source as enum ('manual', 'pluggy');

-- Configuração por usuário (uma linha só)
create table public.settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  projection_start date not null check (extract(day from projection_start) = 1),
  opening_balance_cents integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  kind public.account_kind not null,
  closing_day smallint check (closing_day between 1 and 31),
  due_day smallint check (due_day between 1 and 31),
  pluggy_account_id text,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.incomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  description text not null,
  kind public.income_kind not null default 'outro',
  amount_cents integer not null check (amount_cents >= 0),
  created_at timestamptz not null default now()
);
create index incomes_user_month on public.incomes (user_id, month);

create table public.fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  name text not null,
  category public.fixed_category not null,
  account_id uuid references public.accounts (id) on delete set null,
  amount_cents integer not null check (amount_cents >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, month, name)
);
create index fixed_expenses_user_month on public.fixed_expenses (user_id, month);

create table public.installment_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  total_cents integer not null check (total_cents >= 0),
  installments_count smallint not null check (installments_count >= 1),
  installment_cents integer not null check (installment_cents >= 0),
  first_invoice_month date not null check (extract(day from first_invoice_month) = 1),
  account_id uuid references public.accounts (id) on delete set null,
  status public.installment_status not null default 'ativa',
  notes text,
  created_at timestamptz not null default now()
);

create table public.monthly_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  cap_cents integer not null check (cap_cents >= 0),
  method public.budget_method not null,
  -- sábados dos fins de semana em que não vai gastar (entram fora do "ritmo")
  skipped_weekends date[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (user_id, month)
);

create table public.budget_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  budget_id uuid not null references public.monthly_budgets (id) on delete cascade,
  bucket public.bucket not null,
  amount_cents integer not null check (amount_cents >= 0),
  unique (budget_id, bucket)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  occurred_on date not null,
  description text not null,
  amount_cents integer not null check (amount_cents >= 0),
  account_id uuid references public.accounts (id) on delete set null,
  method public.payment_method not null,
  bucket public.bucket not null default 'sem_categoria',
  source public.tx_source not null default 'manual',
  external_id text,
  created_at timestamptz not null default now(),
  unique (user_id, external_id)
);
create index transactions_user_date on public.transactions (user_id, occurred_on desc);

-- RLS em todas as tabelas
do $$
declare t text;
begin
  foreach t in array array[
    'settings', 'accounts', 'incomes', 'fixed_expenses', 'installment_purchases',
    'monthly_budgets', 'budget_allocations', 'transactions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "dono_%1$s" on public.%1$I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ===== contas pagas =====
-- Marca contas do mês como pagas (checkbox em "Contas a pagar").
-- key identifica o item: 'fixed:<uuid>' para fixos, 'card:<uuid>' ou 'card:none' para faturas.
create table public.bill_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  key text not null check (key ~ '^(fixed|card):'),
  paid_at timestamptz not null default now(),
  unique (user_id, month, key)
);
alter table public.bill_payments enable row level security;
create policy "dono_bill_payments" on public.bill_payments for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.bill_payments from anon;
grant select, insert, update, delete on public.bill_payments to authenticated;

-- ===== pluggy =====
-- Fase 2: Open Finance com Pluggy (Meu Pluggy).

-- Items conectados (a API não lista items na Meu Pluggy, então guardamos aqui)
create table public.pluggy_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id text not null,
  connector_name text,
  status text,
  consent_expires_at timestamptz,
  last_synced_at timestamptz,
  last_sync_summary jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, item_id)
);

-- Dados das contas vindos da Pluggy
alter table public.accounts
  add column pluggy_item_id text,
  add column balance_cents integer,
  add column credit_limit_cents integer,
  add column available_limit_cents integer,
  add column bill_close_date date,
  add column bill_due_date date,
  add column synced_at timestamptz;
create unique index accounts_user_pluggy on public.accounts (user_id, pluggy_account_id) where pluggy_account_id is not null;

-- Faturas reais dos cartões
create table public.card_bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  pluggy_bill_id text not null,
  due_date date not null,
  closing_date date,
  total_cents integer not null,
  minimum_cents integer,
  synced_at timestamptz not null default now(),
  unique (user_id, pluggy_bill_id)
);

-- Metadados das transações da Pluggy
alter table public.transactions
  add column is_inflow boolean not null default false,
  add column pluggy_status text,
  add column installment_number smallint,
  add column total_installments smallint,
  add column pluggy_bill_id text,
  add column pluggy_category text,
  add column synced_at timestamptz;

-- Regras automáticas de categorização (descrição contém X -> bucket)
create table public.categorization_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pattern text not null check (length(trim(pattern)) >= 2),
  bucket public.bucket not null check (bucket <> 'sem_categoria'),
  created_at timestamptz not null default now(),
  unique (user_id, pattern)
);

do $$
declare t text;
begin
  foreach t in array array['pluggy_items', 'card_bills', 'categorization_rules'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "dono_%1$s" on public.%1$I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Upsert idempotente das transações da Pluggy (dedupe por external_id).
-- Na atualização NUNCA mexe no bucket escolhido pelo usuário, e preserva a
-- descrição de lançamentos manuais que foram vinculados a uma transação da Pluggy.
create or replace function public.upsert_pluggy_transactions(rows jsonb)
returns table (inserted integer, updated integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ins integer := 0;
  upd integer := 0;
begin
  with src as (
    select * from jsonb_to_recordset(rows) as r(
      user_id uuid, external_id text, occurred_on date, description text, amount_cents integer,
      account_id uuid, method public.payment_method, bucket public.bucket, is_inflow boolean,
      pluggy_status text, installment_number smallint, total_installments smallint,
      pluggy_bill_id text, pluggy_category text
    )
  ),
  up as (
    insert into public.transactions as t (
      user_id, external_id, occurred_on, description, amount_cents, account_id, method, bucket,
      source, is_inflow, pluggy_status, installment_number, total_installments, pluggy_bill_id,
      pluggy_category, synced_at
    )
    select user_id, external_id, occurred_on, description, amount_cents, account_id, method, bucket,
      'pluggy', is_inflow, pluggy_status, installment_number, total_installments, pluggy_bill_id,
      pluggy_category, now()
    from src
    on conflict (user_id, external_id) do update set
      occurred_on = excluded.occurred_on,
      description = case when t.source = 'manual' then t.description else excluded.description end,
      amount_cents = excluded.amount_cents,
      account_id = coalesce(excluded.account_id, t.account_id),
      is_inflow = excluded.is_inflow,
      pluggy_status = excluded.pluggy_status,
      installment_number = excluded.installment_number,
      total_installments = excluded.total_installments,
      pluggy_bill_id = excluded.pluggy_bill_id,
      pluggy_category = excluded.pluggy_category,
      synced_at = now()
    returning (xmax = 0) as is_insert
  )
  select count(*) filter (where is_insert), count(*) filter (where not is_insert) into ins, upd from up;
  return query select ins, upd;
end $$;

revoke all on function public.upsert_pluggy_transactions(jsonb) from public, anon;
grant execute on function public.upsert_pluggy_transactions(jsonb) to authenticated, service_role;

-- ===== api tokens =====
-- Tokens pessoais para a API somente leitura (MCP). Guardamos só o hash SHA-256.
create table public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  prefix text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
alter table public.api_tokens enable row level security;
create policy "dono_api_tokens" on public.api_tokens for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.api_tokens from anon;
grant select, insert, update, delete on public.api_tokens to authenticated;

-- ===== dados reais metadados =====
-- Etapa 1 do "painel baseado em dados reais": só ADICIONA colunas (nada é apagado).
-- Decisões automáticas ficam registradas (auto_reason) e podem ser desfeitas (prev_bucket).

alter table public.transactions
  add column auto_reason text,
  add column prev_bucket public.bucket,
  add column user_locked boolean not null default false,
  add column linked_tx_id uuid references public.transactions (id) on delete set null,
  add column fee_cents integer check (fee_cents >= 0),
  add column invoice_month date check (extract(day from invoice_month) = 1),
  add column manual_id uuid references public.transactions (id) on delete set null,
  add column superseded boolean not null default false,
  add column subtype text;
create index transactions_user_invoice on public.transactions (user_id, invoice_month);
create index transactions_linked on public.transactions (linked_tx_id) where linked_tx_id is not null;
create index transactions_manual on public.transactions (manual_id) where manual_id is not null;
comment on column public.transactions.auto_reason is 'Motivo da classificação automática (pix_no_credito, pagamento_fatura, transferencia_propria, iof_herdado, regra:X, categoria_banco, juntado_manual...). Null = decisão do usuário ou nenhuma.';
comment on column public.transactions.prev_bucket is 'Bucket antes da decisão automática, para desfazer.';
comment on column public.transactions.user_locked is 'Usuário escolheu o bucket: o sync e as regras nunca mudam.';
comment on column public.transactions.superseded is 'Lançamento manual substituído por transações do banco (manual_id nelas). Não conta em nada; pode ser restaurado.';

alter table public.accounts
  add column days_source text check (days_source in ('banco', 'usuario'));

alter table public.card_bills
  add column status text check (status in ('aberta', 'fechada', 'paga')),
  add column paid_cents integer,
  add column paid_on date,
  add column payment_tx_id uuid references public.transactions (id) on delete set null;

alter table public.bill_payments
  add column transaction_id uuid references public.transactions (id) on delete set null,
  add column auto_reason text,
  add column dismissed boolean not null default false;
comment on column public.bill_payments.dismissed is 'Usuário desfez a marcação automática de pago: o sync não marca de novo.';

alter table public.fixed_expenses
  add column match_pattern text,
  add column source text not null default 'manual' check (source in ('manual', 'banco'));

alter table public.incomes
  add column source text not null default 'manual' check (source in ('manual', 'banco')),
  add column transaction_id uuid references public.transactions (id) on delete set null,
  add column status text not null default 'confirmada' check (status in ('auto', 'confirmada', 'rejeitada', 'substituida'));
create unique index incomes_user_tx on public.incomes (user_id, transaction_id) where transaction_id is not null;

alter table public.installment_purchases
  add column covered_by_bank boolean not null default false,
  add column matched_tx_id uuid references public.transactions (id) on delete set null;

alter table public.categorization_rules
  add column subtype text,
  add column origin text not null default 'usuario' check (origin in ('usuario', 'padrao'));

alter table public.settings
  add column self_names text[] not null default '{}',
  add column self_tax_ids text[] not null default '{}';

-- ===== decisoes respeitam juncao =====
-- O motor não mexe em transações do banco que foram juntadas a um lançamento manual (manual_id):
-- o bucket delas é o que você deu no lançamento.
create or replace function public.apply_auto_decisions(rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare n integer;
begin
  with src as (
    select * from jsonb_to_recordset(rows) as r(
      id uuid, bucket public.bucket, auto_reason text, linked_tx_id uuid, fee_cents integer, subtype text
    )
  ), up as (
    update public.transactions t set
      prev_bucket = case when t.auto_reason is null and t.bucket <> src.bucket then t.bucket else t.prev_bucket end,
      bucket = src.bucket,
      auto_reason = src.auto_reason,
      linked_tx_id = coalesce(src.linked_tx_id, t.linked_tx_id),
      fee_cents = coalesce(src.fee_cents, t.fee_cents),
      subtype = coalesce(src.subtype, t.subtype)
    from src
    where t.id = src.id and not t.user_locked and not t.superseded and t.source <> 'manual' and t.manual_id is null
    returning 1
  )
  select count(*) into n from up;
  return n;
end $$;

-- ===== inicio do controle =====
-- Dia em que o controle do dia a dia começa em cada mês (vazio = dia 1).
alter table public.monthly_budgets
  add column control_start date check (control_start is null or date_trunc('month', control_start)::date = month);
comment on column public.monthly_budgets.control_start is 'Início do controle do dia a dia no mês (null = dia 1).';

-- ===== parcelas data compra =====
-- Data da compra das parcelas do plano, para casar com a parcela real do banco (±3 dias).
alter table public.installment_purchases add column purchase_date date;
comment on column public.installment_purchases.purchase_date is 'Data da compra (para casar com a parcela do banco: valor ±2%, nº de parcelas e data ±3 dias).';

-- ===== juntar contas leva pagas =====
-- Ao juntar uma conta do banco numa cadastrada, as marcações de "paga" (bill_payments, chave
-- 'card:<id>') vão junto para a conta que fica. Sem isso a marcação ficava órfã (item 14).
-- Aditivo: só reescreve a chave; se a conta destino já tem marcação no mês, a dela vale.
create or replace function public.merge_accounts(from_id uuid, into_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  src public.accounts;
  dst public.accounts;
begin
  if from_id = into_id then raise exception 'contas iguais'; end if;
  select * into src from public.accounts where id = from_id;
  select * into dst from public.accounts where id = into_id;
  if src.id is null or dst.id is null then raise exception 'conta não encontrada'; end if;
  if src.user_id <> dst.user_id then raise exception 'contas de usuários diferentes'; end if;
  if src.kind <> dst.kind then raise exception 'tipos diferentes (cartão x conta)'; end if;
  if dst.pluggy_account_id is not null and src.pluggy_account_id is not null then
    raise exception 'as duas contas já estão ligadas ao banco';
  end if;

  update public.accounts set pluggy_account_id = null where id = from_id;
  update public.accounts set
    pluggy_account_id = coalesce(src.pluggy_account_id, dst.pluggy_account_id),
    pluggy_item_id = coalesce(src.pluggy_item_id, dst.pluggy_item_id),
    balance_cents = coalesce(src.balance_cents, dst.balance_cents),
    credit_limit_cents = coalesce(src.credit_limit_cents, dst.credit_limit_cents),
    available_limit_cents = coalesce(src.available_limit_cents, dst.available_limit_cents),
    bill_close_date = coalesce(src.bill_close_date, dst.bill_close_date),
    bill_due_date = coalesce(src.bill_due_date, dst.bill_due_date),
    synced_at = coalesce(src.synced_at, dst.synced_at)
  where id = into_id;

  update public.transactions set account_id = into_id where account_id = from_id;
  update public.card_bills set account_id = into_id where account_id = from_id;
  update public.installment_purchases set account_id = into_id where account_id = from_id;
  update public.fixed_expenses set account_id = into_id where account_id = from_id;

  -- marcações de paga acompanham a conta
  update public.bill_payments bp set key = 'card:' || into_id::text
   where bp.user_id = src.user_id
     and bp.key = 'card:' || from_id::text
     and not exists (
       select 1 from public.bill_payments x
        where x.user_id = bp.user_id and x.month = bp.month and x.key = 'card:' || into_id::text
     );

  delete from public.accounts where id = from_id;
end $$;

revoke all on function public.merge_accounts(uuid, uuid) from public, anon;
grant execute on function public.merge_accounts(uuid, uuid) to authenticated;

-- ===== preferências =====
-- Nomes das duas categorias do dia a dia (editáveis no Planejamento).
alter table public.settings
  add column label_lazer text not null default 'Lazer' check (char_length(label_lazer) between 1 and 40),
  add column label_mercado text not null default 'Mercado' check (char_length(label_mercado) between 1 and 40);
