# Security headers and CSP rollout

Defined in `src/lib/security-headers.ts`, applied by `next.config.ts` (unit-tested).

**Stage 1 (shipped, enforced):** `frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'; upgrade-insecure-requests` (production). Stops clickjacking, `<base>` hijack, plugin content, form exfiltration.

**Stage 1 (shipped, Report-Only):** full policy (`default/script/style/img/font/connect-src` limited to self + the Supabase origin) reporting to `/api/csp-report` -> structured log event `csp.violation`. `script-src` still includes `'unsafe-inline'` because Next.js bootstrap scripts are inline, so this policy is **not yet an XSS defence**; it discovers real sources without blocking anything.

**Stage 2 (not done):** per-request nonce in `src/proxy.ts`, drop `'unsafe-inline'` from `script-src`, promote Report-Only to enforced after one release cycle with no unexpected `csp.violation` events. Needs a browser pass on staging (not possible in this environment).

Also changed: `Permissions-Policy` was `camera=()`, which blocks the driver QR scanner (`getUserMedia`). Now `camera=(self)`.

Tenant custom domains/Storage image hosts (later phases) must be added to `img-src`/`connect-src` before enforcing.
