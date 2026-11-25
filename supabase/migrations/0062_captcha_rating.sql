-- 0062: captcha pass for ratings (plan F3, purpose 'rating'). Same one-time signed pass as bookings (0057); enforcement stays one switch for all purposes.
--   * captcha_passes.purpose accepts 'rating'; redeem_captcha_proof accepts it; submit_trip_rating consumes one AFTER all rule checks pass, so a refusal never burns a pass.
-- ROLLBACK: re-create redeem_captcha_proof and submit_trip_rating from 0057 / 0061 and restore the purpose check to ('booking', 'subscription').
-- RUNNER NOTE: apply before deploying code that sends purpose 'rating'. Enforcement is off by default: nothing changes until a super admin switches it on.
set search_path = public, extensions;
alter table app_private.captcha_passes drop constraint captcha_passes_purpose_check;
alter table app_private.captcha_passes add constraint captcha_passes_purpose_check check (purpose in ('booking', 'subscription', 'rating'));

CREATE OR REPLACE FUNCTION public.redeem_captcha_proof(p_purpose text, p_exp bigint, p_nonce text, p_sig text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := auth.uid(); v_secret text; v_want text;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  perform app_private.rate_limit_hit('captcha.redeem');
  select pass_secret into v_secret from app_private.captcha_config;
  if v_secret is null or p_purpose not in ('booking', 'subscription', 'rating') or p_nonce !~ '^[A-Za-z0-9_-]{16,64}$'
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
end $function$;

CREATE OR REPLACE FUNCTION public.submit_trip_rating(p_booking_id uuid, p_trip_stars integer, p_driver_stars integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := auth.uid(); b record; t public.trips%rowtype; v_driver uuid; w record;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  perform app_private.rate_limit_hit('rating.submit');
  if p_trip_stars is null or p_driver_stars is null or p_trip_stars not between 1 and 5 or p_driver_stars not between 1 and 5 then
    raise exception 'invalid stars' using errcode = '22023'; end if;
  -- ownership: through the customer row linked to this login. A walk-in booked by staff has no login and can never match.
  select bk.id, bk.company_id, bk.trip_id into b from public.bookings bk join public.customers c on c.company_id = bk.company_id and c.id = bk.customer_id
   where bk.id = p_booking_id and c.user_id = v_uid;
  if not found then raise exception 'booking not found' using errcode = 'P0002'; end if;
  select * into t from public.trips x where x.id = b.trip_id and x.company_id = b.company_id;
  if t.status <> 'completed' or t.ended_at is null then raise exception 'trip not rateable' using errcode = '23514'; end if;
  select * into w from app_private.rating_window();
  if now() < t.ended_at + w.opens then raise exception 'rating not open yet' using errcode = '23514'; end if;
  if now() >= t.ended_at + w.closes then raise exception 'rating window closed' using errcode = '23514'; end if;
  select k.boarded_driver_id into v_driver from public.tickets k
   where k.company_id = b.company_id and k.booking_id = b.id and k.status = 'boarded' order by k.boarded_at limit 1;
  if not found then raise exception 'not boarded' using errcode = '23514'; end if;
  v_driver := coalesce(v_driver, t.driver_id);
  if v_driver is null then raise exception 'not boarded' using errcode = '23514'; end if;
  perform app_private.consume_captcha_pass('rating');   -- after every rule check, so a refused rating never burns a pass
  begin
    insert into public.trip_ratings (company_id, trip_id, booking_id, rater_user_id, driver_id, trip_stars, driver_stars)
    values (b.company_id, b.trip_id, b.id, v_uid, v_driver, p_trip_stars, p_driver_stars);
  exception when unique_violation then raise exception 'already rated' using errcode = '23505'; end;
  perform app_private.rating_apply(b.company_id, v_driver, p_trip_stars, p_driver_stars, 1);
  perform app_private.write_audit('customer', b.company_id, 'rating.submitted', 'trip', b.trip_id, '{}'::jsonb);   -- no stars, no identity in the audit row
  return jsonb_build_object('booking_id', b.id, 'trip_stars', p_trip_stars, 'driver_stars', p_driver_stars);
end $function$;
