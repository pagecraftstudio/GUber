-- 0045 (M3B-1): the ONLY write path for `domains`. Company side + platform side. No company_id parameter anywhere: the company
-- is derived from auth.uid() (app_private.caller_company), and authorization is a permission key, never a role name.
--
-- TRUST MODEL FOR DNS (decision recorded here, because it is a security boundary)
--   A hostname becomes `verified` only when PLATFORM STAFF record it (admin_record_domain_check). A tenant must never be able to
--   self-report "my DNS is correct": the DB cannot see DNS, so any tenant-callable "record result" RPC would let a tenant verify
--   any hostname. The owner's "Check DNS" button therefore calls begin_domain_check() (authorizes + rate-limits + returns the
--   hostname and token), runs dns.promises in the Next.js server action and SHOWS the result; nothing is persisted from it.
--   Staff run the same check from the admin queue and record it. v1 already needs a manual Vercel attach, so no extra step exists.
--   The daily recheck (M3F) needs a trusted caller; it will use its own service-role-only RPC when that milestone decides how.
--
-- RULES
--   * add_custom_domain: domains.write (owner only, 0005), rate limited, max_custom_domains enforced UNDER A COMPANY ROW LOCK
--     (two concurrent adds cannot both pass), generic error for a taken hostname (no information about other tenants).
--   * A disabled hostname stays taken by its former company; the same company can re-add it (reset to pending, new token).
--     Another company can take it only 14 days after it was disabled (takeover cooldown); the stale row is then deleted.
--   * set_primary_domain: only an ACTIVE domain; flips old -> new inside one transaction.
--   * Platform staff: admin_record_domain_check, admin_activate_domain (needs verified), admin_disable_domain. super_admin only.
--   * Every mutation writes audit_logs (domain.add / domain.remove / domain.set_primary / domain.verify / domain.activate / domain.disable).
--
-- ROLLBACK
--   drop function public.add_custom_domain(text), public.remove_custom_domain(uuid), public.set_primary_domain(uuid),
--     public.begin_domain_check(uuid), public.admin_record_domain_check(uuid, boolean, text), public.admin_activate_domain(uuid, boolean),
--     public.admin_disable_domain(uuid, text), app_private.caller_company(text);
-- RUNNER NOTE: requires 0042-0044.
set search_path = public, extensions;

-- ---------------------------------------------------------------------------------------------------- caller company
-- The caller's company where they hold permission p_key. V1 = one company per user, written for N (first by id).
create or replace function app_private.caller_company(p_key text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_company uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select c into v_company from app_private.current_company_ids() c
   where app_private.has_permission(c, p_key) order by c limit 1;
  if v_company is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return v_company;
end $$;
revoke all on function app_private.caller_company(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------- add
create or replace function public.add_custom_domain(p_hostname text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_co uuid; v_host text; v_limit integer; v_count integer; v_id uuid; v_old public.domains%rowtype;
begin
  v_co := app_private.caller_company('domains.write');
  perform app_private.rate_limit_hit('domain.add');

  v_host := regexp_replace(lower(trim(coalesce(p_hostname, ''))), '\.$', '');
  if v_host = '' then raise exception 'invalid hostname' using errcode = '22023'; end if;

  -- serialise every domain mutation of this company (limit check + insert must be atomic)
  perform 1 from public.companies where id = v_co for update;

  v_limit := app_private.entitlement_limit(v_co, 'max_custom_domains');       -- NULL = unlimited, missing key = 0
  select count(*) into v_count from public.domains where company_id = v_co and kind = 'custom' and serving_status <> 'disabled';
  if v_limit is not null and v_count >= v_limit then
    raise exception 'custom domain limit reached' using errcode = '53400';
  end if;

  select * into v_old from public.domains where hostname = v_host;
  if found then
    if v_old.serving_status = 'disabled' and v_old.kind = 'custom' and v_old.company_id = v_co then
      -- the former owner re-adds it: back to pending with a fresh token
      update public.domains
         set serving_status = 'pending', verification_status = 'pending', verified_at = null, verification_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
             activated_at = null, disabled_at = null, ssl_ready = false, last_checked_at = null, last_error = null, created_by = auth.uid(), is_primary = false
       where id = v_old.id returning id into v_id;
      perform app_private.write_audit('company_user', v_co, 'domain.add', 'domain', v_id, jsonb_build_object('hostname', v_host, 'reactivated', true));
      return v_id;
    elsif v_old.serving_status = 'disabled' and v_old.kind = 'custom' and v_old.disabled_at < now() - interval '14 days' then
      delete from public.domains where id = v_old.id;                          -- cooldown over: the hostname is free again
    else
      raise exception 'hostname unavailable' using errcode = '23505';
    end if;
  end if;

  begin
    insert into public.domains (company_id, hostname, kind, verification_token, created_by)
    values (v_co, v_host, 'custom', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), auth.uid())
    returning id into v_id;
  exception
    when check_violation then raise exception 'invalid hostname' using errcode = '22023';
    when unique_violation then raise exception 'hostname unavailable' using errcode = '23505';
  end;

  perform app_private.write_audit('company_user', v_co, 'domain.add', 'domain', v_id, jsonb_build_object('hostname', v_host));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------------------------------- remove
create or replace function public.remove_custom_domain(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_co uuid; v_row public.domains%rowtype;
begin
  v_co := app_private.caller_company('domains.write');
  perform 1 from public.companies where id = v_co for update;
  select * into v_row from public.domains where id = p_id and company_id = v_co and kind = 'custom';
  if not found then raise exception 'domain not found' using errcode = 'P0002'; end if;
  if v_row.serving_status = 'disabled' then return; end if;

  update public.domains set serving_status = 'disabled', disabled_at = now(), is_primary = false, ssl_ready = false where id = v_row.id;
  perform app_private.write_audit('company_user', v_co, 'domain.remove', 'domain', v_row.id,
    jsonb_build_object('hostname', v_row.hostname::text, 'was_primary', v_row.is_primary, 'was_active', v_row.serving_status = 'active'));
end $$;

-- ---------------------------------------------------------------------------------------------------- primary
create or replace function public.set_primary_domain(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_co uuid; v_row public.domains%rowtype;
begin
  v_co := app_private.caller_company('domains.write');
  perform 1 from public.companies where id = v_co for update;
  select * into v_row from public.domains where id = p_id and company_id = v_co;
  if not found then raise exception 'domain not found' using errcode = 'P0002'; end if;
  if v_row.serving_status <> 'active' then raise exception 'only an active domain can be primary' using errcode = '23514'; end if;
  if v_row.is_primary then return; end if;

  update public.domains set is_primary = false where company_id = v_co and is_primary;
  update public.domains set is_primary = true where id = v_row.id;
  perform app_private.write_audit('company_user', v_co, 'domain.set_primary', 'domain', v_row.id, jsonb_build_object('hostname', v_row.hostname::text));
end $$;

-- ---------------------------------------------------------------------------------------------------- owner "Check DNS"
-- Authorizes, rate-limits, returns what the server action needs. Persists nothing (see TRUST MODEL).
create or replace function public.begin_domain_check(p_id uuid)
returns table (hostname text, verification_token text, kind text)
language plpgsql security definer set search_path = '' as $$
declare v_co uuid;
begin
  v_co := app_private.caller_company('domains.write');
  perform app_private.rate_limit_hit('domain.check');
  return query select d.hostname::text, d.verification_token, d.kind
                 from public.domains d where d.id = p_id and d.company_id = v_co and d.kind = 'custom' and d.serving_status <> 'disabled';
  if not found then raise exception 'domain not found' using errcode = 'P0002'; end if;
end $$;

-- ---------------------------------------------------------------------------------------------------- platform staff
create or replace function public.admin_record_domain_check(p_id uuid, p_dns_ok boolean, p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_row public.domains%rowtype; v_err text := left(nullif(trim(coalesce(p_error, '')), ''), 300);
begin
  perform app_private.assert_platform(array['super_admin']);
  select * into v_row from public.domains where id = p_id and kind = 'custom' for update;
  if not found then raise exception 'domain not found' using errcode = 'P0002'; end if;
  if v_row.serving_status = 'disabled' then raise exception 'domain is disabled' using errcode = '23514'; end if;
  if p_dns_ok is null then raise exception 'result required' using errcode = '22023'; end if;

  update public.domains
     set last_checked_at = now(),
         last_error = case when p_dns_ok then null else coalesce(v_err, 'DNS check failed') end,
         verification_status = case when p_dns_ok then 'verified' else case when verification_status = 'verified' then verification_status else 'failed' end end,
         verified_at = case when p_dns_ok then coalesce(verified_at, now()) else verified_at end
   where id = v_row.id;
  perform app_private.audit_platform(v_row.company_id, 'domain.verify', 'domain', v_row.id,
    jsonb_build_object('verification_status', v_row.verification_status), jsonb_build_object('dns_ok', p_dns_ok, 'error', v_err));
end $$;

create or replace function public.admin_activate_domain(p_id uuid, p_ssl_ready boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare v_row public.domains%rowtype;
begin
  perform app_private.assert_platform(array['super_admin']);
  select * into v_row from public.domains where id = p_id and kind = 'custom' for update;
  if not found then raise exception 'domain not found' using errcode = 'P0002'; end if;
  if v_row.verification_status <> 'verified' then raise exception 'domain is not verified' using errcode = '23514'; end if;
  if not exists (select 1 from public.companies c where c.id = v_row.company_id and c.deleted_at is null) then
    raise exception 'company not found' using errcode = 'P0002';
  end if;

  update public.domains set serving_status = 'active', activated_at = coalesce(activated_at, now()), disabled_at = null, ssl_ready = coalesce(p_ssl_ready, false)
   where id = v_row.id;
  perform app_private.audit_platform(v_row.company_id, 'domain.activate', 'domain', v_row.id,
    jsonb_build_object('serving_status', v_row.serving_status), jsonb_build_object('serving_status', 'active', 'ssl_ready', coalesce(p_ssl_ready, false)));
end $$;

create or replace function public.admin_disable_domain(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_row public.domains%rowtype; v_reason text := left(nullif(trim(coalesce(p_reason, '')), ''), 300);
begin
  perform app_private.assert_platform(array['super_admin']);
  if v_reason is null then raise exception 'reason required' using errcode = '22023'; end if;
  select * into v_row from public.domains where id = p_id for update;
  if not found then raise exception 'domain not found' using errcode = 'P0002'; end if;
  if v_row.serving_status = 'disabled' then return; end if;

  update public.domains set serving_status = 'disabled', disabled_at = now(), is_primary = false, ssl_ready = false, last_error = v_reason where id = v_row.id;
  perform app_private.audit_platform(v_row.company_id, 'domain.disable', 'domain', v_row.id,
    jsonb_build_object('serving_status', v_row.serving_status), jsonb_build_object('serving_status', 'disabled', 'reason', v_reason));
end $$;

-- ---------------------------------------------------------------------------------------------------- grants
revoke all on function public.add_custom_domain(text), public.remove_custom_domain(uuid), public.set_primary_domain(uuid),
  public.begin_domain_check(uuid), public.admin_record_domain_check(uuid, boolean, text),
  public.admin_activate_domain(uuid, boolean), public.admin_disable_domain(uuid, text) from public, anon;
grant execute on function public.add_custom_domain(text), public.remove_custom_domain(uuid), public.set_primary_domain(uuid),
  public.begin_domain_check(uuid), public.admin_record_domain_check(uuid, boolean, text),
  public.admin_activate_domain(uuid, boolean), public.admin_disable_domain(uuid, text) to authenticated;
