-- 0068_analytics_core.sql  (P10a-1: schema + ingest + consent, no UI)
--
-- Rollback (reverse order):
--   drop function public.track_search(text,uuid,uuid,jsonb,jsonb), public.track_events(text,uuid,uuid,jsonb,jsonb), public.record_consent(text,uuid,boolean,text);
--   drop function app_private.analytics_maintenance(), app_private.ensure_analytics_partition(date), app_private.analytics_consented(text,uuid),
--                 app_private.analytics_clean_text(text,int), app_private.analytics_rate_check(text,int,int);
--   drop table public.search_events, public.analytics_events (drops app_private.analytics_events_y*), public.consents,
--              public.analytics_event_catalog, app_private.analytics_config;
-- Runner note: apply BEFORE deploying code that calls track_events (rule from incident 0033).
--
-- VERIFY before applying (names assumed from earlier phases, each used in ONE place):
--   1. app_private.rate_limit_hit(key text, limit int, window_seconds int): assumed to RAISE when exceeded. Wrapper: analytics_rate_check.
--   2. app_private.is_platform_super_admin(): used by the three select policies below.
--   3. public.companies(id).
--   4. Role service_role exists (Supabase default). Only the server route calls the RPCs.

-- ---------------------------------------------------------------- config
create table app_private.analytics_config (
  id boolean primary key default true check (id),
  notice_version text not null check (length(notice_version) between 1 and 20),
  retention_months int not null check (retention_months between 1 and 36)
);
alter table app_private.analytics_config enable row level security;
insert into app_private.analytics_config (notice_version, retention_months) values ('1', 13);

-- ---------------------------------------------------------------- event allow-list (data, not code)
create table public.analytics_event_catalog (
  event text primary key check (event ~ '^[a-z][a-z0-9_.]{1,63}$'),
  surface text not null check (surface in ('marketplace','company_site','dashboard','driver','system')),
  allowed_keys text[] not null default '{}',
  is_active boolean not null default true
);
alter table public.analytics_event_catalog enable row level security;
insert into public.analytics_event_catalog (event, surface, allowed_keys) values
  ('page_view',       'marketplace', '{}'),
  ('language_switch', 'marketplace', '{to}');

-- ---------------------------------------------------------------- consent log (append-only; latest row wins)
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  session_id text not null check (session_id ~ '^[A-Za-z0-9_-]{16,64}$'),
  user_id uuid references auth.users(id) on delete cascade,
  purpose text not null default 'analytics' check (purpose in ('analytics')),
  granted boolean not null,
  notice_version text not null check (length(notice_version) between 1 and 20),
  created_at timestamptz not null default clock_timestamp()
);
create index consents_session_idx on public.consents (session_id, created_at desc);
create index consents_user_idx on public.consents (user_id, created_at desc) where user_id is not null;
alter table public.consents enable row level security;

-- ---------------------------------------------------------------- events (monthly partitions live in app_private, never exposed by PostgREST)
create table public.analytics_events (
  id bigint generated always as identity,
  occurred_at timestamptz not null default now(),
  session_id text not null,
  user_id uuid references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  surface text not null,
  event text not null references public.analytics_event_catalog(event),
  properties jsonb not null default '{}'::jsonb,
  path text,
  referrer_host text,
  locale text,
  device_class text,
  country text,
  ip_hash text,
  primary key (id, occurred_at)
) partition by range (occurred_at);
create index analytics_events_event_idx on public.analytics_events (event, occurred_at);
create index analytics_events_session_idx on public.analytics_events (session_id);
create index analytics_events_user_idx on public.analytics_events (user_id) where user_id is not null;
alter table public.analytics_events enable row level security;

-- ---------------------------------------------------------------- search events (typed: core business signal; small, retention by delete)
create table public.search_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  session_id text not null,
  user_id uuid references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  origin text,
  destination text,
  travel_date date,
  filters jsonb not null default '{}'::jsonb check (octet_length(filters::text) <= 1024),
  results_count int not null check (results_count between 0 and 10000),
  zero_result boolean generated always as (results_count = 0) stored,
  locale text,
  device_class text,
  country text,
  ip_hash text
);
create index search_events_zero_idx on public.search_events (zero_result, occurred_at);
create index search_events_route_idx on public.search_events (origin, destination);
create index search_events_session_idx on public.search_events (session_id);
create index search_events_user_idx on public.search_events (user_id) where user_id is not null;
alter table public.search_events enable row level security;

-- Super admin read only. No insert/update/delete policy exists: writes go through the RPCs below.
create policy analytics_events_admin_read on public.analytics_events for select to authenticated using (app_private.is_platform_super_admin());
create policy search_events_admin_read    on public.search_events    for select to authenticated using (app_private.is_platform_super_admin());
create policy consents_admin_read         on public.consents         for select to authenticated using (app_private.is_platform_super_admin());
create policy analytics_catalog_admin_read on public.analytics_event_catalog for select to authenticated using (app_private.is_platform_super_admin());

revoke all on public.analytics_events, public.search_events, public.consents, public.analytics_event_catalog from public, anon, authenticated;
grant select on public.analytics_events, public.search_events, public.consents, public.analytics_event_catalog to authenticated;

-- ---------------------------------------------------------------- helpers
create function app_private.analytics_rate_check(p_key text, p_limit int, p_window_seconds int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.rate_limit_hit(p_key, p_limit, p_window_seconds); -- ADJUST here only if the 0020 signature differs
end $$;

create function app_private.analytics_clean_text(p text, p_max int)
returns text language plpgsql immutable set search_path = '' as $$
declare v text := nullif(btrim(p), '');
begin
  if v is null then return null; end if;
  if length(v) > p_max or v ~ '[[:cntrl:]]' then
    raise exception 'invalid text' using errcode = '22023';
  end if;
  return v;
end $$;

create function app_private.analytics_consented(p_session text, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select c.granted and c.notice_version = (select k.notice_version from app_private.analytics_config k)
    from public.consents c
    where c.purpose = 'analytics'
      and (c.session_id = p_session or (p_user is not null and c.user_id = p_user))
    order by c.created_at desc, c.id desc
    limit 1), false)
$$;

create function app_private.ensure_analytics_partition(p_month date)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_name text := format('analytics_events_y%sm%s', to_char(date_trunc('month', p_month), 'YYYY'), to_char(date_trunc('month', p_month), 'MM'));
begin
  execute format('create table if not exists app_private.%I partition of public.analytics_events for values from (%L) to (%L)',
    v_name, v_start::text || ' 00:00:00+00', (v_start + interval '1 month')::date::text || ' 00:00:00+00');
  execute format('alter table app_private.%I enable row level security', v_name);
  execute format('revoke all on app_private.%I from public, anon, authenticated', v_name);
end $$;

-- Scheduler hook: register in the P1 run_due_jobs() pattern (daily). Creates this + next 2 months, drops expired partitions, trims search_events.
create function app_private.analytics_maintenance()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_ret int;
  v_cut date;
  v_m date;
  r record;
  n int;
begin
  select retention_months into v_ret from app_private.analytics_config;
  for n in 0..2 loop
    perform app_private.ensure_analytics_partition((date_trunc('month', now() at time zone 'UTC') + make_interval(months => n))::date);
  end loop;
  v_cut := (date_trunc('month', now() at time zone 'UTC') - make_interval(months => v_ret))::date;
  for r in
    select c.relname
    from pg_inherits inh
    join pg_class c on c.oid = inh.inhrelid
    join pg_class p on p.oid = inh.inhparent
    join pg_namespace pn on pn.oid = p.relnamespace
    where pn.nspname = 'public' and p.relname = 'analytics_events'
  loop
    v_m := make_date(substring(r.relname from 'y(\d{4})m')::int, substring(r.relname from 'm(\d{2})$')::int, 1);
    if v_m < v_cut then
      execute format('drop table app_private.%I', r.relname);
    end if;
  end loop;
  delete from public.search_events where occurred_at < now() - make_interval(months => v_ret);
  -- consents are NOT trimmed here: they are the proof of choice. Retention for them is a counsel decision (D6).
end $$;
select app_private.analytics_maintenance();

-- ---------------------------------------------------------------- RPCs (service_role only: the Next.js route computes ip_hash/country/device)
create function public.record_consent(p_session text, p_user uuid, p_granted boolean, p_version text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_session is null or p_session !~ '^[A-Za-z0-9_-]{16,64}$' then
    raise exception 'invalid session' using errcode = '22023';
  end if;
  if p_version is distinct from (select notice_version from app_private.analytics_config) then
    raise exception 'stale notice version' using errcode = '22023';
  end if;
  perform app_private.analytics_rate_check('consent:' || p_session, 20, 60);
  insert into public.consents (session_id, user_id, granted, notice_version) values (p_session, p_user, p_granted, p_version);
  if not p_granted then
    delete from public.analytics_events where session_id = p_session or (p_user is not null and user_id = p_user);
    delete from public.search_events    where session_id = p_session or (p_user is not null and user_id = p_user);
  end if;
end $$;

create function public.track_events(p_session text, p_user uuid, p_company uuid, p_events jsonb, p_ctx jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_ev jsonb; v_cat record; v_key text; v_val jsonb; v_props jsonb;
  v_n int := 0;
  v_path text; v_ref text; v_locale text; v_dev text; v_country text; v_hash text;
begin
  if p_session is null or p_session !~ '^[A-Za-z0-9_-]{16,64}$' then raise exception 'invalid session' using errcode = '22023'; end if;
  if jsonb_typeof(p_events) is distinct from 'array' or jsonb_array_length(p_events) not between 1 and 20 then
    raise exception 'invalid batch' using errcode = '22023';
  end if;
  perform app_private.analytics_rate_check('track:s:' || p_session, 120, 60);
  v_hash := nullif(p_ctx->>'ip_hash', '');
  if v_hash is not null then
    if v_hash !~ '^[0-9a-f]{64}$' then v_hash := null; else perform app_private.analytics_rate_check('track:ip:' || v_hash, 300, 60); end if;
  end if;
  if not app_private.analytics_consented(p_session, p_user) then return 0; end if;

  v_path := left(split_part(coalesce(p_ctx->>'path', ''), '?', 1), 300);
  if v_path !~ '^/' then v_path := null; end if;
  v_ref := nullif(p_ctx->>'referrer_host', ''); if v_ref !~ '^[a-z0-9.-]{1,100}$' then v_ref := null; end if;
  v_locale := p_ctx->>'locale'; if v_locale not in ('ar','en') then v_locale := null; end if;
  v_dev := p_ctx->>'device_class'; if v_dev not in ('mobile','tablet','desktop') then v_dev := null; end if;
  v_country := p_ctx->>'country'; if v_country !~ '^[A-Z]{2}$' then v_country := null; end if;

  for v_ev in select * from jsonb_array_elements(p_events) loop
    select * into v_cat from public.analytics_event_catalog where event = (v_ev->>'event') and is_active;
    if not found then raise exception 'unknown event' using errcode = '22023'; end if;
    v_props := coalesce(v_ev->'properties', '{}'::jsonb);
    if jsonb_typeof(v_props) <> 'object' or octet_length(v_props::text) > 2048 then raise exception 'invalid properties' using errcode = '22023'; end if;
    for v_key, v_val in select * from jsonb_each(v_props) loop
      if not (v_key = any (v_cat.allowed_keys)) then raise exception 'property not allowed' using errcode = '22023'; end if;
      if jsonb_typeof(v_val) not in ('string','number','boolean') then raise exception 'invalid property value' using errcode = '22023'; end if;
      if jsonb_typeof(v_val) = 'string' then perform app_private.analytics_clean_text(v_val #>> '{}', 200); end if;
    end loop;
    insert into public.analytics_events (session_id, user_id, company_id, surface, event, properties, path, referrer_host, locale, device_class, country, ip_hash)
    values (p_session, p_user, p_company, v_cat.surface, v_cat.event, v_props, v_path, v_ref, v_locale, v_dev, v_country, v_hash);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create function public.track_search(p_session text, p_user uuid, p_company uuid, p_search jsonb, p_ctx jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_hash text; v_locale text; v_dev text; v_country text; v_date date; v_filters jsonb; v_count int;
begin
  if p_session is null or p_session !~ '^[A-Za-z0-9_-]{16,64}$' then raise exception 'invalid session' using errcode = '22023'; end if;
  if jsonb_typeof(p_search) is distinct from 'object' then raise exception 'invalid search' using errcode = '22023'; end if;
  perform app_private.analytics_rate_check('search:s:' || p_session, 60, 60);
  v_hash := nullif(p_ctx->>'ip_hash', '');
  if v_hash is not null then
    if v_hash !~ '^[0-9a-f]{64}$' then v_hash := null; else perform app_private.analytics_rate_check('search:ip:' || v_hash, 200, 60); end if;
  end if;
  if not app_private.analytics_consented(p_session, p_user) then return false; end if;

  v_locale := p_ctx->>'locale'; if v_locale not in ('ar','en') then v_locale := null; end if;
  v_dev := p_ctx->>'device_class'; if v_dev not in ('mobile','tablet','desktop') then v_dev := null; end if;
  v_country := p_ctx->>'country'; if v_country !~ '^[A-Z]{2}$' then v_country := null; end if;
  v_date := nullif(p_search->>'travel_date', '')::date;
  v_filters := coalesce(p_search->'filters', '{}'::jsonb);
  if jsonb_typeof(v_filters) <> 'object' or octet_length(v_filters::text) > 1024 then raise exception 'invalid filters' using errcode = '22023'; end if;
  v_count := (p_search->>'results_count')::int;
  if v_count is null or v_count not between 0 and 10000 then raise exception 'invalid results_count' using errcode = '22023'; end if;

  insert into public.search_events (session_id, user_id, company_id, origin, destination, travel_date, filters, results_count, locale, device_class, country, ip_hash)
  values (p_session, p_user, p_company,
          app_private.analytics_clean_text(p_search->>'origin', 80),
          app_private.analytics_clean_text(p_search->>'destination', 80),
          v_date, v_filters, v_count, v_locale, v_dev, v_country, v_hash);
  return true;
end $$;

revoke all on function public.record_consent(text,uuid,boolean,text), public.track_events(text,uuid,uuid,jsonb,jsonb), public.track_search(text,uuid,uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.record_consent(text,uuid,boolean,text), public.track_events(text,uuid,uuid,jsonb,jsonb), public.track_search(text,uuid,uuid,jsonb,jsonb) to service_role;
revoke all on function app_private.analytics_maintenance(), app_private.ensure_analytics_partition(date) from public, anon, authenticated;
