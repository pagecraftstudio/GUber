#!/usr/bin/env bash
# S2 shuttle start-day race. Needs REAL concurrent sessions, so it cannot be a SQL suite. Needs a DB prepared with migrations,
# 01_helpers_fixtures.sql and suite 70 (service u(7101), route u(7001) with 3 stops). Usage: DB=bus_sql ./shuttle-day-race.sh
#   1. Two managers start the SAME service date at once with different keys and different buses: exactly one wins (23505 for the other).
#   2. Two presses with the SAME key and the same bus at once (double press): both answer ok, one day and one session exist.
set -u
DB="${DB:-bus}"; PSQL="${PSQL:-psql}"
MGR_A=00000000-0000-4000-8000-000000000003; OPS_A=00000000-0000-4000-8000-000000000004
SVC=00000000-0000-4000-8000-000000007101; A=00000000-0000-4000-8000-000000000101
fail=0; ok() { echo "PASS  $1"; }; bad() { echo "FAIL  $1"; fail=1; }
sql() { $PSQL -q -At -d "$DB" "$@"; }
u() { printf '00000000-0000-4000-8000-%012d' "$1"; }
call() { # $1 jwt sub, $2 SQL expression; prints sqlstate or ok
  $PSQL -q -At -d "$DB" 2>&1 <<SQL | grep -oE 'RESULT [0-9A-Z]+|RESULT ok' | head -1 | cut -d' ' -f2
set role authenticated; select set_config('request.jwt.claim.sub','$1',false);
do \$\$ begin perform $2; raise notice 'RESULT ok'; exception when others then raise notice 'RESULT %', sqlstate; end \$\$;
SQL
}
start_expr() { # $1 bus no, $2 driver no, $3 key
  echo "public.shuttle_start_day('$SVC', (now() at time zone coalesce((select timezone from public.company_settings where company_id = '$A'),'UTC'))::date + 1, jsonb_build_array(jsonb_build_object('bus_id','$(u $1)','driver_id','$(u $2)','start_station_idx',0,'direction','forward')), '$3')"
}
SAVED=$(sql -c "select coalesce(bool_value::text,'null') || '|' || coalesce(int_value::text,'null') from plan_entitlements where key='feature_shuttle_ops' and plan_id=(select id from plans where code='professional')")
sql <<SQL >/dev/null
update plan_entitlements set bool_value = true where key = 'feature_shuttle_ops' and plan_id = (select id from plans where code = 'professional');
update plan_entitlements set int_value = null where key = 'max_shuttle_vehicles' and plan_id = (select id from plans where code = 'professional');
insert into buses (id, company_id, plate_number, capacity, status) values ('$(u 7071)','$A','R-1',10,'active'),('$(u 7072)','$A','R-2',10,'active') on conflict do nothing;
insert into drivers (id, company_id, full_name, phone, status) values ('$(u 7071)','$A','R driver 1','+201000007071','active'),('$(u 7072)','$A','R driver 2','+201000007072','active') on conflict do nothing;
SQL
count_days() { sql -c "select count(*) from shuttle_operating_days where service_id = '$SVC' and status <> 'cancelled' and service_date = (now() at time zone coalesce((select timezone from company_settings where company_id = '$A'),'UTC'))::date + 1"; }
reset_tomorrow() { sql <<SQL >/dev/null
update shuttle_vehicle_sessions set state = 'completed' where day_id in (select id from shuttle_operating_days where service_id = '$SVC' and status = 'open' and service_date = (now() at time zone coalesce((select timezone from company_settings where company_id = '$A'),'UTC'))::date + 1);
update shuttle_runs set status = 'aborted' where day_id in (select id from shuttle_operating_days where service_id = '$SVC' and status = 'open' and service_date = (now() at time zone coalesce((select timezone from company_settings where company_id = '$A'),'UTC'))::date + 1);
update shuttle_operating_days set status = 'cancelled', cancelled_reason = 'race test reset' where service_id = '$SVC' and status = 'open' and service_date = (now() at time zone coalesce((select timezone from company_settings where company_id = '$A'),'UTC'))::date + 1;
SQL
}
reset_tomorrow

# ---- 1. different keys, different buses, same date
T1=$(mktemp); T2=$(mktemp)
call $MGR_A "$(start_expr 7071 7071 race-a)" > "$T1" &
call $OPS_A "$(start_expr 7072 7072 race-b)" > "$T2" &
wait
R1=$(cat "$T1"); R2=$(cat "$T2"); rm -f "$T1" "$T2"
{ [ "$R1" = ok ] && [ "$R2" = 23505 ]; } || { [ "$R1" = 23505 ] && [ "$R2" = ok ]; } && ok "double start: exactly one wins, the other gets 23505 ($R1 / $R2)" || bad "double start: got $R1 / $R2"
[ "$(count_days)" = 1 ] && ok "double start: one day row" || bad "double start: $(count_days) day rows"
[ "$(sql -c "select count(*) from shuttle_vehicle_sessions s join shuttle_operating_days d on d.id = s.day_id where d.service_id = '$SVC' and d.status = 'open' and s.state <> 'completed' and s.vehicle_id in ('$(u 7071)','$(u 7072)')")" = 1 ] && ok "double start: one live session among the two buses" || bad "double start: wrong session count"
reset_tomorrow

# ---- 2. same key, same bus, double press
T1=$(mktemp); T2=$(mktemp)
call $MGR_A "$(start_expr 7071 7071 press-1)" > "$T1" &
call $MGR_A "$(start_expr 7071 7071 press-1)" > "$T2" &
wait
R1=$(cat "$T1"); R2=$(cat "$T2"); rm -f "$T1" "$T2"
{ [ "$R1" = ok ] && [ "$R2" = ok ]; } && ok "double press: both answer ok (one replays)" || bad "double press: got $R1 / $R2"
[ "$(count_days)" = 1 ] && ok "double press: one day row" || bad "double press: $(count_days) day rows"
[ "$(sql -c "select count(*) from shuttle_vehicle_sessions s join shuttle_operating_days d on d.id = s.day_id where d.service_id = '$SVC' and d.status = 'open' and s.state <> 'completed' and s.vehicle_id = '$(u 7071)'")" = 1 ] && ok "double press: one session" || bad "double press: wrong session count"
reset_tomorrow

# ---- restore
IFS='|' read -r FB FI <<<"$SAVED"
sql <<SQL >/dev/null
update plan_entitlements set bool_value = $( [ "$FB" = null ] && echo null || echo "$FB" ) where key = 'feature_shuttle_ops' and plan_id = (select id from plans where code = 'professional');
update plan_entitlements set int_value = $( [ "$FI" = null ] && echo null || echo "$FI" ) where key = 'max_shuttle_vehicles' and plan_id = (select id from plans where code = 'professional');
SQL
[ $fail = 0 ] && echo "shuttle-day-race: all passed" || echo "shuttle-day-race: FAILED"
exit $fail
