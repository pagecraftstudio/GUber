-- 0052 (Item 1): MASAR ID as a signed, short-lived QR, and ONE scan answer for drivers (the "scan card").
--
-- WHAT
--   1. my_masar_qr(): the signed-in student gets a token  MQ1.<kid>.<MASAR ID>.<expiry>.<signature>  that is valid for 90 seconds. The
--      app redraws the QR every ~50 s. This closes the gap 0034 left open ("a bare MASAR ID is replayable").
--   2. scan_identity(code, trip): READ-ONLY. Takes a signed QR token, a typed MASAR ID (flagged unverified) or a ticket QR, and returns one
--      card: who, subscription here / elsewhere / nowhere, booking on this trip, paid state, direction and today's use, a verdict and
--      whether boarding is allowed. It never boards anyone (decision D2: the driver confirms).
--   3. confirm_boarding(trip, ticket): the driver's "Board now". Re-checks everything inside the transaction (it trusts nothing the card
--      said), then boards through the same two helpers as 0037 (board_ticket_row + subscriber_scan), so the one-go-one-return-a-day rule
--      and the audit trail are the existing ones.
--   board_ticket (0014/0037) and scan_route_subscription (0034/0037) are NOT changed: they still board immediately. The new driver screen
--   stops calling them; they stay for staff tools and older app versions and can be revoked in a later migration.
--
-- SECURITY
--   * Signature = HMAC-SHA256 over the body with a server-side key (app_private.masar_qr_keys: no grants, RLS on, never returned).
--     HMAC is built from the built-in sha256 (RFC 2104), so there is no dependency on pgcrypto. The expiry is checked against the
--     DATABASE clock only; the phone's clock is never used. Signatures are compared through their SHA-256 digests.
--   * The COMPANY is always taken from the trip, never from the code. A driver only gets a name for a student who has a booking on this
--     trip or a subscription with this company. Anyone else is returned as a bare MASAR ID with verdict no_subscription, and an unknown
--     profile looks exactly like that (no enumeration by response shape). The only cross-company fact is the boolean
--     has_other_company_subscription (no company, plan or date), as the plan allows.
--   * A tampered, malformed or unknown-key token and an unknown ticket are one error ('invalid code' / 'invalid ticket'). A token with a
--     VALID signature but a past expiry is told apart ('qr_expired') so the student is asked to reopen the QR; that cannot be forged.
--   * Same authorization as scan_route_subscription: staff with bookings.write, or the driver assigned to the trip. Rate limit: the
--     existing 'ticket.board' bucket; my_masar_qr has its own 'masar.qr' bucket. Every identity scan writes an audit row (verdict, code
--     kind, verified flag; no name, no phone).
--   * Tokens are replayable for their 90 s lifetime (a photo of a QR). That is the accepted residual risk: what a replay can do is show
--     the card to a driver of the trip, and boarding still needs the driver's confirmation and the daily one-go-one-return rule.
--
-- KEY ROTATION (manual, no downtime): insert a new row with the next kid, then set retired_at = now() on the old one. Tokens signed by a
--   key retired less than 10 minutes ago still verify; new tokens use the newest key that is not retired.
-- ROLLBACK: drop function public.confirm_boarding(uuid, uuid), public.scan_identity(text, uuid), public.my_masar_qr(),
--   app_private.scan_trip(uuid, boolean), app_private.verify_masar_qr(text), app_private.b64url(bytea), app_private.hmac_sha256(bytea, bytea);
--   drop table app_private.masar_qr_keys; delete from app_private.rate_limit_policies where bucket = 'masar.qr'.
-- RUNNER NOTE: apply BEFORE deploying code that calls these functions (the rule from incident 0033). Requires 0014, 0020, 0034, 0037.
set search_path = public, extensions;

-- 1. primitives ---------------------------------------------------------------------------------------------------------------------
create function app_private.hmac_sha256(p_key bytea, p_msg bytea) returns bytea
language plpgsql immutable set search_path = '' as $$
declare k bytea := p_key; ipad bytea := ''::bytea; opad bytea := ''::bytea; i integer;
begin
  if octet_length(k) > 64 then k := sha256(k); end if;
  k := k || decode(repeat('00', 64 - octet_length(k)), 'hex');
  for i in 0..63 loop
    ipad := ipad || set_byte('\x00'::bytea, 0, get_byte(k, i) # 54);   -- 0x36
    opad := opad || set_byte('\x00'::bytea, 0, get_byte(k, i) # 92);   -- 0x5c
  end loop;
  return sha256(opad || sha256(ipad || p_msg));
end $$;

create function app_private.b64url(p_b bytea) returns text
language sql immutable set search_path = '' as $$
  select translate(rtrim(replace(encode(p_b, 'base64'), E'\n', ''), '='), '+/', '-_')
$$;
revoke all on function app_private.hmac_sha256(bytea, bytea), app_private.b64url(bytea) from public, anon, authenticated;

-- 2. keys. One secret per environment, generated here from the database's own CSPRNG (gen_random_uuid), never committed to git. -------
create table app_private.masar_qr_keys (
  kid         smallint primary key check (kid > 0),
  secret      bytea not null check (octet_length(secret) = 32),
  created_at  timestamptz not null default now(),
  retired_at  timestamptz
);
alter table app_private.masar_qr_keys enable row level security;
revoke all on app_private.masar_qr_keys from public, anon, authenticated;
insert into app_private.masar_qr_keys (kid, secret)
  values (1, sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')));

insert into app_private.rate_limit_policies (bucket, window_seconds, max_hits, description) values
  ('masar.qr', 600, 30, 'my_masar_qr per user per 10 minutes (the app asks about once a minute while the QR is open)');

-- 3. verify a token: {state: ok | expired | invalid, masar_id}. Signature first, expiry second. -------------------------------------
create function app_private.verify_masar_qr(p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m text[]; v_key bytea; v_exp bigint; v_body text; v_sig text; v_now bigint := extract(epoch from now())::bigint;
begin
  m := regexp_match(coalesce(p_code, ''), '^MQ1\.([0-9]{1,3})\.(MSR-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4})\.([0-9]{9,12})\.([A-Za-z0-9_-]{43})$');
  if m is null then return jsonb_build_object('state', 'invalid'); end if;
  select k.secret into v_key from app_private.masar_qr_keys k
   where k.kid = m[1]::smallint and (k.retired_at is null or k.retired_at > now() - interval '10 minutes');
  if v_key is null then return jsonb_build_object('state', 'invalid'); end if;
  v_exp := m[3]::bigint;
  v_body := 'MQ1.' || m[1] || '.' || m[2] || '.' || m[3];
  v_sig := app_private.b64url(app_private.hmac_sha256(v_key, convert_to(v_body, 'UTF8')));
  if sha256(convert_to(v_sig, 'UTF8')) is distinct from sha256(convert_to(m[4], 'UTF8')) then return jsonb_build_object('state', 'invalid'); end if;
  if v_exp > v_now + 600 then return jsonb_build_object('state', 'invalid'); end if;     -- a "valid" token from the far future is not ours
  if v_exp < v_now then return jsonb_build_object('state', 'expired'); end if;
  return jsonb_build_object('state', 'ok', 'masar_id', m[2]);
end $$;
revoke all on function app_private.verify_masar_qr(text) from public, anon, authenticated;

-- 4. the student's QR ----------------------------------------------------------------------------------------------------------------
create function public.my_masar_qr() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_id text; v_kid smallint; v_key bytea; v_exp bigint; v_body text;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  perform app_private.rate_limit_hit('masar.qr');
  select p.masar_id into v_id from public.profiles p where p.id = auth.uid() and p.is_active;
  if v_id is null then raise exception 'profile not found' using errcode = 'P0002'; end if;
  select k.kid, k.secret into v_kid, v_key from app_private.masar_qr_keys k where k.retired_at is null order by k.kid desc limit 1;
  v_exp := extract(epoch from now())::bigint + 90;
  v_body := 'MQ1.' || v_kid || '.' || v_id || '.' || v_exp;
  return jsonb_build_object(
    'token', v_body || '.' || app_private.b64url(app_private.hmac_sha256(v_key, convert_to(v_body, 'UTF8'))),
    'expires_at', to_timestamp(v_exp), 'ttl_seconds', 90);
end $$;
revoke all on function public.my_masar_qr() from public, anon;
grant execute on function public.my_masar_qr() to authenticated;

-- 5. who may scan on a trip, and is boarding open (the same rules as 0037's scan_route_subscription, in one place) ---------------------
create function app_private.scan_trip(p_trip_id uuid, p_lock boolean) returns public.trips
language plpgsql security definer set search_path = '' as $$
declare t public.trips%rowtype;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  perform app_private.rate_limit_hit('ticket.board');
  if p_lock then select * into t from public.trips x where x.id = p_trip_id for update;
  else select * into t from public.trips x where x.id = p_trip_id; end if;
  if not found or t.status = 'cancelled' or not (
       app_private.has_permission(t.company_id, 'bookings.write')
       or (app_private.has_permission(t.company_id, 'trips.read_assigned') and app_private.is_my_driver(t.company_id, t.driver_id))) then
    raise exception 'trip not found' using errcode = 'P0002'; end if;
  if t.status not in ('scheduled', 'boarding', 'in_progress') then
    raise exception 'trip is closed for boarding' using errcode = '23514'; end if;
  if t.status = 'scheduled' and now() < t.departure_at - app_private.boarding_opens_before() then
    raise exception 'boarding has not opened yet' using errcode = '23514'; end if;
  return t;
end $$;
revoke all on function app_private.scan_trip(uuid, boolean) from public, anon, authenticated;

-- 6. the scan card (read only) -------------------------------------------------------------------------------------------------------
create function public.scan_identity(p_code text, p_trip_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  t public.trips%rowtype; k public.tickets%rowtype; v_b public.bookings%rowtype; v_sub public.route_subscriptions%rowtype;
  v_pl public.route_plans%rowtype; v_prof public.profiles%rowtype;
  v_code text := trim(coalesce(p_code, '')); v_tprefix constant text := 'MALAKY:TICKET:'; v_tok text;
  v_kind text; v_verified boolean := true; v_masar text; v_uid uuid; v_ver jsonb; v_day date; v_dir text;
  v_verdict text; v_related boolean := false; v_other boolean := false; v_exp date; v_name text; v_has_k boolean := false;
  v_sub_json jsonb := null; v_book_json jsonb := null; v_go boolean := false; v_ret boolean := false; v_seats_boarded integer := 0;
begin
  t := app_private.scan_trip(p_trip_id, false);
  v_day := app_private.company_day(t.company_id, t.departure_at);

  -- what was scanned
  if left(v_code, length(v_tprefix)) = v_tprefix then
    v_kind := 'ticket'; v_tok := substr(v_code, length(v_tprefix) + 1);
    if length(v_tok) < 20 or length(v_tok) > 200 or v_tok !~ '^[A-Za-z0-9_-]+$' then raise exception 'invalid ticket' using errcode = 'P0002'; end if;
    select * into k from public.tickets x where x.token_hash = app_private.ticket_token_hash(v_tok);
    if not found or k.company_id <> t.company_id then raise exception 'invalid ticket' using errcode = 'P0002'; end if;
    v_has_k := true;
    select * into v_b from public.bookings b where b.company_id = k.company_id and b.id = k.booking_id;
    select c.user_id, c.full_name into v_uid, v_name from public.customers c where c.company_id = v_b.company_id and c.id = v_b.customer_id;
    v_related := true;
    if v_uid is not null then select p.masar_id into v_masar from public.profiles p where p.id = v_uid; end if;
  elsif left(v_code, 4) = 'MQ1.' then
    v_kind := 'qr'; v_ver := app_private.verify_masar_qr(v_code);
    if v_ver->>'state' = 'invalid' then raise exception 'invalid code' using errcode = 'P0002'; end if;
    if v_ver->>'state' = 'expired' then
      perform app_private.write_audit('company_user', t.company_id, 'identity.scanned', 'trip', t.id, jsonb_build_object('verdict', 'qr_expired', 'code_kind', v_kind, 'verified', true));
      return jsonb_build_object('verdict', 'qr_expired', 'can_board', false, 'kind', v_kind, 'verified', true, 'student', null, 'subscription', null,
                                'has_other_company_subscription', false, 'booking', null);
    end if;
    v_masar := v_ver->>'masar_id';
  elsif upper(v_code) ~ '^MSR-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$' then
    v_kind := 'masar_id'; v_verified := false; v_masar := upper(v_code);
  else
    raise exception 'invalid code' using errcode = 'P0002';
  end if;

  -- a person scanned by QR / typed ID: find the profile and what ties them to THIS trip's company
  if v_kind <> 'ticket' then
    select * into v_prof from public.profiles p where p.masar_id = v_masar and p.is_active;
    if found then
      v_uid := v_prof.id; v_name := v_prof.full_name;
      select b.* into v_b from public.bookings b join public.customers c on c.company_id = b.company_id and c.id = b.customer_id
       where b.company_id = t.company_id and b.trip_id = t.id and c.user_id = v_uid and b.status in ('confirmed', 'pending', 'cancelled')
       order by case b.status when 'confirmed' then 0 when 'pending' then 1 else 2 end, b.created_at desc limit 1;
      if v_b.id is not null then
        v_related := true;
        select * into k from public.tickets x where x.company_id = t.company_id and x.booking_id = v_b.id order by (x.status = 'valid') desc, x.ticket_index limit 1;
        v_has_k := found;
      end if;
    end if;
  end if;

  -- subscription with THIS company that covers this trip today (by user, so it also works for a typed ID)
  if v_uid is not null then
    select s.* into v_sub from public.route_subscriptions s
      join public.route_plans pl on pl.company_id = s.company_id and pl.id = s.plan_id
      join public.routes r on r.company_id = pl.company_id and r.id = pl.route_id
     where s.company_id = t.company_id and s.user_id = v_uid and s.status = 'active' and v_day between s.valid_from and s.valid_to
       and (pl.route_id = t.route_id or r.return_route_id = t.route_id)
     order by (s.id = v_b.subscription_id) desc nulls last, s.valid_to desc, s.id limit 1;
    if not found and v_b.subscription_id is not null then   -- the booking's own subscription, even if it has since lapsed: report it as expired
      select s.* into v_sub from public.route_subscriptions s where s.company_id = t.company_id and s.id = v_b.subscription_id;
    end if;
    if v_sub.id is null then
      select max(s.valid_to) into v_exp from public.route_subscriptions s
        join public.route_plans pl on pl.company_id = s.company_id and pl.id = s.plan_id
        join public.routes r on r.company_id = pl.company_id and r.id = pl.route_id
       where s.company_id = t.company_id and s.user_id = v_uid and s.status in ('active', 'expired') and s.valid_to < v_day
         and (pl.route_id = t.route_id or r.return_route_id = t.route_id);
    end if;
    select exists (select 1 from public.route_subscriptions s where s.company_id <> t.company_id and s.user_id = v_uid and s.status = 'active'
                    and v_day between s.valid_from and s.valid_to) into v_other;
  end if;
  if v_sub.id is not null or v_exp is not null then v_related := true; end if;

  -- subscription details + today's use
  if v_sub.id is not null then
    select * into v_pl from public.route_plans pl where pl.company_id = v_sub.company_id and pl.id = v_sub.plan_id;
    v_dir := case when t.route_id = v_pl.route_id then 'go' else 'return' end;
    select coalesce(bool_or(x.direction = 'go'), false), coalesce(bool_or(x.direction = 'return'), false) into v_go, v_ret
      from public.route_subscription_scans x where x.subscription_id = v_sub.id and x.service_date = v_day;
    v_sub_json := jsonb_build_object('state', case when v_sub.status = 'active' and v_day between v_sub.valid_from and v_sub.valid_to then 'valid' else 'expired' end,
      'plan_name', v_pl.name, 'valid_from', v_sub.valid_from, 'valid_to', v_sub.valid_to, 'days_left', greatest(v_sub.valid_to - v_day, 0),
      'direction', v_dir, 'go_used', v_go, 'return_used', v_ret);
  elsif v_exp is not null then
    v_sub_json := jsonb_build_object('state', 'expired', 'valid_to', v_exp);
  end if;

  -- booking details
  if v_b.id is not null then
    select count(*) filter (where x.status = 'boarded') into v_seats_boarded from public.tickets x where x.company_id = v_b.company_id and x.booking_id = v_b.id;
    v_book_json := jsonb_build_object('reference', v_b.reference, 'seats', v_b.seats_count, 'seats_boarded', v_seats_boarded, 'status', v_b.status,
      'payment_status', v_b.payment_status, 'ticket_id', case when v_has_k then k.id else null end,
      'boarded', v_has_k and k.status = 'boarded', 'is_subscriber_booking', v_b.subscription_id is not null);
  end if;

  -- verdict. First match wins; every branch is something the driver can say out loud.
  if v_kind = 'ticket' and k.trip_id <> t.id then v_verdict := 'wrong_trip';
  elsif v_b.id is not null then
    if v_b.status = 'cancelled' or (v_has_k and k.status = 'void') then v_verdict := 'cancelled';
    elsif v_b.status <> 'confirmed' or not v_has_k then v_verdict := 'not_confirmed';
    elsif k.status = 'boarded' then v_verdict := 'ok_boarded';
    elsif v_b.subscription_id is not null and (v_sub.id is null or v_sub.status <> 'active' or v_day not between v_sub.valid_from and v_sub.valid_to) then v_verdict := 'expired';
    elsif v_b.subscription_id is not null and exists (select 1 from public.route_subscription_scans x where x.subscription_id = v_b.subscription_id
              and x.service_date = v_day and x.direction = v_dir) then v_verdict := 'already_scanned';
    else v_verdict := 'ok_not_yet_boarded'; end if;
  elsif v_sub.id is not null then v_verdict := 'no_booking';
  elsif v_exp is not null then v_verdict := 'expired';
  else v_verdict := 'no_subscription'; end if;

  perform app_private.write_audit('company_user', t.company_id, 'identity.scanned', 'trip', t.id,
    jsonb_build_object('verdict', v_verdict, 'code_kind', v_kind, 'verified', v_verified));

  return jsonb_build_object(
    'verdict', v_verdict, 'can_board', v_verdict = 'ok_not_yet_boarded', 'kind', v_kind, 'verified', v_verified,
    'student', case when v_related then jsonb_build_object('name', v_name, 'masar_id', v_masar) when v_masar is not null then jsonb_build_object('name', null, 'masar_id', v_masar) else null end,
    'subscription', v_sub_json, 'has_other_company_subscription', v_other, 'booking', v_book_json);
end $$;
revoke all on function public.scan_identity(text, uuid) from public, anon;
grant execute on function public.scan_identity(text, uuid) to authenticated;

-- 7. the driver's confirmation. Trusts nothing from the card: every rule is checked again, under the trip and ticket locks. ------------
create function public.confirm_boarding(p_trip_id uuid, p_ticket_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare t public.trips%rowtype; k public.tickets%rowtype; v_status text; v_sub jsonb;
begin
  t := app_private.scan_trip(p_trip_id, true);                                        -- trip row locked first, like board_ticket
  select * into k from public.tickets x where x.id = p_ticket_id and x.company_id = t.company_id for update;
  if not found then raise exception 'invalid ticket' using errcode = 'P0002'; end if;
  if k.trip_id <> t.id then raise exception 'ticket is for another trip' using errcode = '23514'; end if;
  select b.status into v_status from public.bookings b where b.id = k.booking_id and b.company_id = k.company_id;
  if k.status = 'void' or v_status is distinct from 'confirmed' then raise exception 'ticket is cancelled' using errcode = '23514'; end if;
  if k.status = 'boarded' then
    return jsonb_build_object('result', 'already_boarded', 'ticket_index', k.ticket_index, 'boarded_at', k.boarded_at) || app_private.trip_boarding_stats(t.company_id, t.id);
  end if;
  k := app_private.board_ticket_row(t, k);
  v_sub := app_private.subscriber_scan(t, k);          -- raises (rolling the boarding back) if the subscription is not valid or the direction is used today
  return jsonb_build_object('result', 'boarded', 'ticket_index', k.ticket_index, 'boarded_at', k.boarded_at)
         || case when v_sub is null then '{}'::jsonb else jsonb_build_object('subscriber', v_sub) end
         || app_private.trip_boarding_stats(t.company_id, t.id);
end $$;
revoke all on function public.confirm_boarding(uuid, uuid) from public, anon;
grant execute on function public.confirm_boarding(uuid, uuid) to authenticated;
