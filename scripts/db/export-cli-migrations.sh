#!/usr/bin/env bash
# OPTIONAL. Writes a Supabase-CLI-compatible COPY of the migrations to <outdir>/supabase/migrations (the repository is untouched).
# The CLI only understands "<digits>_name.sql". 0013b is copied as "00135_..." (content byte-identical), which the CLI orders
# between 0013 and 0014 (verified with CLI 2.122.0 on a scratch database: applied order 0013, 00135, 0014; helper present).
# Use this ONLY for a database that has never been migrated with scripts/db/apply-migrations.sh. Never mix the two histories.
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT="${1:?usage: export-cli-migrations.sh <outdir>}"
[ ! -e "$OUT/supabase/migrations" ] || { echo "REFUSING: $OUT/supabase/migrations already exists" >&2; exit 2; }
mkdir -p "$OUT/supabase/migrations"
for f in supabase/migrations/*.sql; do
  n="$(basename "$f")"
  case "$n" in 0013b_*) n="00135_${n#0013b_}";; esac
  cp "$f" "$OUT/supabase/migrations/$n"
done
echo "wrote $(ls "$OUT/supabase/migrations" | wc -l) files to $OUT/supabase/migrations"
echo "next:  cd $OUT && supabase link --project-ref <STAGING ref> && supabase db push --dry-run"
