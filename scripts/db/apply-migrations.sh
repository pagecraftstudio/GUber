#!/usr/bin/env bash
# Applies supabase/migrations/*.sql to ONE database, in order, once each, with a checksum ledger.
#
# WHY NOT `supabase db push`
#   The Supabase CLI (verified with v2.122.0) SKIPS "0013b_create_my_booking_idempotency.sql" with only a warning
#   ("file name must match pattern <timestamp>_name.sql"). A CLI-based deploy therefore silently ships WITHOUT the idempotent
#   booking fix. This script applies every file, including 0013b, in byte order of the file name (= intended order).
#   Use EITHER this script OR the CLI on a given database, never both (the two keep separate histories).
#
# SAFETY
#   * Targets local scratch databases or STAGING only. There is deliberately no production mode in this script.
#   * You must say what you are targeting, and the URL must agree:
#       TARGET_ENV=local    DATABASE_URL host must be localhost/127.0.0.1
#       TARGET_ENV=staging  STAGING_PROJECT_REF must be set and must appear in DATABASE_URL;
#                           PRODUCTION_PROJECT_REF (optional but recommended) must NOT appear in it.
#   * An applied file whose checksum later changes is a hard error (migrations are immutable once applied).
#   * Each file runs in a single transaction with ON_ERROR_STOP; a failure leaves the database at the previous file.
#   * DATABASE_URL is read from the environment only. It is never printed or logged.
#
# USAGE
#   DATABASE_URL=... TARGET_ENV=staging STAGING_PROJECT_REF=abcd... [PRODUCTION_PROJECT_REF=wxyz...] \
#     bash scripts/db/apply-migrations.sh [--dry-run | --status]
set -euo pipefail
cd "$(dirname "$0")/../.."
MODE="apply"; case "${1:-}" in --dry-run) MODE="dry";; --status) MODE="status";; "") ;; *) echo "unknown argument: $1" >&2; exit 64;; esac
PSQL="${PSQL:-psql}"
die() { echo "REFUSING: $*" >&2; exit 2; }

: "${DATABASE_URL:?DATABASE_URL is required}"
case "${TARGET_ENV:-}" in
  local)
    [[ "$DATABASE_URL" =~ ^postgres(ql)?:// ]] || die "DATABASE_URL must be a postgres:// URL"
    host="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[a-z]+://([^@/]*@)?([^:/?]+).*#\2#')"
    [[ "$host" == "localhost" || "$host" == "127.0.0.1" ]] || die "TARGET_ENV=local but the database host is not localhost" ;;
  staging)
    : "${STAGING_PROJECT_REF:?TARGET_ENV=staging requires STAGING_PROJECT_REF}"
    [[ "$DATABASE_URL" == *"$STAGING_PROJECT_REF"* ]] || die "DATABASE_URL does not contain STAGING_PROJECT_REF; wrong database?"
    [ "${STAGING_PROJECT_REF}" != "${PRODUCTION_PROJECT_REF:-}" ] || die "STAGING_PROJECT_REF equals PRODUCTION_PROJECT_REF"
    if [ -n "${PRODUCTION_PROJECT_REF:-}" ] && [[ "$DATABASE_URL" == *"$PRODUCTION_PROJECT_REF"* ]]; then die "DATABASE_URL contains PRODUCTION_PROJECT_REF"; fi
    ;;
  production) die "this script never targets production. Production changes need an explicit, reviewed procedure (docs/STAGING-CHECKLIST.md)" ;;
  *) die "set TARGET_ENV=local or TARGET_ENV=staging" ;;
esac

SQL() { "$PSQL" "$DATABASE_URL" -w -X -qtA -v ON_ERROR_STOP=1 "$@"; }
sha() { sha256sum "$1" | cut -d' ' -f1; }

# Real Supabase projects must already look like Supabase (auth schema + roles). A plain Postgres is almost certainly a mistake.
SQL -c "select 1 from pg_namespace where nspname = 'auth'" | grep -q 1 || die "no 'auth' schema: this is not a Supabase database (local scratch DBs must load supabase/tests/00_supabase_stub.sql first)"

SQL -c "create schema if not exists app_private" \
    -c "create table if not exists app_private.schema_ledger (filename text primary key, sha256 text not null, applied_at timestamptz not null default now())" >/dev/null

# byte order of file names == intended order (0013_... < 0013b_... < 0014_...). LC_ALL=C makes that independent of the locale.
MIG_DIR="${MIGRATIONS_DIR:-supabase/migrations}"   # override only for tests
mapfile -t FILES < <(LC_ALL=C ls "$MIG_DIR"/*.sql | LC_ALL=C sort)
[ "${#FILES[@]}" -gt 0 ] || die "no migrations found"

pending=(); drift=0
for f in "${FILES[@]}"; do
  name="$(basename "$f")"; now="$(sha "$f")"
  have="$(SQL -c "select sha256 from app_private.schema_ledger where filename = '$name'")"
  if [ -z "$have" ]; then pending+=("$f"); echo "pending  $name"
  elif [ "$have" = "$now" ]; then echo "applied  $name"
  else echo "CHANGED  $name  (applied checksum differs from the file)"; drift=1; fi
done
# a ledger row with no file = someone deleted/renamed an applied migration
while read -r orphan; do [ -z "$orphan" ] && continue; [ -f "$MIG_DIR/$orphan" ] || { echo "MISSING  $orphan  (applied but not in the repository)"; drift=1; }; done < <(SQL -c "select filename from app_private.schema_ledger order by filename")
[ "$drift" = 0 ] || die "ledger and repository disagree. Applied migrations must never be edited, renamed or removed. Add a NEW migration instead."

[ "$MODE" = "status" ] && { echo "ledger OK; ${#pending[@]} pending"; exit 0; }
[ "$MODE" = "dry" ] && { echo "dry run: ${#pending[@]} migration(s) would be applied"; exit 0; }
for f in "${pending[@]}"; do
  name="$(basename "$f")"; echo "applying $name"
  "$PSQL" "$DATABASE_URL" -w -X -q -v ON_ERROR_STOP=1 --single-transaction -f "$f" >/dev/null
  SQL -c "insert into app_private.schema_ledger (filename, sha256) values ('$name', '$(sha "$f")')" >/dev/null
done
echo "done: ${#pending[@]} applied, $(( ${#FILES[@]} - ${#pending[@]} )) already present"
