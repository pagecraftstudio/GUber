/**
 * Pure environment validation shared by next.config.ts (build / server start), instrumentation.ts (cold start) and getEnv().
 * No Node APIs, no zod, no logging: it must run in the browser bundle, in next.config and at the edge alike.
 *
 * SAFETY CONTRACT: the result names the variable and the KIND of problem. It never contains a value, not even a prefix, so
 * a build log or a cold-start error can be shared without leaking a key.
 */
export type EnvIssue = { name: string; problem: string };
export type EnvInput = Record<string, string | undefined>;

export const REQUIRED_PUBLIC = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SITE_URL'] as const;

// NEXT_PUBLIC_* is inlined into the browser bundle. A variable with one of these words in its NAME is almost certainly a secret.
const SECRET_NAME = /SERVICE[_-]?ROLE|SECRET|PRIVATE|PASSWORD|PASSWD|API[_-]?KEY|JWT[_-]?SECRET|ACCESS[_-]?TOKEN|CLIENT[_-]?SECRET|WEBHOOK/i;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1', 'host.docker.internal']);

function parseUrl(v: string): URL | null {
  try { return new URL(v); } catch { return null; }
}

function jwtRole(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '='));
    const role = (JSON.parse(json) as { role?: unknown }).role;
    return typeof role === 'string' ? role : null;
  } catch { return null; }
}

/** True on Vercel (any environment). Locally and in the CI e2e jobs this is false, so http://localhost stays legal there. */
export const isHosted = (env: EnvInput): boolean => Boolean(env.VERCEL_ENV);

export function checkEnv(env: EnvInput): { ok: boolean; issues: EnvIssue[] } {
  const issues: EnvIssue[] = [];
  const add = (name: string, problem: string) => issues.push({ name, problem });
  const hosted = isHosted(env);

  // --- required public values
  for (const name of REQUIRED_PUBLIC) if (!env[name] || env[name]!.trim() === '') add(name, 'is missing or empty');

  const supa = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (supa) {
    const u = parseUrl(supa);
    if (!u) add('NEXT_PUBLIC_SUPABASE_URL', 'is not a valid URL');
    else {
      if (u.protocol !== 'https:' && !(u.protocol === 'http:' && LOOPBACK.has(u.hostname))) add('NEXT_PUBLIC_SUPABASE_URL', 'must use https (http is allowed only for localhost)');
      if (hosted && LOOPBACK.has(u.hostname)) add('NEXT_PUBLIC_SUPABASE_URL', 'points at localhost on a hosted deployment');
      if (u.username || u.password) add('NEXT_PUBLIC_SUPABASE_URL', 'must not contain credentials');
    }
  }

  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (key) {
    if (key.length < 20) add('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'is too short to be a Supabase key');
    if (/^sb_secret_/i.test(key)) add('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'is a SECRET key; only the publishable/anon key may be public');
    if (jwtRole(key) === 'service_role') add('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'is a service-role key; only the publishable/anon key may be public');
  }

  const site = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) {
    const u = parseUrl(site);
    if (!u || (u.protocol !== 'https:' && u.protocol !== 'http:')) add('NEXT_PUBLIC_SITE_URL', 'is not a valid http(s) URL');
    else {
      if (u.pathname !== '/' || u.search || u.hash) add('NEXT_PUBLIC_SITE_URL', 'must be an origin only (no path, query or fragment)');
      if (u.username || u.password) add('NEXT_PUBLIC_SITE_URL', 'must not contain credentials');
      if (hosted && u.protocol !== 'https:') add('NEXT_PUBLIC_SITE_URL', 'must use https on a hosted deployment');
      if (hosted && LOOPBACK.has(u.hostname)) add('NEXT_PUBLIC_SITE_URL', 'points at localhost on a hosted deployment');
    }
  }

  // --- nothing secret may be exposed through the NEXT_PUBLIC_ prefix
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('NEXT_PUBLIC_') || value === undefined) continue;
    if (name !== 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY' && SECRET_NAME.test(name)) add(name, 'looks like a secret but uses the NEXT_PUBLIC_ prefix, which publishes it to every browser');
    if (name !== 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY' && (/^sb_secret_/i.test(value) || jwtRole(value) === 'service_role')) add(name, 'contains a secret/service-role credential and would be published to every browser');
  }

  // --- data mode
  const mode = env.NEXT_PUBLIC_UI_DATA_MODE;
  if (mode !== undefined && mode !== '' && mode !== 'real' && mode !== 'mock') add('NEXT_PUBLIC_UI_DATA_MODE', 'must be "real" or "mock"');
  if (mode === 'mock' && (env.NODE_ENV === 'production' || hosted)) add('NEXT_PUBLIC_UI_DATA_MODE', '"mock" is not allowed in a production build or on a hosted deployment');

  return { ok: issues.length === 0, issues };
}

export function formatEnvIssues(issues: EnvIssue[]): string {
  const lines = issues.map((i) => `  - ${i.name}: ${i.problem}`);
  return `Invalid environment configuration (${issues.length} problem${issues.length === 1 ? '' : 's'}):\n${lines.join('\n')}\nSet the variables in the hosting dashboard (see DEPLOYMENT.md, "Environment variables"). Values are never printed.`;
}

/**
 * Whether a failing check must stop the build / server start.
 *   - SKIP_ENV_VALIDATION=1 is an explicit, loud opt-out for CI jobs that compile without configuration (never a default).
 *   - It is IGNORED on Vercel production, so a deployment can never ship unvalidated.
 *   - `next dev` never blocks (it warns), and mock mode in development needs no Supabase variables.
 */
export function shouldEnforce(env: EnvInput, phase: 'build' | 'server' | 'dev'): { enforce: boolean; skippedBy?: string } {
  if (phase === 'dev') return { enforce: false };
  if (env.SKIP_ENV_VALIDATION === '1' && env.VERCEL_ENV !== 'production') return { enforce: false, skippedBy: 'SKIP_ENV_VALIDATION=1' };
  return { enforce: true };
}

export function assertEnv(env: EnvInput, phase: 'build' | 'server' | 'dev', warn: (msg: string) => void = () => undefined): void {
  const { enforce, skippedBy } = shouldEnforce(env, phase);
  const mockDev = phase === 'dev' && env.NEXT_PUBLIC_UI_DATA_MODE === 'mock';
  if (mockDev) return;
  const r = checkEnv(env);
  if (r.ok) return;
  if (!enforce) {
    warn(`${skippedBy ? `[env] validation SKIPPED via ${skippedBy}. ` : '[env] '}${formatEnvIssues(r.issues)}`);
    return;
  }
  throw new Error(formatEnvIssues(r.issues));
}
