-- 0032: paid amount per booking + one flat read model for the staff bookings screen.
--
-- Decisions
--  * bookings.amount_paid is the single source of truth for money received. payment_status is DERIVED from it
--    (0 -> unpaid, 0 < x < total -> partial, x >= total -> paid) inside the RPC, so the two can never disagree.
--    'refunded' stays a manual state and is stored with amount_paid = 0 (the audit log keeps what was paid before).
--  * The amount is entered by STAFF (bookings.write) through set_booking_amount_paid(). It is bounded by the booking's
--    own total_amount, which is immutable. Customers and the public API cannot set it. company is derived from the
--    booking row, never from the caller.
--  * booking_list is a SECURITY INVOKER view: it runs with the caller's rights, so the RLS of bookings, trips, routes,
--    customers and tickets all still apply (an operations user without customers.read sees customer_* as null).
--    It exists so the dashboard can filter, search and sort on trip / customer / boarding columns in one query.
--  * booking_payments (per-payment ledger) stays unused. A single editable amount is what the product asked for.
--    If audit-grade payment history is needed later, a ledger can feed amount_paid without changing this API.
--
-- ROLLBACK (data in amount_paid is lost; payment_status keeps its last derived value):
--   drop view if exists public.booking_list;
--   drop function if exists public.set_booking_amount_paid(uuid, numeric);
--   -- re-run the body of public.set_booking_payment_status from 0010_booking_rpcs.sql (create or replace)
--   alter table public.bookings drop constraint if exists bookings_amount_paid_range;
--   alter table public.bookings drop column if exists amount_paid;
set search_path = public, extensions;

-- ---------- column ----------
alter table bookings add column amount_paid numeric(12,2) not null default 0;

-- Backfill from the old manual status. 'paid' = everything. 'partial' has NO recorded amount, so it cannot be guessed:
-- it stays 'partial' with amount_paid = 0 until staff enter the real figure (flagged in the report).
update bookings set amount_paid = total_amount where payment_status = 'paid';

alter table bookings add constraint bookings_amount_paid_range check (amount_paid >= 0 and amount_paid <= total_amount);

-- ---------- set_booking_amount_paid ----------
create or replace function public.set_booking_amount_paid(p_booking_id uuid, p_amount numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_company uuid; b public.bookings%rowtype; v_status text;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_amount is null or p_amount < 0 or p_amount <> round(p_amount, 2) then
    raise exception 'invalid amount' using errcode = '22023'; end if;
  select bk.company_id into v_company from public.bookings bk where bk.id = p_booking_id;
  if v_company is null or not app_private.has_permission(v_company, 'bookings.write') then
    raise exception 'booking not found' using errcode = 'P0002'; end if;
  select * into b from public.bookings bk where bk.id = p_booking_id for update;
  if p_amount > b.total_amount then raise exception 'amount exceeds booking total' using errcode = '23514'; end if;
  if b.status = 'cancelled' and p_amount > 0 then
    raise exception 'booking cannot be cancelled in its current state' using errcode = '23514'; end if;

  v_status := case
    when p_amount >= b.total_amount and p_amount > 0 then 'paid'
    when p_amount > 0 then 'partial'
    when b.payment_status = 'refunded' then 'refunded'
    else 'unpaid' end;
  -- a zero-total booking has nothing to collect: treat as paid
  if b.total_amount = 0 then v_status := 'paid'; end if;

  update public.bookings set amount_paid = p_amount, payment_status = v_status where id = p_booking_id;
  perform app_private.write_audit('company_user', v_company, 'booking.amount_paid', 'booking', b.id,
    jsonb_build_object('from_amount', b.amount_paid, 'to_amount', p_amount, 'from', b.payment_status, 'to', v_status));
  return jsonb_build_object('id', b.id, 'amount_paid', p_amount, 'payment_status', v_status, 'total_amount', b.total_amount);
end $$;
revoke all on function public.set_booking_amount_paid(uuid, numeric) from public, anon;
grant execute on function public.set_booking_amount_paid(uuid, numeric) to authenticated;

-- ---------- set_booking_payment_status keeps working, but now keeps amount_paid consistent ----------
create or replace function public.set_booking_payment_status(p_booking_id uuid, p_payment_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_company uuid; b public.bookings%rowtype; v_amount numeric(12,2);
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_payment_status not in ('unpaid', 'partial', 'paid', 'refunded') then raise exception 'invalid payment status' using errcode = '22023'; end if;
  select bk.company_id into v_company from public.bookings bk where bk.id = p_booking_id;
  if v_company is null or not app_private.has_permission(v_company, 'bookings.write') then
    raise exception 'booking not found' using errcode = 'P0002'; end if;
  select * into b from public.bookings bk where bk.id = p_booking_id for update;
  if b.status = 'cancelled' and p_payment_status in ('partial', 'paid') then
    raise exception 'booking cannot be cancelled in its current state' using errcode = '23514'; end if;
  v_amount := case p_payment_status
    when 'paid' then b.total_amount
    when 'partial' then b.amount_paid
    else 0 end;
  if p_payment_status = 'partial' and not (v_amount > 0 and v_amount < b.total_amount) then
    raise exception 'partial payment needs an amount between 0 and the total: use set_booking_amount_paid' using errcode = '23514'; end if;
  update public.bookings set payment_status = p_payment_status, amount_paid = v_amount where id = p_booking_id;
  perform app_private.write_audit('company_user', v_company, 'booking.payment_status', 'booking', b.id,
    jsonb_build_object('from', b.payment_status, 'to', p_payment_status, 'from_amount', b.amount_paid, 'to_amount', v_amount));
  return jsonb_build_object('id', b.id, 'payment_status', p_payment_status, 'amount_paid', v_amount);
end $$;
revoke all on function public.set_booking_payment_status(uuid, text) from public, anon;
grant execute on function public.set_booking_payment_status(uuid, text) to authenticated;

-- ---------- booking_list: flat read model for the dashboard ----------
create or replace view public.booking_list with (security_invoker = true) as
select b.id, b.company_id, b.reference, b.trip_id, b.customer_id, b.seats_count, b.unit_price, b.total_amount, b.amount_paid,
       b.currency, b.status, b.payment_status, b.source, b.notes, b.created_at,
       t.departure_at as trip_departure_at, t.status as trip_status, t.route_id, r.name as route_name,
       c.full_name as customer_name, c.phone as customer_phone, c.email::text as customer_email,
       c.student_id as customer_student_id, c.university as customer_university,
       coalesce(k.total, 0)::int as tickets_total, coalesce(k.boarded, 0)::int as tickets_boarded,
       case when coalesce(k.total, 0) = 0 or coalesce(k.boarded, 0) = 0 then 'not_boarded'
            when k.boarded >= k.total then 'boarded'
            else 'partial' end as boarding_status
  from public.bookings b
  left join public.trips t     on t.company_id = b.company_id and t.id = b.trip_id
  left join public.routes r    on r.company_id = t.company_id and r.id = t.route_id
  left join public.customers c on c.company_id = b.company_id and c.id = b.customer_id
  left join lateral (
    select count(*) filter (where tk.status <> 'void') as total, count(*) filter (where tk.status = 'boarded') as boarded
      from public.tickets tk where tk.company_id = b.company_id and tk.booking_id = b.id
  ) k on true;
revoke all on public.booking_list from public, anon;
grant select on public.booking_list to authenticated;

comment on view public.booking_list is 'Staff bookings read model. SECURITY INVOKER: RLS of every underlying table applies to the caller.';
