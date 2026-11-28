#!/usr/bin/env bash
# S3 shuttle leg-engine races. Needs REAL concurrent sessions, so it cannot be a SQL suite. Needs a DB prepared with migrations + 01 fixtures.
# Self-contained: creates its own route, service, buses and drivers (ids 75xx/76xx). Usage: DB=bus_sql ./shuttle-leg-race.sh
#   1. DOUBLE PRESS: the same depart key from two sessions at once -> both ok (one replays), exactly one leg.
#   2. TWO PEOPLE: driver-side and manager-side press depart at once with DIFFERENT keys -> exactly one ok, the other is a stale state; one leg.
#   3. CANCEL vs START: shuttle_cancel_day races open_loading -> exactly one wins, never both, never a deadlock (40P01).
#   4. STRESS: 6 buses, 2 callers each, open -> depart -> arrive all at once -> no deadlock, one leg per bus, all arrived.
set -u
DB="${DB:-bus}"; PSQL="${PSQL:-psql}"
A=00000000-0000-4000-8000-000000000101
MGR=00000000-0000-4000-8000-000000000003; OPS=00000000-0000-4000-8000-000000000004
SVC=00000000-0000-4000-8000-000000007601
fail=0; ok() { echo "PASS  $1"; }; bad() { echo "FAIL  $1"; fail=1; }
sql() { $PSQL -q -At -d "$DB" "$@"; }
u() { printf '00000000-0000-4000-8000-%012d' "$1"; }
call() { # $1 jwt sub, $2 SQL expression; prints sqlstate or ok
  $PSQL -q -At -d "$DB" 2>&1 <<SQL | grep -oE 'RESULT [0-9A-Z]+|RESULT ok' | head -1 | cut -d' ' -f2
set role authenticated; select set_config('request.jwt.claim.sub','$1',false);
do \$\$ begin perform $2; raise notice 'RESULT ok'; exception when others then raise notice 'RESULT %', sqlstate; end \$\$;
SQL
}
TODAY="(now() at time zone coalesce((select timezone from public.company_settings where company_id = '$A'),'UTC'))::date"
sid() { echo "(select id from public.shuttle_vehicle_sessions where vehicle_id = '$(u $1)' order by created_at desc limit 1)"; }
SAVED=$(sql -c "select coalesce(bool_value::text,'null') || '|' || coalesce(int_value::text,'null') from plan_entitlements where key='feature_shuttle_ops' and plan_id=(select id from plans where code='professional')")
SAVEDV=$(sql -c "select coalesce(int_value::text,'null') from plan_entitlements where key='max_shuttle_vehicles' and plan_id=(select id from plans where code='professional')")
sql <<SQL >/dev/null
update plan_entitlements set bool_value = true where key = 'feature_shuttle_ops' and plan_id = (select id from plans where code = 'professional');
update plan_entitlements set int_value = null where key = 'max_shuttle_vehicles' and plan_id = (select id from plans where code = 'professional');
insert into routes (id, company_id, name, origin_name, destination_name) values ('$(u 7501)','$A','LR route','A','C') on conflict do nothing;
insert into route_stops (id, company_id, route_id, name, stop_order, stop_type) select v.id, '$A', '$(u 7501)', v.name, v.ord, 'both' from (values ('$(u 7511)'::uuid,'LR 1',1),('$(u 7512)'::uuid,'LR 2',2),('$(u 7513)'::uuid,'LR 3',3)) v(id, name, ord) where not exists (select 1 from route_stops r where r.id = v.id);
insert into shuttle_services (id, company_id, route_id, name) values ('$SVC','$A','$(u 7501)','LR service') on conflict do nothing;
insert into buses (id, company_id, plate_number, capacity, status) select ('00000000-0000-4000-8000-' || lpad((7550 + n)::text, 12, '0'))::uuid, '$A', 'LR-' || n, 20, 'active' from generate_series(1, 9) n on conflict do nothing;
insert into drivers (id, company_id, full_name, phone, status) select ('00000000-0000-4000-8000-' || lpad((7560 + n)::text, 12, '0'))::uuid, '$A', 'LR driver ' || n, '+2010000075' || lpad(n::text, 2, '0'), 'active' from generate_series(1, 9) n on conflict do nothing;
SQL
reset_day() { sql <<SQL >/dev/null
set session_replication_role = replica;
update shuttle_vehicle_sessions set state = 'completed' where day_id in (select id from shuttle_operating_days where service_id = '$SVC' and status <> 'cancelled');
update shuttle_assignments set effective_to = now() where session_id in (select s.id from shuttle_vehicle_sessions s join shuttle_operating_days d on d.id = s.day_id where d.service_id = '$SVC') and effective_to is null;
update shuttle_runs set status = 'aborted' where day_id in (select id from shuttle_operating_days where service_id = '$SVC' and status <> 'cancelled') and status in ('planned','active');
update shuttle_operating_days set status = 'cancelled', cancelled_reason = 'race test reset' where service_id = '$SVC' and status <> 'cancelled';
set session_replication_role = origin;
delete from app_private.rate_limit_counters;
SQL
}
start_day() { # bus numbers...
  local list="" b
  for b in "$@"; do list="$list${list:+,}jsonb_build_object('bus_id','$(u $((7550 + b)))','driver_id','$(u $((7560 + b)))','start_station_idx',0,'direction','forward')"; done
  [ "$(call $MGR "public.shuttle_start_day('$SVC', $TODAY, jsonb_build_array($list), 'lr-$$-$RANDOM')")" = ok ] || { bad "setup: start day"; }
}
reset_day

# ---- 1. double press
start_day 1; B1=$(sid 7551)
[ "$(call $MGR "public.shuttle_open_loading($B1, 'ready', 'o1')")" = ok ] || bad "setup: open"
T1=$(mktemp); T2=$(mktemp)
call $MGR "public.shuttle_depart($B1, 'loading', 'dep-1')" > "$T1" & call $MGR "public.shuttle_depart($B1, 'loading', 'dep-1')" > "$T2" & wait
R1=$(cat "$T1"); R2=$(cat "$T2"); rm -f "$T1" "$T2"
{ [ "$R1" = ok ] && [ "$R2" = ok ]; } && ok "double press: both ok (one replays)" || bad "double press: $R1 / $R2"
[ "$(sql -c "select count(*) from shuttle_legs where session_id = $B1")" = 1 ] && ok "double press: exactly one leg" || bad "double press: wrong leg count"
reset_day

# ---- 2. two people, different keys
start_day 2; B2=$(sid 7552)
[ "$(call $MGR "public.shuttle_open_loading($B2, 'ready', 'o2')")" = ok ] || bad "setup: open 2"
T1=$(mktemp); T2=$(mktemp)
call $MGR "public.shuttle_depart($B2, 'loading', 'dep-m')" > "$T1" & call $OPS "public.shuttle_depart($B2, 'loading', 'dep-o')" > "$T2" & wait
R1=$(cat "$T1"); R2=$(cat "$T2"); rm -f "$T1" "$T2"
{ { [ "$R1" = ok ] && [ "$R2" = P0001 ]; } || { [ "$R1" = P0001 ] && [ "$R2" = ok ]; }; } && ok "two people: exactly one wins, the other is stale ($R1 / $R2)" || bad "two people: $R1 / $R2"
[ "$(sql -c "select count(*) from shuttle_legs where session_id = $B2")" = 1 ] && ok "two people: exactly one leg" || bad "two people: wrong leg count"
reset_day

# ---- 3. cancel the day while a bus opens loading
start_day 3 4; B3=$(sid 7553); D3=$(sql -c "select day_id from shuttle_vehicle_sessions where id = $B3")
T1=$(mktemp); T2=$(mktemp)
call $MGR "public.shuttle_cancel_day('$D3', 'race test cancel')" > "$T1" & call $OPS "public.shuttle_open_loading($B3, 'ready', 'o3')" > "$T2" & wait
R1=$(cat "$T1"); R2=$(cat "$T2"); rm -f "$T1" "$T2"
{ { [ "$R1" = ok ] && [ "$R2" != ok ] && [ "$R2" != 40P01 ]; } || { [ "$R1" = 23514 ] && [ "$R2" = ok ]; }; } && ok "cancel vs open: exactly one wins, no deadlock (cancel=$R1 open=$R2)" || bad "cancel vs open: cancel=$R1 open=$R2"
reset_day

# ---- 4. stress
start_day 1 2 3 4 5 6
T=$(mktemp -d); i=0
for b in 1 2 3 4 5 6; do
  S=$(sid $((7550 + b)))
  (
    call $MGR "public.shuttle_open_loading($S, 'ready', 'st-o-$b')" > /dev/null
    { call $MGR "public.shuttle_depart($S, 'loading', 'st-d-$b-m')" > "$T/d$b-m" & call $OPS "public.shuttle_depart($S, 'loading', 'st-d-$b-o')" > "$T/d$b-o" & wait; }
    { call $MGR "public.shuttle_arrive($S, 'in_transit', 'st-a-$b-m')" > "$T/a$b-m" & call $OPS "public.shuttle_arrive($S, 'in_transit', 'st-a-$b-o')" > "$T/a$b-o" & wait; } ) &
done
wait
dead=$(cat "$T"/* 2>/dev/null | grep -c 40P01)
[ "$dead" = 0 ] && ok "stress: no deadlock" || bad "stress: $dead deadlocks"
[ "$(sql -c "select count(*) from shuttle_vehicle_sessions s join shuttle_operating_days d on d.id = s.day_id where d.service_id = '$SVC' and d.status = 'open' and s.state = 'arrived' and s.station_idx = 1")" = 6 ] && ok "stress: all 6 buses arrived at position 1" || bad "stress: not all buses arrived"
[ "$(sql -c "select count(*) from shuttle_legs l join shuttle_vehicle_sessions s on s.id = l.session_id join shuttle_operating_days d on d.id = s.day_id where d.service_id = '$SVC' and d.status = 'open'")" = 6 ] && ok "stress: exactly one leg per bus" || bad "stress: leg count wrong"
rm -rf "$T"
reset_day

IFS='|' read -r FB FI <<<"$SAVED"
sql <<SQL >/dev/null
update plan_entitlements set bool_value = $( [ "$FB" = null ] && echo null || echo "$FB" ) where key = 'feature_shuttle_ops' and plan_id = (select id from plans where code = 'professional');
update plan_entitlements set int_value = $( [ "$SAVEDV" = null ] && echo null || echo "$SAVEDV" ) where key = 'max_shuttle_vehicles' and plan_id = (select id from plans where code = 'professional');
SQL
[ $fail = 0 ] && echo "shuttle-leg-race: all passed" || echo "shuttle-leg-race: FAILED"
exit $fail
