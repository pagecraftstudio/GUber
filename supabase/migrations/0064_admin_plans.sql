-- 0064: P8 - the super admin creates and edits the PLATFORM plans companies buy from MALAKY (decision D1).
-- Route plans that students buy from a company are untouched.
--
-- FINDING FIXED HERE: until now `subscriptions` held only plan_id, so a price edit on `plans` would have changed what every existing
-- subscriber is quoted. 1) subscriptions get a PRICE SNAPSHOT (price_monthly, price_yearly, currency), filled by a trigger on insert
-- (so admin_create_company and admin_assign_subscription need no change) and frozen afterwards. 2) price edits therefore apply to NEW
-- subscriptions only.
--
-- ENFORCEMENT FACT (0015 entitlement_limit): a MISSING plan_entitlements row means limit 0 / feature off. So a new plan and a new
-- entitlement definition are SEEDED with explicit restrictive values (0 / false) for every key; nothing is ever "forgotten open".
--
-- FUNCTIONS                                  WHO                          AUDIT ACTION
--   admin_plan_overview()                    super_admin, support, billing  (read)
--   admin_create_plan(...)                   super_admin                  plan.created
--   admin_update_plan(uuid, jsonb)           super_admin                  plan.updated
--   admin_set_plan_active(uuid,bool,text)    super_admin                  plan.archived | plan.restored
--   admin_set_plan_entitlement(...)          super_admin                  plan.entitlement_set
--   admin_create_entitlement_definition(..)  super_admin                  entitlement.defined
-- RULES: plan code is immutable; a plan is never deleted (archive = is_active false, is_public false; live subscribers keep it);
-- currency cannot change once any subscription used the plan; limit changes are NOT retroactive for rows that already exist (0004/0015)
-- but a raised limit applies to the very next insert. A new definition only creates the key + safe values: ENFORCING it needs its own migration.
-- ROLLBACK: drop the six functions, the two triggers + app_private functions, and the three subscriptions columns.
-- RUNNER NOTE: apply before deploying code that calls these RPCs.
set search_path = public, extensions;

-- ======================= 1. PRICE SNAPSHOT =======================
alter table public.subscriptions
  add column price_monthly numeric(12,2) check (price_monthly is null or price_monthly >= 0),
  add column price_yearly  numeric(12,2) check (price_yearly is null or price_yearly >= 0),
  add column currency char(3);

create or replace function app_private.subscription_price_snapshot() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v public.plans%rowtype;
begin
  if new.price_monthly is null or new.currency is null then
    select * into v from public.plans where id = new.plan_id;
    new.price_monthly := v.price_monthly; new.price_yearly := v.price_yearly; new.currency := v.currency;
  end if;
  return new;
end $$;
revoke all on function app_private.subscription_price_snapshot() from public, anon, authenticated;
create trigger subscriptions_price_snapshot before insert on public.subscriptions
  for each row execute function app_private.subscription_price_snapshot();

create or replace function app_private.subscription_price_frozen() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.price_monthly is distinct from old.price_monthly or new.price_yearly is distinct from old.price_yearly or new.currency is distinct from old.currency then
    raise exception 'subscription price is frozen' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function app_private.subscription_price_frozen() from public, anon, authenticated;
create trigger subscriptions_price_frozen before update on public.subscriptions
  for each row execute function app_private.subscription_price_frozen();

update public.subscriptions s set price_monthly = p.price_monthly, price_yearly = p.price_yearly, currency = p.currency
  from public.plans p where p.id = s.plan_id and s.price_monthly is null;
alter table public.subscriptions alter column price_monthly set not null, alter column currency set not null;

-- ======================= 2. READ =======================
create or replace function public.admin_plan_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.assert_platform(array['super_admin','support','billing']);
  return jsonb_build_object(
    'plans', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'code', p.code, 'name', p.name, 'description', p.description,
        'price_monthly', p.price_monthly, 'price_yearly', p.price_yearly, 'currency', p.currency,
        'trial_days', p.trial_days, 'is_public', p.is_public, 'is_active', p.is_active, 'sort_order', p.sort_order,
        'live_subscribers', (select count(*) from public.subscriptions s where s.plan_id = p.id and s.status in ('trialing','active','past_due') and s.current_period_end > now()),
        'total_subscriptions', (select count(*) from public.subscriptions s where s.plan_id = p.id),
        'entitlements', coalesce((select jsonb_agg(jsonb_build_object('key', e.key, 'int_value', e.int_value, 'bool_value', e.bool_value) order by e.key)
                                    from public.plan_entitlements e where e.plan_id = p.id), '[]'::jsonb))
        order by p.sort_order, p.code) from public.plans p), '[]'::jsonb),
    'definitions', coalesce((select jsonb_agg(jsonb_build_object('key', d.key, 'value_type', d.value_type, 'description', d.description) order by d.key)
                               from public.entitlement_definitions d), '[]'::jsonb));
end $$;

-- ======================= 3. CREATE =======================
create or replace function public.admin_create_plan(
  p_code text, p_name text, p_description text, p_price_monthly numeric, p_price_yearly numeric,
  p_currency text, p_trial_days integer, p_is_public boolean, p_sort_order integer
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_name text := btrim(coalesce(p_name, ''));
begin
  perform app_private.assert_platform(array['super_admin']);
  if p_code is null or p_code !~ '^[a-z][a-z0-9_]{1,31}$' then raise exception 'invalid plan code' using errcode = '22023'; end if;
  if length(v_name) not between 1 and 80 then raise exception 'invalid plan name' using errcode = '22023'; end if;
  if p_description is not null and length(p_description) > 500 then raise exception 'description too long' using errcode = '22023'; end if;
  if p_price_monthly is null or p_price_monthly < 0 or p_price_monthly > 10000000 then raise exception 'invalid monthly price' using errcode = '22023'; end if;
  if p_price_yearly is not null and (p_price_yearly < 0 or p_price_yearly > 100000000) then raise exception 'invalid yearly price' using errcode = '22023'; end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' then raise exception 'invalid currency' using errcode = '22023'; end if;
  if p_trial_days is null or p_trial_days not between 0 and 365 then raise exception 'invalid trial days' using errcode = '22023'; end if;
  if p_sort_order is null or p_sort_order not between 0 and 1000 then raise exception 'invalid sort order' using errcode = '22023'; end if;

  begin
    insert into public.plans (code, name, description, price_monthly, price_yearly, currency, trial_days, is_public, is_active, sort_order)
    values (p_code, v_name, nullif(btrim(p_description), ''), p_price_monthly, p_price_yearly, p_currency, p_trial_days, coalesce(p_is_public, false), true, p_sort_order)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'plan code taken' using errcode = '23505';
  end;

  -- explicit restrictive value for EVERY key: a missing row would mean limit 0 anyway, but an explicit row is visible and editable
  insert into public.plan_entitlements (plan_id, key, int_value, bool_value)
  select v_id, d.key, case when d.value_type = 'integer' then 0 end, case when d.value_type = 'boolean' then false end
    from public.entitlement_definitions d;

  perform app_private.audit_platform(null, 'plan.created', 'plan', v_id, null,
    jsonb_build_object('code', p_code, 'name', v_name, 'price_monthly', p_price_monthly, 'price_yearly', p_price_yearly,
                       'currency', p_currency, 'trial_days', p_trial_days, 'is_public', coalesce(p_is_public, false)));
  return jsonb_build_object('plan_id', v_id);
end $$;

-- ======================= 4. UPDATE =======================
-- p_patch keys (all optional): name, description, price_monthly, price_yearly (null clears), currency, trial_days, is_public, sort_order.
-- Anything else, including `code`, is refused.
create or replace function public.admin_update_plan(p_plan uuid, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.plans%rowtype; v_new public.plans%rowtype; k text;
  v_allowed text[] := array['name','description','price_monthly','price_yearly','currency','trial_days','is_public','sort_order'];
begin
  perform app_private.assert_platform(array['super_admin']);
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then raise exception 'empty patch' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(p_patch) loop
    if not (k = any (v_allowed)) then raise exception 'field not editable: %', k using errcode = '22023'; end if;
  end loop;

  select * into v_old from public.plans where id = p_plan for update;
  if not found then raise exception 'plan not found' using errcode = 'P0002'; end if;
  v_new := v_old;

  begin
    if p_patch ? 'name' then v_new.name := btrim(p_patch->>'name'); end if;
    if p_patch ? 'description' then v_new.description := nullif(btrim(p_patch->>'description'), ''); end if;
    if p_patch ? 'price_monthly' then v_new.price_monthly := (p_patch->>'price_monthly')::numeric; end if;
    if p_patch ? 'price_yearly' then v_new.price_yearly := (p_patch->>'price_yearly')::numeric; end if;
    if p_patch ? 'currency' then v_new.currency := p_patch->>'currency'; end if;
    if p_patch ? 'trial_days' then v_new.trial_days := (p_patch->>'trial_days')::integer; end if;
    if p_patch ? 'is_public' then v_new.is_public := (p_patch->>'is_public')::boolean; end if;
    if p_patch ? 'sort_order' then v_new.sort_order := (p_patch->>'sort_order')::integer; end if;
  exception when others then
    raise exception 'invalid value' using errcode = '22023';
  end;

  if v_new.name is null or length(v_new.name) not between 1 and 80 then raise exception 'invalid plan name' using errcode = '22023'; end if;
  if v_new.description is not null and length(v_new.description) > 500 then raise exception 'description too long' using errcode = '22023'; end if;
  if v_new.price_monthly is null or v_new.price_monthly < 0 or v_new.price_monthly > 10000000 then raise exception 'invalid monthly price' using errcode = '22023'; end if;
  if v_new.price_yearly is not null and (v_new.price_yearly < 0 or v_new.price_yearly > 100000000) then raise exception 'invalid yearly price' using errcode = '22023'; end if;
  if v_new.currency is null or v_new.currency !~ '^[A-Z]{3}$' then raise exception 'invalid currency' using errcode = '22023'; end if;
  if v_new.trial_days is null or v_new.trial_days not between 0 and 365 then raise exception 'invalid trial days' using errcode = '22023'; end if;
  if v_new.sort_order is null or v_new.sort_order not between 0 and 1000 then raise exception 'invalid sort order' using errcode = '22023'; end if;
  if v_new.is_public is null then raise exception 'invalid value' using errcode = '22023'; end if;
  if v_new.is_public and not v_new.is_active then raise exception 'archived plan cannot be public' using errcode = '23514'; end if;
  if v_new.currency <> v_old.currency and exists (select 1 from public.subscriptions s where s.plan_id = p_plan) then
    raise exception 'currency fixed once assigned' using errcode = '23514';
  end if;

  update public.plans set name = v_new.name, description = v_new.description, price_monthly = v_new.price_monthly,
         price_yearly = v_new.price_yearly, currency = v_new.currency, trial_days = v_new.trial_days,
         is_public = v_new.is_public, sort_order = v_new.sort_order, updated_at = now()
   where id = p_plan;

  perform app_private.audit_platform(null, 'plan.updated', 'plan', p_plan,
    (select jsonb_object_agg(e.key, e.value) from jsonb_each(to_jsonb(v_old)) e where p_patch ? e.key),
    (select jsonb_object_agg(e.key, e.value) from jsonb_each(to_jsonb(v_new)) e where p_patch ? e.key));
  return jsonb_build_object('plan_id', p_plan);
end $$;

-- ======================= 5. ARCHIVE / RESTORE =======================
create or replace function public.admin_set_plan_active(p_plan uuid, p_active boolean, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_old public.plans%rowtype; v_live bigint;
begin
  perform app_private.assert_platform(array['super_admin']);
  if p_active is null then raise exception 'invalid value' using errcode = '22023'; end if;
  select * into v_old from public.plans where id = p_plan for update;
  if not found then raise exception 'plan not found' using errcode = 'P0002'; end if;
  if v_old.is_active = p_active then return jsonb_build_object('plan_id', p_plan, 'changed', false); end if;
  if not p_active and (p_reason is null or length(btrim(p_reason)) not between 3 and 500) then raise exception 'reason required' using errcode = '22023'; end if;

  select count(*) into v_live from public.subscriptions s where s.plan_id = p_plan and s.status in ('trialing','active','past_due') and s.current_period_end > now();
  update public.plans set is_active = p_active, is_public = case when p_active then is_public else false end, updated_at = now() where id = p_plan;
  perform app_private.audit_platform(null, case when p_active then 'plan.restored' else 'plan.archived' end, 'plan', p_plan,
    jsonb_build_object('is_active', v_old.is_active, 'is_public', v_old.is_public),
    jsonb_build_object('is_active', p_active, 'live_subscribers', v_live, 'reason', btrim(p_reason)));
  return jsonb_build_object('plan_id', p_plan, 'changed', true, 'live_subscribers', v_live);
end $$;

-- ======================= 6. ENTITLEMENT VALUE =======================
-- integer key: exactly one of p_int (0..2147483647) or p_unlimited = true.  boolean key: p_bool only.
create or replace function public.admin_set_plan_entitlement(p_plan uuid, p_key text, p_int integer default null, p_bool boolean default null, p_unlimited boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_def public.entitlement_definitions%rowtype; v_old public.plan_entitlements%rowtype; v_live bigint;
begin
  perform app_private.assert_platform(array['super_admin']);
  perform 1 from public.plans where id = p_plan for update;
  if not found then raise exception 'plan not found' using errcode = 'P0002'; end if;
  select * into v_def from public.entitlement_definitions where key = p_key;
  if not found then raise exception 'unknown entitlement' using errcode = '22023'; end if;

  if v_def.value_type = 'integer' then
    if p_bool is not null or (coalesce(p_unlimited, false) and p_int is not null) or (not coalesce(p_unlimited, false) and (p_int is null or p_int < 0)) then
      raise exception 'invalid value for integer entitlement' using errcode = '22023';
    end if;
  else
    if p_bool is null or p_int is not null or coalesce(p_unlimited, false) then
      raise exception 'invalid value for boolean entitlement' using errcode = '22023';
    end if;
  end if;

  select * into v_old from public.plan_entitlements where plan_id = p_plan and key = p_key;
  insert into public.plan_entitlements (plan_id, key, int_value, bool_value)
  values (p_plan, p_key, case when v_def.value_type = 'integer' and not coalesce(p_unlimited, false) then p_int end, case when v_def.value_type = 'boolean' then p_bool end)
  on conflict (plan_id, key) do update set int_value = excluded.int_value, bool_value = excluded.bool_value;

  select count(*) into v_live from public.subscriptions s where s.plan_id = p_plan and s.status in ('trialing','active','past_due') and s.current_period_end > now();
  perform app_private.audit_platform(null, 'plan.entitlement_set', 'plan', p_plan,
    case when v_old.plan_id is null then null else jsonb_build_object('key', p_key, 'int_value', v_old.int_value, 'bool_value', v_old.bool_value) end,
    jsonb_build_object('key', p_key, 'int_value', case when v_def.value_type = 'integer' and not coalesce(p_unlimited, false) then p_int end,
                       'bool_value', case when v_def.value_type = 'boolean' then p_bool end, 'unlimited', coalesce(p_unlimited, false), 'live_subscribers', v_live));
  return jsonb_build_object('plan_id', p_plan, 'key', p_key, 'live_subscribers', v_live);
end $$;

-- ======================= 7. NEW ENTITLEMENT KEY =======================
create or replace function public.admin_create_entitlement_definition(p_key text, p_value_type text, p_description text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.assert_platform(array['super_admin']);
  if p_key is null or p_key !~ '^(max|feature)_[a-z][a-z0-9_]{1,47}$' then raise exception 'invalid entitlement key' using errcode = '22023'; end if;
  if p_value_type is null or p_value_type not in ('integer','boolean') then raise exception 'invalid value type' using errcode = '22023'; end if;
  if p_description is not null and length(p_description) > 200 then raise exception 'description too long' using errcode = '22023'; end if;
  begin
    insert into public.entitlement_definitions (key, value_type, description) values (p_key, p_value_type, nullif(btrim(p_description), ''));
  exception when unique_violation then
    raise exception 'entitlement key taken' using errcode = '23505';
  end;
  insert into public.plan_entitlements (plan_id, key, int_value, bool_value)
  select p.id, p_key, case when p_value_type = 'integer' then 0 end, case when p_value_type = 'boolean' then false end from public.plans p;
  perform app_private.audit_platform(null, 'entitlement.defined', 'entitlement_definition', null, null,
    jsonb_build_object('key', p_key, 'value_type', p_value_type));
  return jsonb_build_object('key', p_key);
end $$;

-- ======================= 8. GRANTS =======================
revoke all on function public.admin_plan_overview() from public, anon;
revoke all on function public.admin_create_plan(text, text, text, numeric, numeric, text, integer, boolean, integer) from public, anon;
revoke all on function public.admin_update_plan(uuid, jsonb) from public, anon;
revoke all on function public.admin_set_plan_active(uuid, boolean, text) from public, anon;
revoke all on function public.admin_set_plan_entitlement(uuid, text, integer, boolean, boolean) from public, anon;
revoke all on function public.admin_create_entitlement_definition(text, text, text) from public, anon;
grant execute on function public.admin_plan_overview() to authenticated;
grant execute on function public.admin_create_plan(text, text, text, numeric, numeric, text, integer, boolean, integer) to authenticated;
grant execute on function public.admin_update_plan(uuid, jsonb) to authenticated;
grant execute on function public.admin_set_plan_active(uuid, boolean, text) to authenticated;
grant execute on function public.admin_set_plan_entitlement(uuid, text, integer, boolean, boolean) to authenticated;
grant execute on function public.admin_create_entitlement_definition(text, text, text) to authenticated;
