#!/usr/bin/env bash
# Shuttle S4b intake race. Real concurrent sessions, so it cannot be a SQL suite. DB prepared with migrations + 01 fixtures.
# Usage: DB=bus_sql ./shuttle-intake-race.sh   (leaves its own fixtures behind; ids 87xx/88xx)
#   1. DEPART vs DECIDE:   a staff confirm and the departure sweep race on a request at the station the bus is leaving, 12 times ->
#                          final status is always no_show or expired (never a stranded confirmed), counters 0, drift empty.
#   2. REQUEST vs DEPART:  a customer request for the departing station races the departure, 12 times -> the request is either
#                          refused (station_passed) or swept (expired); never left requested/confirmed, counters 0.
#   3. CANCEL vs CONFIRM:  the customer cancels while staff confirms, 12 times -> always cancelled, counters 0.
#   4. JOB vs DECIDE:      the expiry job races a confirm on an overdue request, 12 times -> expired with counters 0, or confirmed with
#                          the seats held (no half state); drift empty either way.
#   5. REQUEST STORM:      12 concurrent requests with one key -> one booking, every call answers the same booking.
set -u
DB="${DB:-bus}"; PSQL="${PSQL:-psql}"
A=00000000-0000-4000-8000-000000000101
MGR=00000000-0000-4000-8000-000000000003; BKG=00000000-0000-4000-8000-000000000005
u() { printf '00000000-0000-4000-8000-%012d' "$1"; }
fail=0; ok() { echo "PASS  $1"; }; bad() { echo "FAIL  $1"; fail=1; }
sql() { $PSQL -q -At -d "$DB" "$@"; }
call() { # $1 jwt sub, $2 SQL expression returning jsonb, $3 key to print; prints the field, or the sqlstate on error
  $PSQL -q -At -d "$DB" 2>&1 <<SQL | grep -oE 'RESULT [0-9A-Za-z_]+' | head -1 | cut -d' ' -f2
set role authenticated; select set_config('request.jwt.claim.sub','$1',false);
do \$\$ begin raise notice 'RESULT %', ($2) ->> '$3'; exception when others then raise notice 'RESULT %', sqlstate; end \$\$;
SQL
}
clear_rl() { sql -c "delete from app_private.rate_limit_counters" >/dev/null; }
bk() { sql -c "select id from public.shuttle_bookings where request_key = '$1'"; }
st() { sql -c "select status from public.shuttle_bookings where request_key = '$1'"; }

F=$(sql -c "select coalesce(bool_value::text,'null') from plan_entitlements where key='feature_shuttle_ops' and plan_id=(select id from plans where code='professional')")
M=$(sql -c "select coalesce(int_value::text,'null') from plan_entitlements where key='max_shuttle_vehicles' and plan_id=(select id from plans where code='professional')")
ent() { sql -c "select coalesce(int_value::text,'null') from plan_entitlements where key='$1' and plan_id=(select id from plans where code='professional')"; }
MB=$(ent max_buses); MD=$(ent max_drivers)
sql <<SQL >/dev/null
update plan_entitlements set int_value = 200 where key in ('max_buses','max_drivers') and plan_id=(select id from plans where code='professional');
update plan_entitlements set bool_value = true where key='feature_shuttle_ops' and plan_id=(select id from plans where code='professional');
update plan_entitlements set int_value = 60 where key='max_shuttle_vehicles' and plan_id=(select id from plans where code='professional');
insert into auth.users (id, email) select ('00000000-0000-4000-8000-' || lpad((8800 + n)::text, 12, '0'))::uuid, 'r87-' || n || '@test.dev' from generate_series(1, 14) n on conflict do nothing;
insert into routes (id, company_id, name, origin_name, destination_name) values ('$(u 8701)','$A','R87 route','a','b');
insert into route_stops (id, company_id, route_id, name, stop_order, stop_type)
  select ('00000000-0000-4000-8000-' || lpad((8710 + s)::text, 12, '0'))::uuid, '$A', '$(u 8701)', 'R87 stop ' || s, s, 'both' from generate_series(1, 3) s;
insert into shuttle_services (id, company_id, route_id, name, outbound_direction, allow_reverse) values ('$(u 8801)','$A','$(u 8701)','R87 shuttle','forward', true);
insert into buses (id, company_id, plate_number, capacity, status) select ('00000000-0000-4000-8000-' || lpad((8900 + n)::text, 12, '0'))::uuid, '$A', 'R87-' || n, 4, 'active' from generate_series(1, 48) n;
insert into drivers (id, company_id, full_name, phone, status) select ('00000000-0000-4000-8000-' || lpad((8950 + n)::text, 12, '0'))::uuid, '$A', 'R87 driver ' || n, '+2010008' || lpad((7000 + n)::text, 4, '0'), 'active' from generate_series(1, 48) n;
SQL
veh() { echo "jsonb_build_object('bus_id','$(u $((8900 + $1)))','driver_id','$(u $((8950 + $1)))','direction','forward','start_station_idx',0)"; }
vehs=""; for n in $(seq 1 48); do vehs="$vehs${vehs:+,}$(veh $n)"; done
TODAY="(now() at time zone coalesce((select timezone from public.company_settings where company_id = '$A'), 'UTC'))::date"
r=$(call $MGR "jsonb_build_object('r', public.shuttle_start_day('$(u 8801)'::uuid, $TODAY, jsonb_build_array($vehs), 'r87-day') ->> 'replayed')" r)
[ "$r" = false ] && ok "setup: day started with 48 buses" || { bad "setup: day ($r)"; exit 1; }
DAY=$(sql -c "select id from public.shuttle_operating_days where service_id = '$(u 8801)' and status <> 'cancelled'")
run() { sql -c "select id from public.shuttle_runs where day_id = '$DAY' and run_no = $1"; }
sess() { sql -c "select id from public.shuttle_vehicle_sessions where day_id = '$DAY' and vehicle_id = '$(u $((8900 + $1)))'"; }
cust() { sql -c "insert into public.customers (id, company_id, full_name, phone) values ('$(u $((8960 + $1)))','$A','R87 cust $1','+2010008' || lpad((8000 + $1)::text, 4, '0')) on conflict do nothing" >/dev/null; }
drift() { sql -c "select count(*) from app_private.shuttle_segment_drift() d where d.run_id in (select id from public.shuttle_runs where day_id = '$DAY')"; }
seg() { sql -c "select string_agg(confirmed_seats::text, ',' order by seg_idx) from public.shuttle_run_segments where run_id = '$(run $1)'"; }
# bus n -> run n (run_no n). Opens loading only: the current station still takes requests until the bus departs.
ready() { sql -c "select 1" >/dev/null; call $MGR "public.shuttle_open_loading('$(sess $1)'::uuid, 'ready', 'r87-ol-$1')" outcome >/dev/null; }
OUT=$(mktemp -d)
# direct request row: used when the test needs a request that already exists on the run
addreq() { # run_no from to seats key
  sql -c "insert into public.shuttle_bookings (company_id, day_id, run_id, customer_id, from_pos, to_pos, seats, request_key) values ('$A','$DAY','$(run $1)','$(u 8961)',$2,$3,$4,'$5')" >/dev/null; }
cust 1

# ============================================================ 1. depart vs decide (runs 1..12)
good=0
for i in $(seq 1 12); do
  ready $i; addreq $i 0 2 2 "r87-dd-$i"; B=$(bk "r87-dd-$i"); clear_rl
  ( call $MGR "public.shuttle_decide_booking('$B'::uuid, 'confirm', 'r87-dd-c-$i')" outcome > "$OUT/dc$i" ) &
  ( call $MGR "public.shuttle_depart('$(sess $i)'::uuid, 'loading', 'r87-dd-d-$i')" state > "$OUT/dp$i" ) &
  wait
  s=$(st "r87-dd-$i")
  if { [ "$s" = no_show ] || [ "$s" = expired ]; } && [ "$(seg $i)" = "0,0" ]; then good=$((good + 1)); else echo "odd: round $i status=$s seg=$(seg $i) decide=$(cat $OUT/dc$i) depart=$(cat $OUT/dp$i)"; fi
done
[ "$good" = 12 ] && [ "$(drift)" = 0 ] && ok "depart vs decide x12: always no_show or expired, counters 0, drift empty" || bad "depart vs decide: $good/12 consistent, drift $(drift)"

ready 28; clear_rl
[ "$(call "$(u 8803)" "public.shuttle_request_booking('$(run 28)'::uuid, 0, 2, 1, 'R87 Sanity', '+201000890003', 'r87-sanity')" state)" = awaiting_confirmation ] && ok "sanity: a request on a loading, not yet departed run is accepted" || bad "sanity: request refused before any departure"
# ============================================================ 2. request vs depart (runs 13..24)
good=0; refused=0; swept=0
for i in $(seq 13 24); do
  n=$((i - 12)); ready $i; clear_rl; K="r87-rd-$i"
  ( call "$(u $((8800 + n)))" "public.shuttle_request_booking('$(run $i)'::uuid, 0, 2, 1, 'R87 Cust $n', '+2010008$((1000 + n))', '$K')" state > "$OUT/rq$i" ) &
  ( call $MGR "public.shuttle_depart('$(sess $i)'::uuid, 'loading', 'r87-rd-d-$i')" state > "$OUT/rp$i" ) &
  wait
  s=$(st "$K"); a=$(cat "$OUT/rq$i")
  if [ -z "$s" ] && [ "$a" = 23514 ]; then refused=$((refused + 1)); good=$((good + 1))
  elif [ "$s" = expired ]; then swept=$((swept + 1)); good=$((good + 1))
  else echo "odd: round $i status='$s' request=$a depart=$(cat $OUT/rp$i)"; fi
done
printf 'request vs depart: %s refused, %s swept\n' "$refused" "$swept"
[ "$good" = 12 ] && [ "$(seg 13)" = "0,0" ] && [ "$(drift)" = 0 ] && ok "request vs depart x12: refused (station_passed) or swept, never stranded, drift empty" || bad "request vs depart: $good/12"

# ============================================================ 3. customer cancel vs confirm (run 25)
good=0
for i in $(seq 1 12); do
  clear_rl
  call "$(u 8804)" "public.shuttle_request_booking('$(run 25)'::uuid, 0, 1, 1, 'R87 Canceller', '+201000890004', 'r87-cc-$i')" state >/dev/null
  B=$(bk "r87-cc-$i"); CU=$(u 8804); clear_rl
  ( call $MGR "public.shuttle_decide_booking('$B'::uuid, 'confirm', 'r87-cc-c-$i')" outcome > "$OUT/cf$i" ) &
  ( call "$CU" "public.shuttle_cancel_my_booking('$B'::uuid, 'r87-cc-m-$i')" outcome > "$OUT/cm$i" ) &
  wait
  s=$(st "r87-cc-$i")
  if [ "$s" = cancelled ] && [ "$(seg 25)" = "0,0" ]; then good=$((good + 1))
  elif [ "$s" = confirmed ] && [ "$(seg 25)" = "1,0" ]; then bad "round $i: customer cancel lost to confirm and left the booking confirmed (cancel=$(cat $OUT/cm$i))"
  else echo "odd: round $i status=$s seg=$(seg 25) confirm=$(cat $OUT/cf$i) cancel=$(cat $OUT/cm$i)"; fi
done
[ "$good" = 12 ] && [ "$(seg 25)" = "0,0" ] && [ "$(drift)" = 0 ] && ok "cancel vs confirm x12: counters always match the final status" || bad "cancel vs confirm: $good/12, seg=$(seg 25)"

# ============================================================ 4. expiry job vs decide (run 26)
good=0; exp=0; conf=0
for i in $(seq 1 12); do
  addreq 26 0 1 1 "r87-jb-$i"; B=$(bk "r87-jb-$i"); clear_rl
  sql -c "update public.shuttle_bookings set expires_at = now() - interval '1 minute' where id = '$B'" >/dev/null
  ( call $MGR "public.shuttle_decide_booking('$B'::uuid, 'confirm', 'r87-jb-c-$i')" outcome > "$OUT/jc$i" ) &
  ( sql -c "select app_private.expire_shuttle_requests()" > "$OUT/jj$i" 2>&1 ) &
  wait
  s=$(st "r87-jb-$i"); sg=$(seg 26)
  if [ "$s" = expired ] && [ "$sg" = "0,0" ]; then exp=$((exp + 1)); good=$((good + 1))
  elif [ "$s" = confirmed ] && [ "$sg" = "1,0" ]; then conf=$((conf + 1)); good=$((good + 1)); call $MGR "public.shuttle_cancel_booking('$B'::uuid, 'r87-jb-x-$i', 'race')" outcome >/dev/null
  else echo "odd: round $i status=$s seg=$sg decide=$(cat $OUT/jc$i) job=$(cat $OUT/jj$i)"; fi
done
printf 'job vs decide: %s expired, %s confirmed\n' "$exp" "$conf"
[ "$good" = 12 ] && [ "$(drift)" = 0 ] && ok "job vs decide x12: expired with 0 seats or confirmed with seats held, drift empty" || bad "job vs decide: $good/12"

# ============================================================ 5. request storm, one key (run 27)
clear_rl
for n in 1 2 3 4 5 6 7 8 9 10 11 12; do
  ( call "$(u 8802)" "public.shuttle_request_booking('$(run 27)'::uuid, 0, 1, 1, 'R87 Storm', '+201000890001', 'r87-storm')" booking_id > "$OUT/s$n" ) &
done; wait
ids=$(cat "$OUT"/s? | sort -u | wc -l); cnt=$(sql -c "select count(*) from public.shuttle_bookings where request_key = 'r87-storm'")
[ "$cnt" = 1 ] && [ "$ids" = 1 ] && ok "request storm x12 with one key: one booking, every call answered it" || bad "request storm: $cnt bookings, $ids distinct answers ($(cat "$OUT"/s? | sort | uniq -c | tr '\n' ' '))"
[ "$(seg 27)" = "0,0" ] && ok "a request never touches the counters" || bad "request moved counters: $(seg 27)"

sql -c "update plan_entitlements set bool_value = $F where key='feature_shuttle_ops' and plan_id=(select id from plans where code='professional')" >/dev/null
sql -c "update plan_entitlements set int_value = $M where key='max_shuttle_vehicles' and plan_id=(select id from plans where code='professional')" >/dev/null
sql -c "update plan_entitlements set int_value = $MB where key='max_buses' and plan_id=(select id from plans where code='professional')" >/dev/null
sql -c "update plan_entitlements set int_value = $MD where key='max_drivers' and plan_id=(select id from plans where code='professional')" >/dev/null
rm -rf "$OUT"; clear_rl
exit $fail
