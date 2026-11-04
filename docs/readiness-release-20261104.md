# Exact main-push readiness-fix release

Version 1. Base executor: `db12f253a86d365b08fdb140c04ab3b2e26f02b1`.
Worklog/implementation evidence, not independent business authority. The owner
directed merging application PR120, allowing normal CI/automatic triggering and
addressing only necessary new-SHA release bindings without another approval round.

## Exact scope

- Application merge `2488682e7f36828c380b2f962f29b9f9b4cb6384`, PR120 head
  `ef4c479779249c77985089be554067f193cf6041`, main-push CI `41861969794/1`.
- The only additional production-source change is the approved protected-readiness
  GET through the cutover operational route gate. Its middleware digest is pinned.
- All existing migration/SQL, database/Tenant/target, policy and financial guard
  facts remain exact. The completed migration is not re-executed or re-dated.
- Original partial release `41798557430` and readiness failure `41822854444/1`
  remain failed. The latter uses its actual original available archive and digest,
  not a synthesized audit or a successful predecessor assertion.

## Reuse versus new deployment

The existing `1b748df...` backend is the authenticated starting deployment, not the
new candidate. Its exact ID/SHA must be uniquely live, healthy and held before a
new Render request. The original `4eba379...` recovery pair stays historical
recovery evidence and must remain available; it is not called the current backend.

The existing Render-first deployment branch issues at most one request for the new
qualified SHA. Already-deployed/unreceipted new-SHA operations and concurrent state
deny rather than submitting a duplicate. OIDC readiness still must pass after that
operation and before any frontend upload. Original source/readback timestamps and
expiry are unchanged; the exact reviewed successor explicitly carries those facts
and identifies its historical recovery source rather than relabeling observations.

New audits distinguish starting Render ID/SHA, original recovery pair and actual
new Render acknowledgement. The ordinary final source/build-input/domain/health/
hold checks and authenticated success audit remain mandatory.

## Automation

Application `release.yml` remains unchanged. It accepts only completed successful
main-push CI for the same repository, requalifies SHA/attempt and dispatches only
the fixed executor workflow on main. No provider credentials/targets are carried.
The executor reauthenticates source, CI, protected merge, history, recovery, holds
and actual providers. No automatic trigger is disabled or replaced.

## Validation / execution

Initial focused schema/recovery/history/continuation tests: 63 passed, zero skipped.
Expanded focused tests: **64 passed, zero failed/skipped**. Full local safety suite:
**300 passed, zero failed/skipped**, including the real disposable PostgreSQL
concurrency test against the existing CI-pinned image. The test container was
stopped afterward. Hosted required results are recorded on the exact review PR.
Tests use controlled clocks and provider substitutes, with an authentic retained
historical failure archive. They are not production operation or OIDC evidence.

Actual main-CI, trigger and provider results are reported only after observation.
No financial activation, migration, credential or infrastructure change is included.

## Actual new-source acknowledgement and guarded continuation

Application main CI `41861969794/1` passed all 17 jobs. Automatic trigger
`41866785653` failed at App-token setup before its dispatch step; no trigger or
credential setting was changed. The existing authorized executor workflow was
invoked once as `41868204651/1` at executor `bda49a9...`.

That execution issued one Render request for the new source. Render App deployment
`7551712123` acknowledged `dep-dbllu0gm7kps73bujf70` and reported success. The
executor's immediate health predicate failed; its response was not retained and
no transient/startup cause is assumed. A later ordinary health observation passed
the exact predicate at the new source. No Vercel operation was initiated.

The separate immutable continuation record retains that original failed outcome,
actual original archive/digests and provider acknowledgement. The existing reuse
branch may use only that exact new-source deployment after fresh unique-live,
health, hold, recovery and OIDC checks. It must not redeploy Render or adopt another
same-SHA ID. Audits preserve the original operation's run/executor and distinguish
the continuation's actual starting revision from the original rollout baseline.

Focused history/continuation tests: **42 passed, zero failed/skipped**. They cover
authenticated archive preservation, no Render POST on reuse, altered/missing/live
state rejection, unchanged OIDC/financial/recovery gates and verified audit origin.
Hosted full safety results are recorded on the exact continuation-binding PR.
