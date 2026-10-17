#!/usr/bin/env bash
# Scans the EXACT .next build output that is on disk (run it right after `next build`, change nothing in between).
# 1. secrets: service-role / secret keys, private keys, JWTs whose payload says service_role, test-only secrets
# 2. mock data: demo tenant / demo credentials / fake QR tokens / mock modules must not ship in the CLIENT bundle (.next/static).
#    NOT scanned: unused i18n copy (e.g. 'Quick Demo Login', a 'Karim' name placeholder). That is UI text, not data; tests/e2e/flow.mjs proves it is never rendered.
# Exit 1 on any hit. Prints a build fingerprint so the report can state which build was scanned.
set -uo pipefail
cd "$(dirname "$0")/.."
[ -d .next/static ] || { echo "no .next build found: run 'npx next build' first"; exit 2; }
echo "build id: $(cat .next/BUILD_ID 2>/dev/null)  files(static)=$(find .next/static -type f | wc -l)  files(server)=$(find .next/server -type f 2>/dev/null | wc -l)"
echo "fingerprint: $(find .next/static .next/server -type f \( -name '*.js' -o -name '*.html' -o -name '*.json' \) -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -c1-16)"
fail=0
scan() { # $1 label, $2 egrep pattern, $3.. dirs
  local label="$1" pat="$2"; shift 2
  local hits; hits=$(grep -rIlE -- "$pat" "$@" 2>/dev/null | head -5)
  if [ -n "$hits" ]; then echo "FAIL  $label"; echo "$hits" | sed 's/^/        /'; fail=1; else echo "PASS  $label"; fi
}
ALL=(.next/static .next/server)
scan "no SUPABASE_SERVICE_ROLE / service-role key name anywhere in the build" 'SUPABASE_SERVICE_ROLE|service_role_key|SERVICE_ROLE_KEY' "${ALL[@]}"
scan "no sb_secret_ / Stripe-style secret keys"                         'sb_secret_[A-Za-z0-9_-]{10,}|sk_live_[A-Za-z0-9]{10,}|sk_test_[A-Za-z0-9]{10,}' "${ALL[@]}"
scan "no private key blocks"                                             '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----' "${ALL[@]}"
scan "no test-only secrets (e2e JWT secret, e2e stub service key)"       '0123456789abcdef0123456789abcdef0123|unused-in-e2e' "${ALL[@]}"
# any JWT-looking token whose payload decodes to role=service_role
jwtfail=0
while read -r tok; do
  pl=$(echo "$tok" | cut -d. -f2 | tr '_-' '/+'); pad=$(( (4 - ${#pl} % 4) % 4 )); pl="$pl$(printf '=%.0s' $(seq 1 $pad))"
  if echo "$pl" | base64 -d 2>/dev/null | grep -q 'service_role'; then echo "FAIL  service_role JWT in build"; jwtfail=1; fi
done < <(grep -rIohE 'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}' "${ALL[@]}" 2>/dev/null | sort -u)
[ $jwtfail = 0 ] && echo "PASS  no JWT with role=service_role" || fail=1
CLIENT=(.next/static)
scan "client bundle: no demo company / demo accounts / demo passwords"    'Galala Connect|comp_galala_connect|Pass1234|karim@' "${CLIENT[@]}"
scan "client bundle: no mock opaque QR token / mock data module markers" 'malaky_sec_tk_[A-Za-z0-9]|mockData|transportService\.mock|MockTransportService' "${CLIENT[@]}"
[ $fail = 0 ] && echo "BUNDLE SCAN: PASS" || echo "BUNDLE SCAN: FAIL"; exit $fail
