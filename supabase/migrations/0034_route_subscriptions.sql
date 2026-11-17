-- 0034: route subscriptions PHASE A (database only: schema, RLS, RPCs). No UI.
--
-- WHAT
--   1. profiles.masar_id: platform-issued member ID, assigned at signup (default), immutable, random (not guessable).
--   2. route_plans: a company's subscription plan for ONE route (its pair is the other direction). Price + validity
--      (N months from approval, OR a fixed date range). Plans are written only through RPCs.
--   3. route_subscriptions: a member's request for a plan. pending -> active (approved + paid, dates set) | rejected | cancelled;
--      'expired' is set lazily. One open (pending/active) row per member per plan.
--   4. bookings.subscription_id: marks a booking made with a subscription (paid, price 0). Subscribers still book a seat.
--   5. create_my_subscriber_booking(): ONE seat on the go trip, optionally ONE seat on a return trip of the paired route,
--      same company-local day, booked together or not at all. Legs are linked with the existing round_trip_group_id, so
--      cancelling one leg cancels the other (cancel_my_booking from 0030, unchanged).
--   6. route_subscription_scans: one row per (subscription, company-local day, direction). The unique key IS the
--      "one go + one return per day" rule. Append-only.
--   7. Entitlement max_route_plans (starter 3, professional 20, enterprise unlimited), enforced by trigger.
-- NAMING: public.subscriptions is the company's PLATFORM billing subscription, so riders use route_plans/route_subscriptions.
-- SECURITY: company is always derived from the plan / trip / subscription row, never from the client. Members see only their own
--   rows; staff see their own company (bookings.read); nobody writes tables directly. Staff cannot search members: they see a
--   member only after that member requested one of THEIR plans (name, phone and MASAR ID are snapshotted on the request).
-- DECISIONS: plan price is paid once, at approval (manual, as bookings.amount_paid is today); subscriber bookings are
--   price 0 / paid. Approval = payment confirmed. No payment gateway yet.
-- SCAN NOTE: scan is by MASAR ID + trip (staff with bookings.write, or the assigned driver). A bare MASAR ID is replayable, so the
--   rotating QR token is Phase D; it will call the same rules.
-- NOT IN PHASE A: dashboard / member UI, my_plan_usage entry for plans, scan token, ticket boarding on scan, revoking an active
--   subscription by staff, adding a return seat to an existing outbound booking.
-- ROLLBACK: drop functions create_route_plan, update_route_plan, archive_route_plan, public_route_plans, request_route_subscription,
--   decide_route_subscription, cancel_my_route_subscription, subscriber_return_options, create_my_subscriber_booking,
--   scan_route_subscription, app_private.new_masar_id, app_private.forbid_masar_id_change; alter table bookings drop column
--   subscription_id; drop tables route_subscription_scans, route_subscriptions, route_plans; delete entitlement max_route_plans
--   (plan_entitlements then entitlement_definitions); alter table profiles drop column masar_id.
-- RUNNER NOTE: apply only with scripts/db/apply-migrations.sh BEFORE deploying code that reads these objects.
set search_path = public, extensions;

-- ======================= 1. MASAR ID =======================
-- 8 symbols from a 32-symbol alphabet (no 0/1/I/O): 40 random bits from the server CSPRNG, no modulo bias (256 % 32 = 0).
-- Bytes 0-5 of one uuid and 0-1 of another are used: byte 6 and 8 of a v4 uuid are not fully random.
create function app_private.new_masar_id() returns text
language plpgsql volatile set search_path = '' as $$
declare
  v_alpha constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_bytes bytea; v_id text; i int;
begin
  loop
    v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex') || decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    v_id := 'MSR-';
    for i in 0..7 loop
      v_id := v_id || substr(v_alpha, (get_byte(v_bytes, case when i < 6 then i else i + 10 end) % 32) + 1, 1);
      if i = 3 then v_id := v_id || '-'; end if;
    end loop;
    exit when not exists (select 1 from public.profiles p where p.masar_id = v_id);
  end loop;
  return v_id;
end $$;
revoke all on function app_private.new_masar_id() from public, anon, authenticated;

alter table profiles add column masar_id text;
update profiles set masar_id = app_private.new_masar_id() where masar_id is null;
alter table profiles
  alter column masar_id set default app_private.new_masar_id(),
  alter column masar_id set not null,
  add constraint profiles_masar_id_format check (masar_id ~ '^MSR-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$'),
  add constraint profiles_masar_id_uq unique (masar_id);

create function app_private.forbid_masar_id_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.masar_id is distinct from old.masar_id then raise exception 'masar id is immutable' using errcode = '42501'; end if;
  return new;
end $$;
create trigger forbid_masar_id_change before update of masar_id on profiles for each row execute function app_private.forbid_masar_id_change();

-- ======================= 2. ENTITLEMENT =======================
insert into entitlement_definitions (key, value_type, description) values ('max_route_plans', 'integer', 'Route subscription plans');
insert into plan_entitlements (plan_id, key, int_value, bool_value)
select p.id, 'max_route_plans', v.n, null from plans p
join (values ('starter', 3), ('professional', 20), ('enterprise', null::int)) as v(code, n) on v.code = p.code;

-- ======================= 3. TABLES =======================
create table route_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  route_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 120),
  price numeric(12,2) not null check (price >= 0),
  validity_type text not null check (validity_type in ('duration', 'range')),
  duration_months smallint check (duration_months between 1 and 24),
  starts_on date,
  ends_on date,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  constraint route_plans_route_fk foreign key (company_id, route_id) references routes(company_id, id) on delete restrict,
  constraint route_plans_validity_shape check (
    (validity_type = 'duration' and duration_months is not null and starts_on is null and ends_on is null)
    or (validity_type = 'range' and duration_months is null and starts_on is not null and ends_on is not null and ends_on >= starts_on))
);
create index route_plans_route_idx on route_plans(company_id, route_id) where deleted_at is null;

create table route_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  plan_id uuid not null,
  user_id uuid not null references profiles(id) on delete restrict,
  masar_id text not null,
  member_name text not null,
  member_phone text not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'rejected', 'cancelled', 'expired')),
  price numeric(12,2) not null check (price >= 0),
  currency char(3) not null,
  valid_from date,
  valid_to date,
  paid_at timestamptz,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references profiles(id) on delete set null,
  decision_note text check (decision_note is null or length(decision_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  constraint route_subscriptions_plan_fk foreign key (company_id, plan_id) references route_plans(company_id, id) on delete restrict,
  constraint route_subscriptions_dates check (valid_to is null or valid_from is null or valid_to >= valid_from),
  constraint route_subscriptions_active_complete check (status <> 'active' or (valid_from is not null and valid_to is not null and paid_at is not null))
);
create unique index route_subscriptions_one_open_uq on route_subscriptions(plan_id, user_id) where status in ('pending', 'active');
create index route_subscriptions_company_idx on route_subscriptions(company_id, status, requested_at desc);
create index route_subscriptions_user_idx on route_subscriptions(user_id);

alter table bookings add column subscription_id uuid;
alter table bookings add constraint bookings_subscription_fk foreign key (company_id, subscription_id)
  references route_subscriptions(company_id, id) on delete restrict;
create index bookings_subscription_idx on bookings(subscription_id) where subscription_id is not null;

create table route_subscription_scans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  subscription_id uuid not null,
  trip_id uuid not null,
  booking_id uuid not null,
  direction text not null check (direction in ('go', 'return')),
  service_date date not null,
  scanned_by uuid references profiles(id) on delete set null,
  scanned_at timestamptz not null default now(),
  constraint route_scans_one_per_day_direction unique (subscription_id, service_date, direction),
  constraint route_scans_subscription_fk foreign key (company_id, subscription_id) references route_subscriptions(company_id, id) on delete restrict,
  constraint route_scans_trip_fk foreign key (company_id, trip_id) references trips(company_id, id) on delete restrict,
  constraint route_scans_booking_fk foreign key (company_id, booking_id) references bookings(company_id, id) on delete restrict
);
create index route_scans_trip_idx on route_subscription_scans(company_id, trip_id);

-- triggers
create trigger "000_tenant_guard" before insert or update on route_plans for each row execute function app_private.tenant_guard();
create trigger "000_tenant_guard" before insert or update on route_subscriptions for each row execute function app_private.tenant_guard();
create trigger "000_tenant_guard" before insert or update on route_subscription_scans for each row execute function app_private.tenant_guard();
create trigger forbid_company_id_change before update on route_plans for each row execute function app_private.forbid_company_id_change();
create trigger forbid_company_id_change before update on route_subscriptions for each row execute function app_private.forbid_company_id_change();
create trigger set_updated_at before update on route_plans for each row execute function app_private.set_updated_at();
create trigger set_updated_at before update on route_subscriptions for each row execute function app_private.set_updated_at();
create trigger enforce_limit before insert on route_plans for each row execute function app_private.enforce_limit('max_route_plans', 'deleted_at is null');
create trigger forbid_modify_row before update or delete on route_subscription_scans for each row execute function app_private.forbid_modify();
create trigger forbid_modify_stmt before truncate on route_subscription_scans for each statement execute function app_private.forbid_modify();

-- ======================= 4. RLS: read only, no client writes =======================
alter table route_plans enable row level security;
alter table route_subscriptions enable row level security;
alter table route_subscription_scans enable row level security;
revoke all on route_plans, route_subscriptions, route_subscription_scans from public, anon, authenticated;
grant select on route_plans, route_subscriptions, route_subscription_scans to authenticated;
create policy tenant_select on route_plans for select to authenticated using (app_private.has_permission(company_id, 'routes.read'));
create policy platform_select on route_plans for select to authenticated using (app_private.is_platform_user());
create policy tenant_select on route_subscriptions for select to authenticated using (app_private.has_permission(company_id, 'bookings.read'));
create policy own_select on route_subscriptions for select to authenticated using (user_id = auth.uid());
create policy platform_select on route_subscriptions for select to authenticated using (app_private.is_platform_user());
create policy tenant_select on route_subscription_scans for select to authenticated using (app_private.has_permission(company_id, 'bookings.read'));
create policy platform_select on route_subscription_scans for select to authenticated using (app_private.is_platform_user());

-- ======================= 5. helpers =======================
-- company-local calendar day of an instant
create function app_private.company_day(p_company uuid, p_at timestamptz) returns date
language sql stable security definer set search_path = '' as $$
  select (p_at at time zone s.timezone)::date from public.company_settings s where s.company_id = p_company
$$;
revoke all on function app_private.company_day(uuid, timestamptz) from public, anon, authenticated;

-- a plan a member may currently request: plan live, route live, company live + published + booking on
create function app_private.is_plan_public(p_plan uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.route_plans pl
    join public.routes r on r.company_id = pl.company_id and r.id = pl.route_id
    join public.company_settings s on s.company_id = pl.company_id
    join public.website_settings w on w.company_id = pl.company_id
    where pl.id = p_plan and pl.is_active and pl.deleted_at is null
      and r.is_active and r.deleted_at is null
      and s.booking_enabled and w.is_published
      and app_private.is_company_active(pl.company_id)
      and app_private.has_live_subscription(pl.company_id)
      and (pl.validity_type = 'duration' or pl.ends_on >= app_private.company_day(pl.company_id, now())))
$$;
revoke all on function app_private.is_plan_public(uuid) from public, anon, authenticated;

-- ======================= 6. plan management (routes.write) =======================
create function public.create_route_plan(
  p_route_id uuid, p_name text, p_price numeric, p_validity_type text,
  p_duration_months integer default null, p_starts_on date default null, p_ends_on date default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_company uuid; v_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select r.company_id into v_company from public.routes r where r.id = p_route_id and r.deleted_at is null;
  if v_company is null or not app_private.has_permission(v_company, 'routes.write') then
    raise exception 'route not found' using errcode = 'P0002'; end if;
  insert into public.route_plans (company_id, route_id, name, price, validity_type, duration_months, starts_on, ends_on, created_by)
  values (v_company, p_route_id, trim(p_name), p_price, p_validity_type, p_duration_months, p_starts_on, p_ends_on, auth.uid())
  returning id into v_id;
  perform app_private.write_audit('company_user', v_company, 'route_plan.created', 'route_plan', v_id,
    jsonb_build_object('route_id', p_route_id, 'price', p_price, 'validity_type', p_validity_type));
  return v_id;
end $$;

-- price / name / active only: validity is fixed once issued; subscribers keep the price they were approved at (snapshot)
create function public.update_route_plan(p_plan_id uuid, p_name text, p_price numeric, p_is_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_company uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select pl.company_id into v_company from public.route_plans pl where pl.id = p_plan_id and pl.deleted_at is null for update;
  if v_company is null or not app_private.has_permission(v_company, 'routes.write') then
    raise exception 'plan not found' using errcode = 'P0002'; end if;
  update public.route_plans set name = trim(p_name), price = p_price, is_active = p_is_active where id = p_plan_id;
  perform app_private.write_audit('company_user', v_company, 'route_plan.updated', 'route_plan', p_plan_id,
    jsonb_build_object('price', p_price, 'is_active', p_is_active));
end $$;

create function public.archive_route_plan(p_plan_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_company uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select pl.company_id into v_company from public.route_plans pl where pl.id = p_plan_id and pl.deleted_at is null for update;
  if v_company is null or not app_private.has_permission(v_company, 'routes.write') then
    raise exception 'plan not found' using errcode = 'P0002'; end if;
  update public.route_plans set deleted_at = now(), is_active = false where id = p_plan_id;
  perform app_private.write_audit('company_user', v_company, 'route_plan.archived', 'route_plan', p_plan_id, '{}'::jsonb);
end $$;

-- ======================= 7. public plan list =======================
create function public.public_route_plans(p_company_id uuid default null)
returns table (plan_id uuid, company_id uuid, company_name text, route_id uuid, origin_name text, destination_name text,
               name text, price numeric, currency char(3), validity_type text, duration_months smallint, starts_on date, ends_on date)
language sql stable security definer set search_path = '' as $$
  select pl.id, pl.company_id, c.name, r.id, r.origin_name, r.destination_name, pl.name, pl.price, s.currency,
         pl.validity_type, pl.duration_months, pl.starts_on, pl.ends_on
  from public.route_plans pl
  join public.companies c on c.id = pl.company_id
  join public.routes r on r.company_id = pl.company_id and r.id = pl.route_id
  join public.company_settings s on s.company_id = pl.company_id
  where app_private.is_plan_public(pl.id) and (p_company_id is null or pl.company_id = p_company_id)
  order by c.name, r.origin_name, r.destination_name, pl.price, pl.id
  limit 200
$$;

-- ======================= 8. request / decide / cancel =======================
create function public.request_route_subscription(p_plan_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_pl public.route_plans%rowtype; v_p public.profiles%rowtype; v_phone text; v_cur char(3); v_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  perform app_private.rate_limit_hit('booking.create');
  select * into v_p from public.profiles p where p.id = v_uid and p.is_active;
  if not found then raise exception 'account disabled' using errcode = '42501'; end if;
  if not app_private.is_plan_public(p_plan_id) then raise exception 'plan not found' using errcode = 'P0002'; end if;
  select * into v_pl from public.route_plans pl where pl.id = p_plan_id;
  v_phone := app_private.normalize_phone(v_p.phone);
  if v_phone is null then raise exception 'a valid phone number is required on your profile' using errcode = '22023'; end if;
  -- a lapsed active subscription must not block a renewal
  update public.route_subscriptions set status = 'expired'
   where plan_id = p_plan_id and user_id = v_uid and status = 'active' and valid_to < app_private.company_day(v_pl.company_id, now());
  select s.currency into v_cur from public.company_settings s where s.company_id = v_pl.company_id;
  begin
    insert into public.route_subscriptions (company_id, plan_id, user_id, masar_id, member_name, member_phone, price, currency)
    values (v_pl.company_id, p_plan_id, v_uid, v_p.masar_id, v_p.full_name, v_phone, v_pl.price, v_cur) returning id into v_id;
  exception when unique_violation then
    raise exception 'you already have an open request or active subscription for this plan' using errcode = '23505';
  end;
  perform app_private.write_audit('customer', v_pl.company_id, 'route_subscription.requested', 'route_subscription', v_id,
    jsonb_build_object('plan_id', p_plan_id, 'price', v_pl.price));
  return v_id;
end $$;

create function public.decide_route_subscription(p_id uuid, p_approve boolean, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_s public.route_subscriptions%rowtype; v_pl public.route_plans%rowtype; v_today date; v_from date; v_to date; v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_s from public.route_subscriptions s where s.id = p_id for update;
  if not found or not app_private.has_permission(v_s.company_id, 'bookings.write') then
    raise exception 'subscription not found' using errcode = 'P0002'; end if;
  if v_s.status <> 'pending' then raise exception 'only a pending request can be decided' using errcode = '23514'; end if;
  if length(coalesce(p_note, '')) > 500 then raise exception 'note too long' using errcode = '22023'; end if;
  if p_approve is null then raise exception 'decision required' using errcode = '22023'; end if;
  if p_approve then
    select * into v_pl from public.route_plans pl where pl.company_id = v_s.company_id and pl.id = v_s.plan_id;
    v_today := app_private.company_day(v_s.company_id, now());
    if v_pl.validity_type = 'duration' then
      v_from := v_today; v_to := (v_today + make_interval(months => v_pl.duration_months))::date - 1;
    else
      if v_pl.ends_on < v_today then raise exception 'plan period already ended' using errcode = '23514'; end if;
      v_from := greatest(v_pl.starts_on, v_today); v_to := v_pl.ends_on;
    end if;
    update public.route_subscriptions set status = 'active', valid_from = v_from, valid_to = v_to, paid_at = now(),
           decided_at = now(), decided_by = auth.uid(), decision_note = v_note where id = p_id;
  else
    update public.route_subscriptions set status = 'rejected', decided_at = now(), decided_by = auth.uid(), decision_note = v_note where id = p_id;
  end if;
  perform app_private.write_audit('company_user', v_s.company_id,
    case when p_approve then 'route_subscription.approved' else 'route_subscription.rejected' end, 'route_subscription', p_id,
    jsonb_build_object('plan_id', v_s.plan_id));
  return jsonb_build_object('id', p_id, 'status', case when p_approve then 'active' else 'rejected' end, 'valid_from', v_from, 'valid_to', v_to);
end $$;

create function public.cancel_my_route_subscription(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_s public.route_subscriptions%rowtype;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_s from public.route_subscriptions s where s.id = p_id and s.user_id = auth.uid() for update;
  if not found then raise exception 'subscription not found' using errcode = 'P0002'; end if;
  if v_s.status not in ('pending', 'active') then raise exception 'subscription is not open' using errcode = '23514'; end if;
  update public.route_subscriptions set status = 'cancelled', decided_at = coalesce(decided_at, now()) where id = p_id;
  perform app_private.write_audit('customer', v_s.company_id, 'route_subscription.cancelled', 'route_subscription', p_id, '{}'::jsonb);
end $$;

-- ======================= 9. subscriber booking =======================
-- return trips a subscriber may pick: the paired return route, same company-local day, after the go trip arrives, seats left
create function public.subscriber_return_options(p_subscription_id uuid, p_outbound_trip_id uuid)
returns table (trip_id uuid, route_id uuid, departure_at timestamptz, arrival_at timestamptz, seats_available integer)
language sql stable security definer set search_path = '' as $$
  select rt.id, rt.route_id, rt.departure_at, rt.arrival_at, (rt.capacity - rt.seats_booked)::integer
  from public.route_subscriptions s
  join public.route_plans pl on pl.company_id = s.company_id and pl.id = s.plan_id
  join public.trips o on o.company_id = s.company_id and o.id = p_outbound_trip_id and o.route_id = pl.route_id
  join public.routes gr on gr.company_id = s.company_id and gr.id = pl.route_id
  join public.trips rt on rt.company_id = s.company_id and rt.route_id = gr.return_route_id
  where s.id = p_subscription_id and s.user_id = auth.uid() and s.status = 'active'
    and app_private.is_trip_public(o.id) and app_private.is_trip_public(rt.id)
    and app_private.company_day(s.company_id, rt.departure_at) = app_private.company_day(s.company_id, o.departure_at)
    and rt.departure_at >= o.arrival_at and rt.capacity - rt.seats_booked >= 1
  order by rt.departure_at, rt.id
$$;

create function public.create_my_subscriber_booking(
  p_subscription_id uuid, p_outbound_trip_id uuid, p_return_trip_id uuid default null,
  p_pickup_stop_id uuid default null, p_dropoff_stop_id uuid default null,
  p_return_pickup_stop_id uuid default null, p_return_dropoff_stop_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_s public.route_subscriptions%rowtype; v_pl public.route_plans%rowtype; v_company uuid;
  v_out public.trips%rowtype; v_ret public.trips%rowtype; v_back uuid; v_day date; v_cust uuid;
  v_group uuid := null; v_oid uuid; v_rid uuid; v_oref text; v_rref text; v_attempt int := 0;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  perform app_private.rate_limit_hit('booking.create');
  select * into v_s from public.route_subscriptions s where s.id = p_subscription_id and s.user_id = v_uid and s.status = 'active' for update;
  if not found then raise exception 'subscription not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.is_active) then raise exception 'account disabled' using errcode = '42501'; end if;
  v_company := v_s.company_id;
  select * into v_pl from public.route_plans pl where pl.company_id = v_company and pl.id = v_s.plan_id;
  select r.return_route_id into v_back from public.routes r where r.company_id = v_company and r.id = v_pl.route_id;

  -- both trips locked in id order (same order as every other two-trip operation)
  perform 1 from public.trips t where t.company_id = v_company and t.id in (p_outbound_trip_id, coalesce(p_return_trip_id, p_outbound_trip_id)) order by t.id for update;
  select * into v_out from public.trips t where t.company_id = v_company and t.id = p_outbound_trip_id and t.route_id = v_pl.route_id;
  if v_out.id is null or not app_private.is_trip_public(v_out.id) then raise exception 'trip not found' using errcode = 'P0002'; end if;
  v_day := app_private.company_day(v_company, v_out.departure_at);
  if v_day < v_s.valid_from or v_day > v_s.valid_to then raise exception 'subscription is not valid on that date' using errcode = '23514'; end if;

  if p_return_trip_id is not null then
    select * into v_ret from public.trips t where t.company_id = v_company and t.id = p_return_trip_id and t.route_id = v_back;
    if v_ret.id is null or v_ret.id = v_out.id or not app_private.is_trip_public(v_ret.id)
       or app_private.company_day(v_company, v_ret.departure_at) <> v_day or v_ret.departure_at < v_out.arrival_at then
      raise exception 'return trip not found' using errcode = 'P0002'; end if;
  end if;

  -- one booked seat per direction per day for a subscription
  if exists (select 1 from public.bookings b join public.trips t on t.company_id = b.company_id and t.id = b.trip_id
              where b.subscription_id = v_s.id and b.status <> 'cancelled' and t.route_id = v_out.route_id
                and app_private.company_day(v_company, t.departure_at) = v_day)
     or (p_return_trip_id is not null and exists (select 1 from public.bookings b join public.trips t on t.company_id = b.company_id and t.id = b.trip_id
              where b.subscription_id = v_s.id and b.status <> 'cancelled' and t.route_id = v_ret.route_id
                and app_private.company_day(v_company, t.departure_at) = v_day)) then
    raise exception 'already booked for this day' using errcode = '23505'; end if;

  if v_out.capacity - v_out.seats_booked < 1 or (p_return_trip_id is not null and v_ret.capacity - v_ret.seats_booked < 1) then
    raise exception 'not enough seats available' using errcode = '23514'; end if;
  if p_pickup_stop_id is not null and not exists (select 1 from public.route_stops s where s.id = p_pickup_stop_id and s.company_id = v_company
       and s.route_id = v_out.route_id and s.is_active and s.stop_type in ('pickup', 'both')) then
    raise exception 'pickup stop does not belong to the trip route' using errcode = '23514'; end if;
  if p_dropoff_stop_id is not null and not exists (select 1 from public.route_stops s where s.id = p_dropoff_stop_id and s.company_id = v_company
       and s.route_id = v_out.route_id and s.is_active and s.stop_type in ('dropoff', 'both')) then
    raise exception 'dropoff stop does not belong to the trip route' using errcode = '23514'; end if;
  if p_return_trip_id is not null then
    if p_return_pickup_stop_id is not null and not exists (select 1 from public.route_stops s where s.id = p_return_pickup_stop_id and s.company_id = v_company
         and s.route_id = v_ret.route_id and s.is_active and s.stop_type in ('pickup', 'both')) then
      raise exception 'pickup stop does not belong to the trip route' using errcode = '23514'; end if;
    if p_return_dropoff_stop_id is not null and not exists (select 1 from public.route_stops s where s.id = p_return_dropoff_stop_id and s.company_id = v_company
         and s.route_id = v_ret.route_id and s.is_active and s.stop_type in ('dropoff', 'both')) then
      raise exception 'dropoff stop does not belong to the trip route' using errcode = '23514'; end if;
    v_group := gen_random_uuid();
  end if;

  select c.id into v_cust from public.customers c where c.company_id = v_company and c.user_id = v_uid and c.deleted_at is null;
  if v_cust is null then
    if exists (select 1 from public.customers c where c.company_id = v_company and c.phone = v_s.member_phone and c.deleted_at is null) then
      raise exception 'phone already registered for this company: verify your phone to link it' using errcode = '23505'; end if;
    insert into public.customers (company_id, user_id, full_name, phone) values (v_company, v_uid, v_s.member_name, v_s.member_phone) returning id into v_cust;
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_oref := app_private.new_booking_reference(); v_rref := app_private.new_booking_reference();
    begin
      insert into public.bookings (company_id, reference, trip_id, customer_id, pickup_stop_id, dropoff_stop_id, seats_count, unit_price, total_amount,
                                   currency, status, payment_status, source, created_by, round_trip_group_id, trip_leg, subscription_id)
      values (v_company, v_oref, v_out.id, v_cust, p_pickup_stop_id, p_dropoff_stop_id, 1, 0, 0, v_s.currency, 'confirmed', 'paid', 'web', v_uid,
              v_group, case when v_group is null then null else 'outbound' end, v_s.id) returning id into v_oid;
      if p_return_trip_id is not null then
        insert into public.bookings (company_id, reference, trip_id, customer_id, pickup_stop_id, dropoff_stop_id, seats_count, unit_price, total_amount,
                                     currency, status, payment_status, source, created_by, round_trip_group_id, trip_leg, subscription_id)
        values (v_company, v_rref, v_ret.id, v_cust, p_return_pickup_stop_id, p_return_dropoff_stop_id, 1, 0, 0, v_s.currency, 'confirmed', 'paid', 'web', v_uid,
                v_group, 'return', v_s.id) returning id into v_rid;
      end if;
      exit;
    exception when unique_violation then
      if v_attempt >= 8 then raise; end if;
    end;
  end loop;

  perform app_private.write_audit('customer', v_company, 'booking.created', 'booking', v_oid,
    jsonb_build_object('trip_id', v_out.id, 'seats', 1, 'reference', v_oref, 'source', 'web', 'subscription_id', v_s.id, 'leg', 'outbound'));
  if v_rid is not null then
    perform app_private.write_audit('customer', v_company, 'booking.created', 'booking', v_rid,
      jsonb_build_object('trip_id', v_ret.id, 'seats', 1, 'reference', v_rref, 'source', 'web', 'subscription_id', v_s.id, 'leg', 'return'));
  end if;
  return jsonb_build_object('group_id', v_group,
    'outbound', jsonb_build_object('id', v_oid, 'reference', v_oref, 'trip_id', v_out.id),
    'return', case when v_rid is null then null else jsonb_build_object('id', v_rid, 'reference', v_rref, 'trip_id', v_ret.id) end);
end $$;

-- ======================= 10. scan =======================
-- Who: staff with bookings.write on the trip's company, OR the driver assigned to that trip. Anyone else: 'trip not found'.
create function public.scan_route_subscription(p_masar_id text, p_trip_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_t public.trips%rowtype; v_s public.route_subscriptions%rowtype; v_pl public.route_plans%rowtype; v_back uuid;
  v_dir text; v_day date; v_bid uuid; v_scan uuid; v_id text := upper(trim(coalesce(p_masar_id, '')));
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_t from public.trips t where t.id = p_trip_id;
  if not found or v_t.status = 'cancelled' or not (
       app_private.has_permission(v_t.company_id, 'bookings.write')
       or (app_private.has_permission(v_t.company_id, 'trips.read_assigned') and app_private.is_my_driver(v_t.company_id, v_t.driver_id))) then
    raise exception 'trip not found' using errcode = 'P0002'; end if;
  v_day := app_private.company_day(v_t.company_id, v_t.departure_at);

  select s.* into v_s from public.route_subscriptions s
    join public.route_plans pl on pl.company_id = s.company_id and pl.id = s.plan_id
    join public.routes r on r.company_id = pl.company_id and r.id = pl.route_id
   where s.company_id = v_t.company_id and s.masar_id = v_id and s.status = 'active'
     and v_day between s.valid_from and s.valid_to
     and (pl.route_id = v_t.route_id or r.return_route_id = v_t.route_id)
   order by s.valid_to desc, s.id limit 1;
  if not found then raise exception 'no valid subscription' using errcode = 'P0002'; end if;
  select * into v_pl from public.route_plans pl where pl.company_id = v_s.company_id and pl.id = v_s.plan_id;
  select r.return_route_id into v_back from public.routes r where r.company_id = v_s.company_id and r.id = v_pl.route_id;
  v_dir := case when v_t.route_id = v_pl.route_id then 'go' else 'return' end;

  select b.id into v_bid from public.bookings b
   where b.company_id = v_t.company_id and b.subscription_id = v_s.id and b.trip_id = v_t.id and b.status in ('pending', 'confirmed') limit 1;
  if v_bid is null then raise exception 'no booking for this trip' using errcode = 'P0002'; end if;

  begin
    insert into public.route_subscription_scans (company_id, subscription_id, trip_id, booking_id, direction, service_date, scanned_by)
    values (v_t.company_id, v_s.id, v_t.id, v_bid, v_dir, v_day, auth.uid()) returning id into v_scan;
  exception when unique_violation then
    raise exception 'already scanned for this direction today' using errcode = '23505';
  end;
  perform app_private.write_audit('company_user', v_t.company_id, 'route_subscription.scanned', 'route_subscription', v_s.id,
    jsonb_build_object('trip_id', v_t.id, 'direction', v_dir, 'booking_id', v_bid));
  return jsonb_build_object('scan_id', v_scan, 'direction', v_dir, 'member_name', v_s.member_name, 'masar_id', v_s.masar_id,
    'subscription_id', v_s.id, 'service_date', v_day);
end $$;

-- ======================= 11. grants =======================
revoke all on function public.create_route_plan(uuid, text, numeric, text, integer, date, date) from public, anon;
revoke all on function public.update_route_plan(uuid, text, numeric, boolean) from public, anon;
revoke all on function public.archive_route_plan(uuid) from public, anon;
revoke all on function public.request_route_subscription(uuid) from public, anon;
revoke all on function public.decide_route_subscription(uuid, boolean, text) from public, anon;
revoke all on function public.cancel_my_route_subscription(uuid) from public, anon;
revoke all on function public.subscriber_return_options(uuid, uuid) from public, anon;
revoke all on function public.create_my_subscriber_booking(uuid, uuid, uuid, uuid, uuid, uuid, uuid) from public, anon;
revoke all on function public.scan_route_subscription(text, uuid) from public, anon;
revoke all on function public.public_route_plans(uuid) from public;
grant execute on function public.create_route_plan(uuid, text, numeric, text, integer, date, date) to authenticated;
grant execute on function public.update_route_plan(uuid, text, numeric, boolean) to authenticated;
grant execute on function public.archive_route_plan(uuid) to authenticated;
grant execute on function public.request_route_subscription(uuid) to authenticated;
grant execute on function public.decide_route_subscription(uuid, boolean, text) to authenticated;
grant execute on function public.cancel_my_route_subscription(uuid) to authenticated;
grant execute on function public.subscriber_return_options(uuid, uuid) to authenticated;
grant execute on function public.create_my_subscriber_booking(uuid, uuid, uuid, uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.scan_route_subscription(text, uuid) to authenticated;
grant execute on function public.public_route_plans(uuid) to anon, authenticated;
