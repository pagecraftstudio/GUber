# Branch and pull-request policy

Applies to the whole repository from M0 onward. The owner configures the GitHub settings in section 4;
the rules in sections 1-3 are followed by every contributor, human or Claude.

## 1. Branches

| Branch | Purpose | Rules |
|---|---|---|
| `main` | The only long-lived branch. Always deployable to staging. | Protected. No direct pushes. No force-push. No deletion. |
| `milestone/m<N>-<slug>` | One per plan milestone, e.g. `milestone/m1-hosted-staging`. | Branched from `main`. Merged back by pull request only. |
| `migration/<NNNN>-<slug>` | One per database migration, e.g. `migration/0022-cap-public-search-offset`. | Branched from the current milestone branch or `main`. One migration per branch. |
| `fix/<slug>` | Small fixes outside a milestone. | Branched from `main`. |

Production has no branch and no automated path. Production database changes follow the reviewed procedure
that M10 creates. Until then nothing in this repository targets production.

## 2. Pull requests

1. One pull request per migration. A migration PR contains the migration file, its SQL tests, and the update to
   the migration ledger documentation. Nothing else.
2. A milestone PR contains code and documentation for that milestone, with no migrations (those arrive in their own PRs).
3. Every PR description lists: what changed, what was tested and whether the evidence is LOCAL or HOSTED,
   and what is still open.
4. A PR is not merged until the regression gate in section 3 passes on the PR branch.
5. Squash-merge. The squash message states the milestone and, for migrations, the migration number.
6. Generated and OS files are never committed: `.DS_Store`, `*.tsbuildinfo`, `.next/`, `node_modules/`, `.env*`
   (except `.env.example`). `.gitignore` covers all of them.

## 3. Regression gate

Run on a clean checkout of the PR branch. All must pass.

```bash
npm ci
npx tsc --noEmit
npx vitest run
# needs local Postgres 16 and PostgREST 12.2.12; add E2E_TOOLS and CHROME_PATH for the browser suites
PSQL=psql POSTGREST=/path/to/postgrest E2E_TOOLS=/path/to/tools bash tests/run-all-local.sh
npx next build
bash tests/bundle-scan.sh        # must run on that exact build, with nothing changed in between
npm audit --omit=dev
```

Migrations are applied only with `scripts/db/apply-migrations.sh`. Never use `supabase db push` for this
project: it skips `0013b`.

## 4. GitHub settings (owner action)

On `main`, under Settings, Branches, Branch protection rule:

- Require a pull request before merging (at least 1 approval).
- Require status checks to pass before merging, once CI exists.
- Require branches to be up to date before merging.
- Do not allow bypassing the above settings.
- Restrict force pushes and deletions.

CI is not part of M0. The gate needs Postgres, PostgREST and Chromium; add a workflow only after M1,
when the hosted pipeline is known to work.
