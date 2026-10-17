#!/usr/bin/env bash
# F1 regression, lock channel: Company A must not be able to take (or wait on) Company B's advisory lock.
# Needs a DB prepared with migrations + 01_helpers_fixtures.sql. Usage: DB=bus ./lock-oracle.sh
set -u
DB="${DB:-bus}"; PSQL="${PSQL:-psql}"
B=00000000-0000-4000-8000-000000000102; OWNER_A=00000000-0000-4000-8000-000000000002; OWNER_B=00000000-0000-4000-8000-000000000007
# session 1 (trusted) holds the exact lock enforce_limit() takes for Company B / max_buses
$PSQL -q -d "$DB" -c "select pg_advisory_lock(hashtextextended('$B' || 'max_buses', 0)); select pg_sleep(8);" >/dev/null 2>&1 &
HOLDER=$!; sleep 1
probe() { # $1 = jwt sub
  $PSQL -q -At -d "$DB" <<SQL 2>&1 | grep -oE '42501|55P03|53400' | head -1
set role authenticated; select set_config('request.jwt.claim.sub','$1',false); set lock_timeout='1200ms';
do \$\$ begin
  begin insert into public.buses (company_id, plate_number, capacity) values ('$B', 'LOCK-PROBE', 5);
  exception when others then raise exception '%', sqlstate; end;
end \$\$;
SQL
}
A_RES=$(probe "$OWNER_A"); B_RES=$(probe "$OWNER_B")
kill $HOLDER 2>/dev/null; wait $HOLDER 2>/dev/null
echo "Company A probing B's lock : $A_RES"; echo "Company B (control)        : $B_RES"
if [[ "$A_RES" == *42501* && "$B_RES" == *55P03* ]]; then echo "PASS  guard fires before the advisory lock (A: 42501 immediately; control B blocked on the lock)"; exit 0
else echo "FAIL  lock oracle (expected A=42501, control B=55P03)"; exit 1; fi
