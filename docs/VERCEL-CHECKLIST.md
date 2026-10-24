# Vercel deployment checklist (Phase 8D)

Everything here is a PROCEDURE. Nothing in this repo has been deployed to Vercel or run against a hosted Supabase project.
Items marked **[verified locally]** were run against `next build` + `next start` on Node 22 with placeholder values.
Items marked **[UNVERIFIED]** need a real Vercel project and are written from platform documentation, not from a test.

## 1. Project settings
| Setting | Value | Status |
|---|---|---|
| Framework preset | Next.js | unverified |
| Root Directory | the folder that contains `package.json` and `next.config.ts` | unverified |
| Node.js Version | **22.x** (`package.json` engines is pinned to `22.x`; the build was only tested on 22) | engines pin verified; dashboard setting unverified |
| Build / Install command | defaults (`next build`, `npm ci`) | unverified |
| Function Region | the region closest to your Supabase project (every page and RPC round-trips to it) | unverified |

## 2. Environment variables (exactly three; names match the code)
| Name | Production | Preview (staging) |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | prod project URL | staging project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | prod publishable/anon key | staging key |
| `NEXT_PUBLIC_SITE_URL` | `https://<prod host>` (origin only) | `https://<stable staging host>` (origin only) |

- Set Production and Preview **separately**; never point previews at the production Supabase project.
- `NEXT_PUBLIC_*` values are **inlined at build time**. Changing one requires a **redeploy** (a restart is not enough).
- Do NOT set `NEXT_PUBLIC_UI_DATA_MODE`, `SKIP_ENV_VALIDATION`, or any service-role / secret key.
  Verified by real `next build` runs: the build refuses mock mode, a `sb_secret_` or service-role JWT in the publishable slot, an http site URL on a hosted env, and any `NEXT_PUBLIC_*` name containing SECRET / PRIVATE / PASSWORD / SERVICE_ROLE / API_KEY.
  `SKIP_ENV_VALIDATION` is ignored on every Vercel environment. **[verified locally]**
- Failure output lists variable names and the rule, never values. **[verified locally]**

## 3. Staging on Vercel: preview-URL pitfalls **[UNVERIFIED, follows from the code]**
Auth email links are built from `NEXT_PUBLIC_SITE_URL`, and the failure-telemetry endpoint accepts only requests whose `Origin` equals it. Therefore:
1. Staging needs ONE stable URL (a Vercel domain alias such as `staging.<yourdomain>` assigned to the staging branch). Do not test auth or booking on a random per-commit preview URL: emails would point at `SITE_URL`, and telemetry reports would be refused with 403.
2. Add that exact origin to Supabase Auth > URL Configuration (Site URL, and Redirect URLs `https://<host>/**`; redirect URLs carry `?next=...&from=...`).
3. Vercel "Deployment Protection" on previews blocks anonymous visitors, including customers clicking an email link. Use a protection bypass for testers, or leave protection off for the staging alias.

## 4. After the first deployment
```
scripts/smoke/deploy-smoke.sh https://<staging host>
```
Read-only (GET/HEAD plus one cross-origin POST that must be refused). Checks public routes, role-correct login redirects, open-redirect handling, auth-callback failure routing, security headers, indexing policy.
**[verified locally against `next start`: PASS]**. It does not log in. Login, booking, QR, boarding, tenant isolation and subscription behaviour need real accounts: `docs/STAGING-CHECKLIST.md`.

## 5. Look at these on the first hosted run **[UNVERIFIED]**
- `Set-Cookie` for `sb-*` carries `Secure; SameSite=Lax` (code adds `Secure` when `SITE_URL` is https; unit-tested only, never observed in a browser).
- Vercel > Logs shows no `Invalid environment configuration` line and the app boots (`instrumentation.ts` runs the same check at cold start).
- `Content-Security-Policy-Report-Only` violations arrive at `/api/csp-report` (structured log). Google Fonts are now in the policy; anything else reported is a real source to review before Stage 2 enforcement.
- `/` is prerendered with `Cache-Control: s-maxage=31536000` (CDN holds it until the next deployment). It has no per-user data; trips load client-side. Confirm after deploy that a signed-in customer never sees another person's state on `/`.
- A customer who confirms signup with no `next` lands on `/my-bookings` (the route reads the session created by `verifyOtp` through a second server client in the same request).
- Rollback: Deployments > a previous deployment > Promote to Production (app only; database migrations are forward-only, see DEPLOYMENT.md).
