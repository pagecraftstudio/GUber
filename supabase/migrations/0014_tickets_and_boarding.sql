-- 0014: passenger tickets (one per seat), hashed opaque QR tokens, driver boarding.
--
-- Decisions (from the product owner)
--  * ONE ticket per seat, created by a trigger in the SAME transaction that confirms the booking. Every write path
--    (create_my_booking, staff create_booking, set_booking_status pending->confirmed) is covered because the rule lives
--    on the table, not in an RPC. A ticket is an entitlement to a seat, NOT a seat number (seats are counted, not assigned).
--  * Each ticket has its own random token. The database stores only SHA-256(token). The raw token never touches a table.
--  * Cancelled booking => its not-yet-boarded tickets become void (same transaction). A boarded ticket stays boarded.
--  * Duplicate scan => "already_boarded", no second event. Boarding history records ticket, trip, time, driver, auth user.
--  * Drivers authenticate with Supabase Auth. drivers.user_id (0003) links the auth user to the driver record; the
--    company_users 'driver' role carries trips.read_assigned. Every boarding call re-checks: auth user active, company
--    active/not suspended, membership, driver record active, driver assigned to THAT trip. A disabled driver is refused on
--    the very next call even with a live session. Nothing company/driver related is taken from the client.
--
-- Because only the hash is stored, a QR cannot be re-displayed. my_ticket_qr() therefore issues a FRESH token for every
-- boardable ticket of the caller's booking each time it is called, which invalidates earlier screenshots of that ticket.
-- Trade-off accepted for MVP: no server-side secret, no reversible storage, revocation by construction.
set search_path = public, extensions;

-- =====================================================================================================
-- tables
-- =====================================================================================================
create table tickets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  booking_id uuid not null,
  trip_id uuid not null,
  ticket_index smallint not null check (ticket_index > 0),
  token_hash bytea not null check (octet_length(token_hash) = 32),
  token_issued_at timestamptz not null default now(),
  status text not null default 'valid' check (status in ('valid', 'boarded', 'void')),
  voided_at timestamptz,
  boarded_at timestamptz,
  boarded_by uuid references profiles(id) on delete set null,
  boarded_driver_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (booking_id, ticket_index),
  constraint tickets_booking_fk foreign key (company_id, booking_id) references bookings(company_id, id) on delete restrict,
  constraint tickets_trip_fk    foreign key (company_id, trip_id)    references trips(company_id, id)    on delete restrict,
  constraint tickets_driver_fk  foreign key (company_id, boarded_driver_id) references drivers(company_id, id) on delete restrict,
  constraint tickets_void_ts    check (status <> 'void'    or voided_at is not null),
  constraint tickets_board_ts   check (status <> 'boarded' or (boarded_at is not null and boarded_driver_id is not null))
);
create unique index tickets_token_hash_uq on tickets(token_hash);
create index tickets_trip_idx on tickets(company_id, trip_id, status);

create table boarding_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  ticket_id uuid not null,
  trip_id uuid not null,
  driver_id uuid not null,
  user_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (ticket_id),                                   -- a ticket boards once; the event is its proof
  constraint boarding_ticket_fk foreign key (company_id, ticket_id) references tickets(company_id, id) on delete restrict,
  constraint boarding_trip_fk   foreign key (company_id, trip_id)   references trips(company_id, id)   on delete restrict,
  constraint boarding_driver_fk foreign key (company_id, driver_id) references drivers(company_id, id) on delete restrict
);
create index boarding_events_trip_idx on boarding_events(company_id, trip_id, created_at);

create trigger "000_tenant_guard" before insert or update on tickets         for each row execute function app_private.tenant_guard();
create trigger "000_tenant_guard" before insert or update on boarding_events for each row execute function app_private.tenant_guard();
create trigger forbid_company_id_change before update on tickets         for each row execute function app_private.forbid_company_id_change();
create trigger set_updated_at before update on tickets for each row execute function app_private.set_updated_at();
-- the boarding history is append-only
create trigger forbid_modify_row before update or delete on boarding_events for each row execute function app_private.forbid_modify();
create trigger forbid_modify_stmt before truncate on boarding_events for each statement execute function app_private.forbid_modify();

-- no client ever writes these tables. Staff may read ticket metadata (never the hash); there is no driver or customer table access.
alter table tickets enable row level security;
alter table boarding_events enable row level security;
revoke all on tickets, boarding_events from public, anon, authenticated;
grant select (id, company_id, booking_id, trip_id, ticket_index, status, voided_at, boarded_at, boarded_driver_id, created_at, updated_at)
  on tickets to authenticated;
grant select on boarding_events to authenticated;
create policy tenant_select on tickets         for select to authenticated using (app_private.has_permission(company_id, 'bookings.read'));
create policy tenant_select on boarding_events for select to authenticated using (app_private.has_permission(company_id, 'bookings.read'));
create policy platform_select on tickets         for select to authenticated using (app_private.is_platform_user());
create policy platform_select on boarding_events for select to authenticated using (app_private.is_platform_user());

-- =====================================================================================================
-- token helpers (private; no client can call them)
-- =====================================================================================================
-- 3 x gen_random_uuid() = 366 random bits from the server CSPRNG, base64url, 64 chars. No pgcrypto dependency.
create or replace function app_private.new_ticket_token() returns text
language sql volatile set search_path = '' as $$
  select translate(encode(decode(replace(gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/', '-_')
$$;
create or replace function app_private.ticket_token_hash(p_token text) returns bytea
language sql immutable set search_path = '' as $$ select sha256(convert_to(p_token, 'UTF8')) $$;
revoke all on function app_private.new_ticket_token(), app_private.ticket_token_hash(text) from public, anon, authenticated;

-- how long before departure a driver may start boarding a still-'scheduled' trip
create or replace function app_private.boarding_opens_before() returns interval
language sql immutable set search_path = '' as $$ select interval '2 hours' $$;
revoke all on function app_private.boarding_opens_before() from public, anon, authenticated;

-- =====================================================================================================
-- issue / void tickets with the booking, same transaction, idempotent
-- =====================================================================================================
create or replace function app_private.bookings_tickets() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') then
    insert into public.tickets (company_id, booking_id, trip_id, ticket_index, token_hash)
    select new.company_id, new.id, new.trip_id, g, app_private.ticket_token_hash(app_private.new_ticket_token())
      from generate_series(1, new.seats_count) g
    on conflict (booking_id, ticket_index) do nothing;      -- a retry or a re-confirm can never duplicate tickets
  elsif tg_op = 'UPDATE' and new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    update public.tickets set status = 'void', voided_at = now()
     where booking_id = new.id and company_id = new.company_id and status = 'valid';
  end if;
  return null;
end $$;
create trigger "300_tickets" after insert or update of status on bookings
  for each row execute function app_private.bookings_tickets();

-- backfill: confirmed bookings that already exist (cancelled ones get none)
insert into tickets (company_id, booking_id, trip_id, ticket_index, token_hash)
select b.company_id, b.id, b.trip_id, g, app_private.ticket_token_hash(app_private.new_ticket_token())
  from bookings b cross join lateral generate_series(1, b.seats_count) g
 where b.status = 'confirmed'
on conflict (booking_id, ticket_index) do nothing;

-- =====================================================================================================
-- customer: my tickets, and a fresh QR for them
-- =====================================================================================================
create or replace function public.my_tickets(p_booking_id uuid default null)
returns table (id uuid, booking_id uuid, trip_id uuid, ticket_index smallint, status text, boarded_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select k.id, k.booking_id, k.trip_id, k.ticket_index, k.status, k.boarded_at
    from public.tickets k join public.bookings b on b.company_id = k.company_id and b.id = k.booking_id
   where b.customer_id in (select app_private.my_customer_ids())
     and (p_booking_id is null or k.booking_id = p_booking_id)
   order by k.booking_id, k.ticket_index
$$;
revoke all on function public.my_tickets(uuid) from public, anon;
grant execute on function public.my_tickets(uuid) to authenticated;

create or replace function public.my_ticket_qr(p_booking_id uuid)
returns table (ticket_id uuid, ticket_index smallint, status text, qr_payload text)
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); b public.bookings%rowtype; v_trip_status text; k record; v_token text;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into b from public.bookings bk where bk.id = p_booking_id and bk.customer_id in (select app_private.my_customer_ids());
  if not found then raise exception 'booking not found' using errcode = 'P0002'; end if;
  select t.status into v_trip_status from public.trips t where t.id = b.trip_id and t.company_id = b.company_id;
  if b.status <> 'confirmed' or v_trip_status not in ('scheduled', 'boarding', 'in_progress') then
    raise exception 'tickets are not available for this booking' using errcode = '23514'; end if;

  for k in select tk.id, tk.ticket_index, tk.status from public.tickets tk
            where tk.booking_id = b.id and tk.company_id = b.company_id and tk.status in ('valid', 'boarded')
            order by tk.ticket_index for update of tk loop
    ticket_id := k.id; ticket_index := k.ticket_index; status := k.status; qr_payload := null;
    if k.status = 'valid' then
      v_token := app_private.new_ticket_token();
      update public.tickets set token_hash = app_private.ticket_token_hash(v_token), token_issued_at = now() where id = k.id;
      qr_payload := 'MALAKY:TICKET:' || v_token;
    end if;
    return next;
  end loop;
end $$;
revoke all on function public.my_ticket_qr(uuid) from public, anon;
grant execute on function public.my_ticket_qr(uuid) to authenticated;

-- =====================================================================================================
-- driver: authorization gate, assigned trips, stats, boarding
-- =====================================================================================================
-- Returns the trip row iff the CALLER is the active driver assigned to it. Everything is derived from auth.uid().
-- Unknown trip, someone else's trip, another company's trip, disabled driver, suspended company: all answer 'trip not found'.
create or replace function app_private.driver_trip(p_trip_id uuid, p_lock boolean default false) returns public.trips
language plpgsql security definer set search_path = '' as $$
declare t public.trips%rowtype;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_lock then select * into t from public.trips x where x.id = p_trip_id for update;
  else select * into t from public.trips x where x.id = p_trip_id; end if;
  if not found
     or not app_private.has_permission(t.company_id, 'trips.read_assigned')    -- active membership + active profile + active company
     or not app_private.is_my_driver(t.company_id, t.driver_id) then            -- driver record active, linked to me, assigned to this trip
    raise exception 'trip not found' using errcode = 'P0002'; end if;
  return t;
end $$;
revoke all on function app_private.driver_trip(uuid, boolean) from public, anon, authenticated;

create or replace function app_private.trip_boarding_stats(p_company uuid, p_trip uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('expected', count(*) filter (where status in ('valid', 'boarded')),
                            'boarded',  count(*) filter (where status = 'boarded'),
                            'remaining', count(*) filter (where status = 'valid'))
    from public.tickets where company_id = p_company and trip_id = p_trip
$$;
revoke all on function app_private.trip_boarding_stats(uuid, uuid) from public, anon, authenticated;

create or replace function public.driver_my_trips()
returns table (trip_id uuid, company_name text, origin_name text, destination_name text, departure_at timestamptz,
               arrival_at timestamptz, status text, expected bigint, boarded bigint, remaining bigint)
language sql stable security definer set search_path = '' as $$
  select t.id, c.name, r.origin_name, r.destination_name, t.departure_at, t.arrival_at, t.status,
         count(k.*) filter (where k.status in ('valid', 'boarded')),
         count(k.*) filter (where k.status = 'boarded'),
         count(k.*) filter (where k.status = 'valid')
    from public.trips t
    join public.companies c on c.id = t.company_id
    join public.routes r    on r.company_id = t.company_id and r.id = t.route_id
    left join public.tickets k on k.company_id = t.company_id and k.trip_id = t.id
   where auth.uid() is not null
     and t.status in ('scheduled', 'boarding', 'in_progress')
     and t.departure_at < now() + interval '2 days'
     and app_private.has_permission(t.company_id, 'trips.read_assigned')
     and app_private.is_my_driver(t.company_id, t.driver_id)
   group by t.id, c.name, r.origin_name, r.destination_name
   order by t.departure_at
$$;
revoke all on function public.driver_my_trips() from public, anon;
grant execute on function public.driver_my_trips() to authenticated;

create or replace function public.driver_trip_boarding(p_trip_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t public.trips%rowtype;
begin
  t := app_private.driver_trip(p_trip_id);
  return app_private.trip_boarding_stats(t.company_id, t.id) || jsonb_build_object('trip_id', t.id, 'trip_status', t.status);
end $$;
revoke all on function public.driver_trip_boarding(uuid) from public, anon;
grant execute on function public.driver_trip_boarding(uuid) to authenticated;

create or replace function public.board_ticket(p_trip_id uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.trips%rowtype; k public.tickets%rowtype; v_status text;
  v_tok text := trim(coalesce(p_token, '')); v_prefix constant text := 'MALAKY:TICKET:';
  v_stats jsonb;
begin
  t := app_private.driver_trip(p_trip_id, true);          -- authz first, then trip row lock (same order as cancel_my_booking: trip -> booking/ticket)

  if t.status not in ('scheduled', 'boarding', 'in_progress') then
    raise exception 'trip is closed for boarding' using errcode = '23514'; end if;
  if t.status = 'scheduled' and now() < t.departure_at - app_private.boarding_opens_before() then
    raise exception 'boarding has not opened yet' using errcode = '23514'; end if;

  if left(v_tok, length(v_prefix)) = v_prefix then v_tok := substr(v_tok, length(v_prefix) + 1); end if;
  if length(v_tok) < 20 or length(v_tok) > 200 or v_tok !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'invalid ticket' using errcode = 'P0002'; end if;

  select * into k from public.tickets x where x.token_hash = app_private.ticket_token_hash(v_tok) for update;
  -- unknown token and another company's ticket are indistinguishable
  if not found or k.company_id <> t.company_id then raise exception 'invalid ticket' using errcode = 'P0002'; end if;
  if k.trip_id <> t.id then raise exception 'ticket is for another trip' using errcode = '23514'; end if;

  select b.status into v_status from public.bookings b where b.id = k.booking_id and b.company_id = k.company_id;
  if k.status = 'void' or v_status is distinct from 'confirmed' then
    raise exception 'ticket is cancelled' using errcode = '23514'; end if;

  if k.status = 'boarded' then
    return jsonb_build_object('result', 'already_boarded', 'ticket_index', k.ticket_index, 'boarded_at', k.boarded_at)
           || app_private.trip_boarding_stats(t.company_id, t.id);
  end if;

  update public.tickets set status = 'boarded', boarded_at = now(), boarded_by = auth.uid(), boarded_driver_id = t.driver_id where id = k.id
    returning * into k;
  insert into public.boarding_events (company_id, ticket_id, trip_id, driver_id, user_id) values (t.company_id, k.id, t.id, t.driver_id, auth.uid());
  if t.status = 'scheduled' then update public.trips set status = 'boarding' where id = t.id; end if;   -- first scan opens boarding

  perform app_private.write_audit('company_user', t.company_id, 'ticket.boarded', 'ticket', k.id,
    jsonb_build_object('trip_id', t.id, 'booking_id', k.booking_id, 'ticket_index', k.ticket_index));
  v_stats := app_private.trip_boarding_stats(t.company_id, t.id);
  return jsonb_build_object('result', 'boarded', 'ticket_index', k.ticket_index, 'boarded_at', k.boarded_at) || v_stats;
end $$;
revoke all on function public.board_ticket(uuid, text) from public, anon;
grant execute on function public.board_ticket(uuid, text) to authenticated;
