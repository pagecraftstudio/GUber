// Runs scripts/smoke/deploy-smoke.sh against the LOCAL production build (next start + local PostgREST + GoTrue stub).
// Proves the script and the public /api/public/* routes work end to end locally; it proves nothing about Vercel or hosted Supabase.
// Run: bash tests/e2e/run-e2e.sh deploy-smoke-local.mjs 1
import * as L from './lib.mjs';
import { spawnSync } from 'node:child_process';
const r = spawnSync('bash', ['scripts/smoke/deploy-smoke.sh', L.BASE], { encoding: 'utf8' });
process.stdout.write(r.stdout + r.stderr);
L.check('deploy-smoke.sh exits 0 (no FAIL lines)', r.status === 0 && !/^FAIL/m.test(r.stdout), `exit ${r.status}`);
L.check('deploy-smoke covers the public routes', /GET \/api\/public\/trips -> 200/.test(r.stdout) && /POST \/api\/public\/trips -> 405/.test(r.stdout));
process.exit(L.summary() ? 0 : 1);
