#!/usr/bin/env bash
# Everything provable WITHOUT a live Supabase project: local Postgres 16 + PostgREST 12. NOT live Supabase validation.
# Needs: psql as a Postgres superuser (PSQL=...), a postgrest binary (POSTGREST=/path), Node deps installed.
# Isolation: three throw-away databases, each rebuilt from migrations, so no suite sees another suite's data:
#   bus_sql  SQL assertion suites 02..16 + lock oracle
#   bus_int  PostgREST integration: services + booking (pristine, website unpublished)
#   bus_web  PostgREST integration: customer-web (seeded by tests/integration/seed-customer-web.sql)
#   bus_idem PostgREST integration: customer idempotency + cancellation (seed-customer-web + seed-customer-idempotency)
#   bus_rl   PostgREST integration: rate limiting with real policy values (seed-customer-web + seed-tickets)
set -uo pipefail
cd "$(dirname "$0")/.."
PSQL="${PSQL:-psql}"; POSTGREST="${POSTGREST:-postgrest}"; export PSQL
SECRET="0123456789abcdef0123456789abcdef0123"; PORT=3100; fail=0
step() { echo; echo "== $*"; }

serve() { # $1 = database
  pkill -9 -x postgrest 2>/dev/null; sleep 1
  cat > /tmp/pgrst.conf <<CONF
db-uri = "postgres://authenticator:pw@127.0.0.1:5432/$1"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$SECRET"
server-port = $PORT
CONF
  setsid nohup "$POSTGREST" /tmp/pgrst.conf >/tmp/pgrst.log 2>&1 &
  for _ in $(seq 1 20); do curl -sf -m 2 -X POST "http://127.0.0.1:$PORT/rpc/public_search_trips" -H 'content-type: application/json' -d '{}' >/dev/null && return 0; sleep 0.5; done
  echo "PostgREST did not come up for $1"; tail -3 /tmp/pgrst.log; return 1
}
itest() { PGRST_URL="http://127.0.0.1:$PORT" PGRST_JWT_SECRET="$SECRET" VITE_CONFIG_NATIVE_IGNORE_WARNING=true npx vitest run -c vitest.integration.config.ts "$@"; }

step "unit + typecheck"
npx tsc --noEmit; rc=$?; echo "tsc exit $rc"; [ $rc = 0 ] || fail=1
npx vitest run src; rc=$?; echo "vitest exit $rc"; [ $rc = 0 ] || fail=1

step "SQL suites on bus_sql"
DB=bus_sql bash tests/integration/reset-db.sh >/dev/null || fail=1
for f in 02_tests 03_auth_tests 04_tenant_guard_tests 05_booking_tests 06_trip_machine_tests 07_customer_identity_tests 08_customer_booking_web_tests 09_idempotency_cancel_tests 10_tickets_boarding_tests 11_platform_foundation_tests 12_platform_overview_tests 13_company_management_tests 14_subscription_management_tests 15_audit_logs_tests 16_rate_limit_tests 17_lifecycle_policy_tests; do
  $PSQL -q -d bus_sql -f "supabase/tests/$f.sql" > "/tmp/$f.log" 2>&1 || true
  p=$($PSQL -tA -d bus_sql -c "select count(*) filter (where ok) from t.results"); n=$($PSQL -tA -d bus_sql -c "select count(*) filter (where not ok) from t.results")
  echo "$f: cumulative passed=$p failed=$n"; [ "$n" = "0" ] || fail=1
done
DB=bus_sql bash supabase/tests/lock-oracle.sh; rc=$?; echo "lock-oracle exit $rc"; [ $rc = 0 ] || fail=1

step "integration: services + booking on pristine bus_int"
DB=bus_int bash tests/integration/reset-db.sh >/dev/null || fail=1
serve bus_int || fail=1
itest tests/integration/services.int.test.ts tests/integration/booking.int.test.ts; rc=$?; echo "integration(services+booking) exit $rc"; [ $rc = 0 ] || fail=1

step "integration: customer-web on seeded bus_web"
DB=bus_web bash tests/integration/reset-db.sh >/dev/null || fail=1
$PSQL -q -v ON_ERROR_STOP=1 -d bus_web -f tests/integration/seed-customer-web.sql || fail=1
serve bus_web || fail=1
itest tests/integration/customer-web.int.test.ts; rc=$?; echo "integration(customer-web) exit $rc"; [ $rc = 0 ] || fail=1

step "integration: customer idempotency + cancellation on seeded bus_idem (real parallel HTTP)"
DB=bus_idem bash tests/integration/reset-db.sh >/dev/null || fail=1
$PSQL -q -v ON_ERROR_STOP=1 -d bus_idem -f tests/integration/seed-customer-web.sql -f tests/integration/seed-customer-idempotency.sql || fail=1
serve bus_idem || fail=1
itest tests/integration/customer-idempotency.int.test.ts; rc=$?; echo "integration(customer-idempotency) exit $rc"; [ $rc = 0 ] || fail=1

step "integration: tickets + driver boarding on seeded bus_tix (real parallel HTTP)"
DB=bus_tix bash tests/integration/reset-db.sh >/dev/null || fail=1
$PSQL -q -v ON_ERROR_STOP=1 -d bus_tix -f tests/integration/seed-customer-web.sql -f tests/integration/seed-tickets.sql || fail=1
serve bus_tix || fail=1
itest tests/integration/tickets.int.test.ts; rc=$?; echo "integration(tickets) exit $rc"; [ $rc = 0 ] || fail=1

step "integration: rate limiting (0020) on seeded bus_rl (real parallel HTTP, real policy values)"
DB=bus_rl bash tests/integration/reset-db.sh >/dev/null || fail=1
$PSQL -q -v ON_ERROR_STOP=1 -d bus_rl -f tests/integration/seed-customer-web.sql -f tests/integration/seed-tickets.sql || fail=1
serve bus_rl || fail=1
itest tests/integration/rate-limit.int.test.ts; rc=$?; echo "integration(rate-limit) exit $rc"; [ $rc = 0 ] || fail=1

step "integration: Super Admin audit log on bus_aud (real HTTP)"
DB=bus_aud bash tests/integration/reset-db.sh >/dev/null || fail=1
serve bus_aud || fail=1
itest tests/integration/audit.int.test.ts; rc=$?; echo "integration(audit) exit $rc"; [ $rc = 0 ] || fail=1

step "staging scripts (applier, seed guard, bootstrap, cleanup gate)"
bash tests/staging/db-scripts.sh | grep -E "^(FAIL|== STAGING)"; [ "${PIPESTATUS[0]}" = 0 ] || fail=1

pkill -9 -x postgrest 2>/dev/null
if [ -n "${E2E_TOOLS:-}" ]; then   # real browser (production build + next start) + local Postgres/PostgREST + GoTrue STUB. Needs puppeteer-core + CHROME_PATH or @sparticuz/chromium.
  step "browser e2e: guest/sign-in/booking flow"
  bash tests/e2e/run-e2e.sh flow.mjs 0; rc=$?; echo "e2e(flow) exit $rc"; [ $rc = 0 ] || fail=1
  step "browser e2e: customer QR tickets + driver boarding page"
  SKIP_BUILD=1 bash tests/e2e/run-e2e.sh tickets.mjs 1; rc=$?; echo "e2e(tickets) exit $rc"; [ $rc = 0 ] || fail=1
  step "browser e2e: customer portal, isolation, cancellation, capacity, history"
  EXTRA_SEED=tests/e2e/seed-portal.sql SKIP_BUILD=1 bash tests/e2e/run-e2e.sh portal.mjs 0; rc=$?; echo "e2e(portal) exit $rc"; [ $rc = 0 ] || fail=1
  step "browser e2e: platform audit logs viewer"
  SKIP_BUILD=1 bash tests/e2e/run-e2e.sh audit.mjs 1; rc=$?; echo "e2e(audit) exit $rc"; [ $rc = 0 ] || fail=1
  step "browser e2e: hosted-smoke script (scripts/smoke/flow-smoke.mjs) against the local stack"
  SKIP_BUILD=1 bash tests/e2e/run-e2e.sh flow-smoke-local.mjs 1; rc=$?; echo "e2e(flow-smoke) exit $rc"; [ $rc = 0 ] || fail=1
  step "browser e2e: sign-out + protected routes"
  SKIP_BUILD=1 bash tests/e2e/run-e2e.sh signout.mjs 1; rc=$?; echo "e2e(signout) exit $rc"; [ $rc = 0 ] || fail=1
else echo "(browser e2e skipped: set E2E_TOOLS to run it)"; fi
echo; echo "== OVERALL: $([ $fail = 0 ] && echo PASS || echo FAIL)"; exit $fail
