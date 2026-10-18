-- 0017: Phase 7.3 - superadmin company management.
--
-- PURPOSE
--   0015 removed every direct platform write on `companies`, `subscriptions` and `company_notes`. This migration adds the
--   ONLY write paths: SECURITY DEFINER functions that authorize from auth.uid() -> platform_users, validate input,
--   and write an audit row with before/after. Two read functions give the admin UI list/detail views that join data
--   across tables (plan, owners, counts) without opening more table policies.
--
-- FUNCTIONS                         WHO                                  AUDIT ACTION(S)
--   admin_list_companies(...)       super_admin, support, billing        none (read)
--   admin_company_detail(uuid)      super_admin, support, billing        none (read)
--   admin_create_company(...)       super_admin                          company.created (+ invite.created from create_invite)
--   admin_update_company(uuid,jsonb) super_admin                         company.updated (changed fields only)
--   admin_set_company_status(...)   super_admin                          company.suspended | company.reactivated |
--                                                                        company.cancelled | company.status_changed
--   admin_add_note(uuid,text)       super_admin, support                 company.note_added
--
-- SECURITY
--   * search_path = '' everywhere. Role is read by app_private.assert_platform() from auth.uid(); it is never a parameter.
--   * No function accepts a role, an actor id or a tenant flag from the caller. Company ids are targets, not authority.
--   * EXECUTE: authenticated only (PUBLIC and anon revoked). Everyone else gets 42501 from assert_platform.
--   * Audit never contains the invite token or note text. The invite token is returned once to the caller.
--   * Unknown company (or soft-deleted) -> P0002, the same answer for every caller that passed authorization.
--
-- BUSINESS RULES DECIDED HERE (flagged in PHASE-7.3-REPORT.md)
--   * Status transitions: trial -> active|suspended|cancelled; active -> suspended|cancelled;
--     suspended -> trial|active|cancelled; cancelled is terminal. Anything else raises 23514.
--   * Suspend and cancel require a reason (3..500 chars). Suspension is a reversible lock-out through is_company_active();
--     it does NOT touch subscriptions, trips or bookings (7.4 decides subscription effects).
--   * slug is immutable after creation (it is the default tenant hostname).
--   * A new company starts in status 'trial' with one 'trialing' monthly subscription on the chosen plan.
--
-- ROLLBACK
--   drop function if exists public.admin_list_companies(text, text, text, text, integer, integer);
--   drop function if exists public.admin_company_detail(uuid);
--   drop function if exists public.admin_create_company(text, text, text, text, text, text, text, text, integer, text);
--   drop function if exists public.admin_update_company(uuid, jsonb);
--   drop function if exists public.admin_set_company_status(uuid, text, text);
--   drop function if exists public.admin_add_note(uuid, text);
set search_path = public, extensions;

-- ======================= admin_list_companies =======================
create or replace function public.admin_list_companies(
  p_q text default null, p_status text default null, p_sort text default 'created_at', p_dir text default 'desc',
  p_page integer default 1, p_page_size integer default 25
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_term text := left(trim(coalesce(p_q, '')), 100);
  v_like text;
  v_total bigint;
  v_items jsonb;
begin
  perform app_private.assert_platform(array['super_admin','support','billing']);

  if p_status is not null and p_status not in ('trial','active','suspended','cancelled') then
    raise exception 'invalid status filter' using errcode = '22023';
  end if;
  if p_sort not in ('name','created_at') or p_dir not in ('asc','desc') then
    raise exception 'invalid sort' using errcode = '22023';
  end if;
  if p_page is null or p_page < 1 or p_page > 100000 or p_page_size is null or p_page_size < 1 or p_page_size > 100 then
    raise exception 'invalid page' using errcode = '22023';
  end if;

  -- LIKE wildcards in user text are escaped, so a search box cannot widen the match.
  v_like := case when v_term = '' then null
                 else '%' || replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_') || '%' end;

  select count(*) into v_total
    from public.companies c
   where c.deleted_at is null
     and (p_status is null or c.status = p_status)
     and (v_like is null or c.name ilike v_like escape '\' or c.slug::text ilike v_like escape '\'
          or c.contact_email::text ilike v_like escape '\');

  select coalesce(jsonb_agg(x.j order by x.rn), '[]'::jsonb) into v_items from (
    select row_number() over (
             order by
               case when p_sort = 'name' and p_dir = 'asc' then c.name end asc,
               case when p_sort = 'name' and p_dir = 'desc' then c.name end desc,
               case when p_sort = 'created_at' and p_dir = 'asc' then c.created_at end asc,
               case when p_sort = 'created_at' and p_dir = 'desc' then c.created_at end desc,
               c.id) as rn,
           jsonb_build_object(
             'id', c.id, 'name', c.name, 'slug', c.slug::text, 'status', c.status,
             'contact_name', c.contact_name, 'contact_email', c.contact_email::text,
             'created_at', c.created_at,
             'plan_code', pl.code, 'plan_name', pl.name,
             'subscription_status', ls.status, 'period_end', ls.current_period_end) as j
      from public.companies c
      left join lateral app_private.live_subscription(c.id) ls on true
      left join public.plans pl on pl.id = ls.plan_id
     where c.deleted_at is null
       and (p_status is null or c.status = p_status)
       and (v_like is null or c.name ilike v_like escape '\' or c.slug::text ilike v_like escape '\'
            or c.contact_email::text ilike v_like escape '\')
     order by rn
     limit p_page_size offset (p_page - 1) * p_page_size
  ) x;

  return jsonb_build_object('items', v_items, 'total', v_total, 'page', p_page, 'page_size', p_page_size);
end $$;

-- ======================= admin_company_detail =======================
create or replace function public.admin_company_detail(p_company uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c public.companies%rowtype;
  s record;
  v_settings jsonb;
  v_sub jsonb;
  v_counts jsonb;
  v_owners jsonb;
  v_invites jsonb;
  v_notes jsonb;
  v_resume text;
begin
  perform app_private.assert_platform(array['super_admin','support','billing']);
  select * into c from public.companies where id = p_company and deleted_at is null;
  if not found then raise exception 'company not found' using errcode = 'P0002'; end if;

  select jsonb_build_object('timezone', cs.timezone, 'currency', cs.currency, 'default_locale', cs.default_locale,
                            'booking_enabled', cs.booking_enabled)
    into v_settings from public.company_settings cs where cs.company_id = c.id;

  -- the live subscription if there is one, otherwise the most recent row (so the page can show "expired")
  select sb.id, pl.code as plan_code, pl.name as plan_name, sb.status, sb.billing_interval,
         sb.current_period_start, sb.current_period_end, sb.cancel_at_period_end,
         (sb.status in ('trialing','active','past_due') and sb.current_period_end > now()) as is_live
    into s
    from public.subscriptions sb join public.plans pl on pl.id = sb.plan_id
   where sb.company_id = c.id
   order by (sb.status in ('trialing','active','past_due') and sb.current_period_end > now()) desc, sb.created_at desc
   limit 1;
  if s.id is not null then
    v_sub := jsonb_build_object('id', s.id, 'plan_code', s.plan_code, 'plan_name', s.plan_name, 'status', s.status,
      'billing_interval', s.billing_interval, 'current_period_start', s.current_period_start,
      'current_period_end', s.current_period_end, 'cancel_at_period_end', s.cancel_at_period_end, 'is_live', s.is_live);
  end if;

  v_counts := jsonb_build_object(
    'users',    (select count(*) from public.company_users cu where cu.company_id = c.id and cu.status = 'active'),
    'buses',    (select count(*) from public.buses b where b.company_id = c.id),
    'drivers',  (select count(*) from public.drivers d where d.company_id = c.id),
    'routes',   (select count(*) from public.routes r where r.company_id = c.id and r.deleted_at is null),
    'trips',    (select count(*) from public.trips t where t.company_id = c.id),
    'bookings', (select count(*) from public.bookings bk where bk.company_id = c.id));

  select coalesce(jsonb_agg(jsonb_build_object('user_id', p.id, 'full_name', p.full_name, 'email', p.email::text,
                                                'status', cu.status) order by p.full_name), '[]'::jsonb)
    into v_owners
    from public.company_users cu
    join public.roles r on r.id = cu.role_id and r.key = 'owner'
    join public.profiles p on p.id = cu.user_id
   where cu.company_id = c.id;

  -- never token_hash
  select coalesce(jsonb_agg(jsonb_build_object('id', ci.id, 'email', ci.email::text, 'role_key', r.key,
                                                'expires_at', ci.expires_at, 'created_at', ci.created_at)
                            order by ci.created_at desc), '[]'::jsonb)
    into v_invites
    from public.company_invites ci join public.roles r on r.id = ci.role_id
   where ci.company_id = c.id and ci.status = 'pending' and ci.expires_at > now();

  select coalesce(jsonb_agg(n.j order by n.created_at desc), '[]'::jsonb) into v_notes from (
    select cn.created_at,
           jsonb_build_object('id', cn.id, 'body', cn.body, 'created_at', cn.created_at, 'author_name', p.full_name) as j
      from public.company_notes cn left join public.profiles p on p.id = cn.author_id
     where cn.company_id = c.id
     order by cn.created_at desc limit 50) n;

  -- where "reactivate" should go by default: the status the company had when it was last suspended
  select al.metadata->'before'->>'status' into v_resume
    from public.audit_logs al
   where al.company_id = c.id and al.action = 'company.suspended'
   order by al.created_at desc limit 1;
  if v_resume is null or v_resume not in ('trial','active') then v_resume := 'active'; end if;

  return jsonb_build_object(
    'company', jsonb_build_object(
      'id', c.id, 'name', c.name, 'slug', c.slug::text, 'status', c.status, 'legal_name', c.legal_name,
      'tax_number', c.tax_number, 'contact_name', c.contact_name, 'contact_email', c.contact_email::text,
      'contact_phone', c.contact_phone, 'country', c.country, 'suspended_at', c.suspended_at,
      'suspension_reason', c.suspension_reason, 'created_at', c.created_at, 'updated_at', c.updated_at),
    'settings', v_settings,
    'subscription', v_sub,
    'counts', v_counts,
    'owners', v_owners,
    'pending_invites', v_invites,
    'notes', v_notes,
    'resume_status', v_resume);
end $$;

-- ======================= admin_create_company =======================
-- One transaction: company (+ settings row via trigger) + trialing subscription + owner invite. Any failure rolls back all.
-- Returns the RAW invite token exactly once (only its hash is stored). No email is sent: the admin hands over the link.
create or replace function public.admin_create_company(
  p_name text, p_slug text, p_contact_name text, p_contact_email text, p_contact_phone text, p_legal_name text,
  p_country text, p_plan_code text, p_trial_days integer, p_owner_email text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_contact_name text := nullif(trim(coalesce(p_contact_name, '')), '');
  v_contact_email text := nullif(lower(trim(coalesce(p_contact_email, ''))), '');
  v_phone text := nullif(trim(coalesce(p_contact_phone, '')), '');
  v_legal text := nullif(trim(coalesce(p_legal_name, '')), '');
  v_country text := nullif(upper(trim(coalesce(p_country, ''))), '');
  v_owner_email text := lower(trim(coalesce(p_owner_email, '')));
  v_plan public.plans%rowtype;
  v_days integer;
  v_company uuid;
  v_sub uuid;
  v_inv record;
  v_now timestamptz := now();
begin
  perform app_private.assert_platform(array['super_admin']);

  if length(v_name) not between 1 and 120 then raise exception 'invalid company name' using errcode = '22023'; end if;
  if v_slug !~ '^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$' then raise exception 'invalid slug' using errcode = '22023'; end if;
  if v_slug in ('www','admin','api','app','mail','support','static','assets','cdn','dashboard','platform','status','blog','docs') then
    raise exception 'reserved slug' using errcode = '22023';
  end if;
  if v_contact_name is not null and length(v_contact_name) > 120 then raise exception 'invalid contact name' using errcode = '22023'; end if;
  if v_contact_email is not null and (v_contact_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_contact_email) > 254) then
    raise exception 'invalid contact email' using errcode = '22023';
  end if;
  if v_legal is not null and length(v_legal) > 200 then raise exception 'invalid legal name' using errcode = '22023'; end if;
  if v_country is not null and v_country !~ '^[A-Z]{2}$' then raise exception 'invalid country' using errcode = '22023'; end if;
  if v_owner_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_owner_email) > 254 then
    raise exception 'invalid email' using errcode = '22023';
  end if;

  select * into v_plan from public.plans where code = p_plan_code and is_active;
  if not found then raise exception 'unknown plan' using errcode = '22023'; end if;
  v_days := coalesce(p_trial_days, v_plan.trial_days);
  if v_days < 1 or v_days > 365 then raise exception 'invalid trial days' using errcode = '22023'; end if;

  -- slug taken -> 23505 companies_slug_key; bad phone -> 22023 from the 0009 trigger
  insert into public.companies (name, slug, status, legal_name, contact_name, contact_email, contact_phone, country, created_by)
  values (v_name, v_slug, 'trial', v_legal, v_contact_name, v_contact_email, v_phone, v_country, auth.uid())
  returning id into v_company;

  insert into public.subscriptions (company_id, plan_id, status, billing_interval, trial_ends_at,
                                    current_period_start, current_period_end)
  values (v_company, v_plan.id, 'trialing', 'monthly', v_now + make_interval(days => v_days),
          v_now, v_now + make_interval(days => v_days))
  returning id into v_sub;

  -- reuse the audited, hardened invite path (existing-member check, token hashing, 7-day expiry)
  select ci.invite_id, ci.token, ci.expires_at into v_inv from public.create_invite(v_owner_email, 'owner', v_company) ci;

  perform app_private.audit_platform(v_company, 'company.created', 'company', v_company, null,
    jsonb_build_object('name', v_name, 'slug', v_slug, 'status', 'trial', 'plan_code', v_plan.code,
                       'subscription_id', v_sub, 'trial_days', v_days, 'owner_email', v_owner_email));

  return jsonb_build_object('company_id', v_company, 'invite_id', v_inv.invite_id, 'token', v_inv.token,
                            'expires_at', v_inv.expires_at);
end $$;

-- ======================= admin_update_company =======================
-- Patch semantics: only keys present in p_patch change; '' or null clears a nullable field. `name` cannot be cleared.
-- Not editable here: status (admin_set_company_status), slug (immutable), id, timestamps.
create or replace function public.admin_update_company(p_company uuid, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_allowed text[] := array['name','legal_name','tax_number','contact_name','contact_email','contact_phone','country'];
  v_old public.companies%rowtype;
  v_new public.companies%rowtype;
  v_unknown text;
  v_name text; v_legal text; v_tax text; v_cname text; v_cemail text; v_phone text; v_country text;
  v_b jsonb; v_a jsonb; v_before jsonb; v_after jsonb;
begin
  perform app_private.assert_platform(array['super_admin']);
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'empty patch' using errcode = '22023';
  end if;
  select k into v_unknown from jsonb_object_keys(p_patch) k where k <> all (v_allowed) limit 1;
  if v_unknown is not null then raise exception 'unknown field' using errcode = '22023'; end if;

  select * into v_old from public.companies where id = p_company and deleted_at is null for update;
  if not found then raise exception 'company not found' using errcode = 'P0002'; end if;

  v_name := case when p_patch ? 'name' then trim(coalesce(p_patch->>'name', '')) else v_old.name end;
  v_legal := case when p_patch ? 'legal_name' then nullif(trim(coalesce(p_patch->>'legal_name', '')), '') else v_old.legal_name end;
  v_tax := case when p_patch ? 'tax_number' then nullif(trim(coalesce(p_patch->>'tax_number', '')), '') else v_old.tax_number end;
  v_cname := case when p_patch ? 'contact_name' then nullif(trim(coalesce(p_patch->>'contact_name', '')), '') else v_old.contact_name end;
  v_cemail := case when p_patch ? 'contact_email' then nullif(lower(trim(coalesce(p_patch->>'contact_email', ''))), '') else v_old.contact_email::text end;
  v_phone := case when p_patch ? 'contact_phone' then nullif(trim(coalesce(p_patch->>'contact_phone', '')), '') else v_old.contact_phone end;
  v_country := case when p_patch ? 'country' then nullif(upper(trim(coalesce(p_patch->>'country', ''))), '') else v_old.country::text end;

  if length(v_name) not between 1 and 120 then raise exception 'invalid company name' using errcode = '22023'; end if;
  if v_legal is not null and length(v_legal) > 200 then raise exception 'invalid legal name' using errcode = '22023'; end if;
  if v_tax is not null and length(v_tax) > 50 then raise exception 'invalid tax number' using errcode = '22023'; end if;
  if v_cname is not null and length(v_cname) > 120 then raise exception 'invalid contact name' using errcode = '22023'; end if;
  if v_cemail is not null and (v_cemail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_cemail) > 254) then
    raise exception 'invalid contact email' using errcode = '22023';
  end if;
  if v_country is not null and v_country !~ '^[A-Z]{2}$' then raise exception 'invalid country' using errcode = '22023'; end if;

  update public.companies
     set name = v_name, legal_name = v_legal, tax_number = v_tax, contact_name = v_cname,
         contact_email = v_cemail::extensions.citext, contact_phone = v_phone, country = v_country
   where id = p_company
   returning * into v_new;       -- phone is normalised to E.164 by the 0009 trigger, so compare AFTER the update

  v_before := jsonb_build_object('name', v_old.name, 'legal_name', v_old.legal_name, 'tax_number', v_old.tax_number,
    'contact_name', v_old.contact_name, 'contact_email', v_old.contact_email::text, 'contact_phone', v_old.contact_phone,
    'country', v_old.country::text);
  v_after := jsonb_build_object('name', v_new.name, 'legal_name', v_new.legal_name, 'tax_number', v_new.tax_number,
    'contact_name', v_new.contact_name, 'contact_email', v_new.contact_email::text, 'contact_phone', v_new.contact_phone,
    'country', v_new.country::text);

  -- audit only what actually changed; a no-op patch writes nothing
  select coalesce(jsonb_object_agg(k, v_before->k), '{}'::jsonb), coalesce(jsonb_object_agg(k, v_after->k), '{}'::jsonb)
    into v_b, v_a
    from jsonb_object_keys(v_before) k where (v_before->k) is distinct from (v_after->k);
  if v_b <> '{}'::jsonb then
    perform app_private.audit_platform(p_company, 'company.updated', 'company', p_company, v_b, v_a);
  end if;

  return jsonb_build_object('id', v_new.id, 'name', v_new.name, 'status', v_new.status, 'changed', v_b <> '{}'::jsonb);
end $$;

-- ======================= admin_set_company_status =======================
create or replace function public.admin_set_company_status(p_company uuid, p_status text, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.companies%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_action text;
  v_ok boolean;
begin
  perform app_private.assert_platform(array['super_admin']);
  if p_status is null or p_status not in ('trial','active','suspended','cancelled') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  if v_reason is not null and length(v_reason) > 500 then raise exception 'reason required' using errcode = '22023'; end if;

  select * into v_old from public.companies where id = p_company and deleted_at is null for update;
  if not found then raise exception 'company not found' using errcode = 'P0002'; end if;

  v_ok := case v_old.status
    when 'trial'     then p_status in ('active','suspended','cancelled')
    when 'active'    then p_status in ('suspended','cancelled')
    when 'suspended' then p_status in ('trial','active','cancelled')
    else false end;          -- cancelled is terminal
  if not v_ok then raise exception 'invalid company status transition' using errcode = '23514'; end if;

  if p_status in ('suspended','cancelled') and (v_reason is null or length(v_reason) < 3) then
    raise exception 'reason required' using errcode = '22023';
  end if;

  update public.companies
     set status = p_status,
         suspended_at = case when p_status = 'suspended' then now() else null end,
         suspension_reason = case when p_status = 'suspended' then v_reason else null end
   where id = p_company;

  v_action := case
    when p_status = 'suspended' then 'company.suspended'
    when p_status = 'cancelled' then 'company.cancelled'
    when v_old.status = 'suspended' then 'company.reactivated'
    else 'company.status_changed' end;

  perform app_private.audit_platform(p_company, v_action, 'company', p_company,
    jsonb_build_object('status', v_old.status, 'suspended_at', v_old.suspended_at, 'suspension_reason', v_old.suspension_reason),
    jsonb_build_object('status', p_status, 'reason', v_reason));

  return jsonb_build_object('id', p_company, 'status', p_status, 'previous_status', v_old.status);
end $$;

-- ======================= admin_add_note =======================
create or replace function public.admin_add_note(p_company uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_body text := trim(coalesce(p_body, ''));
  v_id uuid;
begin
  perform app_private.assert_platform(array['super_admin','support']);
  if length(v_body) not between 1 and 2000 then raise exception 'invalid note' using errcode = '22023'; end if;
  if not exists (select 1 from public.companies where id = p_company and deleted_at is null) then
    raise exception 'company not found' using errcode = 'P0002';
  end if;
  insert into public.company_notes (company_id, author_id, body) values (p_company, auth.uid(), v_body) returning id into v_id;
  -- the note text stays in company_notes only; the audit row records that a note was added
  perform app_private.audit_platform(p_company, 'company.note_added', 'company_note', v_id, null,
                                     jsonb_build_object('length', length(v_body)));
  return jsonb_build_object('id', v_id);
end $$;

-- ======================= grants =======================
revoke all on function public.admin_list_companies(text, text, text, text, integer, integer) from public, anon;
revoke all on function public.admin_company_detail(uuid) from public, anon;
revoke all on function public.admin_create_company(text, text, text, text, text, text, text, text, integer, text) from public, anon;
revoke all on function public.admin_update_company(uuid, jsonb) from public, anon;
revoke all on function public.admin_set_company_status(uuid, text, text) from public, anon;
revoke all on function public.admin_add_note(uuid, text) from public, anon;
grant execute on function public.admin_list_companies(text, text, text, text, integer, integer) to authenticated;
grant execute on function public.admin_company_detail(uuid) to authenticated;
grant execute on function public.admin_create_company(text, text, text, text, text, text, text, text, integer, text) to authenticated;
grant execute on function public.admin_update_company(uuid, jsonb) to authenticated;
grant execute on function public.admin_set_company_status(uuid, text, text) to authenticated;
grant execute on function public.admin_add_note(uuid, text) to authenticated;
