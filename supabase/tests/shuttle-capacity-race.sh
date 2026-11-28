#!/usr/bin/env bash
# Shuttle S4a capacity race. Real concurrent sessions, so it cannot be a SQL suite. DB prepared with migrations + 01 fixtures.
# Usage: DB=bus_sql ./shuttle-capacity-race.sh   (leaves its own fixtures behind; ids 77xx)
#   1. LAST SEAT:        capacity 4, 3 seats confirmed, 8 different requests (1 seat each) confirmed at once -> exactly ONE confirmed, 7 no_capacity.
#   2. SAME BOOKING:     8 staff confirm the SAME request with different keys -> one confirmed, 7 already_processed; the seats are held ONCE.
#   3. SAME KEY:         8 identical calls (retry storm) -> all answer confirmed, one decision row, seats held once.
#   4. CANCEL vs CONFIRM: confirm and cancel race on one request, 10 times -> the counters always equal what the final status says.
#   5. RANDOM STORM:     200 random confirm / reject / cancel calls on 30 overlapping requests, 8 at a time, 3 different staff users ->
#                        no error, every segment 0..capacity, stored counters = recompute (drift empty) at the end.
#   6. DECIDE vs CANCEL DAY: confirm (needs the run lock) against shuttle_cancel_day (day -> session locks) never deadlocks.
set -u
DB="${DB:-bus}"; PSQL="${PSQL:-psql}"
A=00000000-0000-4000-8000-000000000101
MGR=00000000-0000-4000-8000-000000000003; BKG=00000000-0000-4000-8000-000000000005; OWN=00000000-0000-4000-8000-000000000002
USERS=($MGR $BKG $OWN)
u() { printf '00000000-0000-4000-8000-%012d' "$1"; }
fail=0; ok() { echo "PASS  $1"; }; bad() { echo "FAIL  $1"; fail=1; }
sql() { $PSQL -q -At -d "$DB" "$@"; }
call() { # $1 jwt sub, $2 SQL expression returning jsonb; prints the outcome, or the sqlstate on error
  $PSQL -q -At -d "$DB" 2>&1 <<SQL | grep -oE 'RESULT [0-9A-Za-z_]+' | head -1 | cut -d' ' -f2
set role authenticated; select set_config('request.jwt.claim.sub','$1',false);
do \$\$ begin raise notice 'RESULT %', ($2) ->> 'outcome'; exception when others then raise notice 'RESULT %', sqlstate; end \$\$;
SQL
}
clear_rl() { sql -c "delete from app_private.rate_limit_counters" >/dev/null; }
decide() { call "$1" "public.shuttle_decide_booking('$2'::uuid, '$3', '$4')"; }
cancel() { call "$1" "public.shuttle_cancel_booking('$2'::uuid, '$3', 'race')"; }
bk() { sql -c "select id from public.shuttle_bookings where request_key = '$1'"; }

F=$(sql -c "select coalesce(bool_value::text,'null') from plan_entitlements where key='feature_shuttle_ops' and plan_id=(select id from plans where code='professional')")
M=$(sql -c "select coalesce(int_value::text,'null') from plan_entitlements where key='max_shuttle_vehicles' and plan_id=(select id from plans where code='professional')")
sql <<SQL >/dev/null
update plan_entitlements set bool_value = true where key='feature_shuttle_ops' and plan_id=(select id from plans where code='professional');
update plan_entitlements set int_value = 40 where key='max_shuttle_vehicles' and plan_id=(select id from plans where code='professional');
insert into routes (id, company_id, name, origin_name, destination_name) values ('$(u 7701)','$A','R77 route','a','b'), ('$(u 7702)','$A','R77 route 2','a','c');
insert into route_stops (id, company_id, route_id, name, stop_order, stop_type)
  select ('00000000-0000-4000-8000-' || lpad((7710 + r * 10 + s)::text, 12, '0'))::uuid, '$A', ('00000000-0000-4000-8000-' || lpad((7700 + r)::text, 12, '0'))::uuid, 'R77 stop ' || r || '-' || s, s, 'both'
  from generate_series(1, 2) r, generate_series(1, 4) s;
insert into shuttle_services (id, company_id, route_id, name, outbound_direction, allow_reverse) values
  ('$(u 7801)','$A','$(u 7701)','R77 shuttle','forward', true), ('$(u 7802)','$A','$(u 7702)','R77 shuttle 2','forward', true);
insert into buses (id, company_id, plate_number, capacity, status) select ('00000000-0000-4000-8000-' || lpad((7900 + n)::text, 12, '0'))::uuid, '$A', 'R77-' || n, 4, 'active' from generate_series(1, 8) n;
insert into drivers (id, company_id, full_name, phone, status) select ('00000000-0000-4000-8000-' || lpad((7950 + n)::text, 12, '0'))::uuid, '$A', 'R77 driver ' || n, '+2010007' || lpad((7000 + n)::text, 4, '0'), 'active' from generate_series(1, 8) n;
insert into customers (id, company_id, full_name, phone) select ('00000000-0000-4000-8000-' || lpad((7960 + n)::text, 12, '0'))::uuid, '$A', 'R77 cust ' || n, '+2010007' || lpad((8000 + n)::text, 4, '0') from generate_series(1, 40) n;
SQL
# day 1: 5 buses (runs 1..5), day 2 (service 2): 1 bus
veh() { echo "jsonb_build_object('bus_id','$(u $((7900 + $1)))','driver_id','$(u $((7950 + $1)))','direction','forward','start_station_idx',0)"; }
TODAY="(now() at time zone coalesce((select timezone from public.company_settings where company_id = '$A'), 'UTC'))::date"
r1=$(call $MGR "jsonb_build_object('outcome', public.shuttle_start_day('$(u 7801)'::uuid, $TODAY, jsonb_build_array($(veh 1),$(veh 2),$(veh 3),$(veh 4),$(veh 5)), 'r77-day-1') ->> 'replayed')")
r2=$(call $MGR "jsonb_build_object('outcome', public.shuttle_start_day('$(u 7802)'::uuid, $TODAY, jsonb_build_array($(veh 6)), 'r77-day-2') ->> 'replayed')")
[ "$r1" = false ] && [ "$r2" = false ] && ok "setup: two days started" || { bad "setup: days ($r1/$r2)"; exit 1; }
DAY1=$(sql -c "select id from public.shuttle_operating_days where service_id = '$(u 7801)' and status <> 'cancelled'")
run() { sql -c "select id from public.shuttle_runs where day_id = '$DAY1' and run_no = $1"; }
addbk() { # run_no from to seats key customer-n
  sql -c "insert into public.shuttle_bookings (company_id, day_id, run_id, customer_id, from_pos, to_pos, seats, request_key) values ('$A','$DAY1','$(run $1)','$(u $((7960 + $6)))',$2,$3,$4,'$5')" >/dev/null; }
seg() { sql -c "select string_agg(confirmed_seats::text, ',' order by seg_idx) from public.shuttle_run_segments where run_id = '$(run $1)'"; }
drift() { sql -c "select count(*) from app_private.shuttle_segment_drift() d where d.run_id in (select id from public.shuttle_runs where day_id = '$DAY1')"; }
OUT=$(mktemp -d)

# ============================================================ 1. last seat
addbk 1 0 3 3 r77-ls-base 1; clear_rl; [ "$(decide $MGR $(bk r77-ls-base) confirm r77-ls-base-k)" = confirmed ] || bad "setup: base booking"
for n in 1 2 3 4 5 6 7 8; do addbk 1 0 3 1 "r77-ls-$n" $((n + 1)); done
for n in 1 2 3 4 5 6 7 8; do ( decide ${USERS[$((n % 3))]} "$(bk r77-ls-$n)" confirm "r77-ls-k-$n" > "$OUT/l$n" ) & done; wait
c=$(cat "$OUT"/l* | grep -c '^confirmed$'); nc=$(cat "$OUT"/l* | grep -c '^no_capacity$'); o=$(cat "$OUT"/l* | grep -vc -e '^confirmed$' -e '^no_capacity$')
printf 'last seat: %s confirmed, %s no_capacity, %s other; segments %s\n' "$c" "$nc" "$o" "$(seg 1)"
[ "$c" = 1 ] && [ "$nc" = 7 ] && [ "$o" = 0 ] && [ "$(seg 1)" = "4,4,4" ] && [ "$(drift)" = 0 ] && ok "last seat: exactly one of 8 wins, counters 4,4,4, drift empty" || bad "last seat race: $(cat "$OUT"/l* | sort | uniq -c | tr '\n' ' ') seg=$(seg 1)"
[ "$(sql -c "select count(*) from public.shuttle_booking_decisions d join public.shuttle_bookings b on b.id = d.booking_id where b.request_key like 'r77-ls-%' and b.request_key <> 'r77-ls-base'")" = 8 ] && ok "all 8 attempts are in the decision log (losers too)" || bad "decision log is missing attempts"

# ============================================================ 2. same booking, different keys
addbk 2 0 2 2 r77-sb 12; clear_rl; B=$(bk r77-sb)
for n in 1 2 3 4 5 6 7 8; do ( decide ${USERS[$((n % 3))]} "$B" confirm "r77-sb-k-$n" > "$OUT/b$n" ) & done; wait
c=$(cat "$OUT"/b* | grep -c '^confirmed$'); ap=$(cat "$OUT"/b* | grep -c '^already_processed$')
[ "$c" = 1 ] && [ "$ap" = 7 ] && [ "$(seg 2)" = "2,2,0" ] && [ "$(drift)" = 0 ] && ok "same booking: one confirmed, 7 already_processed, seats held once (2,2,0)" || bad "same booking: $(cat "$OUT"/b* | sort | uniq -c | tr '\n' ' ') seg=$(seg 2)"

# ============================================================ 3. same key storm
addbk 3 1 3 2 r77-sk 13; clear_rl; B=$(bk r77-sk)
for n in 1 2 3 4 5 6 7 8; do ( decide $MGR "$B" confirm "r77-sk-key-0001" > "$OUT/k$n" ) & done; wait
[ "$(cat "$OUT"/k* | grep -c '^confirmed$')" = 8 ] && [ "$(seg 3)" = "0,2,2" ] && [ "$(sql -c "select count(*) from public.shuttle_booking_decisions where booking_id = '$B'")" = 1 ] && ok "same key x8: all confirmed, one decision row, seats once" || bad "key storm: $(cat "$OUT"/k* | sort | uniq -c | tr '\n' ' ') seg=$(seg 3)"

# ============================================================ 4. cancel vs confirm
okc=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  addbk 4 0 2 2 "r77-cc-$i" $((13 + i)); B=$(bk "r77-cc-$i"); clear_rl
  ( decide $MGR "$B" confirm "r77-cc-d-$i" > "$OUT/cd$i" ) & ( cancel $BKG "$B" "r77-cc-c-$i" > "$OUT/cc$i" ) & wait
  st=$(sql -c "select status from public.shuttle_bookings where id = '$B'")
  # whatever the order, the counter must match the final status; then release for the next round
  if [ "$st" = cancelled ] && [ "$(seg 4)" = "0,0,0" ]; then okc=$((okc + 1))
  elif [ "$st" = confirmed ] && [ "$(seg 4)" = "2,2,0" ]; then okc=$((okc + 1)); cancel $BKG "$B" "r77-cc-c2-$i" >/dev/null
  else echo "odd: status=$st seg=$(seg 4) decide=$(cat $OUT/cd$i) cancel=$(cat $OUT/cc$i)"; fi
done
[ "$okc" = 10 ] && [ "$(seg 4)" = "0,0,0" ] && [ "$(drift)" = 0 ] && ok "cancel vs confirm x10: counters always match the final status" || bad "cancel/confirm: $okc/10 consistent"

# ============================================================ 5. random storm on run 5 (4 stations -> 3 segments, capacity 4)
for i in $(seq 1 30); do f=$((RANDOM % 3)); t=$((f + 1 + RANDOM % (3 - f))); addbk 5 $f $t $((1 + RANDOM % 3)) "r77-rs-$i" $((1 + i % 40)); done
errs=0
for round in $(seq 1 25); do clear_rl
  for w in 1 2 3 4 5 6 7 8; do
    i=$((1 + RANDOM % 30)); B=$(bk "r77-rs-$i"); who=${USERS[$((RANDOM % 3))]}; k="r77-rs-$round-$w"
    case $((RANDOM % 4)) in 0|1) ( decide $who "$B" confirm "$k" > "$OUT/x$w" ) & ;; 2) ( decide $who "$B" reject "$k" > "$OUT/x$w" ) & ;; 3) ( cancel $who "$B" "$k" > "$OUT/x$w" ) & ;; esac
  done; wait
  errs=$((errs + $(cat "$OUT"/x? | grep -vc -e '^confirmed$' -e '^rejected$' -e '^cancelled$' -e '^already_processed$' -e '^no_capacity$' -e '^too_late$' -e '^run_closed$')))
done
over=$(sql -c "select count(*) from public.shuttle_run_segments where run_id = '$(run 5)' and (confirmed_seats < 0 or confirmed_seats > capacity)")
printf 'random storm: %s unexpected answers, segments %s, over/under capacity rows: %s\n' "$errs" "$(seg 5)" "$over"
[ "$errs" = 0 ] && ok "200 random calls: every answer was a normal outcome (no exception)" || bad "random storm raised $errs errors"
[ "$over" = 0 ] && [ "$(drift)" = 0 ] && ok "random storm: counters within 0..capacity and equal to the recompute" || bad "random storm: drift or overbooking ($(drift) drift rows)"

# ============================================================ 6. decide vs cancel day (day 2, bus 6): never a deadlock, never a half state
D2=$(sql -c "select id from public.shuttle_operating_days where service_id = '$(u 7802)' and status = 'open'")
R2=$(sql -c "select id from public.shuttle_runs where day_id = '$D2' and run_no = 1")
sql -c "insert into public.shuttle_bookings (company_id, day_id, run_id, customer_id, from_pos, to_pos, seats, request_key) values ('$A','$D2','$R2','$(u 7961)',0,2,1,'r77-cd-1')" >/dev/null
B=$(bk r77-cd-1); clear_rl
( decide $MGR "$B" confirm r77-cd-d > "$OUT/dd1" ) & ( call $MGR "jsonb_build_object('outcome', 'x', 'r', public.shuttle_cancel_day('$D2'::uuid, 'race cancel'))" > "$OUT/dd2" ) & wait
dd1=$(cat "$OUT/dd1"); dd2=$(cat "$OUT/dd2")
echo "decide=$dd1 cancel_day=$dd2"
case "$dd1" in 57014|40P01) bad "decide vs cancel_day: deadlock/timeout ($dd1)";; *) ok "decide vs cancel_day: no deadlock (decide=$dd1, cancel_day=$dd2)";; esac
[ "$(sql -c "select count(*) from app_private.shuttle_segment_drift() d where d.run_id = '$R2'")" = 0 ] && ok "decide vs cancel_day: no drift on that run" || bad "drift after cancel_day race"

sql -c "update plan_entitlements set bool_value = $F where key='feature_shuttle_ops' and plan_id=(select id from plans where code='professional')" >/dev/null
sql -c "update plan_entitlements set int_value = $M where key='max_shuttle_vehicles' and plan_id=(select id from plans where code='professional')" >/dev/null
rm -rf "$OUT"; clear_rl
[ $fail = 0 ] && echo "ALL PASS" || echo "FAILURES"; exit $fail
