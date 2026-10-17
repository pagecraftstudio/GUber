-- 0012: customer identity (Phase 6). Links a Supabase Auth user to the per-company `customers` rows that belong to
-- the same verified person, so a signed-in customer can see ONLY their own customer rows and bookings.
--
-- Model (decided: Q2 guest + internal profile; recommendation "global account + per-company link"):
--   * one auth user = one profiles row (already exists). Being a customer is NOT a role: it is the existence of
--     customers.user_id = auth.uid(). Customers have no company_users row, hence no staff permission anywhere.
--   * each company keeps ITS OWN customers row (company A never sees company B's customer data). Link is per company.
--   * a customer row is claimed only through claim_my_customer(), and only with a VERIFIED phone from Supabase Auth
--     (auth.users.phone + phone_confirmed_at) that equals the guest row's E.164 phone. The client never supplies a
--     phone, a user id or a customer id for authorization.
--   * claim never CREATES customers (prevents spam rows in any tenant); creation stays in the booking RPCs.
set search_path = public, extensions;

alter table customers add column user_id uuid references profiles(id) on delete set null;
create unique index customers_user_uq on customers(company_id, user_id)
  where user_id is not null and deleted_at is null;
create index customers_user_idx on customers(user_id) where user_id is not null;

-- ---------- user_id is never client-writable (staff with customers.write must not be able to link accounts) ----------
revoke insert, update on customers from authenticated;
grant insert (company_id, full_name, phone, email, university, student_id, notes) on customers to authenticated;
grant update (full_name, phone, email, university, student_id, notes, deleted_at) on customers to authenticated;

-- ---------- helper: customer rows owned by the caller, in companies that are still active ----------
create or replace function app_private.my_customer_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select c.id from public.customers c
  join public.profiles p on p.id = c.user_id and p.is_active
  where c.user_id = auth.uid() and c.deleted_at is null and app_private.is_company_active(c.company_id)
$$;
revoke all on function app_private.my_customer_ids() from public, anon;
grant execute on function app_private.my_customer_ids() to authenticated;

-- a customer may read their OWN customer rows directly (no write path: edits go through update_my_customer)
create policy own_select on customers for select to authenticated
  using (id in (select app_private.my_customer_ids()));

-- ---------- claim ----------
create or replace function public.claim_my_customer(p_company_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_phone text; v_confirmed timestamptz; v_cust public.customers;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.is_active) then
    raise exception 'account disabled' using errcode = '42501';
  end if;
  select u.phone, u.phone_confirmed_at into v_phone, v_confirmed from auth.users u where u.id = v_uid;
  if v_phone is null or v_confirmed is null then
    raise exception 'phone not verified' using errcode = '42501';
  end if;
  -- Supabase stores the verified phone without "+": make it E.164, then the same DB rule as every other phone.
  v_phone := app_private.normalize_phone(case when v_phone like '+%' then v_phone else '+' || v_phone end);

  -- same answer for "company missing / inactive / no guest row": nothing to claim, nothing learned
  select c.* into v_cust from public.customers c
   where c.company_id = p_company_id and c.phone = v_phone and c.deleted_at is null
     and app_private.is_company_active(c.company_id)
   for update;
  if not found then raise exception 'nothing to claim' using errcode = 'P0002'; end if;

  if v_cust.user_id is not null and v_cust.user_id <> v_uid then
    raise exception 'customer already linked to another account' using errcode = '42501';
  end if;
  if v_cust.user_id is null then
    begin
      update public.customers set user_id = v_uid where id = v_cust.id;
    exception when unique_violation then
      raise exception 'account already linked to a customer in this company' using errcode = '23505';
    end;
  end if;
  return jsonb_build_object('customer_id', v_cust.id, 'company_id', v_cust.company_id, 'linked', true);
end $$;
revoke all on function public.claim_my_customer(uuid) from public, anon;
grant execute on function public.claim_my_customer(uuid) to authenticated;

-- ---------- own profile edit: name/email/university/student_id only (phone is the verified identity key) ----------
create or replace function public.update_my_customer(
  p_company_id uuid, p_full_name text default null, p_email text default null,
  p_university text default null, p_student_id text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_name text := nullif(trim(coalesce(p_full_name, '')), '');
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if v_name is not null and length(v_name) > 120 then raise exception 'invalid customer name' using errcode = '22023'; end if;
  select c.id into v_id from public.customers c
   where c.id in (select app_private.my_customer_ids()) and c.company_id = p_company_id for update;
  if v_id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  update public.customers c set
    full_name = coalesce(v_name, c.full_name),
    email = coalesce(nullif(lower(trim(coalesce(p_email, ''))), ''), c.email),
    university = coalesce(nullif(trim(coalesce(p_university, '')), ''), c.university),
    student_id = coalesce(nullif(trim(coalesce(p_student_id, '')), ''), c.student_id),
    updated_at = now()
   where c.id = v_id;
  return jsonb_build_object('customer_id', v_id);
end $$;
revoke all on function public.update_my_customer(uuid, text, text, text, text) from public, anon;
grant execute on function public.update_my_customer(uuid, text, text, text, text) to authenticated;

-- ---------- own bookings: safe columns only (no staff notes, created_by, idempotency key) ----------
create or replace function public.my_bookings(p_company_id uuid default null) returns table (
  id uuid, company_id uuid, reference text, trip_id uuid, seats_count smallint, total_amount numeric, currency char(3),
  status text, payment_status text, created_at timestamptz, cancelled_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.id, b.company_id, b.reference, b.trip_id, b.seats_count, b.total_amount, b.currency, b.status,
         b.payment_status, b.created_at, b.cancelled_at
  from public.bookings b
  where b.customer_id in (select app_private.my_customer_ids())
    and (p_company_id is null or b.company_id = p_company_id)
  order by b.created_at desc
$$;
revoke all on function public.my_bookings(uuid) from public, anon;
grant execute on function public.my_bookings(uuid) to authenticated;
