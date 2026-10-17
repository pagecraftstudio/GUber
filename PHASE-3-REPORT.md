# MALAKY BUS SaaS — PHASE 3: AUTHENTICATION

Status: implemented and tested locally. NOT yet run against a live Supabase project.
Results: migration 0007 + 58 new SQL checks (all pass, 126 earlier checks still pass), 38 unit tests pass, typecheck clean, production build OK, runtime smoke test of routes/redirects/headers OK.

## What was built
| Area | Files |
|---|---|
| DB (Supabase) | `supabase/migrations/0007_auth_rpcs.sql`: `my_context()`, `create_invite()`, `revoke_invite()`, `preview_invite()`, `accept_invite()` |
| DB tests | `supabase/tests/03_auth_tests.sql` (58 checks, re-runnable); stub gained `email_confirmed_at` |
| Bootstrap | `supabase/bootstrap/first_super_admin.sql`, `first_company.sql` (until Phase 10 UI) |
| App core | `src/lib/env.ts`, `lib/supabase/{server,proxy}.ts`, `src/proxy.ts` |
| AuthZ (central) | `lib/auth/{types,context,permissions,guards,redirect}.ts` |
| Validation | `lib/validation/auth.ts` (zod) |
| Actions | `features/auth/actions.ts`: login, logout, forgot/reset password, invite signup, accept invite |
| Pages | `/login`, `/forgot-password`, `/reset-password`, `/invite/[token]`, `/auth/confirm` (route), `/dashboard`, `/admin`, `/suspended`, `/no-access` (dashboard/admin are placeholders for Phases 9/10) |
| Tests | 4 vitest files (permissions, redirect, context parsing, validation) |

## Architecture in one paragraph
Identity = verified Supabase JWT (`getUser()`, never `getSession()`). Tenancy and permissions = `my_context()`, which derives everything from `auth.uid()` in Postgres. The app never sends or trusts a company id. All access decisions in code go through `can(ctx, 'permission')`, `hasPlatformRole()` and `homePathFor()` in one pure module; permissions come from `role_permissions` in the DB, so role-grant changes need no code change. `proxy.ts` is only a coarse "has session" redirect plus cookie refresh. The real gates are server guards (re-check on every request) and RLS/RPC checks in Postgres.

## Flows
- **Account creation: invite only.** Owner (or super_admin) calls `create_invite` -> raw token returned once, sha256 stored. Invitee opens `/invite/<token>`, signs up with the email fixed by the invite, confirms email, clicks Accept -> `accept_invite` creates the membership.
- **Login:** generic error for bad credentials (no enumeration). Lands on `/admin`, `/dashboard`, `/suspended` or `/no-access` depending on resolved context. `?next=` is allow-listed.
- **Password reset:** same response whether or not the email exists. Reset signs out all other sessions.
- **Suspended company:** user sees `/suspended`; `my_context()` returns zero permissions; RLS already returns zero rows (Phase 2).

## Security properties (and where each is enforced)
| Property | Enforced by | Tested |
|---|---|---|
| Invite token never stored raw | `create_invite` stores sha256 | SQL |
| Stolen token useless to a different email | `accept_invite` email match | SQL |
| Unconfirmed email cannot accept | `accept_invite` checks `email_confirmed_at` | SQL |
| Token single-use, expiring, revocable | status + `expires_at` + `for update` lock | SQL |
| All invite failures look identical (no oracle) | one error message `invalid_invite` | SQL |
| Tenant user cannot invite into another company | company derived from membership; mismatched id -> 42501 | SQL |
| Manager/operations/support cannot invite | `users.write` / super_admin only | SQL |
| Suspended company cannot invite or accept | `is_company_active` | SQL |
| Open redirect via `?next=` | `safeNextPath` allow-list | unit |
| Message injection / prototype keys via `?error=` | whitelisted codes, `Object.hasOwn` | smoke |
| Admin area not discoverable | `notFound()` for non-platform users | by design |
| No service-role key in the app | not used at all in Phase 3 | n/a |

## Supabase dashboard settings YOU must apply (the app depends on them)
1. **Authentication > Providers > Email:** enabled, **Confirm email = ON**.
2. **Authentication > URL Configuration:** Site URL = your `NEXT_PUBLIC_SITE_URL`. Redirect URLs: `http://localhost:3000/**` and `https://<your-app-host>/**`.
3. **Authentication > Email Templates.** Replace the link in both templates (our route exchanges `token_hash`):
   - Confirm signup: `<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">Confirm your email</a>`
   - Reset password: `<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery">Reset your password</a>`
   Without this, the default links will not work with `/auth/confirm`.
4. **Password policy:** minimum length 10 (app also enforces 10–72). Enable leaked-password protection if your plan has it.
5. Built-in email has a very low send limit. Fine for testing (use Dashboard > Users > Add user to skip email). Production needs custom SMTP (Phase 14).

## How to test
1. Run `0007_auth_rpcs.sql` in the Supabase SQL editor. Then run `03_auth_tests.sql` (needs the 01 fixtures already present in that project). Expect `passed 58 | failed 0`.
2. Run `bootstrap/first_super_admin.sql` (after creating the user in Dashboard > Users).
3. `cp .env.example .env.local`, fill the URL and publishable key, `npm install`, `npm run dev`.
4. Walk through: login as super admin -> `/admin`. Run `first_company.sql`, open the printed invite link in a private window, create the account, confirm email, accept -> `/dashboard` shows role `owner` and permissions. Try `/admin` as the owner (expect 404). Try the forgot-password flow.
5. `npm run typecheck && npm test && npm run build`.

## Decisions I made (please confirm or change)
| # | Decision | Why |
|---|---|---|
| D1 | No public self-signup. Accounts exist only through invitations | Matches the product: companies are onboarded by MALAKY, customers book as guests (Q2) |
| D2 | Invite link is returned to the inviter to share. Not emailed | No email infrastructure until Phase 14. Avoids the low built-in email limit |
| D3 | Only `users.write` holders can invite: owner, super_admin. Managers cannot | Follows Phase 2 matrix D6. Prevents privilege spreading |
| D4 | Invite lifetime 7 days | Reasonable default, one constant in the RPC |
| D5 | Dashboard and admin live on ONE app host. Session cookies are host-scoped, so tenant custom domains never carry staff sessions | Keeps cookies off customer-facing domains. Matches Phase 12 plan |
| D6 | Platform roles are granted only by SQL (bootstrap script) | No API path to become platform staff |
| D7 | Next.js 16 (`proxy.ts` replaces `middleware.ts`), TypeScript pinned to 5.9 | Current stable. TS 7 not yet validated with Next |
| D8 | UI strings English only for now | `profiles.locale` already exists. See open question Q2 |
| D9 | Logout ends this device only. Password reset ends all others | Standard expectation for both |

## NOT done / NOT proven
- Not run on a live Supabase project (neither 0007 nor the app). Only local Postgres 16, a stub for `auth`, and a mock environment for the build.
- No UI to create/revoke invites or manage members (Phase 9). RPCs exist and are tested.
- No RPCs yet for: remove member, change role, suspend member, update own profile name via UI, change email.
- No app-level rate limiting or CAPTCHA (Supabase Auth defaults only). Phase 18.
- No Content-Security-Policy yet (Phase 18, needs storage and tenant-domain hosts decided).
- No MFA. No end-to-end browser tests (Playwright) yet.
- Direct calls to Supabase's public `signUp` endpoint still create stray accounts. They have zero access (no membership, RLS returns nothing) but clutter `auth.users`. Mitigate with CAPTCHA in Phase 18.
- `getUser()` is a network call per request (secure but adds latency). Measure in Phase 19.

## Risks found
1. Wrong redirect allow-list or unedited email templates silently break confirmation and reset links. Checklist above.
2. `search_path = ''` in SECURITY DEFINER functions means every type and function must be schema-qualified. Caught once already (`citext`). Keep this rule for all future RPCs.
3. One company per user (Q8) means a person invited to a second company gets `already_member`. Intended for V1.
4. Placeholder plan limits from 0005 still apply to invite acceptance (`max_users`).

## Open questions
- Q1. Keep copy-the-link invites until Phase 14, or do you want invite emails sooner (needs an SMTP provider)?
- Q2. Arabic/RTL for auth screens now or with the dashboard in Phase 9?
- Q3. Confirm the single app host for all staff (for example `app.yourplatform.com`).
- Q4. Should managers ever invite staff (would need `users.write` for managers, or a narrower `users.invite` permission)?

STOP. Awaiting approval for Phase 4.
