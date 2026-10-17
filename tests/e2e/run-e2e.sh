#!/usr/bin/env bash
# Browser test against the real app (production build + next start), real local Postgres + PostgREST, and the GoTrue-compatible STUB.
# NOT live Supabase. Optional: EXTRA_SEED=<sql file>, CHROME_PATH=<chromium binary>. Usage: PSQL=... POSTGREST=... E2E_TOOLS=/dir/with/puppeteer bash tests/e2e/run-e2e.sh <script.mjs> [AUTOCONFIRM=1|0]
set -uo pipefail
cd "$(dirname "$0")/../.."
PSQL="${PSQL:?}"; POSTGREST="${POSTGREST:?}"; TOOLS="${E2E_TOOLS:?}"; SCRIPT="${1:?}"; AUTOCONFIRM="${2:-1}"; export PSQL
SECRET="0123456789abcdef0123456789abcdef0123"; DB=bus_e2e
killall_e2e() { # kill our own servers by /proc scan, excluding this script's whole ancestor chain (so the caller is never hit)
  python3 - <<'PY'
import os
keep=set(); pid=os.getpid()
while pid>1:
    keep.add(pid)
    try: pid=int(open(f'/proc/{pid}/stat').read().rsplit(')',1)[1].split()[1])
    except Exception: break
pats=(b'next-server', b'auth-stub.mjs', b'/postgrest', b'next\x00start')
for d in os.listdir('/proc'):
    if d.isdigit() and int(d) not in keep:
        try: c=open(f'/proc/{d}/cmdline','rb').read()
        except Exception: continue
        if any(p in c for p in pats) and b'python3' not in c.split(b'\x00')[0]: 
            try: os.kill(int(d),9)
            except Exception: pass
PY
}
killall_e2e; sleep 1
DB=$DB bash tests/integration/reset-db.sh >/dev/null || exit 1
$PSQL -q -v ON_ERROR_STOP=1 -d $DB -f tests/integration/seed-customer-web.sql -f tests/e2e/seed-e2e.sql ${EXTRA_SEED:+-f $EXTRA_SEED} || exit 1
cat > /tmp/pgrst.conf <<CONF
db-uri = "postgres://authenticator:pw@127.0.0.1:5432/$DB"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$SECRET"
server-port = 3100
CONF
setsid nohup "$POSTGREST" /tmp/pgrst.conf >/tmp/pgrst.log 2>&1 &
JWT_SECRET=$SECRET REST_URL=http://127.0.0.1:3100 PSQL_BIN=$PSQL DB=$DB AUTOCONFIRM=$AUTOCONFIRM setsid nohup node tests/e2e/auth-stub.mjs >/tmp/stub.log 2>&1 &
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3200 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=local-publishable-key-0123456789 NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
if [ -z "${SKIP_BUILD:-}" ]; then npx next build > /tmp/e2e_build.log 2>&1; echo "e2e build exit $?"; fi
SUPABASE_SERVICE_ROLE_KEY=unused-in-e2e setsid nohup npx next start -p 3000 -H 127.0.0.1 >/tmp/next.log 2>&1 &
for _ in $(seq 1 40); do curl -sf -m 2 http://127.0.0.1:3000/ >/dev/null && break; sleep 1; done
curl -s -o /dev/null -w "app http %{http_code}\n" http://127.0.0.1:3000/
mkdir -p /tmp/e2e/shots; ln -sfn "$TOOLS/node_modules" tests/e2e/node_modules
NODE_PATH="$TOOLS/node_modules" BASE=http://127.0.0.1:3000 STUB=http://127.0.0.1:3200 DB=$DB PSQL_BIN=$PSQL node "tests/e2e/$SCRIPT"; rc=$?
echo "e2e script exit $rc"
killall_e2e
exit $rc
