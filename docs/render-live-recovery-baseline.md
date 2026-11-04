# Render live-baseline recovery verification

Version: 1. Base executor: `3fd6ec6d0c35313e95c8d0b6f6b4c264ba9d2de3`.
Branch: `fix/render-live-recovery-baseline-20261103`.

## Owner scope and demonstrated predicate defect

The owner's **“Resolve Render Recovery Verification”** directive authorizes the
minimum correction if the verifier equates latest attempt with serving deployment,
preserving exact live revision, health/recovery and financial holds, followed by
the existing read-only verification under protected approval. No production
deployment, provider configuration/credential change, database/B6 work, new
infrastructure or unrelated development is authorized.

Protected readback `41738727213/1` reached `latest-deploy` with HTTP 200 after
service/holds/profile/disk checks, then returned UNVERIFIED. Its exact predicate
required `/deploys?limit=1` to return the expected held deployment in `live` state.
The response identity/status was not retained, so it did not establish that the
serving deployment changed. Render's existing list endpoint returns attempts in
all statuses, not only serving deployments. A known failed attempt therefore must
not be substituted for or mistaken for the current live baseline.

## Narrow corrected predicate

The existing verifier reuses the controller's bounded, paginated deployment-history
GET helper. It requires one unique live deployment and its exact approved ID/source,
then retains the direct held-deployment GET and health/source check. It validates
history identifiers/timestamps, rejects any pending operation, and checks every
attempt created at/after the live baseline. The only permitted later attempt is
the exact existing reconciled `dep-dbkftrcipgvc73asn0lg` at its original source in a
terminal failure/canceled state. Failed/unexpected/newer attempts cannot disappear
behind a live-only filter. Older inactive history does not select the live baseline;
existing full release-history reconciliation remains unchanged.

The entire selection/accounting is rechecked before completing the observation,
alongside existing project/domain/alias and direct held-deployment checks. Drift,
missing/multiple live records, unknown/truncated history, missing/corrupt timestamps,
unexpected operations or changed live ID/revision fail closed.

Only allowlisted deployment ID/status/revision fields are emitted, including on a
live-baseline mismatch; unknown revision is explicitly undetermined. No raw response,
commit message, token/header, arbitrary provider error or secret value is emitted.
The last outcome remains UNVERIFIED on failure, with only fixed safe reason enums.

## Preserved boundaries and evidence limits

Existing protected main/admin gates, GET-only credential custody, fixed targets,
financial/worker/payout/Yoco holds, service/no-disk profile, held health, Vercel
source/audit/domain mappings and final rechecks remain. No baseline, policy,
historical failed outcome, recovery evidence or original timestamp is rewritten.
No new workflow, credential, exception for arbitrary failed writes or automatic
deployment/retry is introduced. This correction changes only the read-only
verification predicate and its safe state reporting.

Fixtures show the approved live baseline alongside the exact known later failure,
not a claim about current production. The actual authenticated live ID/status/revision
will come from the corrected protected workflow. If those values differ from the
approved baseline, verification stops and reports the observed difference. A fixture
or code review is not fresh recovery acceptance or production admission.

## Validation and completion plan

1. Correct the existing predicate and add focused fail-closed regression coverage.
2. Run existing required executor safety CI and obtain exact-head protected review.
3. Merge through existing protections and run the existing native recovery readback
   mode, not a new diagnostic workflow.
4. Report actual live metadata, known-failure accounting, remaining recovery/health/
   Vercel verdict and required acceptance. Stop on a real baseline mismatch.
   Do not dispatch production or alter financial controls.

Initial focused native-observation/provider-credential suites: **18 passed, 0 failed,
0 skipped**. Coverage includes the reconciled failed latest attempt, foreign/active/
changed attempts, observed live differences, missing/duplicate/corrupt history,
pagination, final drift and secret-free GET-only output. Full/current-head and
protected-run results are recorded on the PR at their exact revisions.

Full local existing suite `node --test tools/deployment/*.test.mjs`:
**271 tests, 270 passed, 0 failed, 1 skipped** on Node 26.6.0. The sole skip is the
existing disposable PostgreSQL prototype test without a local test URL; required
hosted safety CI supplies its existing service. `git diff --check` passed. Recovery
acceptance/policy, expected baseline and the prior failure record have no diff.
Status: **IMPLEMENTED**, **TESTED** locally with the explicit existing skip.
