#!/usr/bin/env bash
# Tests the operator-facing database scripts on throw-away LOCAL databases (never a real project):
#   scripts/db/apply-migrations.sh, supabase/staging/seed_staging.sql, supabase/bootstrap/first_super_admin.sql,
#   supabase/maintenance/cleanup_test_fixtures.sql.   Usage: PSQL=psql bash tests/staging/db-scripts.sh
set -uo pipefail
cd "$(dirname "$0")/../.."
PSQL="${PSQL:-psql}"; fail=0
ok()   { echo "PASS  $1"; }
bad()  { echo "FAIL  $1"; fail=1; }
expect() { local name="$1"; shift; if "$@" >/tmp/stg.out 2>&1; then ok "$name"; else bad "$name"; sed -n 1,5p /tmp/stg.out; fi; }
refuse() { local name="$1" want="$2"; shift 2; if "$@" >/tmp/stg.out 2>&1; then bad "$name (should have been refused)"; else grep -qi "$want" /tmp/stg.out && ok "$name" || { bad "$name (wrong error)"; sed -n 1,4p /tmp/stg.out; }; fi; }
mkdb() { $PSQL -q -d postgres -c "drop database if exists $1" -c "create database $1" >/dev/null && $PSQL -q -v ON_ERROR_STOP=1 -d "$1" -f supabase/tests/00_supabase_stub.sql >/dev/null 2>&1; }
url() { echo "postgres://postgres:pw@127.0.0.1:5432/$1"; }   # local scratch cluster password; psql -w never prompts
q() { $PSQL -qtA -d "$1" -c "$2"; }
apply() { DATABASE_URL="$(url "$1")" TARGET_ENV=local MIGRATIONS_DIR="${MIGS:-supabase/migrations}" bash scripts/db/apply-migrations.sh "${@:2}"; }

echo "== apply-migrations.sh"
mkdb stg_a
refuse "no TARGET_ENV is refused"           "TARGET_ENV" env DATABASE_URL="$(url stg_a)" bash scripts/db/apply-migrations.sh
refuse "TARGET_ENV=production is refused"   "never targets production" env DATABASE_URL="$(url stg_a)" TARGET_ENV=production bash scripts/db/apply-migrations.sh
refuse "local mode refuses a remote host"   "not localhost" env DATABASE_URL="postgres://u:p@db.abcdefgh.supabase.co:5432/postgres" TARGET_ENV=local bash scripts/db/apply-migrations.sh
refuse "staging mode needs a project ref"   "STAGING_PROJECT_REF" env DATABASE_URL="postgres://u:p@db.abcdefgh.supabase.co/postgres" TARGET_ENV=staging bash scripts/db/apply-migrations.sh
refuse "staging ref must be in the URL"     "wrong database" env DATABASE_URL="postgres://u:p@db.prodprodprod.supabase.co/postgres" TARGET_ENV=staging STAGING_PROJECT_REF=stagstagstag bash scripts/db/apply-migrations.sh
refuse "URL containing the production ref is refused" "PRODUCTION_PROJECT_REF" env DATABASE_URL="postgres://u:p@db.stagstagstag.supabase.co/postgres?x=prodprodprod" TARGET_ENV=staging STAGING_PROJECT_REF=stagstagstag PRODUCTION_PROJECT_REF=prodprodprod bash scripts/db/apply-migrations.sh
refuse "staging ref == production ref is refused" "equals" env DATABASE_URL="postgres://u:p@db.same.supabase.co/postgres" TARGET_ENV=staging STAGING_PROJECT_REF=same PRODUCTION_PROJECT_REF=same bash scripts/db/apply-migrations.sh
# a database without the Supabase auth schema is rejected
$PSQL -q -d postgres -c "drop database if exists stg_plain" -c "create database stg_plain" >/dev/null
refuse "plain Postgres (no auth schema) is rejected" "not a Supabase database" env DATABASE_URL="$(url stg_plain)" TARGET_ENV=local bash scripts/db/apply-migrations.sh
$PSQL -q -d postgres -c "drop database stg_plain" >/dev/null

expect "dry run lists everything as pending and changes nothing" apply stg_a --dry-run
[ "$(q stg_a "select count(*) from app_private.schema_ledger")" = "0" ] && ok "dry run wrote no ledger rows" || bad "dry run wrote ledger rows"
expect "full apply" apply stg_a
N=$(ls supabase/migrations/*.sql | wc -l)
[ "$(q stg_a "select count(*) from app_private.schema_ledger")" = "$N" ] && ok "ledger has one row per migration ($N)" || bad "ledger count"
[ "$(q stg_a "select count(*) from app_private.schema_ledger where filename ~ '^0013b_'")" = "1" ] && ok "0013b is applied (the Supabase CLI would have skipped it)" || bad "0013b missing"
[ "$(q stg_a "select to_regprocedure('app_private.my_booking_replay(uuid,text,uuid,integer,uuid,uuid,text)') is not null")" = "t" ] && ok "0013b's idempotency helper exists" || bad "0013b helper missing"
[ "$(q stg_a "select (select applied_at from app_private.schema_ledger where filename ~ '^0013_') < (select applied_at from app_private.schema_ledger where filename ~ '^0013b_') and (select applied_at from app_private.schema_ledger where filename ~ '^0013b_') < (select applied_at from app_private.schema_ledger where filename ~ '^0014_')")" = "t" ] && ok "order is 0013 < 0013b < 0014" || bad "0013b ordering"
[ "$(q stg_a "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity")" = "0" ] && ok "every public table has RLS enabled" || bad "RLS gap"
out=$(apply stg_a); echo "$out" | grep -q "0 applied" && ok "second run is a no-op" || bad "second run not idempotent"
# immutability: editing an applied migration is detected and refused
TMPM="$(mktemp -d)"; cp supabase/migrations/*.sql "$TMPM/"   # tamper tests only ever touch this COPY
echo "-- tampered" >> "$TMPM/0019_admin_audit_logs.sql"
refuse "edited applied migration is refused" "CHANGED" env MIGS="$TMPM" bash -c "$(declare -f apply url); apply stg_a"
cp supabase/migrations/0019_admin_audit_logs.sql "$TMPM/"
mv "$TMPM/0016_admin_platform_overview.sql" "$TMPM/../0016.moved"
refuse "removed applied migration is refused" "MISSING" env MIGS="$TMPM" bash -c "$(declare -f apply url); apply stg_a"
mv "$TMPM/../0016.moved" "$TMPM/0016_admin_platform_overview.sql"
expect "restored copy verifies clean again" env MIGS="$TMPM" bash -c "$(declare -f apply url); apply stg_a --status"
# a failing migration rolls back only itself and is not recorded
mkdb stg_f
echo "select 1/0;" >> "$TMPM/0005_seed_catalog.sql"
refuse "failing migration stops the run" "division by zero" env MIGS="$TMPM" bash -c "$(declare -f apply url); apply stg_f"
[ "$(q stg_f "select count(*) from app_private.schema_ledger where filename like '0005_%'")" = "0" ] && ok "failed migration is not recorded" || bad "failed migration recorded"
[ "$(q stg_f "select count(*) from app_private.schema_ledger")" = "4" ] && ok "earlier migrations stay applied (0001-0004)" || bad "ledger after failure"
rm -rf "$TMPM"
$PSQL -q -d postgres -c "drop database stg_f" >/dev/null

echo "== staging seed guard"
refuse "seed refuses an unmarked database (= production)" "not marked as staging" $PSQL -d stg_a -v ON_ERROR_STOP=1 -q -f supabase/staging/seed_staging.sql
[ "$(q stg_a "select count(*) from companies where slug='staging-demo'")" = "0" ] && ok "unmarked run changed nothing" || bad "seed leaked into an unmarked DB"
$PSQL -q -d postgres -c "alter database stg_a set app.environment = 'production'" >/dev/null
refuse "seed refuses app.environment=production" "not marked as staging" $PSQL -d stg_a -v ON_ERROR_STOP=1 -q -f supabase/staging/seed_staging.sql
$PSQL -q -d postgres -c "alter database stg_a set app.environment = 'staging'" >/dev/null
expect "seed runs on a staging-marked database" $PSQL -d stg_a -v ON_ERROR_STOP=1 -q -f supabase/staging/seed_staging.sql
[ "$(q stg_a "select count(*) from trips t join companies c on c.id=t.company_id where c.slug='staging-demo' and t.status='scheduled' and t.departure_at>now()")" = "3" ] && ok "3 upcoming scheduled trips" || bad "trip count"
[ "$(q stg_a "select count(*) from public_search_trips() where company_slug='staging-demo'")" = "3" ] && ok "demo trips are visible through the PUBLIC marketplace RPC" || bad "demo not publicly visible"
expect "seed is idempotent" $PSQL -d stg_a -v ON_ERROR_STOP=1 -q -f supabase/staging/seed_staging.sql
[ "$(q stg_a "select count(*) from companies where slug='staging-demo'")" = "1" ] && ok "re-run created no duplicate" || bad "duplicate company"
# driver link section
$PSQL -q -d stg_a -c "insert into auth.users (id, email, email_confirmed_at) values (gen_random_uuid(), 'stg-driver@example.test', now())" >/dev/null
sed "s/REPLACE_WITH_DRIVER_EMAIL/stg-driver@example.test/" supabase/staging/seed_staging.sql > /tmp/seed_drv.sql
expect "driver linking section" $PSQL -d stg_a -v ON_ERROR_STOP=1 -q -f /tmp/seed_drv.sql
[ "$(q stg_a "select count(*) from drivers where user_id is not null and full_name='Staging Driver'")" = "1" ] && ok "driver row linked to the auth user" || bad "driver link"
[ "$(q stg_a "select count(*) from company_users cu join roles r on r.id=cu.role_id where r.key='driver'")" = "1" ] && ok "driver membership created" || bad "driver membership"

echo "== first_super_admin.sql"
mkdb stg_b; apply stg_b >/dev/null
run_sa() { sed "s/REPLACE_WITH_YOUR_EMAIL/$1/g" supabase/bootstrap/first_super_admin.sql > /tmp/sa.sql; $PSQL -d stg_b -v ON_ERROR_STOP=1 -q -f /tmp/sa.sql; }
refuse "placeholder e-mail is refused"       "Set a real e-mail" $PSQL -d stg_b -v ON_ERROR_STOP=1 -q -f supabase/bootstrap/first_super_admin.sql
refuse "unknown user is refused"             "No Auth user" run_sa nobody@example.test
$PSQL -q -d stg_b -c "insert into auth.users (id, email) values ('11111111-1111-4111-8111-111111111111', 'boss@example.test')" >/dev/null
refuse "unconfirmed user is refused"         "not confirmed" run_sa boss@example.test
$PSQL -q -d stg_b -c "update auth.users set email_confirmed_at = now() where email = 'boss@example.test'" >/dev/null
expect "confirmed user becomes super_admin (case-insensitive match)" run_sa Boss@Example.TEST
[ "$(q stg_b "select count(*) from platform_users where role='super_admin' and is_active")" = "1" ] && ok "exactly one active super_admin" || bad "super_admin count"
[ "$(q stg_b "select count(*) from audit_logs where action='platform.bootstrap_super_admin' and actor_type='system'")" = "1" ] && ok "bootstrap left an audit row" || bad "no audit row"
expect "re-run for the same user is a no-op" run_sa boss@example.test
[ "$(q stg_b "select count(*) from audit_logs where action='platform.bootstrap_super_admin'")" = "1" ] && ok "no second audit row" || bad "duplicate audit"
$PSQL -q -d stg_b -c "insert into auth.users (id, email, email_confirmed_at) values ('22222222-2222-4222-8222-222222222222', 'second@example.test', now())" >/dev/null
refuse "a SECOND super_admin cannot be created with the bootstrap script" "already exists" run_sa second@example.test
[ "$(q stg_b "select count(*) from platform_users")" = "1" ] && ok "nothing changed on refusal" || bad "refusal leaked a row"

echo "== cleanup_test_fixtures.sql gate"
mkdb stg_c; apply stg_c >/dev/null
refuse "cleanup is inert as shipped" "nothing was deleted" $PSQL -d stg_c -v ON_ERROR_STOP=1 -q -f supabase/maintenance/cleanup_test_fixtures.sql
$PSQL -q -d stg_c -c "insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000999', 'fixture@test.dev'), ('33333333-3333-4333-8333-333333333333', 'real@example.test')" >/dev/null
sed "s/'app.confirm_fixture_cleanup', 'no'/'app.confirm_fixture_cleanup', 'yes'/" supabase/maintenance/cleanup_test_fixtures.sql > /tmp/cleanup_yes.sql
expect "cleanup runs once confirmed" $PSQL -d stg_c -v ON_ERROR_STOP=1 -q -f /tmp/cleanup_yes.sql
[ "$(q stg_c "select count(*) from auth.users where email='real@example.test'")" = "1" ] && ok "non-fixture user untouched" || bad "cleanup deleted a real row"
[ "$(q stg_c "select count(*) from auth.users where email='fixture@test.dev'")" = "0" ] && ok "fixture user removed" || bad "fixture not removed"

for d in stg_a stg_b stg_c; do $PSQL -q -d postgres -c "drop database if exists $d" >/dev/null; done
echo; echo "== STAGING SCRIPTS: $([ $fail = 0 ] && echo PASS || echo FAIL)"; exit $fail
