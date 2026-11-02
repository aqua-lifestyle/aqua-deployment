# Prior failed release: pre-mutation recognition

## Authority and categories

The owner direction **“AQGreen V2 — Break the Deployment Failure Cycle”**
authorizes a bounded correction and validation, with no production dispatch.
The decision is recorded in
[`general-pre-mutation-release-history-authority-20261102.json`](../governance/general-pre-mutation-release-history-authority-20261102.json).
Its exact bytes are pinned by the classifier. This is recognition of facts, not
deployment, replay, retry, migration, rollback or financial authority.

| Category | Treatment |
| --- | --- |
| Authenticated evidence proves no mutation-capable stage was entered | Recognize the failed attempt in `priorFailedRuns` |
| An operation may have been initiated, or evidence is incomplete/uncertain | Reconciliation required |
| An operation was attempted, acknowledged or completed | Reconciliation required |

Failures remain failures. Recognition never enters `verifiedReleases`, selects a
baseline, supplies a same-run continuation or suppresses duplicate-source checks.
Successful qualification-only runs remain successful checks with production
skipped, and never become deployment predecessors.

## Evidence required

The controller authenticates the complete contiguous workflow history and each
attempt's actual outcome through GitHub. Repository, workflow, main branch,
executor revision, run/attempt and the complete three-job inventory must match.
Candidate content and dispatch input supply no recognition flag or audit URL.

The classifier supports three bases:

1. **`production-never-executed`**: the authenticated production job is skipped.
2. **`deploy-step-never-entered`**: the production job failed, but its single
   expected deployment step is explicitly skipped.
3. **`audit-verified-never-mutated`**: the production job and deployment step
   failed, and all of the following hold:
   - The exact producer revision was merged by a standing-policy administrator.
   - Authenticated GitHub content at that revision matches the reviewed deployment
     workflow and a supported controller fingerprint. The current reviewed
     controller and the pre-instrumentation controller are supported. These are
     source-code fingerprints, not run-ID exceptions.
   - The producer's controller writes a mutation-intent audit row synchronously
     **before** every Render/Vercel deployment or file-upload operation. Audit
     write failure stops execution before that request. This invariant is why
     absence of such rows can be meaningful; an empty mutation log alone cannot
     establish safety.
   - One unexpired audit artifact has the exact run/attempt name, original run and
     revision metadata, repository IDs, bounded size and authenticated ZIP digest.
     Retrieval and parsing use the existing GitHub artifact reader.
   - Every row binds the same exact application/CI, executor, release attempt,
     policy, environment/profile and provider target identities. The first row
     selects authenticated admission evidence. There is exactly one terminal
     `failed` row at the end, no success row and no unknown phase/read scope.
   - No row records a mutation-capable phase, deployment ID or member-release
     route. Even a request-intent row with no acknowledged ID denies recognition.
   - The terminal category is a supported read failure:
     `PROVIDER_READ_REJECTED` or `PROTECTED_RUNTIME_READINESS_FAILED`.
     Unknown failures, unexpected errors and ambiguous provider outcomes deny.

An unsupported producer, missing step, expired/missing/substituted archive,
truncated report, conflicting identity or unknown terminal category fails closed.
Supporting another producer or failure category requires a reviewed code change.
This finite-history mechanism continues to depend on GitHub and retained artifacts;
it does not create permanent replay storage.

`priorFailedRuns` is part of the frozen evidence plan and is independently
re-derived before deployment. Audit-based entries retain artifact ID, canonical
rows digest, producer fingerprints and original terminal failure code. Qualification
success does not erase a failure in an earlier attempt of the same run.

The exact historical recognition of runs **40850715880/1** and **40883686654/1**
executes first and retains its original pins and evidence requirements. The pinned
member-continuation route also executes first. The general audit route cannot
recognize a member release or replace either special contract.

## Existing incident diagnosis

**Retained evidence**, not a new provider observation:

- **41493666511/1** failed in admission with `PROVIDER_READ_REJECTED`. It never
  entered production. The retained record establishes a rejected GitHub evidence
  read but does not identify its endpoint or HTTP class.
- **41494396970/1** passed admission, then failed production revalidation with
  `PROVIDER_READ_REJECTED`. Its audit contains only `evidence-selected` and
  `failed`. The supported producer places both before any mutation-capable stage.
  The exact rejected read is not recoverable: the possible families between those
  rows are GitHub repository, Render service/configuration/history, Vercel
  project/configuration and Vercel deployment reads.
- **41495524552/1** subsequently failed admission because the previous failed
  production run lacked an applicable recognition rule. It did not enter
  production. This is the reconciliation cycle addressed by this change.

The original wrapper discarded the endpoint/status/body when translating a
non-successful GET to `PROVIDER_READ_REJECTED`. The missing evidence is a retained
read scope and safe HTTP outcome classification for the original requests. There
is no established authentication, permission, rate-limit or provider defect to
patch, and no failing provider operation was rerun for this diagnosis.

The real audit JSONL for 41494396970 is retained as a redacted test fixture:

- Original artifact ID: `13165273087`.
- Original ZIP SHA-256:
  `471c39bda5199e5b654efbd46d6dc3583b22c0f11a1529d867c67ef5415d9ae9`.
- Raw JSONL SHA-256:
  `72dd8d3d033e2eeace658a441faa786727766c7e2df6796bef7c488696ef6f42`.
- Canonical parsed-row digest:
  `997c49266ea03c2d8e129b66db647666c3d18b940fbe002ccee91dd3f9d41f6e`.

These digests identify incident evidence; none is a run-specific authorization
exception in the general classifier.

## Future diagnostic correction

Direct reads inside the full deployment controller now emit `provider-read`
rows with fixed scope names before each read family. Render variable reads and
deployment polling are grouped by family. URLs, headers, credentials, environment
values and raw responses are not included. The read still fails with its original
error category; there is no retry, token fallback or success substitution.

This improves diagnosis of future direct deployment-read failures. It does not
identify the original rejected endpoint, change provider permissions, establish a
provider-side fix, or instrument every admission/guard GitHub read. Admission
failures still have the authenticated skipped production job as evidence that the
production stage never ran. The protected workflow and secret placement are
unchanged.

## Validation and next decision

```bash
node --test tools/deployment/release-prior-run-classification.test.mjs tools/deployment/historical-release-reconciliation.test.mjs tools/deployment/qualification-only.test.mjs
node --test tools/deployment/*.test.mjs
git diff --check
```

Tests combine the incident audit with synthetic authenticated-transport responses,
ZIPs and provider substitutes. They test all three bases, preservation of original
failure status, no predecessor/continuation promotion, subsequent failed admission,
earlier attempts, negative evidence and read-scope logging before writes. They do
not establish live provider behavior or production deployment.

The hosted `Executor safety tests` workflow additionally supplies a disposable
PostgreSQL service for the existing replay-adapter test. Local execution without
`AQUA_TEST_DATABASE_URL` skips that test; it must not be reported as a local pass.
Execution results and PR/qualification state belong in the
[worklog](deployment-failure-cycle-worklog-20261102.md).

A trusted-administrator merge and fresh current evidence are prerequisites for a
qualification-only main-workflow dispatch. Qualification cannot authorize
deployment. Production dispatch requires the owner's next decision.
