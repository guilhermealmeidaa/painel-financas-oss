-- Notificações por push (aparelhos, preferências, o que já foi avisado) e fotos do mês para o Plano
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  fail_count integer not null default 0
);
create index push_subscriptions_user on public.push_subscriptions (user_id);
alter table public.settings add column notifications jsonb not null default
  '{"contas":true,"ritmo":true,"sync":true,"assinaturas":true,"fora_do_padrao":true,"resumo_diario":true}';
create table public.notification_log (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);
create table public.month_snapshots (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month date not null,
  kind text not null check (kind in ('inicio', 'fim')),
  projected_balance_cents integer,
  bank_balance_cents integer,
  debt_remaining_cents integer,
  taken_at timestamptz not null default now(),
  primary key (user_id, month, kind)
);
alter table public.push_subscriptions enable row level security;
alter table public.notification_log enable row level security;
alter table public.month_snapshots enable row level security;
create policy "dono_push_subscriptions" on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "dono_notification_log" on public.notification_log for select to authenticated
  using (user_id = (select auth.uid()));
create policy "dono_month_snapshots" on public.month_snapshots for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.push_subscriptions, public.notification_log, public.month_snapshots from anon;
revoke all on public.notification_log, public.month_snapshots from authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select on public.notification_log, public.month_snapshots to authenticated;
