# MALAKY BUS SaaS — PHASE 2: MIGRATIONS + RLS

Status: implemented and tested on local Postgres 16 (NOT yet on a Supabase project).
Result: 6 migrations apply cleanly from empty; 126 automated checks, 0 failures.

## Files
| File | Content |
|---|---|
| migrations/0001 | extensions (citext, btree_gist), `app_private` schema, shared trigger fns |
| migrations/0002 | 19 tables: identity, catalog, platform, billing, audit, media |
| migrations/0003 | 15 tables: transport, customers, bookings, website, communication (total 34) |
| migrations/0004 | triggers: updated_at, company_id immutable, audit append-only, auth->profiles sync, last-owner, trip rules, stop/route check, plan limits |
| migrations/0005 | seed: 5 roles, 28 permissions, role grants, 9 entitlement keys, 3 PLACEHOLDER plans |
| migrations/0006 | RLS helpers, all policies, grants, `my_company` view, `resolve_tenant()`, `my_company_status()` |
| tests/ | stub for auth/roles (local only), fixtures, 126 checks |

## Decisions I made (please confirm or change)
| # | Decision | Why |
|---|---|---|
| D1 | Q11–Q13 recommendations applied as written (single-language ops names, 30-day rolling window, template edits affect future dates only). Nothing in 0002/0003 depends on them | You said start Phase 2 |
| D2 | No client writes to `company_users`, `company_invites`, `domains`, `subscriptions`, `bookings`, `booking_payments`, `website_publications`. They go through SECURITY DEFINER RPCs (Phase 3/5/8) | Closes privilege escalation (manager promoting self to owner) and keeps seat counter honest |
| D3 | Tenants have NO policy on `companies`. They read the `my_company` view (no `suspension_reason`) | Risk R8 |
| D4 | Driver sees only: assigned trips, their route, stops, bus, own driver row. No passenger list yet | `customers.notes` is staff-only; passenger list = safe RPC in Phase 8 |
| D5 | Platform staff: any role reads all; `super_admin` insert/update; `billing` writes billing tables; `support` adds notes. Nobody gets DELETE | Hard purge only via audited function |
| D6 | Role matrix: manager = everything except `billing.read`, `users.write`, `domains.write`. operations = routes/buses/drivers/trips rw + bookings read. booking = customers/bookings rw + trips/routes read | Editable data in 0005 |
| D7 | Plan limits enforced now by trigger for buses, drivers, routes, company_users (advisory lock vs race). No live subscription = cannot create | Secure default. Monthly trip/booking limits wait for Phases 5/8 |
| D8 | Seeded plans are PLACEHOLDERS: price 0, `is_public=false`, invented limits | You must set real values |
| D9 | `SET NULL (col)` composite FKs used for media/template refs (needs PG15+) | Replaces the trigger idea in design §5 |
| D10 | `trips`: `seats_booked`, `buffer_minutes`, `blocked_until` not client-writable (column grants); `created_by` forced to caller | R1, R2 |

## Deviations from the Phase 1 doc
- Design ER diagram still shows `companies ||--o{ roles` (custom roles). Wrong since Q9. Fix in doc.
- Added `company_settings` auto-row trigger on company insert.
- `slug` and `hostname` checks also test `= lower(...)`: citext `~` is case-insensitive, so the regex alone would let `Bad-Slug` through. Found while designing, covered by tests.

## Tested (all pass)
Tenant isolation (A cannot read/update/delete/insert B across routes, trips, bookings, customers, buses, drivers, invoices, media, publications), composite-FK cross-tenant links, company_id immutability, 5 roles incl. driver least privilege, suspended lockout, bus/driver overlap incl. buffer, cancelled trips not blocking, overbooking CHECK, protected columns, plan limits, last-owner, one-company-per-user, audit append-only, anon access, platform roles, suspension then reactivation.

## NOT done / NOT proven
- Not run on a real Supabase project (stub for `auth`). Run `supabase db reset` + tests there before trusting.
- Storage bucket policies: Phase 13.
- No RPCs yet: company onboarding, invite accept, booking, publish, trip generation. Tests build fixtures as superuser.
- Direct `profiles` updates by platform staff (ban switch) not exposed to clients. Needs RPC.
- RLS performance not measured (`has_permission` per row). Check with EXPLAIN at realistic volume.
- Tenant "update own company profile" (legal name, contact) needs an RPC. No client write on `companies`.

## Risks found
1. `has_permission()` runs per row. Fine small, measure later.
2. Seeded placeholder limits could ship by accident. `is_public=false` guards the pricing page only.
3. Q8 `UNIQUE (user_id)` plus `max_users` trigger: when Q8 is dropped, review `keep_one_owner` and the helpers together.

STOP. Awaiting approval for Phase 3.
