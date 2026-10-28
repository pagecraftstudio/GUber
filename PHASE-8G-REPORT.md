# Phase 8G report: documentation (no code, no migration changed)

## Changed
- `DEPLOYMENT.md`: rewritten. Sections: status at a glance, prerequisites, env vars, pre-deploy gate, Supabase staging setup (migrations, 4.4 production gap), Auth redirect config, first-superadmin bootstrap, Vercel procedure, smoke tests, security checks, rollback/recovery, known limitations. Each step is tagged as done-locally, needs-credentials, or unverified.
- `docs/OPERATIONS.md`: **fixed a 8F mistake**. It told you to run `supabase db push --dry-run` and read CLI migration history. That is wrong for this repo (CLI skips `0013b`; history is `app_private.schema_ledger`). Now points to `scripts/db/apply-migrations.sh`.
- 8B report line 51 still says `supabase db push --dry-run`; it is a historical report, left unchanged. `DEPLOYMENT.md` and `docs/STAGING-CHECKLIST.md` are the current truth.

## Checks run
- Every repo path referenced in `DEPLOYMENT.md` exists (scripted check, no MISSING).
- Env var names match `src/lib/env*.ts` (3 variables).
- Correction during 8G: first draft claimed `grep service_role src` is empty; it is not (env-check.ts + tests). Fixed in DEPLOYMENT.md.
- No tests re-run: no code changed since 8F (tsc 0, vitest 572/572, build, bundle-scan, audit, deploy-smoke all passed at 8F).

## Gaps the docs now state plainly
- No production migration procedure exists (script has no production mode).
- Nothing hosted verified. Credentials-needed list in DEPLOYMENT.md section 11.
- Open decisions: hide expired-subscription trips (migration 0021), customer sign-out scope, admin P0002 -> 500.

Status: **8G DONE.** Not deployed. Phase 8 final report not yet issued.
