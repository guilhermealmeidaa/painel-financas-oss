-- Fase 4: OAuth 2.1 para o conector do claude.ai. Ver lib/oauth.ts.
create table public.oauth_codes (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id text not null,
  client_name text not null,
  redirect_uri text not null,
  code_challenge text not null,
  scopes text[] not null,
  resource text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.oauth_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_name text not null,
  client_hash text not null check (client_hash ~ '^[0-9a-f]{64}$'),
  redirect_host text not null,
  scopes text[] not null,
  resource text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create table public.oauth_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  grant_id uuid not null references public.oauth_grants (id) on delete cascade,
  kind text not null check (kind in ('access', 'refresh')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index oauth_tokens_grant on public.oauth_tokens (grant_id);
create index oauth_codes_user on public.oauth_codes (user_id);
create index oauth_grants_user on public.oauth_grants (user_id);
create table public.api_rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  token_key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (token_key, window_start)
);
create index api_rate_limits_user on public.api_rate_limits (user_id);

alter table public.oauth_codes enable row level security;
alter table public.oauth_grants enable row level security;
alter table public.oauth_tokens enable row level security;
alter table public.api_rate_limits enable row level security;
create policy "dono_oauth_codes_insert" on public.oauth_codes for insert to authenticated with check (user_id = (select auth.uid()));
create policy "dono_oauth_grants_select" on public.oauth_grants for select to authenticated using (user_id = (select auth.uid()));
create policy "dono_oauth_grants_update" on public.oauth_grants for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "dono_oauth_tokens_select" on public.oauth_tokens for select to authenticated using (user_id = (select auth.uid()));
create policy "dono_api_rate_limits_select" on public.api_rate_limits for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.oauth_codes, public.oauth_grants, public.oauth_tokens, public.api_rate_limits from anon, authenticated;
grant insert on public.oauth_codes to authenticated;
grant select, update on public.oauth_grants to authenticated;
grant select on public.oauth_tokens to authenticated;
grant select on public.api_rate_limits to authenticated;

create function public.hit_rate_limit(p_user uuid, p_key text, p_limit integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  w timestamptz := date_trunc('minute', now());
  n integer;
begin
  insert into public.api_rate_limits (user_id, token_key, window_start, hits) values (p_user, p_key, w, 1)
  on conflict (token_key, window_start) do update set hits = public.api_rate_limits.hits + 1
  returning hits into n;
  if n = 1 then
    delete from public.api_rate_limits where token_key = p_key and window_start < w - interval '1 hour';
  end if;
  return n <= p_limit;
end;
$$;
revoke all on function public.hit_rate_limit(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(uuid, text, integer) to service_role;
