# Phase 5, journey 4: admin (companies list, company detail, new, edit, invite)

Status: built, tested, **awaiting your approval**. Off by default: `DS_SURFACES=admin` (or `all`). Unset = the old pages, unchanged. The shell (Platform band, sidebar) already existed from Phase 4.

## What changed
| Area | Change |
|---|---|
| `components/admin/masar/CompaniesMasarView.tsx` | Companies list: dense table with status, plan and subscription state ("No live plan" called out), contact, created date; slug and email as left-to-right identifiers; URL filters (search, status) with removable chips; pagination keeps the filters; empty (with and without filters) and error states |
| `CompanyDetailMasarView.tsx` | Company detail: breadcrumb, status, a banner for suspended and cancelled, profile, subscription, usage (six figures), owners and invites, internal notes, recent activity. A platform admin's actions sit in labelled groups |
| `AdminActionDialog.tsx` | One dialog for every consequential action, same props and same server actions as the old `ConfirmDialog`. The consequence is written in the dialog; a reason is required where it is kept in the audit log; danger actions focus Cancel first; refusals and field errors show in the dialog and it stays open |
| `CompanyFormsMasar.tsx`, `fields.tsx` | Create, edit, add note, invite owner, and the one-time invite link with a Copy button |
| `pages` | `admin/companies`, `[id]`, `new`, `[id]/edit` choose the look after all data and permission work, so no query, guard or permission changed |
| `/dev/admin-preview` | Dev and Vercel-preview page with FAKE data (`?view=list|detail|suspended|none|new|edit`) |

Not changed: services, RPCs, server actions, RLS, audit logging, who may do what.

## Verified
- `tsc` clean. `vitest`: 60 files, **1274 tests** pass (J3: 1225). 50 new, 33 of them for the admin screens and forms, plus guards.
- Behaviour tests (server actions faked): every row and state of the list; filters, chips and pagination links; the dialog (consequence text, focus, required reason blocks an empty submit, hidden values and reason reach the action, closes on success, stays open and shows the message or field error on refusal); detail visibility per role (super admin, billing, support), suspended and cancelled companies, no subscription, stale subscription, no owner; create, edit, note and invite forms including the one-time link and Copy; axe on list, detail (active and suspended), create form and an open dialog: no serious or critical violations.
- `next build` and `tests/bundle-scan.sh` pass (new check for the admin preview marker).
- **Real browser** (Playwright, Chromium, on `/dev/admin-preview`): all six views at 1280 and 375 wide; no horizontal scroll; no console errors; the suspend dialog opens with focus on Cancel and closes on Escape. I reviewed the screenshots.

## Bugs the browser found in my own work (and fixed)
1. `buttonClass` was exported from a client file and called in server views, so the pages would have crashed on load. It now lives in `ds/primitives/button-class.ts`; a guard test forbids importing it from the client module.
2. The list passed a function (`hrefFor`) from a server component to the client `Pagination`. `Pagination` now accepts `hrefBase` + `hrefParams`.
3. On a phone the list page was 460px wide: a screen-reader-only "Copied" region inside a table cell escaped the scroll container. Scroll containers in the new system are now positioned; guard test added; `DataTable` fixed too.
These did not show in jsdom. Two more found by reading: J2's filter chips said "Clear all: X" for removing one filter (now "Remove filter: X"), and the old admin forms **lose everything typed after a failed submit** because React resets a form after its action. The new forms keep the input (tested). The old forms are unchanged.

## Not verified
- **The real admin pages behind a platform login and real Supabase.** The views render with fake data in the preview; the same views, with the real server actions imported, rendered fine there, but no action was executed for real. Clicking a button in the preview reaches the real action, which refuses (no session, fake id).
- **A real phone**, rendered colour contrast, Safari.
- The invite link Copy button on iOS (clipboard permissions).

## Decisions and notes
1. **Dates** show as "5 October 2026, 09:00 UTC": explicit UTC and an unambiguous month. The old admin used ISO; dd/mm/yyyy would be ambiguous for staff.
2. **Admin stays English only** (no Arabic copy exists), so digits are Latin and everything is left-to-right.
3. **Not in this journey (Phase 6):** admin overview, subscriptions, plans and audit-log pages stay in the old look inside the new shell (the Phase 2 bridge recolours them). The detail page's "Recent activity" still uses the old `AuditTable`.
4. **Row actions** are on the detail page only; the list rows are links. No bulk actions, no export.
5. **The company slug** is shown as an identifier and cannot be edited (as before).
6. The list table scrolls sideways inside its own box on a phone (five columns). Admin is a desktop task; a card layout is possible if you want one.

## Needs your decision
- Approve J4, or list what you saw.
- Phone layout for the admin list: keep the sideways-scrolling table, or cards?
- Next: Phase 6 (remaining screens, delete the old components, CI guard), or a browser pass on J2 first? J2 is the only journey never looked at in a browser.
