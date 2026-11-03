# Trusted-administrator protected Actions admission

Version: 1. Base: `11f8fd0fe891de81a138d5beeb77a837b6561406`.
Branch: `fix/protected-actions-admission-20261103`.

## Governing owner direction and scope

The owner's current direction, **“Finish the MVP Without Further Unnecessary
Work,”** authorizes one focused simplification using trusted-administrator
approval and GitHub's existing protected CI evidence. It expressly rejects another
App or verification infrastructure merely to reproduce GitHub checks. This
execution record does not itself establish business-policy authority.

The change does not authorize production. It preserves the exact approved
application, successful required CI, protected review, explicit production
authorization, provider-credential isolation, database integrity, financial/Yoco/
worker/payout restrictions, Render-first/Vercel verification and failed-provider
reconciliation. No schema, recovery observation, historical financial fact or
timestamp is amended. Completed B6/migration55/Yoco work is not reopened.

## Single executable authentication arrangement

- Application Git-object fetching remains unchanged. Supported application REST
  reads and artifacts use existing `AQGREEN_EVIDENCE_READ_TOKEN`, needing only
  Actions, Contents, Pull requests and Metadata read on the application repository.
- Executor-local REST reads and artifacts use `GH_TOKEN` explicitly mapped to
  GitHub's existing job token under the existing read-only workflow permissions.
- Neither identity falls back to the other. Provider credentials remain confined
  to the existing production controller step. Ordinary PR tests remain secret-free.
- REST controller reads explicitly select API version `2022-11-28`, matching the
  previously implicit default. No credential, permission, App or infrastructure
  provisioning is part of this change.

The dormant PR-1 credential checker is kept compatible with the shared client's
explicit executor credential. Its same-repository pre-secret Checks read uses the
native job token, which supports that API; it does not restore application Checks
reads with a fine-grained PAT or reopen PR #1.

## CI authority, without duplicated Checks API verification

Qualification reads the fixed application's exact GitHub Actions run, its current
attempt's complete jobs, current main, and re-reads the run to detect replacement.
It requires a successful main push from the fixed repository and approved CI
workflow path/name; exactly all 17 required successful jobs; matching run/attempt;
unique positive job IDs; and unique, canonical same-repository check-run IDs.

It then authenticates trusted-administrator approval of the exact executor merge,
both repositories' protected governance and application merged-PR provenance.
The required-status-check rules still bind every required context to App 15368.
GitHub's authenticated Actions results supply execution provenance; the executor
does not re-query those application jobs through the fine-grained-PAT-incompatible
Checks API. This is the owner-selected trust arrangement, not independent
execution verification or a substitute success flag.

Admission still verifies every approved workflow/security-definition hash, the
exact digest-bearing CI artifact, all 240 mandatory case identities/executions,
source/run/attempt/purpose bindings, freshness and same-run receipts. The policy
and receipt schemas are unchanged; receipts bind the newly approved executor SHA.

## Failure and historical handling

GitHub failures retain their existing fail-closed error categories. A safe console
row now identifies only the fixed repository, operation family and observed HTTP
status (or transport-unavailable category), never a raw URL, header, body or
credential. This makes a real missing Actions permission actionable without a
separate endpoint-specific diagnostic PR or a blind retry.

Reviewed pre-routing producer fingerprints are retained alongside the new producer
so this credential-only workflow edit does not invalidate previously supported
no-mutation evidence. Mutation-intent ordering and reconciliation classifications
are unchanged. An acknowledged or uncertain Render operation is never reclassified
as an unexecuted operation or a successful predecessor.

## Execution plan and evidence

1. Implement the bounded authority/routing correction and regression cases.
2. Run focused and existing required safety tests; inspect the final diff.
3. Submit one protected PR for exact-head human acceptance and hosted CI, then merge
   through protections under the owner's current authorization.
4. Run one qualification-only admission at the exact merged executor main using
   application `1b748dfdaf3b63fb9dcc42f781ab79d5c39ca503` and CI `41601901625/1`,
   if still eligible. Keep production skipped. Return the actual result; if a real
   permission/freshness/reconciliation safeguard blocks it, report that one blocker
   and its minimum corrective action instead of starting another amendment cycle.

Initial focused run: 57 passed, 9 failed. All nine failures exposed one stale
internal singular workflow-digest reference after retaining the pre-routing
workflow fingerprint; it was corrected to use the exact approved digest set.
No assertion or reconciliation requirement was relaxed. Final test, review, merge
and actual admission results are recorded on the protected PR at exact revisions.
Fixture success is not production or live admission evidence.

Final local focused command (the new protected-Actions, evidence-access, executor,
legacy credential-check and prior-run classification suites): **66 passed, 0
failed, 0 skipped**. Full existing command `node --test tools/deployment/*.test.mjs`:
**252 tests, 251 passed, 0 failed, 1 skipped** on Node 26.6.0. The existing disposable
PostgreSQL test is skipped locally because `AQUA_TEST_DATABASE_URL` is absent;
required hosted safety CI supplies its existing test service. `git diff --check`
passed. Status: **IMPLEMENTED**, **TESTED** locally, with the explicit skip above.
