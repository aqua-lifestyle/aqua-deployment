# AQGreen MVP: trusted-administrator GitHub evidence

## Authority and scope

The owner's explicit MVP direction trusts `Xolani-M` (GitHub user ID 86495928)
and `aqualifestyleclub` (307076734) to administer verification policy, executor
source, credentials and deployment authorization. External administrator-resistant
custody and cryptographically independent verification are not MVP requirements.
This does not authorize a merge, configuration change, credential provisioning or
production deployment. Agent 2's fixture-only MVP and B6/B7 gates remain separate.

Ordinary contributors, candidate content and dispatch inputs remain untrusted.
The executor must reject missing, substituted, stale, skipped, duplicated or
changed required evidence and uncertain prior provider operations. No candidate
code runs with provider credentials. Trusted administrators may change policy;
this model does not claim to prevent their deliberate authorized changes.

`tools/deployment/unattended-policy.json` explicitly selects policy version 4,
`github-evidence-v1`, epoch `aqgreen-mvp-oidc-readiness-v1`. Versions/modes outside
this contract deny. Missing GitHub evidence never falls back to an attestation,
manual token, permissive default or candidate-supplied success flag.

The standing policy binds the application/main branch, executor repository,
production environment, fixed provider identities and the normal-integrated
runtime profile described in [OIDC readiness](oidc-runtime-readiness.md). It permits automatic admission for each eligible main merge
without recurring human approval. The exact executor main revision must itself
be the merge commit of a PR merged by one of the two trusted administrators,
confirmed through GitHub user ID and login. This is approval of executor policy,
not a human approval requirement on every application release. This PR is not
merged and that runtime approval has not occurred.

## Evidence standard

These properties are distinct:

- Authenticated GitHub API results establish reported source/run/attempt, check
  identities, producing Actions App 15368 and job outcomes.
- The executor-owned inventory pins all 240 existing stable test identities and
  25 source files, including workflows, harness, reporter and test definitions.
  The candidate's inventory must match too; it is not an authority.
- Exact case counts/outcomes establish complete execution as reported by that
  approved GitHub workflow. All 240 must pass exactly once, with no skip/todo,
  cancellation, rename, duplicate, missing case or unsuccessful process/summary.
- The administrator-approved executor revision supplies policy authority.
- None of these is cryptographically independent execution verification. GitHub,
  hosted-runner isolation and the approved workflow/dependencies remain trusted.
  Tests establish only the assertions they execute, not general immunity to
  hostile code or compromise.

`approved-security-tests.json` is a byte-for-byte copy from application PR #106 at
`b57c2810bc15d1f7893126697a0bfbb3f5b3ade2`; SHA-256 is
`85e0b5175527509de9badd368d4db82da2429cf6e295345f25049f913674fa9f`.
`mandatory-security.mjs` reuses the existing classifier from the same revision.
The inventory has not been expanded. Pins are read from the executor revision,
not discovered or refreshed from the candidate. An intentional protected-source
change requires a reviewed executor policy/inventory update by a trusted admin;
an ordinary application PR cannot silently update the approved copy.

## Admission and receipt contract

1. The existing application CI completion trigger dispatches only source SHA,
   CI run ID and attempt. Automatic API dispatch is not manual release dispatch.
2. Candidate qualification authenticates the exact current-main push, all 17
   checks, App 15368, source and executor identities, merged PR provenance and
   existing governance. Source is fetched as inert Git objects.
3. The separate admission job has no production environment or provider secrets.
   Its explicit read-only GitHub evidence credential covers both repositories.
   It verifies regular
   Git blobs against all protected hashes; no checkout/execution of app scripts.
4. Admission inventories the exact CI run's artifacts. It requires one unexpired
   `mandatory-security-SHA-RUN-ATTEMPT`, correct repository/run/source metadata and
   a SHA-256 archive digest. It downloads by authenticated numeric ID, verifies
   the ZIP digest and reads only `report.json`. Candidate URLs are ignored.
5. The report must match the full approved inventory and exact CI context. CI
   completion must be no older than 24 hours, with at most 30 seconds future
   clock skew. The current CI attempt/result is re-read after retrieval.
6. Admission reconciles complete executor release history and creates a receipt
   only after all required evidence passes. The receipt and evidence plan are
   retained in a same-run artifact.
7. The production job needs successful candidate and admission jobs before GitHub
   exposes its `production-release` environment secrets. Its controller re-fetches
   the evidence, validates the receipt and successful admission job/current
   attempt, and rechecks the frozen history plan before any provider operation.
8. Existing Render-first revision/health checks, Vercel production verification,
   runtime restrictions, migration rejection, immutable audits and retry checks
   remain. Partial provider failures stop; there is no automatic rollback or
   blind retry of an uncertain request.

Receipt contract `aqua.github-evidence-admission`, version 2, binds:
repository, source SHA, CI ID/attempt, executor repository/revision, release
ID/attempt, policy digest, environment/profile, provider identities, approved
inventory digest, qualification-only purpose and the canonical evidence digest.
That evidence includes the artifact ID/name/archive digest, report digest and CI
completion time. The receipt
has an issuance/expiry time (at most one hour, never beyond CI evidence expiry)
and deterministic authorization ID. Unknown fields or mismatches deny. Hashes
bind observed bytes; they are not independent signatures. Authenticity comes from
the approved executor workflow, GitHub artifact provenance and same-run job checks.
Production audit rows retain authorization/evidence/inventory and artifact IDs.

The GitHub client uses only `AQGREEN_EVIDENCE_READ_TOKEN` for both repositories
and artifact downloads. The job token cannot supply cross-repository authority.
The evidence client permits GET only; missing/denied authentication fails without
credential fallback. This enforces transport behavior; actual fine-grained token
permissions and repository scope require authorized owner configuration/readback.

GitHub hides bypass actors from readers without ruleset-write access. The runtime
first authenticates the exact trusted-administrator executor merge, then may use
its committed `governance/ruleset-readbacks.json` for that private field. Every
public ruleset field selected by the contract, including ID, source, conditions,
rules, enforcement and `updated_at`, must match the original privileged readback.
Missing approval, missing revision or drift denies. An explicit live bypass value
always takes precedence and a nonempty/malformed value denies. This is standing
administrator-approved configuration evidence, not a claim of live visibility of
hidden actors or cryptographic independence. Actual executor settings and the
original administrator readback are now recorded; their runtime policy authority
was established by PR #1's trusted-administrator merge for policy v3. This policy-v4
correction requires its own separately authorized trusted-administrator merge.
See the exact assumptions and next actions in
[`permission-unblocking.md`](permission-unblocking.md).

### Qualification-only dispatch

The optional boolean `qualification_only` defaults to `false`, preserving the
existing three-field application trigger. A `true` dispatch runs the same candidate
and admission checks without entering the production job or its environment.
Only the controller's validated literal `false` output permits that job to run;
missing or unrecognized output denies entry. Invalid dispatch values are rejected.

Candidate artifacts and version-2 admission receipts bind the purpose. Receipts
from qualification cannot authorize deployment, and both deployment entrypoints
reject qualification-only candidates before provider access. Older receipt versions
are rejected. Qualification is not evidence of a deployed predecessor. Existing
history and rerun reconciliation remain unchanged; a repeated attempt lacking a
required prior-attempt audit fails closed. Use a fresh qualification run rather
than treating a missing audit as permission to retry.

Artifact retrieval follows GitHub's authenticated numeric-ID endpoint to its
short-lived HTTPS storage URL without forwarding GitHub/provider credentials.
No signed storage URL or raw provider response is logged. Archive downloads and
unzip output are bounded; no archive is extracted into the worktree. Node and the
Ubuntu `unzip` utility are required. Tests also use `zip` to build disposable ZIPs.

## Duplicate/replay semantics and limitations

There is no transferable signed authorization to consume. An admission receipt
works only in its exact executor revision, workflow run and current attempt while
its admission job succeeded and the production job is in progress. Another
attempt/run requires fresh admission. A receipt alone grants no provider access.

The fixed workflow has one production invocation and repository-wide concurrency
group `production-release`, `cancel-in-progress: false`. This GitHub serialization,
not an in-memory set or this classifier, is the concurrent execution boundary.
The controller rejects other unfinished release runs conservatively. Multiple
queued requests may cause a safe denial requiring reconciliation; ordering and
queue availability are not guaranteed by these local tests.

The controller checks contiguous workflow history and authenticates audit artifacts
for every previously successful provider release. Any already verified source SHA
is denied even with a new CI ID/attempt. Other runs that may have attempted a
provider operation cannot be superseded without positive reconciliation. A same-run
retry requires every prior attempt's audit and refuses unacknowledged requests;
known provider IDs must be reconciled and reused rather than resubmitted blindly.

Missing/deleted history, missing/expired artifacts, pagination limits, unavailable
GitHub, inconsistent state or unknown provider outcomes deny. Artifacts are retained
90 days; expiry can therefore stop unattended releases. This is a finite-history
MVP guarantee, not permanent replay storage or a highly available atomic store.
Do not delete runs/receipts, silently reset run numbering or invent a bootstrap
receipt. Any retention/policy-epoch transition requires an explicitly authorized,
evidenced reconciliation. Policy changes can invalidate previous receipts and
require such reconciliation. No production replay database is needed by v3; the
existing PostgreSQL adapter remains an inactive prototype.

The guarantee assumes the same workflow/history namespace and fixed concurrency
group remain in force. Deliberate changes by the trusted administrators are outside
the adversary model; a workflow/history reset is not an approved replay-state reset.
The supported mechanisms are GitHub's
[artifact API](https://docs.github.com/en/rest/actions/artifacts) and
[workflow concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).

## Validation and execution record

Baseline: executor PR #1 `fc40ebb998452c210be984d6bda6744c38480e89`.
Application PR #106 remains unchanged. The initial definition read checked the
existing inventory's 25 hashes against its recorded source commit with zero
mismatches. This is source inspection, not new execution of the 240 app tests.

Focused tests exercise actual ZIP parsing, artifact/CI substitution, full 240-case
classification, protected-source changes, the original 170-pass/one-skip case,
receipt expiry/identity, trusted-admin approval, concurrent conflicting histories,
duplicate completion and partial provider failures. GitHub/provider responses are
substitutes. Real temporary Git repositories prove inert regular-blob reads and
symlink rejection. They do not prove live Actions isolation, cross-repository token
permissions, production configuration, provider behavior or deployment.

Run the affected suites:

```bash
node --test tools/deployment/qualification-only.test.mjs tools/deployment/executor.test.mjs tools/deployment/github-evidence.test.mjs
git diff --check
```

The existing executor CI also runs the unchanged prototype PostgreSQL suite against
its disposable service. No production database or provider is involved. See
[`SETUP.md`](../SETUP.md) for remaining one-time configuration and authorization.

Baseline `e3e1608` local affected-suite validation on Node 26.6.0:
**60 passed, 0 failed, 0 skipped**.
`git diff --check` passed. Standalone `actionlint` is unavailable locally; workflow
ordering/dependencies/secret placement are covered by focused source checks. The
Node-24 hosted CI result is reported against the pushed commit in PR #1; it is
separate from these local results. No full application CI suite was rerun.

Qualification-only change: the command above passed **54 tests, 0 failed,
0 skipped**, including seven mode-specific cases. They cover strict dispatch
parsing, production-job exclusion, candidate/receipt isolation, unchanged mandatory
evidence rejection and provider-free controller entrypoints. The existing normal
deployment sequence also passed against provider substitutes. This is not a live
qualification dispatch or proof of deployed GitHub configuration.
