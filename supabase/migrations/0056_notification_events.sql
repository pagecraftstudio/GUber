-- 0056: notification events (P5b, plan section 5.1). All in-app (the only live channel until delivery ships in P5c; push/email rows are not
-- created while those channels are not live). Everything here is a TRIGGER or a scheduled JOB: no existing booking, trip or subscription function is
-- rewritten, so none of their rules can change by accident.
--
--   student   trip.cancelled (mandatory)   trip cancelled: every student whose booking was just cancelled by it
--             trip.changed                  departure time moved: students with a pending/confirmed booking
--             trip.starting_soon            job: 60 min window (15..60) and 15 min window (0..15) before departure
--             trip.not_boarded              job: ticket not yet boarded, 10 min before departure and at departure
--             subscription.requested / approved / rejected / expired    on the status change of the subscription row (any path)
--   staff     company.booking_needs_review            new pending booking waiting for payment (staff with bookings.write)
--             company.subscription_request_pending    new request, plus ONE reminder after 24 h (staff with bookings.write)
--   drivers   company.trip_boarding_soon (30 min), company.students_not_boarded (5 min, count + first names): the trip's driver and staff with trips.write
--   ops       company.trip_starting_soon (15 min): staff with trips.write
--
-- Rules for every event: recipients are people of THAT company only; a suspended/deleted company sends nothing; a deactivated profile gets nothing;
-- every insert carries a dedupe key (event:entity:window), so a job that runs twice or a missed tick creates no duplicate.
-- NOT here: subscription.expiring (the 0041 job and its unique index stay as they are until P5c), company.platform_subscription_expiring,
--   company.student_subscription_expiring digest, platform.company_suspended (next slice).
--
-- ROLLBACK (manual): drop the three triggers and the functions below; delete from app_private.jobs where name in ('notify-trip-windows','notify-pending-requests');
--   delete from notification_templates where company_id is null and key in (the 12 keys); update notification_events set is_live = false where key in (the 12 keys).
-- RUNNER NOTE: requires 0053. Apply before the code that shows these notices (they appear in the existing bell, no code change is needed).

create or replace function app_private.company_is_live(p_company uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.companies c where c.id = p_company and c.deleted_at is null and c.status in ('trial', 'active'))
$$;

-- people of ONE company holding a permission (active membership, active profile, live company)
create or replace function app_private.company_staff_with(p_company uuid, p_permission text) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct cu.user_id
    from public.company_users cu
    join public.profiles p on p.id = cu.user_id and p.is_active
    join public.role_permissions rp on rp.role_id = cu.role_id
    join public.permissions pm on pm.id = rp.permission_id
   where cu.company_id = p_company and cu.status = 'active' and pm.key = p_permission and app_private.company_is_live(p_company)
$$;

-- "Cairo → Galala, 2027-02-01 09:00" in the company's own time zone
create or replace function app_private.trip_label(p_trip uuid) returns text language sql stable security definer set search_path = '' as $$
  select r.origin_name || ' → ' || r.destination_name || ', ' || to_char(t.departure_at at time zone s.timezone, 'YYYY-MM-DD HH24:MI')
    from public.trips t join public.routes r on r.company_id = t.company_id and r.id = t.route_id
    join public.company_settings s on s.company_id = t.company_id where t.id = p_trip
$$;
create or replace function app_private.trip_clock(p_trip uuid) returns text language sql stable security definer set search_path = '' as $$
  select to_char(t.departure_at at time zone s.timezone, 'YYYY-MM-DD HH24:MI') from public.trips t join public.company_settings s on s.company_id = t.company_id where t.id = p_trip
$$;
revoke all on function app_private.company_is_live(uuid), app_private.company_staff_with(uuid, text), app_private.trip_label(uuid), app_private.trip_clock(uuid) from public, anon, authenticated;

-- 1. trips: cancelled / time changed ---------------------------------------------------------------------------------------------------------
create or replace function app_private.notify_trip_changes() returns trigger language plpgsql security definer set search_path = '' as $$
declare r record; v_label text;
begin
  if not app_private.company_is_live(new.company_id) then return null; end if;
  v_label := app_private.trip_label(new.id);
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    -- the status trigger has just cancelled these bookings in this same transaction (same now())
    for r in select distinct c.user_id from public.bookings b join public.customers c on c.company_id = b.company_id and c.id = b.customer_id
              where b.trip_id = new.id and b.company_id = new.company_id and b.status = 'cancelled' and b.cancellation_reason = 'trip cancelled'
                and b.cancelled_at = now() and c.user_id is not null loop
      perform app_private.enqueue_notification('trip.cancelled', r.user_id, new.company_id, jsonb_build_object('trip', v_label), 'trip', new.id,
                                               'trip.cancelled:' || new.id || ':' || r.user_id, '/my-bookings');
    end loop;
  elsif new.departure_at is distinct from old.departure_at and new.status in ('scheduled', 'boarding') and old.status in ('scheduled', 'boarding') then
    for r in select distinct c.user_id from public.bookings b join public.customers c on c.company_id = b.company_id and c.id = b.customer_id
              where b.trip_id = new.id and b.company_id = new.company_id and b.status in ('pending', 'confirmed') and c.user_id is not null loop
      perform app_private.enqueue_notification('trip.changed', r.user_id, new.company_id, jsonb_build_object('trip', v_label, 'time', app_private.trip_clock(new.id)), 'trip', new.id,
                                               'trip.changed:' || new.id || ':' || r.user_id || ':' || extract(epoch from new.departure_at)::bigint, '/my-bookings');
    end loop;
  end if;
  return null;
end $$;
revoke all on function app_private.notify_trip_changes() from public, anon, authenticated;
drop trigger if exists zz_trips_notify on public.trips;
create trigger zz_trips_notify after update of status, departure_at on public.trips for each row
  when (old.status is distinct from new.status or old.departure_at is distinct from new.departure_at) execute function app_private.notify_trip_changes();

-- 2. bookings: a new booking waiting for payment needs a person ------------------------------------------------------------------------------
create or replace function app_private.notify_booking_needs_review() returns trigger language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  for u in select app_private.company_staff_with(new.company_id, 'bookings.write') loop
    perform app_private.enqueue_notification('company.booking_needs_review', u, new.company_id,
      jsonb_build_object('reference', new.reference, 'trip', app_private.trip_label(new.trip_id)), 'booking', new.id, 'company.booking_needs_review:' || new.id || ':' || u, '/dashboard/bookings');
  end loop;
  return null;
end $$;
revoke all on function app_private.notify_booking_needs_review() from public, anon, authenticated;
drop trigger if exists zz_booking_review on public.bookings;
create trigger zz_booking_review after insert on public.bookings for each row
  when (new.status = 'pending' and new.payment_due_at is not null) execute function app_private.notify_booking_needs_review();

-- 3. route subscriptions: request, decision, expiry --------------------------------------------------------------------------------------------
create or replace function app_private.notify_subscription_change() returns trigger language plpgsql security definer set search_path = '' as $$
declare u uuid; v_plan text; v_route text; v_event text;
begin
  select pl.name, r.name into v_plan, v_route from public.route_plans pl join public.routes r on r.company_id = pl.company_id and r.id = pl.route_id
   where pl.company_id = new.company_id and pl.id = new.plan_id;
  if tg_op = 'INSERT' then
    if new.status <> 'pending' or not app_private.company_is_live(new.company_id) then return null; end if;
    perform app_private.enqueue_notification('subscription.requested', new.user_id, new.company_id, jsonb_build_object('plan', v_plan, 'route', v_route),
                                             'route_subscription', new.id, 'subscription.requested:' || new.id, '/my-subscriptions');
    for u in select app_private.company_staff_with(new.company_id, 'bookings.write') loop
      perform app_private.enqueue_notification('company.subscription_request_pending', u, new.company_id,
        jsonb_build_object('plan', v_plan, 'member', new.member_name), 'route_subscription', new.id,
        'company.subscription_request_pending:' || new.id || ':' || u || ':new', '/dashboard/subscriptions');
    end loop;
    return null;
  end if;
  v_event := case when old.status = 'pending' and new.status = 'active' then 'subscription.approved'
                  when old.status = 'pending' and new.status = 'rejected' then 'subscription.rejected'
                  when old.status = 'active' and new.status = 'expired' then 'subscription.expired' end;
  if v_event is null or not app_private.company_is_live(new.company_id) then return null; end if;
  perform app_private.enqueue_notification(v_event, new.user_id, new.company_id,
    jsonb_build_object('plan', v_plan, 'route', v_route, 'until', to_char(new.valid_to, 'YYYY-MM-DD'), 'note', new.decision_note),
    'route_subscription', new.id, v_event || ':' || new.id, '/my-subscriptions');
  return null;
end $$;
revoke all on function app_private.notify_subscription_change() from public, anon, authenticated;
drop trigger if exists zz_subscription_notify on public.route_subscriptions;
drop trigger if exists zz_subscription_notify_ins on public.route_subscriptions;
create trigger zz_subscription_notify_ins after insert on public.route_subscriptions for each row execute function app_private.notify_subscription_change();
create trigger zz_subscription_notify after update of status on public.route_subscriptions for each row
  when (old.status is distinct from new.status) execute function app_private.notify_subscription_change();

-- 4. jobs: time windows before departure --------------------------------------------------------------------------------------------------------
create or replace function app_private.notify_trip_windows() returns integer language plpgsql security definer set search_path = '' as $$
declare t record; r record; u uuid; v_n integer := 0; v_win text; v_count integer; v_names text; v_driver uuid;
begin
  for t in select x.id, x.company_id, x.departure_at, x.driver_id from public.trips x
            where x.status in ('scheduled', 'boarding') and x.departure_at > now() - interval '5 minutes' and x.departure_at <= now() + interval '60 minutes'
              and app_private.company_is_live(x.company_id) loop
    select d.user_id into v_driver from public.drivers d where d.company_id = t.company_id and d.id = t.driver_id;
    -- students: starting soon (60 = 15..60 min, 15 = 0..15 min)
    v_win := case when t.departure_at > now() + interval '15 minutes' then '60' when t.departure_at > now() then '15' end;
    if v_win is not null then
      for r in select distinct c.user_id from public.bookings b join public.customers c on c.company_id = b.company_id and c.id = b.customer_id
                where b.trip_id = t.id and b.company_id = t.company_id and b.status = 'confirmed' and c.user_id is not null loop
        v_n := v_n + app_private.enqueue_notification('trip.starting_soon', r.user_id, t.company_id,
          jsonb_build_object('trip', app_private.trip_label(t.id), 'minutes', v_win), 'trip', t.id, 'trip.starting_soon:' || t.id || ':' || r.user_id || ':' || v_win, '/my-bookings');
      end loop;
    end if;
    -- students: not boarded yet (10 min before and at departure)
    if t.departure_at <= now() + interval '10 minutes' then
      v_win := case when t.departure_at > now() then '10' else '0' end;
      for r in select distinct c.user_id from public.tickets tk join public.bookings b on b.company_id = tk.company_id and b.id = tk.booking_id
                join public.customers c on c.company_id = b.company_id and c.id = b.customer_id
                where tk.trip_id = t.id and tk.company_id = t.company_id and tk.status = 'valid' and b.status = 'confirmed' and c.user_id is not null loop
        v_n := v_n + app_private.enqueue_notification('trip.not_boarded', r.user_id, t.company_id,
          jsonb_build_object('trip', app_private.trip_label(t.id), 'minutes', v_win), 'trip', t.id, 'trip.not_boarded:' || t.id || ':' || r.user_id || ':' || v_win, '/my-bookings');
      end loop;
    end if;
    -- driver + operations: boarding soon (30), starting soon (15, operations only), students not boarded (last 5 min, count + names)
    if t.departure_at > now() and t.departure_at <= now() + interval '30 minutes' then
      for u in select v_driver where v_driver is not null union select app_private.company_staff_with(t.company_id, 'trips.write') loop
        v_n := v_n + app_private.enqueue_notification('company.trip_boarding_soon', u, t.company_id, jsonb_build_object('trip', app_private.trip_label(t.id)), 'trip', t.id,
                                                       'company.trip_boarding_soon:' || t.id || ':' || u, '/dashboard/trips');
      end loop;
    end if;
    if t.departure_at > now() and t.departure_at <= now() + interval '15 minutes' then
      for u in select app_private.company_staff_with(t.company_id, 'trips.write') loop
        v_n := v_n + app_private.enqueue_notification('company.trip_starting_soon', u, t.company_id, jsonb_build_object('trip', app_private.trip_label(t.id)), 'trip', t.id,
                                                       'company.trip_starting_soon:' || t.id || ':' || u, '/dashboard/trips');
      end loop;
    end if;
    if t.departure_at > now() and t.departure_at <= now() + interval '5 minutes' then
      select count(*), string_agg(n, ', ') into v_count, v_names from (
        select distinct on (b.id) c.full_name as n, b.id from public.tickets tk join public.bookings b on b.company_id = tk.company_id and b.id = tk.booking_id
          join public.customers c on c.company_id = b.company_id and c.id = b.customer_id
         where tk.trip_id = t.id and tk.company_id = t.company_id and tk.status = 'valid' and b.status = 'confirmed' order by b.id limit 5) q;
      select count(*) into v_count from public.tickets tk where tk.trip_id = t.id and tk.company_id = t.company_id and tk.status = 'valid';
      if v_count > 0 then
        for u in select v_driver where v_driver is not null union select app_private.company_staff_with(t.company_id, 'trips.write') loop
          v_n := v_n + app_private.enqueue_notification('company.students_not_boarded', u, t.company_id,
            jsonb_build_object('trip', app_private.trip_label(t.id), 'count', v_count, 'names', v_names), 'trip', t.id, 'company.students_not_boarded:' || t.id || ':' || u, '/dashboard/trips');
        end loop;
      end if;
    end if;
  end loop;
  return v_n;
end $$;

-- one reminder for a request still pending after 24 h
create or replace function app_private.notify_pending_requests() returns integer language plpgsql security definer set search_path = '' as $$
declare s record; u uuid; v_n integer := 0;
begin
  for s in select x.id, x.company_id, x.member_name, pl.name as plan from public.route_subscriptions x
             join public.route_plans pl on pl.company_id = x.company_id and pl.id = x.plan_id
            where x.status = 'pending' and x.created_at <= now() - interval '24 hours' and x.created_at > now() - interval '7 days' and app_private.company_is_live(x.company_id) loop
    for u in select app_private.company_staff_with(s.company_id, 'bookings.write') loop
      v_n := v_n + app_private.enqueue_notification('company.subscription_request_pending', u, s.company_id, jsonb_build_object('plan', s.plan, 'member', s.member_name),
                                                    'route_subscription', s.id, 'company.subscription_request_pending:' || s.id || ':' || u || ':24h', '/dashboard/subscriptions');
    end loop;
  end loop;
  return v_n;
end $$;
revoke all on function app_private.notify_trip_windows(), app_private.notify_pending_requests() from public, anon, authenticated;
insert into app_private.jobs (name, fn, every_seconds, stale_after_seconds) values
  ('notify-trip-windows', 'notify_trip_windows', 60, 300), ('notify-pending-requests', 'notify_pending_requests', 600, 1800);

-- 5. catalogue + texts (both languages) -----------------------------------------------------------------------------------------------------------
update notification_events set is_live = true where key in ('trip.cancelled', 'trip.changed', 'trip.starting_soon', 'trip.not_boarded', 'subscription.requested', 'subscription.approved',
  'subscription.rejected', 'subscription.expired', 'company.booking_needs_review', 'company.subscription_request_pending', 'company.trip_boarding_soon', 'company.trip_starting_soon',
  'company.students_not_boarded');
insert into notification_templates (company_id, key, channel, locale, subject, body) values
  (null, 'trip.cancelled', 'in_app', 'en', 'Trip cancelled', 'Your trip {{trip}} was cancelled by the company. Your booking was cancelled and your seats released.'),
  (null, 'trip.cancelled', 'in_app', 'ar', 'أُلغيت الرحلة', 'ألغت الشركة رحلتك {{trip}}. أُلغي حجزك وتم تحرير مقاعدك.'),
  (null, 'trip.changed', 'in_app', 'en', 'Trip time changed', 'Your trip {{trip}} now departs at {{time}}.'),
  (null, 'trip.changed', 'in_app', 'ar', 'تغيّر موعد الرحلة', 'أصبح موعد انطلاق رحلتك {{trip}} الساعة {{time}}.'),
  (null, 'trip.starting_soon', 'in_app', 'en', 'Your trip leaves in {{minutes}} minutes', '{{trip}}. Be at the stop with your ticket.'),
  (null, 'trip.starting_soon', 'in_app', 'ar', 'رحلتك تنطلق بعد {{minutes}} دقيقة', '{{trip}}. كن في المحطة ومعك تذكرتك.'),
  (null, 'trip.not_boarded', 'in_app', 'en', 'You have not boarded yet', '{{trip}} is about to leave and your ticket has not been scanned. Go to the driver now.'),
  (null, 'trip.not_boarded', 'in_app', 'ar', 'لم تصعد بعد', 'رحلتك {{trip}} على وشك الانطلاق ولم تُمسح تذكرتك. توجّه إلى السائق الآن.'),
  (null, 'subscription.requested', 'in_app', 'en', 'Subscription request sent', 'Your request for {{plan}} ({{route}}) was sent. The company will review it.'),
  (null, 'subscription.requested', 'in_app', 'ar', 'تم إرسال طلب الاشتراك', 'تم إرسال طلبك للباقة {{plan}} ({{route}}). ستراجعه الشركة.'),
  (null, 'subscription.approved', 'in_app', 'en', 'Subscription approved', 'Your {{plan}} subscription ({{route}}) is active until {{until}}. Eligible trips are free for you.'),
  (null, 'subscription.approved', 'in_app', 'ar', 'تمت الموافقة على اشتراكك', 'اشتراكك {{plan}} ({{route}}) فعّال حتى {{until}}. الرحلات المشمولة مجانية لك.'),
  (null, 'subscription.rejected', 'in_app', 'en', 'Subscription not approved', 'Your request for {{plan}} ({{route}}) was not approved. {{note}}'),
  (null, 'subscription.rejected', 'in_app', 'ar', 'لم تتم الموافقة على الاشتراك', 'لم تتم الموافقة على طلبك للباقة {{plan}} ({{route}}). {{note}}'),
  (null, 'subscription.expired', 'in_app', 'en', 'Subscription ended', 'Your {{plan}} subscription ({{route}}) ended. Request a renewal to ride free again.'),
  (null, 'subscription.expired', 'in_app', 'ar', 'انتهى الاشتراك', 'انتهى اشتراكك {{plan}} ({{route}}). اطلب التجديد لتعود للركوب مجانًا.'),
  (null, 'company.booking_needs_review', 'in_app', 'en', 'Booking waiting for payment: {{reference}}', '{{trip}}. Record the payment when it arrives, or it is cancelled automatically.'),
  (null, 'company.booking_needs_review', 'in_app', 'ar', 'حجز بانتظار الدفع: {{reference}}', '{{trip}}. سجّل الدفع عند وصوله وإلا يُلغى الحجز تلقائيًا.'),
  (null, 'company.subscription_request_pending', 'in_app', 'en', 'Subscription request to review', '{{member}} requested {{plan}}. Approve or reject it.'),
  (null, 'company.subscription_request_pending', 'in_app', 'ar', 'طلب اشتراك للمراجعة', 'طلب {{member}} الباقة {{plan}}. وافق عليه أو ارفضه.'),
  (null, 'company.trip_boarding_soon', 'in_app', 'en', 'Boarding opens soon', '{{trip}} leaves in 30 minutes or less.'),
  (null, 'company.trip_boarding_soon', 'in_app', 'ar', 'اقترب موعد الصعود', 'الرحلة {{trip}} تنطلق خلال ٣٠ دقيقة أو أقل.'),
  (null, 'company.trip_starting_soon', 'in_app', 'en', 'Trip leaves in 15 minutes', '{{trip}}.'),
  (null, 'company.trip_starting_soon', 'in_app', 'ar', 'الرحلة تنطلق بعد ١٥ دقيقة', '{{trip}}.'),
  (null, 'company.students_not_boarded', 'in_app', 'en', 'Passengers not boarded: {{count}}', '{{trip}}. Not boarded yet: {{names}}.'),
  (null, 'company.students_not_boarded', 'in_app', 'ar', 'ركاب لم يصعدوا بعد: {{count}}', '{{trip}}. لم يصعد بعد: {{names}}.')
on conflict do nothing;
