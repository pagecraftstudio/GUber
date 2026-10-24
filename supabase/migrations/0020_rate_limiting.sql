-- 0020: Phase 8B - server-enforced, concurrency-safe rate limiting for authenticated customer/driver actions.
--
-- PURPOSE
--   Throttle the four abuse-prone authenticated RPCs inside the database, so the limit cannot be bypassed by calling
--   PostgREST directly with a valid JWT (the browser talks to Supabase directly; there is no app server in that path):
--     create_my_booking, cancel_my_booking, my_ticket_qr (customers), board_ticket (drivers).
--
-- DESIGN
--   * Fixed-window counters keyed by (bucket, subject = auth.uid(), window). One atomic
--       INSERT .. ON CONFLICT DO UPDATE SET hits = hits + 1 RETURNING hits
--     per policy tier. The row lock taken by the upsert serialises concurrent calls of the same user, and READ COMMITTED
--     re-evaluates against the committed row, so N parallel calls can never commit more than max_hits.
--   * Limits are DATA (app_private.rate_limit_policies), not code. Several tiers per bucket are allowed (short + daily).
--     Change a limit with a new migration (or an operator UPDATE), never by editing the functions.
--   * The existing implementations are NOT rewritten. They are renamed to *_impl and moved to app_private
--     (EXECUTE revoked from every API role). A thin wrapper with the ORIGINAL public signature, owner/SECURITY DEFINER,
--     calls rate_limit_hit() and then the implementation. Because the public name is the only callable entry point,
--     there is no un-throttled path.  Grants on the public wrappers equal the previous grants (authenticated only).
--   * Over the limit -> SQLSTATE 'PT429' (PostgREST turns the 'PT' prefix into HTTP 429), hint = seconds until the
--     window resets. The message is constant and reveals nothing about other users.
--
-- KNOWN LIMITATIONS (by construction, documented in PHASE-8B-REPORT.md)
--   * The counter increment lives in the same transaction as the call. A call that FAILS (validation error, sold out,
--     wrong ticket ...) rolls back and does not consume budget; only calls that commit, and the single call that hits the
--     ceiling, are counted. Failed-call floods are bounded by cheap early checks, by 128-bit ticket tokens, and by the
--     Vercel Firewall / Supabase edge limits (see docs/RATE-LIMITING.md). Postgres has no autonomous transactions.
--   * Fixed windows allow up to 2x max_hits across a window boundary. Acceptable for abuse control (not for billing).
--   * public_search_trips / public_trip_stops are anonymous (no subject). They are NOT limited here; use the firewall.
--
-- ROLLBACK: reverse the renames (set schema public, rename back), drop the wrappers, drop the two tables and the function.
--   Nothing outside this file depends on them. Data loss: only counters (disposable).
set search_path = public, extensions;

-- ------------------------------------------------------------------------------------------------ storage
create table app_private.rate_limit_policies (
  bucket         text    not null check (bucket ~ '^[a-z][a-z0-9_.]{1,63}$'),
  window_seconds integer not null check (window_seconds between 1 and 604800),
  max_hits       integer not null check (max_hits between 1 and 100000),
  description    text,
  primary key (bucket, window_seconds)
);

create table app_private.rate_limit_counters (
  bucket         text        not null,
  subject        text        not null,
  window_seconds integer     not null,
  window_start   timestamptz not null,
  hits           integer     not null default 0 check (hits >= 0),
  primary key (bucket, subject, window_seconds, window_start)
);
-- purge scans by expiry, not by key
create index rate_limit_counters_window_start_idx on app_private.rate_limit_counters (window_start);

-- Not exposed through the API (schema app_private is not in db-schemas) AND locked down anyway: defence in depth.
alter table app_private.rate_limit_policies enable row level security;
alter table app_private.rate_limit_counters enable row level security;
revoke all on app_private.rate_limit_policies, app_private.rate_limit_counters from public, anon, authenticated;

insert into app_private.rate_limit_policies (bucket, window_seconds, max_hits, description) values
  ('booking.create', 600,   20,  'create_my_booking per user per 10 minutes (idempotent retries count; real users book 1-3 times)'),
  ('booking.create', 86400, 60,  'create_my_booking per user per day'),
  ('booking.cancel', 600,   20,  'cancel_my_booking per user per 10 minutes'),
  ('ticket.qr',      600,   30,  'my_ticket_qr per user per 10 minutes (each call rotates the QR token)'),
  ('ticket.board',   60,    180, 'board_ticket per driver per minute (a full bus can be scanned in well under a minute)');

-- ------------------------------------------------------------------------------------------------ limiter
-- Records one hit for the CALLER (auth.uid()) against every tier of the bucket; raises PT429 when any tier is exceeded.
-- A bucket with no policy FAILS CLOSED (XX000): a typo or a deleted policy must never silently disable protection.
create or replace function app_private.rate_limit_hit(p_bucket text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  pol record; v_start timestamptz; v_hits integer; v_found boolean := false; v_retry integer;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  for pol in select p.window_seconds, p.max_hits from app_private.rate_limit_policies p where p.bucket = p_bucket order by p.window_seconds loop
    v_found := true;
    v_start := to_timestamp(floor(extract(epoch from clock_timestamp()) / pol.window_seconds) * pol.window_seconds);

    insert into app_private.rate_limit_counters as c (bucket, subject, window_seconds, window_start, hits)
    values (p_bucket, v_uid::text, pol.window_seconds, v_start, 1)
    on conflict (bucket, subject, window_seconds, window_start) do update set hits = c.hits + 1
    returning c.hits into v_hits;

    if v_hits > pol.max_hits then
      v_retry := greatest(1, ceil(extract(epoch from (v_start + make_interval(secs => pol.window_seconds)) - clock_timestamp()))::integer);
      raise exception 'rate limit exceeded' using errcode = 'PT429', hint = v_retry::text;
    end if;
  end loop;

  if not v_found then raise exception 'rate limit policy missing' using errcode = 'XX000'; end if;

  -- opportunistic housekeeping (~1% of calls): drop windows that ended more than an hour ago
  if random() < 0.01 then
    delete from app_private.rate_limit_counters k
     where k.window_start + make_interval(secs => k.window_seconds) < clock_timestamp() - interval '1 hour';
  end if;
end $$;
revoke all on function app_private.rate_limit_hit(text) from public, anon, authenticated;

-- Manual / scheduled purge (service role or SQL editor only). Returns the number of rows removed.
create or replace function app_private.rate_limit_purge() returns bigint
language plpgsql security definer set search_path = '' as $$
declare n bigint;
begin
  delete from app_private.rate_limit_counters k
   where k.window_start + make_interval(secs => k.window_seconds) < clock_timestamp() - interval '1 hour';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function app_private.rate_limit_purge() from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------------ move implementations
alter function public.create_my_booking(uuid, integer, text, text, text, text, text, uuid, uuid, text, text) rename to create_my_booking_impl;
alter function public.create_my_booking_impl(uuid, integer, text, text, text, text, text, uuid, uuid, text, text) set schema app_private;
alter function public.cancel_my_booking(uuid, text) rename to cancel_my_booking_impl;
alter function public.cancel_my_booking_impl(uuid, text) set schema app_private;
alter function public.my_ticket_qr(uuid) rename to my_ticket_qr_impl;
alter function public.my_ticket_qr_impl(uuid) set schema app_private;
alter function public.board_ticket(uuid, text) rename to board_ticket_impl;
alter function public.board_ticket_impl(uuid, text) set schema app_private;

revoke all on function app_private.create_my_booking_impl(uuid, integer, text, text, text, text, text, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function app_private.cancel_my_booking_impl(uuid, text) from public, anon, authenticated;
revoke all on function app_private.my_ticket_qr_impl(uuid) from public, anon, authenticated;
revoke all on function app_private.board_ticket_impl(uuid, text) from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------------ throttled public entry points
create or replace function public.create_my_booking(
  p_trip_id uuid, p_seats integer, p_full_name text, p_phone text,
  p_email text default null, p_university text default null, p_student_id text default null,
  p_pickup_stop_id uuid default null, p_dropoff_stop_id uuid default null,
  p_idempotency_key text default null, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.rate_limit_hit('booking.create');
  return app_private.create_my_booking_impl(p_trip_id, p_seats, p_full_name, p_phone, p_email, p_university, p_student_id,
                                            p_pickup_stop_id, p_dropoff_stop_id, p_idempotency_key, p_notes);
end $$;
revoke all on function public.create_my_booking(uuid, integer, text, text, text, text, text, uuid, uuid, text, text) from public, anon;
grant execute on function public.create_my_booking(uuid, integer, text, text, text, text, text, uuid, uuid, text, text) to authenticated;

create or replace function public.cancel_my_booking(p_booking_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.rate_limit_hit('booking.cancel');
  return app_private.cancel_my_booking_impl(p_booking_id, p_reason);
end $$;
revoke all on function public.cancel_my_booking(uuid, text) from public, anon;
grant execute on function public.cancel_my_booking(uuid, text) to authenticated;

create or replace function public.my_ticket_qr(p_booking_id uuid)
returns table (ticket_id uuid, ticket_index smallint, status text, qr_payload text)
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.rate_limit_hit('ticket.qr');
  return query select q.ticket_id, q.ticket_index, q.status, q.qr_payload from app_private.my_ticket_qr_impl(p_booking_id) q;
end $$;
revoke all on function public.my_ticket_qr(uuid) from public, anon;
grant execute on function public.my_ticket_qr(uuid) to authenticated;

create or replace function public.board_ticket(p_trip_id uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.rate_limit_hit('ticket.board');
  return app_private.board_ticket_impl(p_trip_id, p_token);
end $$;
revoke all on function public.board_ticket(uuid, text) from public, anon;
grant execute on function public.board_ticket(uuid, text) to authenticated;
