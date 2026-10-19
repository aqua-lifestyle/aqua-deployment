# One-time MVP setup and production holds

The implementation remains on executor PR #1, branch
`feature/automatic-qualified-executor`. Application PR #106 is unchanged.
`tools/deployment/upstream.json` records reused source provenance.

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

## Existing observations, not applied setup

The latest carried-forward metadata readback (2026-10-19) found executor main
unprotected with no environment, rulesets or shared/repository secrets; Actions
allowed all dependencies and did not enforce SHA pinning. Both trusted accounts
were effective repository administrators. Application main retained its 17-check
ruleset #25297647 and main-only unattended production environment. These observations
are not readback of the proposed executor configuration below. No settings or
credentials were changed by this implementation.

## Minimum remaining one-time configuration

Each mutation needs separate owner authorization and authoritative readback.

1. Review and merge PR #1 through one of the trusted administrators only when
   authorized. Runtime requires GitHub evidence that the exact executor main SHA
   was merged by their user ID and login. Configure repository main history and
   PR protections and required `Executor safety tests`, without recurring release
   reviewers, timers or bypass actors. No organization-plan upgrade is required
   merely to resist the trusted administrators.
2. Apply the proposed repository Actions and environment settings in
   [`governance/expected-github-state.json`](governance/expected-github-state.json).
   Pin/allow the existing Actions dependencies, retain read-only token defaults,
   restrict executor write/settings access to trusted administrators and configure
   `production-release` main only, no reviewers/wait, `can_admins_bypass=false`.
   Provider secrets belong only to that environment, never application workflows,
   candidate/admission jobs, repository-wide or shared organization exposure.
3. Verify the read identity can access exact application CI/check/artifact evidence
   and executor run/governance metadata. Cross-repository artifact download and
   bypass-actor visibility must be demonstrated; they are not proved by public
   repository visibility or mocks. If unavailable, authorize a narrowly scoped
   supported read capability rather than adding broad administration to the runner.
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

Focused local and hosted executor tests use provider substitutes. They do not prove
live secret isolation, cross-repository permissions, production runtime or actual
Render/Vercel deployment. Qualify the automatic trigger, admission and failures in
non-production before provisioning production authority. Any live deployment or
activation still requires explicit owner authorization. No merge, deployment,
provider mutation, secret provisioning or restricted business activation occurred.
