-- 0028: regular (weekly) trips. A trip template says "route R, departs 07:30 on Sun/Mon/Tue, bus B, driver D".
-- generate_template_trips() turns the template into real trips for the next N days.
--
-- WHY: the trip_templates table and trips.template_id existed since 0003 but nothing could create trips from them.
-- DESIGN:
--   * Authorization derived from the signed-in user: trips.write on the TEMPLATE's company. Other tenant = "not found".
--   * Dates are walked in the company time zone (company_settings.timezone), so 07:30 stays 07:30 across DST changes.
--   * Idempotent: unique index trips_template_departure_uq makes a second run skip trips that already exist.
--   * A trip with bus AND driver is created 'scheduled' (bookable). Otherwise it is created 'draft' (constraint trips_assigned_when_live).
--   * A day that conflicts with another trip of the bus/driver (exclusion constraints, 0027) is SKIPPED and counted, never forced.
--   * The monthly plan limit (trigger 200_month_limit) stops generation; trips created so far are kept and the result says so.
--   * Horizon is capped at 60 days. Past departures are never generated.
-- ROLLBACK: drop function public.generate_template_trips(uuid, integer);   (generated trips stay; they are normal trips)
-- RUNNER NOTE: apply only with scripts/db/apply-migrations.sh (staging first). Immutable once applied.
set search_path = public, extensions;

create or replace function public.generate_template_trips(p_template_id uuid, p_days integer default 28)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_company uuid; tpl public.trip_templates%rowtype;
  v_tz text; v_today date; v_from date; v_through date; v_day date;
  v_dep timestamptz; v_status text; v_created int := 0; v_existing int := 0; v_conflicts int := 0;
  v_limit_reached boolean := false; v_inserted int;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select t.company_id into v_company from public.trip_templates t where t.id = p_template_id;
  if v_company is null or not app_private.has_permission(v_company, 'trips.write') then
    raise exception 'template not found' using errcode = 'P0002'; end if;
  select * into tpl from public.trip_templates t where t.id = p_template_id and t.company_id = v_company for update;
  if not tpl.is_active then raise exception 'template is not active' using errcode = '23514'; end if;

  select coalesce(s.timezone, 'UTC') into v_tz from public.company_settings s where s.company_id = v_company;
  v_tz := coalesce(v_tz, 'UTC');
  v_today := (now() at time zone v_tz)::date;
  v_from := greatest(tpl.start_date, v_today);
  v_through := v_today + least(greatest(coalesce(p_days, 28), 1), 60);
  if tpl.end_date is not null then v_through := least(v_through, tpl.end_date); end if;
  v_status := case when tpl.bus_id is not null and tpl.driver_id is not null then 'scheduled' else 'draft' end;

  v_day := v_from;
  while v_day <= v_through loop
    if extract(isodow from v_day)::smallint = any (tpl.days_of_week) then
      v_dep := (v_day + tpl.departure_time) at time zone v_tz;
      if v_dep > now() then
        begin
          insert into public.trips (company_id, route_id, bus_id, driver_id, departure_at, arrival_at, template_id, price, capacity, status)
          values (v_company, tpl.route_id, tpl.bus_id, tpl.driver_id, v_dep, v_dep + make_interval(mins => tpl.duration_minutes),
                  tpl.id, tpl.price, tpl.capacity, v_status)
          on conflict (template_id, departure_at) where template_id is not null do nothing;
          get diagnostics v_inserted = row_count;
          if v_inserted = 1 then v_created := v_created + 1; else v_existing := v_existing + 1; end if;
        exception
          when exclusion_violation then v_conflicts := v_conflicts + 1;
          when sqlstate '53400' then v_limit_reached := true; exit;
        end;
      end if;
    end if;
    v_day := v_day + 1;
  end loop;

  if not v_limit_reached then
    update public.trip_templates set generated_through = greatest(coalesce(generated_through, v_through), v_through) where id = tpl.id;
  end if;
  perform app_private.write_audit('company_user', v_company, 'trip.template_generated', 'trip_template', tpl.id,
    jsonb_build_object('created', v_created, 'already_existed', v_existing, 'conflicts', v_conflicts, 'limit_reached', v_limit_reached, 'through', v_through));
  return jsonb_build_object('created', v_created, 'already_existed', v_existing, 'conflicts', v_conflicts,
                            'limit_reached', v_limit_reached, 'through', v_through);
end $$;
revoke all on function public.generate_template_trips(uuid, integer) from public, anon;
grant execute on function public.generate_template_trips(uuid, integer) to authenticated;
