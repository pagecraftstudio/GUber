/** Cold-start guard: a misconfigured server refuses to serve instead of failing on the first user request. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NODE_ENV !== 'production') return;
  const { assertEnv } = await import('./lib/env-check');
  assertEnv(process.env, 'server', (m) => console.warn(m));
}
