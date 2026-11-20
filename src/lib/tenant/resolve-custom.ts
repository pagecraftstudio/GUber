import { isSlug } from './host';

/**
 * hostname -> slug for CUSTOM domains, from the proxy. The proxy may not cache (Next 16: fetch caching options have no effect
 * there and module state is not shared), so this is one anonymous RPC per request to a custom host. That is acceptable in v1
 * because custom domains are plan-gated and rare; the planned optimisation is an external cache (Vercel Edge Config), not a global.
 *
 * Calls exactly what an anonymous browser could: public.resolve_tenant (EXECUTE granted to anon, returns company_id/slug/status
 * of ACTIVE domains of live companies only). FAIL CLOSED: any error or timeout is { ok: false } and the proxy answers 503.
 */
export type CustomHostResult = { ok: true; slug: string | null } | { ok: false };

export interface CustomHostOptions {
  supabaseUrl: string;
  publishableKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export async function resolveCustomHost(hostname: string, o: CustomHostOptions): Promise<CustomHostResult> {
  const f = o.fetchImpl ?? fetch;
  try {
    const res = await f(`${o.supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/resolve_tenant`, {
      method: 'POST',
      headers: { apikey: o.publishableKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ p_hostname: hostname }),
      cache: 'no-store',
      signal: AbortSignal.timeout(o.timeoutMs ?? 1500),
    });
    if (!res.ok) return { ok: false };
    const rows: unknown = await res.json();
    if (!Array.isArray(rows)) return { ok: false };
    if (rows.length === 0) return { ok: true, slug: null };
    const slug = (rows[0] as { slug?: unknown }).slug;
    return typeof slug === 'string' && isSlug(slug) ? { ok: true, slug } : { ok: false };
  } catch {
    return { ok: false };
  }
}
