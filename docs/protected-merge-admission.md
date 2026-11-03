# Protected-merge admission without administrative API dependencies

Version: 1. Base: `975b86ae470c7ed4f0e253e652b95993ff665fdc`.
Branch: `fix/protected-merge-admission-20261103`.

## Governing owner direction

The owner's current **“Eliminate Unnecessary GitHub Deployment Blockers”** directive
authorizes one focused reviewed correction: remove runtime branch-governance and
administrative checks duplicating existing GitHub protected merges; retain exact
approved application/CI/workflow and authorized release, credential isolation,
financial/database safeguards, provider sequencing and failed-operation
reconciliation; then execute one qualification-only attempt after merge.
Production is not authorized. This worklog records execution, not independent
business authority or an assertion that production is verified.

## Minimal release contract

The release controller no longer calls either repository's `/rules/branches`,
`/rulesets`, `/environments` or deployment-branch-policy configuration endpoints.
It does not replace inaccessible settings with fabricated empty/valid values.
Instead, GitHub's existing protected merge and production-environment boundaries
enforce configuration under the trusted-administrator model selected by the owner.

Runtime still requires:

1. GitHub-provided protected `main` context in both the candidate job and controller
   guards. Missing/false protected-ref evidence fails closed.
2. The exact executor workflow/checkout SHA, a trusted administrator's merged PR
   for that revision, current executor main and the exact in-progress run/attempt.
3. The exact current-main application SHA, successful fixed CI workflow/main-push,
   complete successful 17-job inventory and exact unique job/check/run identities.
4. Application merged-PR provenance, approved workflow/security definition hashes,
   exact authenticated artifact and all 240 mandatory security-case executions.
5. Existing freshness, purpose-bound receipts, complete attempt/history accounting,
   schema/recovery compatibility and financial restrictions. An acknowledged or
   uncertain provider operation still requires reconciliation.

GitHub protections are an external enforcement boundary, not a second settings
audit implemented by the executor. Trusted administrators remain responsible for
maintaining them; runtime no longer claims to independently detect their detailed
configuration or an administrator changing it. A future configuration change is
not implicitly authorized by this correction.

## Credential and provider boundaries

Existing source-token and native executor-job-token routing is unchanged. No token
replacement, permission expansion, additional App, diagnostic workflow or evidence
system is introduced. Application source remains inert Git objects. Provider secrets
remain only in the dependent production environment/controller step; successful
qualification-only output cannot enter that job. Render-first deployment, runtime
restrictions, Vercel verification and write-ahead mutation audit ordering are not
edited.

Historical setup validators remain for the dormant PR-1 credential checker, which
is not part of candidate/admission/deployment execution and is not reopened.
Previously supported producer fingerprints, including the reviewed PR-26 producer,
are retained so this change cannot erase authenticated history. No failed Render
deployment is promoted to successful/unexecuted status and no per-run exception is
added.

## Plan and evidence

1. Remove only the duplicated runtime settings reads and enforce protected-ref
   context directly; adapt the affected regression assertions to this owner-selected
   contract.
2. Run focused/full executor safety checks and review the complete diff.
3. Obtain exact-head protected review and required CI, then normal protected merge.
4. Run one qualification-only attempt at merged executor main for application
   `1b748dfdaf3b63fb9dcc42f781ab79d5c39ca503`, CI `41601901625/1`, subject to existing
   freshness. Report the actual result and stop on any essential remaining blocker.

Focused affected suites: **66 passed, 0 failed, 0 skipped**. They include the full
guarded fixture flow with every governance/environment-administration endpoint
forbidden, missing/false protected context rejection, untrusted merge/source/CI
rejection, credential isolation and unchanged mutation/reconciliation failure paths.
Fixture execution is component/integration evidence, not live admission or deployment.
Full tests, exact protected review/merge and actual qualification result are recorded
on the protected PR. No observation timestamps or eligibility facts are rewritten.

Full local suite before the final unused governance-module import cleanup:
**253 tests, 252 passed, 0 failed, 1 skipped** on Node 26.6.0. The sole skip is the
existing disposable PostgreSQL prototype test without a local test URL; hosted
required CI supplies its existing service. `git diff --check` passed. The final
current-head focused/hosted results are recorded on the PR. No test was suppressed
or financial/reconciliation assertion weakened to obtain these results.
