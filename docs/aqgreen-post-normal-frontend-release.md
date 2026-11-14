# AQGreen post-Normal frontend release correction (2026-11-14)

## Scope and provenance

PR 131 of `aqua-lifestyle/aqua-lifestyle` merged on protected main as
`fb4d7e509db2f5c8de68df44ea978995a5c455fb` (reviewed head
`a1c8eecbbf30f56ce47e87674012f69de5f47eb7`). The push/main CI run is
`43597833117`, attempt 1, with all 17 jobs successful and the approved 240/240
security report. Relative to the commissioned backend source
`b8d86e5e60997483423b273d5f426c08b411f573`, the authenticated compare
has 17 files: frontend files, one application test and documentation. The five
commissioning guard paths are byte-identical. The Docker publish stage produces
only Web.Host and Migrator, so the changed `aspnet-core/test/**` file is absent
from the published image. The chained immutable record is
`governance/aqgreen-frontend-source-successor-20261114.json` (SHA-256
`6b2d9aaeaf30adab12b16f1b0b4d4e9a073987ca195fac8df7ddb7ce006732b7`).

The existing executor previously required a Held runtime for every full
release, a protected pre-commissioning readiness response for a verified
predecessor and a Render deployment of the candidate SHA. This cannot release
frontend changes after commissioning: the production backend is deliberately
Normal (`paymentAvailability=Available`) and remains on the earlier SHA. A
full release must not reset commissioning flags or mistake the Vercel source
revision for the running backend BuildId.

## Correction

- A full release requires an explicit `Held` health verdict before reading
  normal-mode Render settings or issuing any provider write. `Available` and
  absent/unknown states require separate backend authorization.
- The new `post-normal-frontend-v1` choice is bound to the exact source, CI,
  completed-M55 successor chain, frozen purpose, GitHub admission, existing
  environment protection, evidence plan and audit. It does not fetch secrets,
  create infrastructure or authorize a Render POST.
- The frontend-only path accepts the prior full-release receipt, compares the
  entire application diff with a bounded frontend/test/docs allowlist and
  rechecks the currently serving backend SHA, single live Render deployment,
  health, commissioning settings and financial holds. The later commissioning
  redeployment has a *different deployment ID* from the full-release audit but
  the same SHA; both IDs are retained, and the serving ID must remain stable.
- It authenticates the existing READY Vercel deployment and production alias,
  checks the public inputs, records upload/create intent before each operation,
  then validates the resulting deployment, effective inputs, alias, web health
  and unchanged backend before emitting a terminal receipt. No automatic
  attempt-2 resume exists: any initiated upload/create requires reconciliation
  before a new attempt. Read-only stops can be recognized by the existing
  authenticated failed-run classifier.
- The release plan recognizes a successful frontend receipt separately from
  successful full releases. A frontend receipt never supplies a new backend
  baseline or schema proof, and duplicate release of its source is rejected.

## Verification and decision boundary

- `node --test --test-reporter=dot tools/deployment/*.test.mjs` passes; the
  disposable PostgreSQL case is skipped when `AQUA_TEST_DATABASE_URL` is unset.
  Tests cover record tampering, immutable schema/readback pins, purpose binding,
  Normal/Held settings, same-SHA different-ID backend continuity, alias drift,
  backend diff/drift, Vercel failures, write-ahead audit and reconciliation.
- Real `git archive fb4d7e5…` passes `prepareFrontend` (500 files, manifest
  `9f6c4e127dc2b4a5c861a2e9a99c4ea31e7a32316f182a98f89ba7ca58643a00`).
  Real GitHub compares contain 268 files from the legacy schema baseline and
  83 from the original M55 operation (no later migration files), both within
  the bounded verifier. The direct backend-to-candidate compare has 17 files.
- The authenticated run-81 audit has 58 rows and passes
  `validateBaselineReceipt` for this candidate: baseline Render
  `dep-dbrgkstbedkc73difujg` at `b8d86e5…`, Vercel
  `dpl_9gLkJk4TBHxcjK6LkKVE14eZ533x` with legacy frontend provenance.
  The currently live Render deployment is `dep-dbru710n74is738ah8bg` at the
  same backend SHA; public `/api/health` is Healthy, BuildId matches, payments
  Available; the production web proxy `/api/backend/api/health` independently
  reports that same BuildId and Available state; and the seven commissioning/
  financial control flags have the expected values. The latest executor run is
  successful run 81; no newer
  failed run needs reconciliation as of this read-only check.

**Review/merge of this executor correction and any deployment require separate
owner authorization.** Once the corrected executor is on protected main,
dispatch `deploy.yml` with `release_mode=post-normal-frontend-v1`,
`qualification_only=false`, `ci_run_id=43597833117`, `ci_run_attempt=1`,
`sha=fb4d7e509db2f5c8de68df44ea978995a5c455fb`. All other recovery inputs
stay at defaults. The workflow must revalidate Vercel's incumbent alias and
both providers live; a changed alias or state denies before mutation. The
source CI evidence has a 24-hour lifetime from its last update at
2026-11-14T13:20:29Z (deadline 2026-11-15T13:20:29Z);
if it expires, a new CI attempt requires a separately reviewed, re-pinned
successor record rather than bypassing the freshness gate.

After a frontend-only success, an ordinary full-release attempt remains
fail-closed (the Normal fence and the advanced Vercel alias require a separately
designed backend release). No post-commissioning protected-readiness or live
assembly digest endpoint is asserted by this correction: backend integrity is
bound to the previously authenticated source/assembly evidence, live SHA,
service configuration and unchanged deployment throughout the Vercel operation.
