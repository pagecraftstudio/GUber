# Tenant routing (M3C)

One render path serves every company site: `app/s/[slug]`. Configuration decides how a visitor reaches it.

| | `TENANT_MODE=path` (default) | `TENANT_MODE=subdomain` |
|---|---|---|
| Public URL | `<SITE_URL>/s/<slug>` | `https://<slug>.<PLATFORM_DOMAIN>` and verified custom domains |
| Needs | nothing | bought domain, wildcard DNS, wildcard certificate (Vercel nameservers), `PLATFORM_DOMAIN` |
| Proxy work | none (platform behaves exactly as before) | host decides: rewrite to `/s/<slug>/...`, redirect, or 404 |
| Indexing | `X-Robots-Tag: noindex, nofollow` on `/s/*` (static header in `next.config.ts`) | tenant sites indexable |
| Old `/s/<slug>` URLs | are the URLs | 308 to `<slug>.<PLATFORM_DOMAIN>` |

Switching is configuration only. All URLs are built by `tenantUrl` / `tenantHref` / `platformUrl` in `src/lib/tenant/url.ts`; never write `/s/<slug>` or `<slug>.<domain>` by hand.

## Environment
- `TENANT_MODE` `path|subdomain` (default `path`). `PLATFORM_DOMAIN` bare hostname, required in subdomain mode.
- `PLATFORM_EXTRA_HOSTS` comma list of hosts that keep serving the platform app in subdomain mode (preview deployments, `localhost`). The host of `NEXT_PUBLIC_SITE_URL`, the domain and `www.<domain>` are always platform hosts.
- A bad value fails `next build` (value-free message). At run time an unusable subdomain configuration degrades to path mode, which serves no tenant by host.
- `NEXT_PUBLIC_*` values are inlined at build time: change `NEXT_PUBLIC_SITE_URL` and rebuild. `TENANT_MODE` and `PLATFORM_DOMAIN` are read at run time by the proxy but also shape `next.config.ts` headers at start, so restart after changing them.
- Local subdomain test: `TENANT_MODE=subdomain PLATFORM_DOMAIN=localtest.me NEXT_PUBLIC_SITE_URL=http://localtest.me:3000 PLATFORM_EXTRA_HOSTS=localhost` (`*.localtest.me` resolves to 127.0.0.1).

## Security properties (all unit-tested, `src/lib/tenant/tenant.test.ts`, `src/proxy-tenant.test.ts`)
- **Rewrite by construction.** On a tenant host every path is rewritten under `/s/<slug>`. `/dashboard` becomes `/s/<slug>/dashboard`, a tenant page that does not exist, so no staff or admin route is reachable through a tenant host. The redirect list (`PLATFORM_PREFIXES`) is only a convenience.
- Only `Host` decides. `X-Forwarded-Host` is ignored. Incoming `x-tenant-*` headers are stripped; the tenant travels in the URL, never in a header.
- `/s/*` and staff `/api/*` are 404 on a tenant host. Only `/api/public/*` and `/api/csp-report` pass.
- Tenant hosts skip the session refresh: anonymous public sites, no cookie, no `Set-Cookie`, so responses stay CDN-shareable. Customer sign-in stays on the platform host (cross-host handoff is M3-X, only when leaving path mode).
- Custom host -> slug uses the anonymous `resolve_tenant` RPC (active domains of live companies only). **Fails closed**: any error or timeout is a bare 503, an unknown host a bare 404. Slug shape is re-validated.
- Unknown, suspended and deleted companies all answer 404. This deliberately differs from the plan's "suspended -> 503 page": telling the two apart would let a visitor enumerate which companies exist and which are suspended.

## Known limits
- Proxy cannot cache (Next 16: `fetch` caching options do nothing there, module state is not shared). A custom-host request costs one RPC (about one DB round trip). Acceptable while custom domains are plan-gated and rare; the planned optimisation is an external cache (Vercel Edge Config), not a global.
- Redirect "non-primary host -> primary host" is not in M3C: `resolve_tenant` returns no primary hostname. It lands with the custom-domain UI (M3F).
- Anonymous reads have no DB rate limit (`rate_limit_hit` needs `auth.uid()`). Use Vercel firewall rate rules (decision F1).
