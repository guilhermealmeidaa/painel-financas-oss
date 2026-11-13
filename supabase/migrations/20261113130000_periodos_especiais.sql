-- Períodos especiais do dia a dia (ex.: viagem) com teto próprio, reservado de dentro do teto do mês
create table public.budget_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month date not null,
  name text not null check (length(name) between 1 and 60),
  start_date date not null,
  end_date date not null,
  cap_cents integer not null check (cap_cents >= 0),
  created_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (date_trunc('month', start_date)::date = month and date_trunc('month', end_date)::date = month)
);
create index budget_periods_user_month on public.budget_periods (user_id, month);
alter table public.budget_periods enable row level security;
create policy "dono_budget_periods" on public.budget_periods for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.budget_periods from anon;
grant select, insert, update, delete on public.budget_periods to authenticated;
