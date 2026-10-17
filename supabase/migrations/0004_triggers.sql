-- 0004: triggers. Each one is documented because trigger logic is hidden logic (risk R7).
set search_path = public, extensions;

-- ---------- updated_at on every table that has the column ----------
do $$
declare t text;
begin
  for t in select table_name from information_schema.columns
           where table_schema='public' and column_name='updated_at'
  loop
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function app_private.set_updated_at()', t);
  end loop;
end $$;

-- ---------- company_id immutable on every tenant table ----------
do $$
declare t text;
begin
  for t in select c.table_name from information_schema.columns c
           join information_schema.tables tb on tb.table_schema=c.table_schema and tb.table_name=c.table_name
           where c.table_schema='public' and c.column_name='company_id' and tb.table_type='BASE TABLE'
             and c.table_name not in ('company_settings','website_settings')  -- PK, covered by PK update below
  loop
    execute format('create trigger forbid_company_id_change before update on public.%I
                    for each row execute function app_private.forbid_company_id_change()', t);
  end loop;
end $$;
-- 1:1 tables use company_id as PK: same rule.
create trigger forbid_company_id_change before update on company_settings
  for each row execute function app_private.forbid_company_id_change();
create trigger forbid_company_id_change before update on website_settings
  for each row execute function app_private.forbid_company_id_change();

-- ---------- audit_logs append-only (blocks even the table owner) ----------
create trigger audit_logs_no_update before update or delete on audit_logs
  for each row execute function app_private.forbid_modify();
create trigger audit_logs_no_truncate before truncate on audit_logs
  for each statement execute function app_private.forbid_modify();

-- ---------- profiles <-> auth.users ----------
create or replace function app_private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email,
          coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app_private.handle_new_user();

create or replace function app_private.sync_profile_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end $$;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function app_private.sync_profile_email();

-- ---------- company bootstrap: settings row ----------
create or replace function app_private.company_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.company_settings (company_id) values (new.id);
  return new;
end $$;
create trigger company_after_insert after insert on companies
  for each row execute function app_private.company_after_insert();

-- ---------- every company keeps >= 1 active owner ----------
create or replace function app_private.keep_one_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_leaving boolean;
begin
  select id into v_owner from public.roles where key = 'owner';
  if old.role_id <> v_owner or old.status <> 'active' then return coalesce(new, old); end if;
  v_leaving := tg_op = 'DELETE' or new.role_id <> v_owner or new.status <> 'active';
  if v_leaving and not exists (
    select 1 from public.company_users cu
    where cu.company_id = old.company_id and cu.id <> old.id
      and cu.role_id = v_owner and cu.status = 'active'
  ) then
    raise exception 'company must keep at least one active owner' using errcode = '23514';
  end if;
  return coalesce(new, old);
end $$;
create trigger keep_one_owner before update or delete on company_users
  for each row execute function app_private.keep_one_owner();

-- ---------- plan_entitlements value type must match definition ----------
create or replace function app_private.check_entitlement_type() returns trigger
language plpgsql set search_path = '' as $$
declare v_type text;
begin
  select value_type into v_type from public.entitlement_definitions where key = new.key;
  if v_type = 'boolean' and (new.int_value is not null or new.bool_value is null) then
    raise exception 'entitlement % is boolean', new.key using errcode = '23514';
  elsif v_type = 'integer' and new.bool_value is not null then
    raise exception 'entitlement % is integer', new.key using errcode = '23514';
  end if;
  return new;
end $$;
create trigger check_entitlement_type before insert or update on plan_entitlements
  for each row execute function app_private.check_entitlement_type();

-- ---------- trips: buffer snapshot, blocked_until, bus/driver rules, created_by ----------
-- blocked_until is ALWAYS recomputed here, so a client can never set it (R1).
create or replace function app_private.trips_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_buf smallint; v_status text; v_cap smallint;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
    if new.buffer_minutes is null then
      select trip_buffer_minutes into v_buf from public.company_settings where company_id = new.company_id;
      new.buffer_minutes := coalesce(v_buf, 30);
    end if;
  end if;
  new.blocked_until := new.arrival_at + make_interval(mins => new.buffer_minutes);

  if new.bus_id is not null and (tg_op = 'INSERT' or new.bus_id is distinct from old.bus_id
                                 or new.capacity is distinct from old.capacity) then
    select status, capacity into v_status, v_cap from public.buses
      where id = new.bus_id and company_id = new.company_id;
    if tg_op = 'INSERT' or new.bus_id is distinct from old.bus_id then
      if v_status is distinct from 'active' then
        raise exception 'bus is not active' using errcode = '23514';
      end if;
    end if;
    if new.capacity > v_cap then
      raise exception 'trip capacity (%) exceeds bus capacity (%)', new.capacity, v_cap using errcode = '23514';
    end if;
  end if;

  if new.driver_id is not null and (tg_op = 'INSERT' or new.driver_id is distinct from old.driver_id) then
    select status into v_status from public.drivers
      where id = new.driver_id and company_id = new.company_id;
    if v_status is distinct from 'active' then
      raise exception 'driver is not active' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger trips_before_write before insert or update on trips
  for each row execute function app_private.trips_before_write();

-- ---------- bookings: stops must belong to the trip's route ----------
create or replace function app_private.bookings_check_stops() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_route uuid;
begin
  select route_id into v_route from public.trips where id = new.trip_id and company_id = new.company_id;
  if new.pickup_stop_id is not null and not exists (
    select 1 from public.route_stops s where s.id = new.pickup_stop_id and s.company_id = new.company_id
      and s.route_id = v_route and s.stop_type in ('pickup','both')) then
    raise exception 'pickup stop does not belong to the trip route' using errcode = '23514';
  end if;
  if new.dropoff_stop_id is not null and not exists (
    select 1 from public.route_stops s where s.id = new.dropoff_stop_id and s.company_id = new.company_id
      and s.route_id = v_route and s.stop_type in ('dropoff','both')) then
    raise exception 'dropoff stop does not belong to the trip route' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger bookings_check_stops before insert or update of trip_id, pickup_stop_id, dropoff_stop_id on bookings
  for each row execute function app_private.bookings_check_stops();

-- ---------- plan limits (entitlements) ----------
-- Integer limit lookup. Raises if no live subscription (secure default).
-- Missing key for the plan = not granted = 0. NULL int_value = unlimited -> returns NULL.
create or replace function app_private.entitlement_limit(p_company uuid, p_key text) returns integer
language plpgsql stable security definer set search_path = '' as $$
declare v_plan uuid; v_val integer; v_found boolean;
begin
  select s.plan_id into v_plan from public.subscriptions s
    where s.company_id = p_company and s.status in ('trialing','active','past_due');
  if v_plan is null then
    raise exception 'no active subscription' using errcode = '42501';
  end if;
  select true, pe.int_value into v_found, v_val from public.plan_entitlements pe
    where pe.plan_id = v_plan and pe.key = p_key;
  if v_found is null then return 0; end if;
  return v_val;
end $$;

-- BEFORE INSERT limit guard. Args: entitlement key, extra WHERE (trusted literal from this file).
create or replace function app_private.enforce_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_limit integer; v_count bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.company_id::text || tg_argv[0], 0));  -- serialize racing inserts
  v_limit := app_private.entitlement_limit(new.company_id, tg_argv[0]);
  if v_limit is null then return new; end if;
  execute format('select count(*) from public.%I where company_id = $1 and %s', tg_table_name, tg_argv[1])
    into v_count using new.company_id;
  if v_count >= v_limit then
    raise exception 'plan limit reached: % (%)', tg_argv[0], v_limit using errcode = '53400';
  end if;
  return new;
end $$;
create trigger enforce_limit before insert on buses   for each row execute function app_private.enforce_limit('max_buses', 'true');
create trigger enforce_limit before insert on drivers for each row execute function app_private.enforce_limit('max_drivers', 'true');
create trigger enforce_limit before insert on routes  for each row execute function app_private.enforce_limit('max_routes', 'deleted_at is null');
create trigger enforce_limit before insert on company_users for each row execute function app_private.enforce_limit('max_users', 'true');

-- ---------- audit writer (called only from SECURITY DEFINER code; not granted to clients) ----------
create or replace function app_private.write_audit(
  p_actor_type text, p_company uuid, p_action text, p_entity_type text,
  p_entity_id uuid default null, p_metadata jsonb default '{}'::jsonb
) returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs (actor_id, actor_type, company_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_actor_type, p_company, p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
$$;
revoke all on function app_private.write_audit(text, uuid, text, text, uuid, jsonb) from public;
