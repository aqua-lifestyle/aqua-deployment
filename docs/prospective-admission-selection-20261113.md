# Prospective admission recovery selection — 13 November 2026

## Cause and bounded correction

Production-purpose run `43380442152/1`, executor
`c32fe4e213f73cc051b0e233f73fd6a59e542a9a`, selected authenticated prospective
recovery for application `b8d86e5e60997483423b273d5f426c08b411f573` and CI
`43191377577/2`. GitHub-only admission nevertheless invoked the legacy
first-release validator and failed `FIRST_RELEASE_RECOVERY_EVIDENCE_EXPIRED`.

The November 4 legacy observation expired on November 5. PRs #30–32 established
the historical-completion lifetime, live-baseline identification and exact
recovery-evidence carry-forward; they did not make that observation current or
grant arbitrary successors its recovery scope. Removing expiry alone would
expose `NATIVE_RECOVERY_EXACT_SCOPE_REQUIRED` for this candidate.

The only production logic change adds `!prospectiveProof` to the existing legacy
recovery selection in `main()`'s `admit` branch. This matches the evidence planner
and deployment contract: legacy recovery is required only without a verified
predecessor or authenticated prospective recovery.

`prospectiveProof` is a local result of `loadProspectiveRecovery()`, not a dispatch
flag, option or candidate-supplied object. That loader authenticates the capture
run, same executor, owner, jobs, exact artifact and ZIP digest, baseline freshness,
source comparison, target/CI bindings and separate release-attempt-specific owner
authorization. Frozen candidate and separate proof-file equality checks still
run before admission. Invalid prospective evidence fails rather than falling
back to legacy recovery.

All legacy expiry, exact-scope, provenance and identity checks remain intact.
Historical M55/readback/operation records, incomplete incident evidence, source
successor and policy bindings, migration and financial/payout guards have no
changes.

## Validation

Runtime: Node `26.6.0` locally. Dependencies installed with `npm ci --ignore-scripts`.

- Before the correction, the entry-point regression reached its throwing legacy
  readback getter; all other then-current cases passed (29 passed, 1 failed).
- Final focused command:
  `node --test tools/deployment/prospective-admission.test.mjs`:
  **33 passed, 0 failed, 0 skipped**.
- Full existing command: `node --test tools/deployment/*.test.mjs`:
  **394 tests, 393 passed, 0 failed, 1 skipped**. The existing disposable PostgreSQL
  replay concurrency test skipped because `AQUA_TEST_DATABASE_URL` is not
  configured locally. No database infrastructure was created. The unchanged
  required hosted safety workflow supplies its existing PostgreSQL service.

The focused tests execute actual `main(..., { mode: 'candidate' })` and
`main(..., { mode: 'admit' })`, including:

1. Exact 17-job source qualification, current source/executor and protected-merge
   checks, purpose-bound candidate freezing and inert archive authentication.
2. Full prospective loader authentication, fresh owner authorization, real
   ZIP extraction/digest checks, same-executor capture and complete frontend
   comparison; wrong owner, expired authorization, missing/corrupt/stale capture,
   wrong CI/digest, unsafe payment state and forged/missing proof all deny.
3. Security inventory/report validation and CI freshness; changed definitions,
   skipped cases and another CI attempt deny.
4. Complete fixture release history and all three pinned incomplete-incident
   attempts. Gaps, concurrent releases or changed outcomes deny. Missing original
   audits remain unavailable; no failed release becomes a successful predecessor.
5. Actual checked-in exact successor and M55 validators with
   `qualificationOnly=false` and no verified predecessor. All 25 source/migration/
   financial/payout pins are challenged individually; changed readback, missing
   operation ancestry and extra migration deny.
6. Receipt creation, frozen evidence-plan output, receipt identity/purpose
   substitution and expiry rejection. Legacy expiry, exact scope and immutable
   readback digest still deny on the legacy path; an authenticated verified
   predecessor retains its separate branch.

These are offline component/orchestration tests: GitHub responses, source digest
reads and the inert source-archive boundary are fixtures. The default wall clock
is frozen inside each test. Original governance timestamps are not modified.
Provider API methods fail the test if reached, and provider credentials are
absent. Live capture, OIDC exchange, live settings/payout verification, production
admission-job consumption, provider deployment and member/admin journeys were
not executed. Ordinary existing provider-fixture tests in the full suite remain
component evidence rather than live provider verification.

## Existing evidence window and remaining release prerequisites

At the authenticated GitHub check on 13 November around `07:41Z`, application and
executor main still matched the named source and base executor. CI remained
successful at exact attempt `2`.

The attempt-specific API reports CI completion at `2026-11-12T10:38:00Z`, matching
the previously stated 24-hour deadline. The current-run endpoint actually used by
`verifyGitHubEvidence()` reports `updated_at=2026-11-12T10:37:59Z`; use the earlier
**2026-11-13T10:37:59Z** as the conservative admission/receipt deadline. The CI is
usable only while the current-run freshness and all other exact bindings still
pass; availability through a future review/merge cannot be guaranteed. A new
attempt is not silently accepted because the source-successor record pins `/2`.

Capture `43380051278/1` expired at `2026-11-13T07:09:05.682Z` and is bound to the
old executor. A corrected merged executor requires a fresh capture using the
existing protected mechanism and a new, exact release-attempt owner authorization.
Authorization from failed run `43380442152/1` is not transferable.

This correction is for protected PR review and safety CI. It does not establish
live release readiness or authorize another release attempt. No production
deployment, workflow dispatch, provider/credential change, D10/financial
activation or historical-record rewrite was performed.
