# Rate limiting - what is enforced in code, what needs YOUR dashboard action

Status legend: **ENFORCED+TESTED** = in code and covered by passing local tests. **MANUAL / UNVERIFIED** = needs a dashboard change by you; nothing below is active until you do it and verify it.

## Where requests actually go (this decides what each layer can protect)

| Operation | Path | Can Vercel Firewall see it? |
|---|---|---|
| Operator login, forgot/reset password | Next.js Server Actions (`POST /company/login`, `/forgot-password`, `/reset-password`) | Yes |
| Customer login / register / customer reset | Browser -> Supabase Auth directly | **No** (use Supabase Auth limits) |
| Public trip search (`public_search_trips`, `public_trip_stops`) | Browser -> Supabase PostgREST directly | **No** |
| Booking create / cancel, ticket QR | Browser -> Supabase PostgREST directly | **No** |
| Driver boarding scan | Browser -> Supabase PostgREST directly | **No** |
| Failure reports, CSP reports | Next.js `/api/telemetry/failure`, `/api/csp-report` | Yes |

The earlier proposal said Vercel Firewall would cover public search and customer login. That was wrong for this architecture: those calls bypass Vercel. The correction is below.

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
3. **Public search (`public_search_trips`)**: Supabase has no per-endpoint limiter for PostgREST. Current mitigations in the function: result `limit` clamped to 100; only published companies/scheduled trips. Remaining gap: unbounded `offset`. Recommended follow-up (needs your decision): route search through a Next.js route handler with `s-maxage` caching so Vercel Firewall + CDN can protect it.

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

Start each rule in **Log** mode for a day, check Firewall -> Traffic for false positives (university campuses share NAT IPs: do not set per-IP limits lower than above), then switch to **Deny/429**.

Verification once configured (from a terminal; do not use production credentials):
`for i in $(seq 1 15); do curl -s -o /dev/null -w "%{http_code} " -X POST https://<staging>/company/login -d x=1; done` - expect 429s after the limit. Until you have seen that, treat firewall protection as **not active**.
