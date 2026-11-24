# P6b: Google sign-in (customers only)

## What changed

| File | Change |
|---|---|
| `src/app/auth/confirm/route.ts` | New `?code=` (PKCE) branch. Refuses a code unless `from=customer`; after the exchange, the role is resolved from the database and anything that is not `accessState === 'customer'` is rejected (Google identity unlinked when another identity remains, local session ended). Provider `?error=` (user cancelled) also handled. |
| `src/app/auth/confirm/route.test.ts` | Existing tests kept; 8 new tests for the Google branch. |
| `src/ui/lib/real/authService.real.ts` | `signInWithGoogle(next?)`. Starts only on the platform origin; from another host it sends the visitor to the platform customer login (the PKCE verifier cookie is per host). `next` re-validated with `safeNextPath`. |
| `src/ui/lib/authService.ts` | `signInWithGoogle` on the contract, optional so the mock needs no change. |
| `src/ui/components/auth/AuthModal.tsx`, `.../masar/AuthModalMasarView.tsx` | "Continue with Google" under the login and register forms. Hidden in mock mode. |

No migration. Phone: Google users have none; they enter it where it is already required (`/my-subscriptions` phone step via `savePhoneAction`, booking wizard phone field), unverified, same as password signup today.

Staff login (`/company/login`, `loginAction`) is untouched and has no Google button.

## Setup you must do

1. Google Cloud Console: create an OAuth client (type Web application).
   - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
2. Supabase dashboard: Authentication > Providers > Google. Enable, paste the client ID and secret.
3. Supabase dashboard: Authentication > URL Configuration. Add to Redirect URLs the platform origin's confirm route, with a wildcard so the query string matches, e.g. `https://guber-six.vercel.app/auth/confirm**` (verify with a real login; if the redirect falls back to Site URL, the pattern did not match).
4. Do not set anything for staff. Do not add Google to `/company/login`.

## P6c follow-up (done on branch `p6-complete`)

- Invite path closed: migration `0059` makes `accept_invite` refuse an account that has any non-email identity (suite 55, with a negative control that fails against the old function).
- `/login?error=google_failed|google_not_allowed|confirm_failed` now renders an allow-listed message in English and Egyptian Arabic (`src/ui/lib/auth-url-error.ts`).
- Captcha on login, sign-up and reset for operators, platform admins and passengers: see `DEPLOYMENT.md` 2.2. **Supabase's dashboard setting is the real enforcement.**
- Limits 2 and 3 below are therefore resolved; 1, 4, 5 (5 is now partly resolved) and 6 remain as written.

## Known limits (read before enabling)

1. **Auto-linking.** Supabase links a Google identity to an existing user with the same verified email before our route runs. For staff accounts the route undoes it (unlink + sign out), but there is a window where the link exists. "Ask for the password once before linking" is not implemented: Supabase does not offer it as a setting as far as I know. Verify in the dashboard docs.
2. **Invite path.** A person can sign in with Google first (customer), then accept a staff invite for the same email. That account would then be staff with a Google identity. Closing it needs a check in `accept_invite` or `my_context` against `auth.identities` / `app_metadata.providers`. Not done in P6b; recommend P6c.
3. **Error display.** `/login?error=google_failed|google_not_allowed` is set but the customer login page does not render `?error=` today (same as the existing `confirm_failed`). Users see the plain login screen.
4. **Return path.** Only allow-listed paths come back (`/my-bookings`, `/my-subscriptions`, ...). A Google login started on a marketplace trip page returns to the customer home, not the trip.
5. **Captcha.** Sign-in is not captcha-gated (neither is password login). Booking and subscription RPCs stay gated by P6a passes.
6. **Not run.** Written without a local checkout: nothing here has been type-checked or tested. Run `npm run typecheck && npx vitest run src/app/auth/confirm` first. `supabase.auth.getUserIdentities` / `unlinkIdentity` need a recent `@supabase/supabase-js`.
