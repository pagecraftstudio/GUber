#!/usr/bin/env bash
# Read-only deployment smoke test: GET/HEAD requests only, no credentials, no writes, no cookies stored.
# Usage: scripts/smoke/deploy-smoke.sh https://staging.example.com
# Proves ROUTING, ACCESS GATES and HEADERS of a running deployment. It does NOT prove login, booking or boarding:
# those need real accounts (docs/STAGING-CHECKLIST.md). Works against `next start` locally and against Vercel.
set -uo pipefail
BASE="${1:-}"; [ -n "$BASE" ] || { echo "usage: $0 <base-url>"; exit 2; }
BASE="${BASE%/}"
case "$BASE" in https://*|http://localhost*|http://127.0.0.1*) ;; *) echo "REFUSING: use https:// (or localhost)"; exit 2;; esac
fail=0
ok()  { echo "PASS  $*"; }
bad() { echo "FAIL  $*"; fail=1; }
code()     { curl -s -o /dev/null -m 20 -w '%{http_code}' "$BASE$1"; }
location() { curl -s -o /dev/null -m 20 -w '%{redirect_url}' "$BASE$1"; }
path_of()  { echo "$1" | sed -E 's#^https?://[^/]+##'; }

echo "target: $BASE"
# 1. public pages answer
for p in / /login /register /company/login /forgot-password; do
  c=$(code "$p"); [ "$c" = 200 ] && ok "GET $p -> 200" || bad "GET $p -> $c (want 200)"
done
# 2. protected areas redirect signed-out visitors to the RIGHT login (customers never to the operator login)
chk() { l=$(path_of "$(location "$1")"); c=$(code "$1"); [ "$c" = 307 ] && [ "$l" = "$2" ] && ok "GET $1 -> 307 $l" || bad "GET $1 -> $c '$l' (want 307 $2)"; }
chk /my-bookings     '/login?next=%2Fmy-bookings'
chk /reset-password  '/login?next=%2Freset-password'
chk /dashboard       '/company/login?next=%2Fdashboard'
chk /admin           '/company/login?next=%2Fadmin'
chk /driver          '/company/login?next=%2Fdriver'
# 3. auth callback: a failed link never lands on /dashboard, and the audience in `from` decides the way back
cf() { l=$(path_of "$(location "$1")"); [ "$l" = "$2" ] && ok "bad link $1 -> $l" || bad "bad link $1 -> '$l' (want $2)"; }
cf '/auth/confirm?token_hash=x&type=recovery&next=%2Freset-password&from=customer' '/forgot-password?error=confirm_failed&from=customer'
cf '/auth/confirm?token_hash=x&type=recovery&next=%2Freset-password&from=operator' '/forgot-password?error=confirm_failed&from=operator'
cf '/auth/confirm?token_hash=x&type=email&next=%2Fmy-bookings' '/login?error=confirm_failed'
cf '/auth/confirm?token_hash=x&type=email' '/login?error=confirm_failed'
l=$(path_of "$(location '/auth/confirm?token_hash=x&type=email&next=https%3A%2F%2Fevil.test')"); case "$l" in /login*) ok "open-redirect next ignored -> $l";; *) bad "open-redirect next -> '$l'";; esac
# the return link on the reset form follows the audience
curl -s -m 20 "$BASE/forgot-password?from=customer" | grep -q 'href="/login"' && ok "forgot-password?from=customer -> back link /login" || bad "forgot-password customer back link"
curl -s -m 20 "$BASE/forgot-password?from=operator" | grep -q 'href="/company/login"' && ok "forgot-password?from=operator -> back link /company/login" || bad "forgot-password operator back link"
# 4. API surface: POST-only, nothing leaks on GET
for p in /api/telemetry/failure /api/csp-report; do c=$(code "$p"); [ "$c" = 405 ] && ok "GET $p -> 405" || bad "GET $p -> $c (want 405)"; done
c=$(curl -s -o /dev/null -m 20 -w '%{http_code}' -X POST -H 'content-type: application/json' -H 'origin: https://evil.example' -d '{}' "$BASE/api/telemetry/failure"); case "$c" in 401|403) ok "cross-origin POST telemetry -> $c";; *) bad "cross-origin POST telemetry -> $c (want 401/403)";; esac
# 5. security headers on a page and on an error page
h=$(curl -sI -m 20 "$BASE/login"); hn=$(curl -sI -m 20 "$BASE/definitely-not-a-page")
for want in 'x-content-type-options: nosniff' 'x-frame-options: deny' 'referrer-policy:' 'permissions-policy:' 'strict-transport-security:' "content-security-policy: base-uri 'self'" 'content-security-policy-report-only:'; do
  echo "$h" | tr 'A-Z' 'a-z' | grep -qF "$want" && ok "header $want" || bad "missing header $want"
done
echo "$hn" | tr 'A-Z' 'a-z' | grep -qF 'x-frame-options: deny' && ok "headers also on 404" || bad "no headers on 404"
echo "$h" | grep -qi '^x-powered-by' && bad "x-powered-by leaks" || ok "no x-powered-by"
echo "$h" | tr 'A-Z' 'a-z' | grep -q 'upgrade-insecure-requests' && { case "$BASE" in https://*) ok "upgrade-insecure-requests on https";; *) echo "NOTE  upgrade-insecure-requests is sent on a plain-http target (production build): browsers may refuse to load http assets";; esac; }
# 6. indexing policy: marketplace indexable, everything operator-side is not
curl -s -m 20 "$BASE/" | grep -q 'name="robots" content="index, follow"' && ok "/ is indexable" || bad "/ not indexable"
curl -s -m 20 "$BASE/company/login" | grep -q 'content="noindex' && ok "/company/login noindex" || bad "/company/login indexable"
echo; [ $fail = 0 ] && echo "DEPLOY SMOKE: PASS" || echo "DEPLOY SMOKE: FAIL"; exit $fail
