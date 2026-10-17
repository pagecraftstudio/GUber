#!/usr/bin/env bash
# Rebuilds the throw-away test database from migrations + fixtures. Run as a user that can `psql` as superuser.
# Usage: DB=bus PSQL="psql" tests/integration/reset-db.sh
set -euo pipefail
DB="${DB:-bus}"; PSQL="${PSQL:-psql}"; ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
$PSQL -q -d postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = '$DB' and pid <> pg_backend_pid()" >/dev/null
$PSQL -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
$PSQL -q -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/tests/00_supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do $PSQL -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null; done
$PSQL -q -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/tests/01_helpers_fixtures.sql" >/dev/null
$PSQL -q -d "$DB" <<'SQL'
do $$ begin if not exists (select 1 from pg_roles where rolname='authenticator') then
  create role authenticator login noinherit password 'pw'; end if; end $$;
grant anon, authenticated to authenticator;
alter role authenticator set search_path = public, extensions;
alter role anon set search_path = public, extensions;
alter role authenticated set search_path = public, extensions;
SQL
echo "database $DB ready"
