#!/usr/bin/env bash
# M3E-5 publish race. Needs REAL concurrent sessions, so it cannot be a SQL suite (those run in one session).
# Needs a DB prepared with migrations + 01_helpers_fixtures.sql. Usage: DB=bus_sql ./publish-race.sh
#
#   1. SERIALISATION (deterministic). Session 1 (owner A) publishes inside a transaction and holds the company-row lock for 5 s.
#      Session 2 (manager A) publishes meanwhile and must BLOCK until session 1 commits, then get version+1.
#      Session 3 (owner B) publishes meanwhile and must NOT be blocked (the lock is per company).
#   2. STRESS. 8 publish/rollback/unpublish calls each from A's owner and A's manager, plus 4 publishes from B, all at once. Nothing may
#      deadlock, hit a unique violation, or fail; then the invariants must hold (gapless versions, one current, is_published matches).
set -u
DB="${DB:-bus}"; PSQL="${PSQL:-psql}"
A=00000000-0000-4000-8000-000000000101; B=00000000-0000-4000-8000-000000000102
OWNER_A=00000000-0000-4000-8000-000000000002; MGR_A=00000000-0000-4000-8000-000000000003; OWNER_B=00000000-0000-4000-8000-000000000007
fail=0; ok() { echo "PASS  $1"; }; bad() { echo "FAIL  $1"; fail=1; }
sql() { $PSQL -q -At -d "$DB" "$@"; }
now() { date +%s.%N; }
ge() { awk -v a="$1" -v b="$2" 'BEGIN{exit !(a>=b)}'; }
le() { awk -v a="$1" -v b="$2" 'BEGIN{exit !(a<=b)}'; }

# one call as a user; prints "<sqlstate|ok>" (never the message: no tenant text leaks into logs)
call() { # $1 jwt sub, $2 SQL expression to perform
  $PSQL -q -At -d "$DB" 2>&1 <<SQL | grep -oE 'RESULT [0-9A-Z]+|RESULT ok' | head -1 | cut -d' ' -f2
set role authenticated; select set_config('request.jwt.claim.sub','$1',false);
do \$\$ begin perform $2; raise notice 'RESULT ok'; exception when others then raise notice 'RESULT %', sqlstate; end \$\$;
SQL
}

# ---- fixtures for this test: a valid draft for A and B, clean counters. (Audit rows cannot be deleted; the test counts deltas.)
sql <<SQL >/dev/null
delete from app_private.rate_limit_counters; delete from public.website_publications; delete from public.website_sections; delete from public.website_pages;
update public.website_settings set is_published = false, site_title = jsonb_build_object('en', c.name) from public.companies c where website_settings.company_id = c.id and c.id in ('$A', '$B');
insert into public.website_pages (id, company_id, slug, title, is_home) values ('00000000-0000-4000-8000-000000000601', '$A', '', '{"en":"Home"}', true), ('00000000-0000-4000-8000-000000000602', '$B', '', '{"en":"Home"}', true);
insert into public.website_sections (company_id, page_id, type, sort_order, content) values ('$A', '00000000-0000-4000-8000-000000000601', 'hero', 1, '{"title":{"en":"A"}}'), ('$B', '00000000-0000-4000-8000-000000000602', 'hero', 1, '{"title":{"en":"B"}}');
SQL
T0=$(sql -c "select clock_timestamp()")
[ "$(call $OWNER_A "public.publish_website('seed')")" = ok ] && ok "setup: A has v1" || bad "setup: could not publish v1 for A"

# ============================================================ 1. serialisation
$PSQL -q -At -d "$DB" >/dev/null 2>&1 <<SQL &
begin; set local role authenticated; select set_config('request.jwt.claim.sub','$OWNER_A',true);
select public.publish_website('holder'); select pg_sleep(5); commit;
SQL
HOLDER=$!; sleep 1.2          # session 1 now holds A's company-row lock until ~T+5s
s=$(now); B_RES=$(call $OWNER_B "public.publish_website('b during a')"); B_T=$(awk -v a="$(now)" -v b="$s" 'BEGIN{print a-b}')
s=$(now); M_RES=$(call $MGR_A "public.publish_website('blocked behind holder')"); M_T=$(awk -v a="$(now)" -v b="$s" 'BEGIN{print a-b}')
wait $HOLDER 2>/dev/null
printf 'B (other company) : %s in %.2fs\nManager A (same)  : %s in %.2fs\n' "$B_RES" "$B_T" "$M_RES" "$M_T"
[ "$B_RES" = ok ] && le "$B_T" 2.0 && ok "company B was not blocked by company A's publish lock" || bad "company B was blocked or failed (res=$B_RES, ${B_T}s)"
[ "$M_RES" = ok ] && ge "$M_T" 2.5 && ok "second publisher of the SAME company waited for the first" || bad "same-company publish did not wait (res=$M_RES, ${M_T}s): the company-row lock is not serialising"
V=$(sql -c "select string_agg(version::text || case when is_current then '*' else '' end, ',' order by version) from public.website_publications where company_id = '$A'")
[ "$V" = "1,2,3*" ] && ok "A has v1,v2,v3 with only the last current ($V)" || bad "unexpected A versions: $V"

# ============================================================ 2. stress
sql -c "delete from app_private.rate_limit_counters" >/dev/null
OUT=$(mktemp -d); i=0
for who in $OWNER_A $MGR_A; do
  for n in 1 2 3 4 5 6 7 8; do
    i=$((i+1)); case $((n % 3)) in 0) e="public.unpublish_website()";; 1) e="public.publish_website('stress $n')";; 2) e="public.rollback_website(1)";; esac
    ( call $who "$e" > "$OUT/a$i" ) &
  done
done
for n in 1 2 3 4; do i=$((i+1)); ( call $OWNER_B "public.publish_website('b stress $n')" > "$OUT/b$i" ) & done
wait
RES=$(cat "$OUT"/* | sort | uniq -c | tr '\n' ' '); rm -rf "$OUT"
echo "stress outcomes: $RES"
[ "$(echo "$RES" | tr -d ' 0-9')" = "ok" ] && ok "all 20 concurrent calls succeeded (no deadlock 40P01, no unique violation 23505, no lock timeout)" || bad "some concurrent calls failed: $RES"

# ============================================================ invariants after the storm
chk() { # $1 name, $2 SQL returning t/f
  [ "$(sql -c "$2")" = t ] && ok "$1" || bad "$1"; }
chk "A versions are gapless from 1" "select max(version) = count(*) and min(version) = 1 from public.website_publications where company_id = '$A'"
chk "B versions are gapless from 1 and B made exactly 5 (1 during the lock test + 4 in the storm)" "select max(version) = 5 and count(*) = 5 and min(version) = 1 from public.website_publications where company_id = '$B'"
chk "at most one current version per company" "select coalesce(max(c), 0) <= 1 from (select count(*) c from public.website_publications where is_current group by company_id) q"
chk "is_published matches 'a current version exists' for A and B" "select count(*) = 0 from public.website_settings s where s.company_id in ('$A', '$B') and s.is_published is distinct from exists (select 1 from public.website_publications p where p.company_id = s.company_id and p.is_current)"
# every successful call wrote exactly one audit row: A = seed + holder + blocked + 16 stress, B = 1 + 4
chk "audit rows since the test began equal successful calls (A: 19, B: 5)" "select (select count(*) from public.audit_logs where company_id = '$A' and action like 'website.%' and created_at >= '$T0') = 19
   and (select count(*) from public.audit_logs where company_id = '$B' and action like 'website.%' and created_at >= '$T0') = 5"
chk "A's snapshots hold A's content only, B's hold B's only (the positive match proves the pattern is real)" "select
   (select count(*) from public.website_publications where company_id = '$A' and snapshot::text like '%\"en\": \"A\"%') = (select count(*) from public.website_publications where company_id = '$A')
   and (select count(*) from public.website_publications where company_id = '$B' and snapshot::text like '%\"en\": \"B\"%') = (select count(*) from public.website_publications where company_id = '$B')
   and not exists (select 1 from public.website_publications where company_id = '$A' and snapshot::text like '%\"en\": \"B\"%')
   and not exists (select 1 from public.website_publications where company_id = '$B' and snapshot::text like '%\"en\": \"A\"%')"

# ---- cleanup: later suites share this database
sql <<SQL >/dev/null
delete from app_private.rate_limit_counters; delete from public.website_publications; delete from public.website_sections; delete from public.website_pages;
update public.website_settings set is_published = (company_id = '$A'), site_title = null where company_id in ('$A', '$B');
SQL
[ $fail = 0 ] && { echo "PASS  publish race"; exit 0; } || { echo "FAIL  publish race"; exit 1; }
