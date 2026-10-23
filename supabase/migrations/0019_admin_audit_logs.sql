-- 0019: Phase 7.5 - audit log read model for the Super Admin.
--
-- PURPOSE
--   Give platform staff a safe, paginated, filterable view of audit_logs, and stop billing from reading raw
--   audit metadata through the API.
--
-- CHANGES
--   1. audit_logs policy platform_select (any platform user) is replaced by one for super_admin and support only.
--      Reason: metadata holds before/after snapshots (owner emails, phones, tax numbers). Billing reads audit rows only
--      through the RPCs below, which redact metadata outside subscription entries.
--      Tenant policy (audit.read, own company) is untouched. Append-only triggers untouched.
--   2. Indexes for the two access paths: newest-first scan, and action + time.
--   3. admin_list_audit_logs   all platform roles     keyset pagination, filters, NO metadata (changed keys only)
--      admin_get_audit_log     all platform roles     one entry with metadata; redacted for billing outside subscriptions
--      admin_audit_summary     super_admin, support   counts for the last N days (platform staff activity)
--
-- SECURITY (same contract as 0016/0017/0018)
--   SECURITY DEFINER, search_path = '', role from app_private.assert_platform() (auth.uid() -> platform_users),
--   never a parameter. All filters are typed and validated; none reaches dynamic SQL. Read-only: these functions
--   write nothing, not even audit rows (reading the log is not audited; it would double the log's write volume).
--   ip_address and user_agent are never returned (nothing writes them today).
--
-- ROLLBACK
--   drop function if exists public.admin_list_audit_logs(uuid,text,text,text,text,uuid,timestamptz,timestamptz,timestamptz,uuid,integer),
--                           public.admin_get_audit_log(uuid), public.admin_audit_summary(integer);
--   drop index if exists public.audit_logs_created_idx, public.audit_logs_action_idx;
--   drop policy if exists platform_select on public.audit_logs;
--   create policy platform_select on public.audit_logs for select to authenticated using (app_private.is_platform_user());
set search_path = public, extensions;

-- ---------------------------------------------------------------- 1. policy
drop policy if exists platform_select on public.audit_logs;
create policy platform_select on public.audit_logs for select to authenticated
  using (app_private.platform_role() in ('super_admin','support'));

-- ---------------------------------------------------------------- 2. indexes
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc, id desc);
create index if not exists audit_logs_action_idx  on public.audit_logs (action, created_at desc);

-- ---------------------------------------------------------------- 3a. list
create or replace function public.admin_list_audit_logs(
  p_company uuid default null, p_namespace text default null, p_action text default null, p_entity_type text default null,
  p_actor_type text default null, p_actor uuid default null, p_from timestamptz default null, p_to timestamptz default null,
  p_before_at timestamptz default null, p_before_id uuid default null, p_limit integer default 50
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_items jsonb; v_count integer; v_more boolean; v_last jsonb;
begin
  perform app_private.assert_platform(array['super_admin','support','billing']);

  if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid limit' using errcode = '22023'; end if;
  if p_namespace is not null and p_namespace !~ '^[a-z0-9_]{1,40}$' then raise exception 'invalid filter' using errcode = '22023'; end if;
  if p_action is not null and p_action !~ '^[a-z0-9_]{1,40}\.[a-z0-9_]{1,40}$' then raise exception 'invalid filter' using errcode = '22023'; end if;
  if p_entity_type is not null and p_entity_type !~ '^[a-z0-9_]{1,40}$' then raise exception 'invalid filter' using errcode = '22023'; end if;
  if p_actor_type is not null and p_actor_type not in ('platform_user','company_user','customer','system') then raise exception 'invalid filter' using errcode = '22023'; end if;
  if p_from is not null and p_to is not null and p_from > p_to then raise exception 'invalid range' using errcode = '22023'; end if;
  if (p_before_at is null) <> (p_before_id is null) then raise exception 'invalid cursor' using errcode = '22023'; end if;

  with page as (
    select a.id, a.created_at, a.action, a.entity_type, a.entity_id, a.actor_type, a.actor_id, a.company_id, a.metadata
      from public.audit_logs a
     where (p_company is null or a.company_id = p_company)
       and (p_namespace is null or split_part(a.action, '.', 1) = p_namespace)
       and (p_action is null or a.action = p_action)
       and (p_entity_type is null or a.entity_type = p_entity_type)
       and (p_actor_type is null or a.actor_type = p_actor_type)
       and (p_actor is null or a.actor_id = p_actor)
       and (p_from is null or a.created_at >= p_from)
       and (p_to is null or a.created_at <= p_to)
       and (p_before_at is null or (a.created_at, a.id) < (p_before_at, p_before_id))
     order by a.created_at desc, a.id desc
     limit p_limit + 1
  ), numbered as (
    select p.*, row_number() over (order by p.created_at desc, p.id desc) as rn from page p
  )
  select count(*), coalesce(jsonb_agg(jsonb_build_object(
           'id', n.id, 'created_at', n.created_at, 'action', n.action, 'entity_type', n.entity_type, 'entity_id', n.entity_id,
           'actor_type', n.actor_type, 'actor_id', n.actor_id, 'actor_name', pr.full_name,
           'company_id', n.company_id, 'company_name', c.name,
           'changed_keys', case when jsonb_typeof(n.metadata -> 'after') = 'object'
                                then (select coalesce(jsonb_agg(k order by k), '[]'::jsonb) from jsonb_object_keys(n.metadata -> 'after') k)
                                else '[]'::jsonb end
         ) order by n.rn) filter (where n.rn <= p_limit), '[]'::jsonb)
    into v_count, v_items
    from numbered n
    left join public.profiles pr on pr.id = n.actor_id
    left join public.companies c on c.id = n.company_id;

  v_more := v_count > p_limit;
  if v_more then
    v_last := v_items -> (p_limit - 1);
  end if;
  return jsonb_build_object(
    'items', v_items,
    'has_more', v_more,
    'next_before_at', case when v_more then v_last ->> 'created_at' end,
    'next_before_id', case when v_more then v_last ->> 'id' end);
end $$;

-- ---------------------------------------------------------------- 3b. one entry
create or replace function public.admin_get_audit_log(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_role text := app_private.assert_platform(array['super_admin','support','billing']);
  r record; v_full boolean;
begin
  select a.*, pr.full_name as actor_name, pr.email::text as actor_email, c.name as company_name
    into r
    from public.audit_logs a
    left join public.profiles pr on pr.id = a.actor_id
    left join public.companies c on c.id = a.company_id
   where a.id = p_id;
  if not found then raise exception 'audit entry not found' using errcode = 'P0002'; end if;

  -- billing sees subscription entries in full and nothing else beyond the header
  v_full := v_role in ('super_admin','support') or r.entity_type = 'subscription';
  return jsonb_build_object(
    'id', r.id, 'created_at', r.created_at, 'action', r.action, 'entity_type', r.entity_type, 'entity_id', r.entity_id,
    'actor_type', r.actor_type, 'actor_id', r.actor_id, 'actor_name', r.actor_name,
    'actor_email', case when v_role in ('super_admin','support') then r.actor_email end,
    'company_id', r.company_id, 'company_name', r.company_name,
    'metadata', case when v_full then r.metadata end,
    'metadata_redacted', not v_full);
end $$;

-- ---------------------------------------------------------------- 3c. summary
create or replace function public.admin_audit_summary(p_days integer default 7) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_since timestamptz; v_total bigint; v_ns jsonb; v_actors jsonb;
begin
  perform app_private.assert_platform(array['super_admin','support']);
  if p_days is null or p_days not between 1 and 90 then raise exception 'invalid range' using errcode = '22023'; end if;
  v_since := now() - make_interval(days => p_days);

  select count(*) into v_total from public.audit_logs where created_at >= v_since;
  select coalesce(jsonb_agg(jsonb_build_object('namespace', x.ns, 'count', x.n) order by x.n desc, x.ns), '[]'::jsonb) into v_ns
    from (select split_part(action, '.', 1) as ns, count(*) as n from public.audit_logs
           where created_at >= v_since group by 1 order by 2 desc, 1 limit 10) x;
  select coalesce(jsonb_agg(jsonb_build_object('actor_id', x.actor_id, 'actor_name', x.name, 'count', x.n) order by x.n desc, x.name), '[]'::jsonb) into v_actors
    from (select a.actor_id, pr.full_name as name, count(*) as n
            from public.audit_logs a left join public.profiles pr on pr.id = a.actor_id
           where a.created_at >= v_since and a.actor_type = 'platform_user'
           group by a.actor_id, pr.full_name order by 3 desc, 2 limit 10) x;
  return jsonb_build_object('days', p_days, 'since', v_since, 'total', v_total, 'by_namespace', v_ns, 'platform_actors', v_actors);
end $$;

revoke all on function public.admin_list_audit_logs(uuid,text,text,text,text,uuid,timestamptz,timestamptz,timestamptz,uuid,integer) from public, anon;
revoke all on function public.admin_get_audit_log(uuid) from public, anon;
revoke all on function public.admin_audit_summary(integer) from public, anon;
grant execute on function public.admin_list_audit_logs(uuid,text,text,text,text,uuid,timestamptz,timestamptz,timestamptz,uuid,integer) to authenticated;
grant execute on function public.admin_get_audit_log(uuid) to authenticated;
grant execute on function public.admin_audit_summary(integer) to authenticated;
