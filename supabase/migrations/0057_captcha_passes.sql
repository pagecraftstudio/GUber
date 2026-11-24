-- 0057: captcha passes (P6a, plan F3 + item 11). The database cannot call Cloudflare Turnstile, so a Next.js SERVER action verifies the Turnstile token and
-- signs a short proof; the database checks the signature, stores a ONE-TIME pass for (caller, purpose), and the protected functions CONSUME it. A browser
-- calling the RPC directly without a pass is refused (when enforcement is on). No service-role key is involved (owner decision).
--
--   app_private.captcha_config             singleton: enforced (default FALSE until the owner switches it on), pass_secret (never readable by clients)
--   app_private.captcha_passes             one row per proof: purpose, nonce (unique = replay protection), expires_at, consumed_at
--   app_private.hmac_sha256(key, msg)      HMAC-SHA256 hex, implemented on the built-in sha256() (the project has no pgcrypto dependency)
--   public.redeem_captcha_proof(...)       signed-in; verifies the server's signature, stores the pass
--   app_private.consume_captcha_pass(p)    no-op while enforcement is off; otherwise burns one valid pass or raises 'captcha required'
--   public.captcha_enforced()              anon + signed-in: the UI shows the challenge only when this is true
--   public.set_captcha_enforcement(b, s)   super_admin only; refuses to enforce without a secret; audited without the secret
--   REPLACED (from the live definitions): public.create_my_booking, public.create_my_subscriber_trip_booking, public.request_route_subscription
--                                         (one added line each, after the rate limit; an idempotent replay of an existing booking needs no new pass)
--
-- Proof format signed by the server: 'v1|<purpose>|<user id>|<expiry epoch seconds>|<nonce>'; expiry at most 10 minutes ahead.
-- ROLLBACK: recreate the three functions from 0054/0055/0020 without the consume line; drop function public.set_captcha_enforcement, public.captcha_enforced,
--   public.redeem_captcha_proof, app_private.consume_captcha_pass, app_private.hmac_sha256; drop table app_private.captcha_passes, app_private.captcha_config;
--   delete from app_private.rate_limit_policies where bucket = 'captcha.redeem'.
-- RUNNER NOTE: apply BEFORE deploying the code that calls redeem_captcha_proof. Enforcement stays off until set_captcha_enforcement(true, secret) is run.

create table app_private.captcha_config (
  singleton   boolean primary key default true check (singleton),
  enforced    boolean not null default false,
  pass_secret text check (pass_secret is null or length(pass_secret) >= 32),
  updated_at  timestamptz not null default now()
);
insert into app_private.captcha_config (singleton) values (true);

create table app_private.captcha_passes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  purpose     text not null check (purpose in ('booking', 'subscription')),
  nonce       text not null unique check (nonce ~ '^[A-Za-z0-9_-]{16,64}$'),
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index captcha_passes_open_idx on app_private.captcha_passes (user_id, purpose, expires_at) where consumed_at is null;
revoke all on app_private.captcha_config, app_private.captcha_passes from public, anon, authenticated;

insert into app_private.rate_limit_policies (bucket, window_seconds, max_hits, description) values ('captcha.redeem', 60, 30, 'captcha proofs per user per minute');

create or replace function app_private.hmac_sha256(p_key text, p_msg text) returns text language plpgsql immutable set search_path = '' as $$
declare k bytea := convert_to(p_key, 'UTF8'); ipad bytea; opad bytea; i int;
begin
  if length(k) > 64 then k := sha256(k); end if;
  k := k || decode(repeat('00', 64 - length(k)), 'hex');
  ipad := k; opad := k;
  for i in 0..63 loop
    ipad := set_byte(ipad, i, get_byte(k, i) # 54);   -- 0x36
    opad := set_byte(opad, i, get_byte(k, i) # 92);   -- 0x5c
  end loop;
  return encode(sha256(opad || sha256(ipad || convert_to(p_msg, 'UTF8'))), 'hex');
end $$;

create or replace function public.redeem_captcha_proof(p_purpose text, p_exp bigint, p_nonce text, p_sig text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_secret text; v_want text;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  perform app_private.rate_limit_hit('captcha.redeem');
  select pass_secret into v_secret from app_private.captcha_config;
  if v_secret is null or p_purpose not in ('booking', 'subscription') or p_nonce !~ '^[A-Za-z0-9_-]{16,64}$'
     or p_exp is null or p_exp <= extract(epoch from now()) or p_exp > extract(epoch from now()) + 600 or p_sig is null then
    raise exception 'captcha proof invalid' using errcode = '42501';
  end if;
  v_want := app_private.hmac_sha256(v_secret, 'v1|' || p_purpose || '|' || v_uid || '|' || p_exp || '|' || p_nonce);
  if v_want is distinct from lower(p_sig) then raise exception 'captcha proof invalid' using errcode = '42501'; end if;
  delete from app_private.captcha_passes where id in (select id from app_private.captcha_passes where expires_at < now() - interval '1 day' limit 100);
  begin
    insert into app_private.captcha_passes (user_id, purpose, nonce, expires_at) values (v_uid, p_purpose, p_nonce, to_timestamp(p_exp));
  exception when unique_violation then
    raise exception 'captcha proof invalid' using errcode = '42501';
  end;
end $$;
revoke all on function public.redeem_captcha_proof(text, bigint, text, text) from public, anon;
grant execute on function public.redeem_captcha_proof(text, bigint, text, text) to authenticated;

create or replace function app_private.consume_captcha_pass(p_purpose text) returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not (select enforced from app_private.captcha_config) then return; end if;
  select id into v_id from app_private.captcha_passes
   where user_id = auth.uid() and purpose = p_purpose and consumed_at is null and expires_at > now()
   order by expires_at limit 1 for update skip locked;
  if v_id is null then raise exception 'captcha required' using errcode = '42501'; end if;
  update app_private.captcha_passes set consumed_at = now() where id = v_id;
end $$;
revoke all on function app_private.consume_captcha_pass(text) from public, anon, authenticated;

create or replace function public.captcha_enforced() returns boolean language sql stable security definer set search_path = '' as $$
  select enforced from app_private.captcha_config
$$;
revoke all on function public.captcha_enforced() from public;
grant execute on function public.captcha_enforced() to anon, authenticated;

create or replace function public.set_captcha_enforcement(p_enforced boolean, p_secret text default null) returns void language plpgsql security definer set search_path = '' as $$
begin
  if app_private.platform_role() is distinct from 'super_admin' then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_secret is not null and length(p_secret) < 32 then raise exception 'captcha secret too short' using errcode = '22023'; end if;
  if p_enforced and p_secret is null and (select pass_secret from app_private.captcha_config) is null then raise exception 'captcha secret required' using errcode = '22023'; end if;
  update app_private.captcha_config set enforced = p_enforced, pass_secret = coalesce(p_secret, pass_secret), updated_at = now();
  perform app_private.write_audit('platform_user', null, 'captcha.enforcement_changed', 'captcha', null, jsonb_build_object('enforced', p_enforced, 'secret_changed', p_secret is not null));
end $$;
revoke all on function public.set_captcha_enforcement(boolean, text) from public, anon;
grant execute on function public.set_captcha_enforcement(boolean, text) to authenticated;

-- protected functions: ONE added line each, everything else is the live definition ------------------------------------------------------------------
create or replace function public.create_my_booking(p_trip_id uuid, p_seats integer, p_full_name text, p_phone text, p_email text default null, p_university text default null,
  p_student_id text default null, p_pickup_stop_id uuid default null, p_dropoff_stop_id uuid default null, p_idempotency_key text default null, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.rate_limit_hit('booking.create');
  -- a retry of a booking that already exists (same key, same caller) needs no new pass
  if p_idempotency_key is null or not exists (select 1 from public.bookings b where b.idempotency_key = p_idempotency_key and b.customer_id in (select app_private.my_customer_ids())) then
    perform app_private.consume_captcha_pass('booking');
  end if;
  return app_private.create_my_booking_impl(p_trip_id, p_seats, p_full_name, p_phone, p_email, p_university, p_student_id,
                                            p_pickup_stop_id, p_dropoff_stop_id, p_idempotency_key, p_notes);
end $$;

CREATE OR REPLACE FUNCTION public.create_my_subscriber_trip_booking(p_trip_id uuid, p_pickup_stop_id uuid DEFAULT NULL::uuid, p_dropoff_stop_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid(); v_cov record; v_s public.route_subscriptions%rowtype; v_t public.trips%rowtype; v_cust uuid;
  v_id uuid; v_ref text; v_attempt int := 0;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  perform app_private.rate_limit_hit('booking.create');
  perform app_private.consume_captcha_pass('booking');
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.is_active) then raise exception 'account disabled' using errcode = '42501'; end if;
  select * into v_cov from app_private.trip_coverage(v_uid, p_trip_id);
  if v_cov.subscription_id is null then raise exception 'no subscription covers this trip' using errcode = 'P0002'; end if;
  -- serialise this member's bookings for the day, then decide again on the locked state (a double click cannot book twice)
  select * into v_s from public.route_subscriptions s where s.id = v_cov.subscription_id and s.user_id = v_uid and s.status = 'active' for update;
  if not found then raise exception 'no subscription covers this trip' using errcode = 'P0002'; end if;
  select * into v_cov from app_private.trip_coverage(v_uid, p_trip_id);
  if v_cov.subscription_id is null then raise exception 'no subscription covers this trip' using errcode = 'P0002'; end if;
  if not v_cov.available then raise exception 'already booked for this day' using errcode = '23505'; end if;
  select * into v_t from public.trips t where t.id = p_trip_id and t.company_id = v_s.company_id for update;
  if v_t.id is null or not app_private.is_trip_public(v_t.id) then raise exception 'trip not found' using errcode = 'P0002'; end if;
  if v_t.capacity - v_t.seats_booked < 1 then raise exception 'not enough seats available' using errcode = '23514'; end if;
  if p_pickup_stop_id is not null and not exists (select 1 from public.route_stops s where s.id = p_pickup_stop_id and s.company_id = v_s.company_id
       and s.route_id = v_t.route_id and s.is_active and s.stop_type in ('pickup', 'both')) then
    raise exception 'pickup stop does not belong to the trip route' using errcode = '23514'; end if;
  if p_dropoff_stop_id is not null and not exists (select 1 from public.route_stops s where s.id = p_dropoff_stop_id and s.company_id = v_s.company_id
       and s.route_id = v_t.route_id and s.is_active and s.stop_type in ('dropoff', 'both')) then
    raise exception 'dropoff stop does not belong to the trip route' using errcode = '23514'; end if;

  select c.id into v_cust from public.customers c where c.company_id = v_s.company_id and c.user_id = v_uid and c.deleted_at is null;
  if v_cust is null then
    if exists (select 1 from public.customers c where c.company_id = v_s.company_id and c.phone = v_s.member_phone and c.deleted_at is null) then
      raise exception 'phone already registered for this company: verify your phone to link it' using errcode = '23505'; end if;
    insert into public.customers (company_id, user_id, full_name, phone) values (v_s.company_id, v_uid, v_s.member_name, v_s.member_phone) returning id into v_cust;
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_ref := app_private.new_booking_reference();
    begin
      insert into public.bookings (company_id, reference, trip_id, customer_id, pickup_stop_id, dropoff_stop_id, seats_count, unit_price, total_amount,
                                   currency, status, payment_status, source, created_by, subscription_id)
      values (v_s.company_id, v_ref, v_t.id, v_cust, p_pickup_stop_id, p_dropoff_stop_id, 1, 0, 0, v_s.currency, 'confirmed', 'paid', 'web', v_uid, v_s.id)
      returning id into v_id;
      exit;
    exception when unique_violation then
      if v_attempt >= 8 then raise; end if;
    end;
  end loop;

  perform app_private.write_audit('customer', v_s.company_id, 'booking.created', 'booking', v_id,
    jsonb_build_object('trip_id', v_t.id, 'seats', 1, 'reference', v_ref, 'source', 'web', 'subscription_id', v_s.id, 'leg', v_cov.leg));
  return jsonb_build_object('id', v_id, 'reference', v_ref, 'status', 'confirmed', 'seats_count', 1, 'total_amount', 0, 'currency', v_s.currency,
                            'payment_due_at', null, 'leg', v_cov.leg, 'plan_name', v_cov.plan_name);
end $function$;

CREATE OR REPLACE FUNCTION public.create_my_subscriber_booking(p_subscription_id uuid, p_outbound_trip_id uuid, p_return_trip_id uuid DEFAULT NULL::uuid, p_pickup_stop_id uuid DEFAULT NULL::uuid, p_dropoff_stop_id uuid DEFAULT NULL::uuid, p_return_pickup_stop_id uuid DEFAULT NULL::uuid, p_return_dropoff_stop_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid(); v_s public.route_subscriptions%rowtype; v_pl public.route_plans%rowtype; v_company uuid;
  v_out public.trips%rowtype; v_ret public.trips%rowtype; v_back uuid; v_day date; v_cust uuid;
  v_group uuid := null; v_oid uuid; v_rid uuid; v_oref text; v_rref text; v_attempt int := 0;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  perform app_private.rate_limit_hit('booking.create');
  perform app_private.consume_captcha_pass('booking');
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
end $function$;

CREATE OR REPLACE FUNCTION public.request_route_subscription(p_plan_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := auth.uid(); v_pl public.route_plans%rowtype; v_p public.profiles%rowtype; v_phone text; v_cur char(3); v_id uuid;
        v_today date; v_last date;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  perform app_private.rate_limit_hit('booking.create');
  perform app_private.consume_captcha_pass('subscription');
  select * into v_p from public.profiles p where p.id = v_uid and p.is_active;
  if not found then raise exception 'account disabled' using errcode = '42501'; end if;
  if not app_private.is_plan_public(p_plan_id) then raise exception 'plan not found' using errcode = 'P0002'; end if;
  select * into v_pl from public.route_plans pl where pl.id = p_plan_id;
  v_phone := app_private.normalize_phone(v_p.phone);
  if v_phone is null then raise exception 'a valid phone number is required on your profile' using errcode = '22023'; end if;
  v_today := app_private.company_day(v_pl.company_id, now());
  -- a lapsed active subscription must not block a renewal
  update public.route_subscriptions set status = 'expired'
   where plan_id = p_plan_id and user_id = v_uid and status = 'active' and valid_to < v_today;
  -- still running: only a duration plan, and only inside the renewal window
  select max(s.valid_to) into v_last from public.route_subscriptions s where s.plan_id = p_plan_id and s.user_id = v_uid and s.status = 'active';
  if v_last is not null then
    if v_pl.validity_type <> 'duration' then
      raise exception 'you already have an active subscription for this plan' using errcode = '23505'; end if;
    if v_last > v_today + app_private.subscription_notice_days() then
      raise exception 'renewal opens % days before your subscription ends', app_private.subscription_notice_days() using errcode = '23514'; end if;
  end if;
  select s.currency into v_cur from public.company_settings s where s.company_id = v_pl.company_id;
  begin
    insert into public.route_subscriptions (company_id, plan_id, user_id, masar_id, member_name, member_phone, price, currency)
    values (v_pl.company_id, p_plan_id, v_uid, v_p.masar_id, v_p.full_name, v_phone, v_pl.price, v_cur) returning id into v_id;
  exception when unique_violation then
    raise exception 'you already have an open request or active subscription for this plan' using errcode = '23505';
  end;
  perform app_private.write_audit('customer', v_pl.company_id, 'route_subscription.requested', 'route_subscription', v_id,
    jsonb_build_object('plan_id', p_plan_id, 'price', v_pl.price, 'renewal', v_last is not null));
  return v_id;
end $function$;

