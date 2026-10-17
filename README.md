# MALAKY Bus SaaS (fused)
Next.js 16 + Supabase backend (Phase 5A) + customer marketplace at `/` (real backend; mock data only in `next dev` with `NEXT_PUBLIC_UI_DATA_MODE=mock`).
- `cp .env.example .env.local`, `npm i`, `npm run dev`, open `/`
- Checks: `npx tsc --noEmit`, `npx vitest run`, `tests/run-all-local.sh` (local PG + PostgREST, not live Supabase)
- See `docs/INTEGRATION-MAP.md`.

## Entry routes
| URL | Who | Notes |
|---|---|---|
| `/` | everyone | public marketplace, trip search without login |
| `/login`, `/register` | customers | Supabase Auth; then `/continue` sends each role to its own area |
| `/my-bookings` | customers | bookings, tickets, QR; server-guarded (`requireCustomer`) |
| `/company/login` | staff, drivers, platform admins | operator sign in -> `/dashboard`, `/driver`, `/admin` |
| `/continue` | signed-in | role-aware dispatcher (server-resolved role) |
| `/app/*` | legacy | redirects to `/` |
