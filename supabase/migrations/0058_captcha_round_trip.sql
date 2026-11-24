-- 0058: captcha gate for the round-trip booking RPC (P6a follow-up to 0057).
-- 0057 gated create_my_booking, create_my_subscriber_trip_booking, create_my_subscriber_booking and request_route_subscription, but
-- public.create_my_round_trip_booking (0030) was not redefined: with enforcement ON a client could skip the challenge by booking a round trip
-- directly through that RPC. This replaces ONLY the public wrapper (one added statement, after the rate limit); the _impl is untouched.
-- Same rule as create_my_booking: a retry of a booking that already exists (same key, same caller, outbound leg) needs no new pass.
-- ROLLBACK: recreate public.create_my_round_trip_booking exactly as in 0030 (without the consume block).

create or replace function public.create_my_round_trip_booking(
  p_outbound_trip_id uuid, p_return_trip_id uuid, p_seats integer, p_full_name text, p_phone text,
  p_email text default null, p_university text default null, p_student_id text default null,
  p_pickup_stop_id uuid default null, p_dropoff_stop_id uuid default null,
  p_return_pickup_stop_id uuid default null, p_return_dropoff_stop_id uuid default null,
  p_idempotency_key text default null, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.rate_limit_hit('booking.create');
  if p_idempotency_key is null or not exists (select 1 from public.bookings b where b.idempotency_key = p_idempotency_key and b.customer_id in (select app_private.my_customer_ids())) then
    perform app_private.consume_captcha_pass('booking');
  end if;
  return app_private.create_my_round_trip_booking_impl(p_outbound_trip_id, p_return_trip_id, p_seats, p_full_name, p_phone, p_email, p_university,
    p_student_id, p_pickup_stop_id, p_dropoff_stop_id, p_return_pickup_stop_id, p_return_dropoff_stop_id, p_idempotency_key, p_notes);
end $$;
revoke all on function public.create_my_round_trip_booking(uuid, uuid, integer, text, text, text, text, text, uuid, uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.create_my_round_trip_booking(uuid, uuid, integer, text, text, text, text, text, uuid, uuid, uuid, uuid, text, text) to authenticated;
