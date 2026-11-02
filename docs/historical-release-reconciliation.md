# Exact historical release reconciliation recognition

## Owner authority and execution plan — 2026-11-02

The owner explicitly authorized the minimum executor-owned history correction for
failed runs **40850715880 attempt 1** and **40883686654 attempt 1**, protected PR/CI,
and qualification-only admission after merge. The conversation authority is
recorded in `governance/historical-release-reconciliation-authority-20261102.json`;
it does not impersonate a GitHub review. Production deployment/rollback, database
operations, provider/credential changes and financial/worker/payout/Normal-mode
activation are not authorized by this work.

Execution sequence:

1. Bind the completed factual reconciliation and existing qualified observations.
2. Recognize only these exact failed attempts in the full-release history guard;
   authenticate their original GitHub artifacts on every history evaluation.
3. Run focused positive/negative and required executor safety tests; inspect the
   complete diff; use the normal protected PR and required CI.
4. After merge, run `deploy.yml` with `qualification_only=true`, `release_mode=full`,
   accepted application `a4755801ce89868d7791422f3c983363ab76bf30`, and its qualified
   main-push CI ID/attempt. Report actual admission and stop.

## Immutable evidence and semantics

`historical-release-reconciliation.mjs` pins the bytes of the authority,
`governance/historical-release-reconciliation-20261102.json`, and the already
accepted native-held observation and frontend-source qualification records.
The reconciliation binds the protected factual record SHA-256
`3c57f2219a3e0318e74c1d383b8e5c70892fee66b53fe8543f9fa6cce536c7df`.

| Run / attempt | Original audit artifact | Known effect | Original terminal failure |
| --- | --- | --- | --- |
| 40850715880 / 1 | 12886558488 | Acknowledged Render deployment completed; no Vercel operation in the audit | `API_REVISION_OR_RECOVERY_READINESS_FAILED` |
| 40883686654 / 1 | 12901649081 | Existing receiver reconciled; acknowledged frontend created and subsequently qualified | `VERCEL_EFFECTIVE_BUILD_INPUTS_UNVERIFIABLE` |

Exact archive/canonical-audit digests, original executor/source/CI identities,
provider targets/deployment IDs, and original observation times are in the
versioned reconciliation record. The complete original second ZIP is a non-secret
test fixture; the first ZIP already existed. ZIP digests in tests must match the
original authenticated artifacts, not regenerated test archives.

This uses the existing trusted-administrator/protected-executor custody model,
not independent provider attestation. Runtime retrieval uses authenticated numeric
artifact IDs, repository/producer metadata, availability and bounded ZIP digest
verification. Missing/expired/substituted evidence denies; no offline fallback.
Unresolved effects, different attempts/runs, changed failures, sources or targets
deny. Recognition is scoped to the accepted application and existing policy.

The frozen evidence plan records `historicalReconciliations` separately from
`verifiedReleases`, `baseline`, `memberReleases`, `memberContinuation` and `resume`.
Neither failed audit becomes a successful full-release predecessor or retry
receipt. No provider request is issued by recognition. Other failed runs retain
the existing fail-closed rule. Full history, active-run exclusion, anti-replay,
source/CI security, schema/recovery/target checks and purpose-bound admission
remain in force. Historical resolution does not re-date evidence or relax any
freshness limit; qualification-only still skips production and does not establish
production readiness or authorize deployment.

## Validation worklog

Focused suite:

```sh
node --test tools/deployment/historical-release-reconciliation.test.mjs
```

Required executor suite (hosted CI supplies its existing disposable PostgreSQL
service; no production database operation):

```sh
node --test tools/deployment/*.test.mjs
git diff --check
```

Coverage includes both exact authentic audits, history integration, failed-result
preservation, no predecessor/retry authority, immutable-record and artifact
substitution, provider/source/target mismatches, unresolved requests, changed
attempts and unrelated failed provider runs. Actual local, PR/main CI, merged SHA
and qualification verdict are recorded in the PR and final execution report;
this plan does not presume those results.
