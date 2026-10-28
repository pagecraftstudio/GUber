# Rate limiting - what is enforced in code, what needs YOUR dashboard action

Status legend: **ENFORCED+TESTED** = in code and covered by passing local tests. **MANUAL / UNVERIFIED** = needs a dashboard change by you; nothing below is active until you do it and verify it.

## Where requests actually go (this decides what each layer can protect)

| Operation | Path | Can Vercel Firewall see it? |
|---|---|---|
| Operator login, forgot/reset password | Next.js Server Actions (`POST /company/login`, `/forgot-password`, `/reset-password`) | Yes |
| Customer login / register / customer reset | Browser -> Supabase Auth directly | **No** (use Supabase Auth limits) |
| Public trip search / stops, **via the app** (`GET /api/public/trips`, `GET /api/public/trips/:id/stops`, since Phase 8) | Browser -> Next.js route -> Supabase | **Yes** |
| Public trip search / stops, **called directly** (`/rest/v1/rpc/public_search_trips`, `public_trip_stops` with the publishable key) | Anyone -> Supabase PostgREST | **No** (still open, see 3b) |
| Booking create / cancel, ticket QR | Browser -> Supabase PostgREST directly | **No** |
| Driver boarding scan | Browser -> Supabase PostgREST directly | **No** |
| Failure reports, CSP reports | Next.js `/api/telemetry/failure`, `/api/csp-report` | Yes |

The earlier proposal said Vercel Firewall would cover public search and customer login. That was wrong for the original architecture. Since Phase 8 the **app's own** search goes through `/api/public/*` and can be protected; customer login still bypasses Vercel, and so does anyone who calls the Supabase RPC directly.

## 1. ENFORCED+TESTED - database limiter (migration 0020)

| Bucket (RPC) | Limit per user |
|---|---|
| `booking.create` (`create_my_booking`) | 20 / 10 min **and** 60 / day |
| `booking.cancel` (`cancel_my_booking`) | 20 / 10 min |
| `ticket.qr` (`my_ticket_qr`) | 30 / 10 min |
| `ticket.board` (`board_ticket`) | 180 / min per driver |

Over the limit: SQLSTATE `PT429` -> HTTP 429, `hint` = seconds until reset. Limits are rows in `app_private.rate_limit_policies`; change them with a new migration. Unknown bucket fails closed.

Known limits of this design:
- Only calls that **commit** are counted (a failing call rolls back its own counter). Failed-call floods are not throttled by this layer.
- Fixed windows: up to 2x the limit can pass across a window boundary.
- Anonymous endpoints (search, login) have no `auth.uid()` and are not covered.
- Run `select app_private.rate_limit_purge();` occasionally (SQL editor). ~1% of calls also purge opportunistically.

## 2. MANUAL / UNVERIFIED - Supabase dashboard (covers customer login and public search)

1. **Authentication -> Rate Limits**: review sign-in, sign-up, token refresh, password-recovery/email-send limits. Lower the email limits if you use custom SMTP. Record the values you set.
2. **Authentication -> Attack Protection**: enable CAPTCHA (Turnstile/hCaptcha) for sign-up and password recovery. Enabling it requires a matching frontend token change that is **not implemented** yet - do not enable before that work is scheduled.
3. **Public search (`public_search_trips`) called directly**: Supabase has no per-endpoint limiter for PostgREST. Mitigations inside the function: result `limit` clamped to 100; only published companies, active/trial status, live subscription (0021) and scheduled trips are returned. Remaining gap: `offset` is not capped in the database (the HTTP route validates it; the RPC does not). See 3b.

## 3. MANUAL / UNVERIFIED - Vercel Firewall (Project -> Firewall -> Custom Rules)

Plan limits for rate-limit rules differ per Vercel plan; check yours. Create, in this order, action **Rate Limit** (key = IP), unless stated:

| Rule | Condition | Suggested limit |
|---|---|---|
| operator-login | Method POST and Path equals `/company/login` | 10 / 1 min |
| forgot-password | Method POST and Path equals `/forgot-password` | 5 / 5 min |
| reset-password | Method POST and Path equals `/reset-password` | 10 / 5 min |
| invite | Method POST and Path starts with `/invite/` | 10 / 5 min |
| telemetry | Path starts with `/api/telemetry/` | 30 / 1 min |
| csp-report | Path equals `/api/csp-report` | 30 / 1 min |
| auth-callback | Path equals `/auth/confirm` | 20 / 1 min |

| public-search | Method GET and Path starts with `/api/public/` | 60 / 1 min per IP (campus NAT: do not go lower) |

**What the `public-search` rule protects:** the Next.js routes `/api/public/trips` and `/api/public/trips/:id/stops` (Vercel function invocations and the upstream Supabase load they cause). The responses are CDN-cacheable (`s-maxage` 30 s trips / 120 s stops, no cookies, no per-user variance), so most repeat traffic never reaches the function.
**What it does NOT protect:** direct requests to `https://<ref>.supabase.co/rest/v1/rpc/public_search_trips` and `public_trip_stops`. Those never touch Vercel (3b). It also does not protect booking, tickets, boarding or customer login.
**Cache header design (found by a browser test):** `Cache-Control: public, max-age=0, s-maxage=30` for browsers/other CDNs, and `Vercel-CDN-Cache-Control: max-age=30, stale-while-revalidate=60` for the Vercel CDN only. `stale-while-revalidate` must not be in `Cache-Control`: Chrome honours it and showed stale seat counts ("Fully Booked" for a freed trip) in `tests/e2e/portal.mjs`.

Start each rule in **Log** mode for a day, check Firewall -> Traffic for false positives (university campuses share NAT IPs: do not set per-IP limits lower than above), then switch to **Deny/429**.

Verification once configured (from a terminal; do not use production credentials):
`for i in $(seq 1 15); do curl -s -o /dev/null -w "%{http_code} " -X POST https://<staging>/company/login -d x=1; done` - expect 429s after the limit. Until you have seen that, treat firewall protection as **not active**. For the public rule: `for i in $(seq 1 80); do curl -s -o /dev/null -w "%{http_code} " "https://<staging>/api/public/trips?limit=1"; done` (cache hits may not reach the function; vary `?date=` to defeat the cache while testing).

## 3b. DECISION - closing the direct-RPC bypass (security recommendation)

Facts verified in this repo: `public_search_trips` and `public_trip_stops` are `SECURITY DEFINER`, `STABLE`, read-only, with `EXECUTE` granted to `anon, authenticated` (0013, re-created in 0021). The Next.js route calls them with the **publishable key and no session** (no service-role key exists anywhere in the app; `tests/bundle-scan.sh` fails the build if one appears). The publishable key is public by design, so anyone can call the RPCs directly.

| | A. Revoke `anon` EXECUTE, call through a server-only privileged path | B. Keep anonymous RPCs, document residual risk |
|---|---|---|
| Closes the bypass | Yes, for anonymous callers | No |
| New secret in Vercel env | **Yes**: a service-role key (it bypasses RLS on every table) or a hand-minted JWT for a custom DB role signed with the project JWT secret | None |
| Blast radius of a leaked server env or an SSRF/RCE in the app | Full database read/write (service role) | Unchanged: only already-public data |
| What it protects | Read-only data that is public by design (published trips, fares, seats), already clamped to 100 rows and filtered by tenant/subscription rules | same |
| Impact if abused | Scraping of public data; read load on Postgres (DoS-style) | same, until a Supabase-side control exists |
| Side effects | Breaks every direct caller (staging smoke test, third-party clients) and the `authenticated` grant; needs a deployment-order plan (code first, then revoke) | none |
| Hosted validation possible now | No | n/a |

**Recommendation: B for now, with the gap stated plainly. Do not claim it is closed.** Reason: option A swaps a low-severity availability/scraping risk on public data for a high-severity secret (a god-key) in the web tier, which violates least privilege. A least-privilege variant of A (custom DB role + minted JWT) depends on the project's JWT-signing configuration (legacy secret vs asymmetric keys) that cannot be verified without a hosted project, so it is not implemented. It was **not** tested and no grant was changed.

Residual risk accepted under B, and its mitigations:
1. Direct anonymous calls bypass Vercel Firewall and the CDN cache. Mitigation: Supabase project-level limits and compute sizing (dashboard, **unverified**), Supabase API/DB metrics alerting (recommended), data is public anyway.
2. `offset` is uncapped in the RPC. Recommended small follow-up migration (needs approval, would make the migration count 23): cap `p_offset` (e.g. 1000). Not done.
3. Revisit A if the product ever exposes non-public data through these RPCs, or if abuse is observed. Preconditions for A: a custom DB role limited to `EXECUTE` on exactly these two functions, a short-lived server-signed token, input validation (already in the route's zod schemas), a test proving anonymous direct calls get 401/403 while `/api/public/*` still returns 200, and a deployment order (ship code, set the secret, then revoke).

Test coverage that does exist: `src/lib/public-search/public-search.test.ts` (route contract, allow-listed columns, no cookies, cache headers, no upstream error leakage), `tests/integration/public-search.int.test.ts` (real PostgREST), `tests/e2e/deploy-smoke-local.mjs` and `flow-smoke-local.mjs` (HTTP routes end to end). There is intentionally no test that anonymous direct RPC calls are denied, because they are allowed.
