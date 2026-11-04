# Exact partial-release reconciliation: 41798557430

Version: 1. Base: `0ce744a29eec5e0a5a0ef40960472b2f6e636396`.
Execution plan/worklog for the owner's authorized implementation, focused tests,
required CI and one protected review PR. Merge and production continuation require
separate authorization.

## Scope and plan

1. Pin the retained original audit and authenticated historical Render/GitHub facts.
2. Recognize only run 41798557430/1 and its non-executing second attempt; preserve
   both failures, original identities, timestamps and missing-artifact limitations.
3. Feed the existing Render reuse branch from that exact reconciliation in a new
   protected execution. Keep fresh admission, schema/recovery proof, runtime holds,
   unique live state, OIDC readiness and all Vercel/final verification guards.
4. Exercise altered history, provenance, state, holds and downstream failures;
   run the complete PostgreSQL-backed safety suite and hosted required CI.

## Evidence and limits

The original audit ZIP (artifact 13307300799) is unavailable after the full rerun.
Its upload digest is independently recorded in production job 126469017732's
authenticated log. The retained extracted report matches the report digest
observed during the earlier authenticated download. The record stores a lossless
canonical representation of all 30 rows, verified against their original canonical
digest; it does not recreate the ZIP or claim a newly verified ZIP-to-report link.

Render's authenticated GitHub App deployment 7541402640 and status records bind
`dep-dblemb8u01pc73a0ouh0` to the approved application SHA. These are historical
snapshots, not assertions that the deployment is still live or that holds remain
enabled. Existing authenticated Render reads must establish current state.

The original health failure is preserved without attributing a startup/transient
cause. The failed response was not retained. Attempt 2 failed admission and its
production job was skipped; no fictional attempt-2 production audit is supplied.

The original backend's recovery pair is retained as historical recovery evidence,
not reselected as the serving revision. A new run must find the exact acknowledged
deployment uniquely live at the approved SHA; absent, inactive, conflicting or
changed state stops without a Render POST. The audit uses `render-reconciled` and
records `renderOriginRunId`, `renderOriginExecutorSha` and the pinned reconciliation;
it does not attribute the old Render request to the new execution. Completed
receipts retain that provenance when read as later verified predecessors.

The source evidence PAT has no Deployments/Checks scope. Historical snapshots are
reviewed with the executor; execution reauthenticates original executor run/jobs
and failure annotations using the existing executor job token. No source-token
scope expansion, log-download mechanism or provider credential exposure is added.

## Validation

The application CI identity remains `41601901625/2`. Its existing age window ends
2026-11-05T08:16:20Z; the existing recovery readback expires earlier at
2026-11-05T05:54:23.080Z. No historical date is refreshed. Evidence must still be
valid at each existing guard, not merely when a workflow is dispatched. Admission
receipts remain new-execution-bound and have at most their existing one-hour life.

Initial focused existing suites: 52 passed, zero failed/skipped. Initial new tests:
five passed, five failed because the synthetic frontend archive belonged to a
different synthetic commit. The fixture now explicitly models the already-
authenticated archive boundary with synthetic tar metadata; production source
validation was not changed. A negative test retains the wrong-commit rejection.
The corrected initial new suite passed 11/11, zero skipped. Expanded/final results
follow:

- Expanded focused suite: **12 passed, zero failed/skipped**.
- `npm ci --ignore-scripts`: passed; 15 audited packages, zero vulnerabilities.
- Complete safety suite: **291 passed, zero failed/skipped**, Node **26.6.0**.
  The PostgreSQL replay/concurrency test executed against a disposable local
  container using the exact pinned image in `.github/workflows/test.yml`.
- `git diff --check`: passed. Hosted Node24/PostgreSQL required CI is reported on
  the PR at its exact head only after an observed result.

Tests use fixed clocks, synthetic frontend/CI/provider responses and actual pinned
historical records. Orchestration tests do not establish application Git-byte
authenticity, a live provider observation, an OIDC exchange or a production release.
Existing entry-path tests cover independent application Git-byte authentication.
