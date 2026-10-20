The first-release recovery correction selects policy v6; see
[the pinned retained-artifact exception and required operator evidence](docs/first-release-recovery.md).
The checked-in readback remains UNVERIFIED and blocks production admission. No
provider inspection or production operation was performed by this correction.
The Vercel file-source behavior remains unchanged; see
[the exact source/build-input and recovery contract](docs/vercel-file-source.md).
Historical Git-link and recovery-only setup descriptions below are not current setup requirements.

## One-off provider credential verification

After its separately authorized protected merge, an approved administrator can
dispatch `provider-credential-check.yml` on protected `main`. Its only job uses
the existing `production-release` environment and the two existing provider
secrets. A credential-free context check precedes the secret-bearing GET step;
ordinary PR safety CI receives no secrets. No deployment workflow is dispatched.
The approved Render account ID and service are checked. Vercel authentication
is established by successful fixed-team and project reads, not personal user
profile access: `GET /v2/teams/{teamId}` (team ID in the path), then
`GET /v9/projects/{projectId}?teamId={teamId}` with matching `accountId`.
The checker does not call `/v2/user` or claim to establish the token owner's
personal identity from team/project access.
Reads cover identities, target metadata/history, pinned baselines, domain/aliases,
and the controller's existing non-secret runtime/environment metadata endpoints.
Redirects and failed reads deny without retries, credential fallback or permission
changes. Output contains only fixed check names, HTTP statuses, PASS/FAIL and
sanitized Vercel diagnostic categories/documented generic error enums. A 404
means resource/context not found; it is not classified as an invalid token.
401 authentication rejection, 402 payment required and 403 access/policy denial
remain distinct. Provider messages and unrecognized codes are never echoed.

The original hosted check stopped on `/v2/user?teamId=...` with HTTP 404; this
does not establish the server-side reason. The documented user endpoint has no
team query parameter and was an unnecessary prerequisite. Reference:
[team lookup](https://vercel.com/docs/rest-api/teams/get-a-team),
[project lookup](https://vercel.com/docs/rest-api/projects/find-a-project-by-id-or-name),
[user lookup](https://vercel.com/docs/rest-api/user/get-the-user),
[generic errors](https://vercel.com/docs/rest-api/errors).

A successful check proves authentication and those reads, not deployment-write
permissions, billing availability, rollback eligibility, readiness or release
authorization. It emits no admission receipt and cannot bypass deployment
admission. Provider tokens remain limited to environment jobs. Any live check
must use the exact approved merged revision; this implementation does not
authorize its own merge or execute the check from PR code.

# One-time MVP setup and production holds

The current bounded OIDC readiness correction is documented in
[normal runtime readiness](docs/oidc-runtime-readiness.md). It selects policy v4,
preserves mandatory Bird/Yoco startup configuration, and removes Render secret-value
reads. Earlier recovery-only descriptions below are historical controller context;
they do not authorize credential provisioning, merges or production execution.

Executor PR #1 and application PR #106 are merged baselines. The OIDC readiness
correction uses separate application/executor PRs; no further merge or deployment
is authorized. `tools/deployment/upstream.json` records reused source provenance.
Historical setup observations below do not invalidate the completed credential
verification or provider-free qualification run 39313665672, attempt 1 (policy v3).

## Selected MVP authority

The owner explicitly trusts `Xolani-M` and `aqualifestyleclub` as deployment
administrators. They may administer policy and credentials within separately
authorized work. External custody, an independent signer/service and organization
required workflows are not requirements of this MVP. Do not describe their absence
as blockers. Repository administration is not itself authorization to deploy now.

The version-3 standing policy selects `github-evidence-v1`; a trusted administrator's
merge of the exact executor PR revision approves that policy for eligible application
main CI events. It imposes no per-application-release human approval, activation
switch or release token. This PR is not merged, and setup, credential provisioning
and live deployment remain unauthorized.

## Automatic sequence

Application successful main CI automatically dispatches SHA/run/attempt to the
executor. Candidate qualification checks all 17 exact contexts and App 15368.
Credential-free admission compares inert Git blobs to the executor-owned approved
240-test inventory, retrieves the exact authenticated GitHub report, rejects all
missing/skipped/changed evidence, reconciles release history and emits a same-run
receipt. Only the dependent production job receives environment credentials.

The controller revalidates admission before any provider read, deploys the exact
Render commit, verifies API revision/health, deploys Vercel and verifies production.
Fixed targets, restricted runtime capabilities, migration rejection, recovery,
immutable receipts and no-blind-retry handling remain. Candidate code is never
executed with provider keys.

The exact policy, receipt, trust assumptions, finite-history replay guarantee and
validation limitations are in [`docs/github-evidence-admission.md`](docs/github-evidence-admission.md).
The signed-attestation and PostgreSQL replay code remains an inactive prototype;
it is not a fallback or setup prerequisite for the selected policy.

## Applied executor setup and carried-forward application observations

Owner-authorized setup on 2026-10-19 created executor ruleset #25403847 and the
empty main-only environment, applied the four pinned Actions dependencies and SHA
enforcement, and preserved read-only workflow defaults. Fresh administrator reads
verified the effective branch rules, zero approvals/bypass actors, environment
policy and zero repository/environment secrets. Original metadata is retained in
[`governance/executor-configuration-readback.json`](governance/executor-configuration-readback.json)
and [`governance/ruleset-readbacks.json`](governance/ruleset-readbacks.json).
No credentials, merge or deployment were authorized or performed by this setup.
Subsequently, the owner confirmed creating the PAT as `aqualifestyleclub`;
GitHub metadata confirms
repository secret `AQGREEN_EVIDENCE_READ_TOKEN` exists. Its access remains unverified
until the trusted credential check below succeeds. No provider secret was added.
The application 17-check ruleset #25297647 and environment are carried-forward
observations; application PR #106 remains unchanged.

## Minimum remaining one-time configuration

Each mutation needs separate owner authorization and authoritative readback.

1. Review and merge PR #1 through one of the trusted administrators only when
   authorized. Runtime requires GitHub evidence that the exact executor main SHA
   was merged by their user ID and login. Main history/PR protections and the
   required `Executor safety tests` are now applied; merge remains unauthorized.
2. Preserve the applied Actions and environment settings recorded above, and
   executor write/settings access restricted to trusted administrators.
   Provider secrets belong only to that environment, never application workflows,
   candidate/admission jobs, repository-wide or shared organization exposure.
3. Preserve the owner-created expiring fine-grained GitHub PAT scoped to only these
   two repositories, with Actions, Checks, Contents, Pull requests and Metadata
   **read** permissions; no other permissions, including Administration or Secrets.
   It is stored only as executor repository secret `AQGREEN_EVIDENCE_READ_TOKEN`.
   This GitHub evidence credential is available to fixed controller steps and the
   explicitly approved credential-check step, not ordinary PR tests or application
   code. It is not a provider key.
   The controller never falls back to `github.token`, anonymous retrieval or
   another credential. Verify actual access before qualification; scope/expiration
   and renewal are owner setup, not recurring release approval.
   Hidden bypass metadata uses the executor-owned administrator readbacks described
   below, not runtime ruleset-write access.
   Before merging, run the one-off trusted credential check described below.
4. Install the existing application PR106 automatic trigger only through its
   separately authorized merge/setup. Its trigger-only App needs Actions:write and
   Metadata:read on the executor, no Contents:write or provider authority. GitHub's
   permission is not limited to one workflow; trusted trigger code selects the
   fixed workflow, and executor admission treats every dispatch input as untrusted.
   Duplicate/ambiguous dispatch must not be blindly retried.
5. Separately authorize persistent Render/Vercel authentication in the production
   environment after non-production qualification. Verify fixed service/project,
   narrowest usable credential scopes, public build inputs, exact-source transport
   and native Git/deploy-hook routes so deployment is not duplicated. No provider
   credential, integration or setting was inspected/changed in this implementation.
6. Preserve existing Render recovery/runtime restrictions, database privilege
   qualification, backups, predecessor identity and monitoring requirements. Do not
   enable financial, messaging, scheduled workers, startup maintenance or B6/B7
   commissioning to satisfy deployment. Unknown live prerequisites remain unknown.
7. Establish receipt retention and reconciliation: all required workflow history
   and prior successful audit artifacts must remain available. Current artifacts
   expire after 90 days and missing evidence intentionally stops admission. Agree
   an authorized reconciliation before expiry/epoch transitions; do not synthesize
   historical proof or silently bypass replay checks.

## Qualification and authorization

### One-off credential check before merge

After reviewing the exact PR #1 head and its passing `Executor safety tests`,
`Xolani-M` or `aqualifestyleclub` may explicitly authorize its credential-check code
by applying label `readpat-` followed by that complete 40-character head SHA to
PR #1. Applying the label is a separate execution action, not performed by merely
pushing this implementation. The dedicated `credential-check.yml` handles only
that label event, same-repository PR #1, those administrator IDs and attempt 1.
A changed head requires new review and a new SHA-specific label. Ordinary PR CI
remains secret-free. No `pull_request_target`, deployment dispatch or production
environment is used.

The job checks out exactly the approved head. Before exposing the PAT to its
verification step, a job-token-only step rechecks the current PR/label/head and
successful safety check from App 15368. The PAT step repeats that check, verifies
the token owner's authenticated username/numeric ID pair against the existing
approved administrators: `Xolani-M` / `86495928` or `aqualifestyleclub` / `307076734`.
It performs GitHub GET-only reads for source,
provenance, CI jobs/checks, a digest-verified artifact archive, governance,
environments and run history in both repositories. It emits only static pass/fail
codes, HTTP statuses and non-sensitive IDs. It stops on a failed required read,
without retrying with a different identity or broadening token scope.

This proves read capability, not absence of write permissions: configured scope
still needs the owner's permission metadata. It uses an existing main-CI artifact
to prove authenticated download, not to approve stale tests or authorize a release.
Fresh mandatory-security evidence and later qualification remain separate gates.
The resulting workflow run, attempt, approved head and secret update timestamp
must be recorded before an executor merge. No credential check is claimed complete
until that actual trusted job passes.

The original prepared API request bodies are in
[`governance/qualification-setup-requests.json`](governance/qualification-setup-requests.json).
Their historical preparation status is not current state; all six executor settings
requests were applied and independently read back in the evidence linked above.
The bounded setup/merge/evidence checklist and readback limits are in
[`docs/permission-unblocking.md`](docs/permission-unblocking.md).

The workflow supports an optional boolean `qualification_only: true` alongside
the exact source SHA and CI run/attempt. It runs normal candidate qualification
and admission, then skips the production job entirely. Its purpose-bound receipt
cannot authorize deployment. Omitting the flag preserves normal deployment mode.
This implements the provider-free path; it does not authorize a live dispatch,
merge or configuration change. Existing main provenance, read permissions,
mandatory evidence and history requirements must still pass. Qualification does
not produce a deployed predecessor or relax rerun reconciliation.

Focused local and hosted executor tests use provider substitutes. They do not prove
live secret isolation, cross-repository permissions, production runtime or actual
Render/Vercel deployment. Qualify the automatic trigger, admission and failures in
non-production before provisioning production authority. Any live deployment or
activation still requires explicit owner authorization. No merge, deployment,
provider mutation, secret provisioning or restricted business activation occurred.
