# One-time setup and production holds

Implementation branch: `feature/automatic-qualified-executor`. This branch
contains credential-free executor code. It reuses the PR106 release controller;
`tools/deployment/upstream.json` records the reviewed source and digest. The
application's successful `main` CI `workflow_run` automatically calls GitHub's
workflow-dispatch API with only source SHA, CI run ID and attempt. No person needs
to open the Actions page or dispatch a release. The executor workflow's event is
`workflow_dispatch` because that is the API event used by the automatic trigger;
it is not a per-release manual action.

The executor re-fetches and qualifies the exact application main source, CI run and
attempt, all 17 named checks and Actions App 15368, merged PR provenance, executor
workflow identity and deployment environment. Candidate source is fetched as inert
Git objects and never checked out or executed. Provider calls use fixed executor
code and targets. Render exact-commit deployment, health and revision checks must
pass before Vercel deployment and production revision checks. Existing serialized
operations, immutable receipts, no-blind-retry handling and fail-closed ambiguity
checks remain. This is implementation and mock-test evidence; it does not prove
credential isolation or live provider behavior.

## Current observed executor state

Read-only GitHub inspection on 2026-10-18 found `main` at
`eb4dbcb188eb4d1ee1d0fdde73f072de3aa65fc5`, unprotected, with no rulesets,
environments or provider secrets. Actions are enabled with all actions allowed
and SHA pinning off. The default workflow token is read-only and cannot approve PR
reviews. `aqualifestyleclub` is the sole listed organization owner and effective
repository admin; `Xolani-M` retains a direct repository-admin grant by owner
instruction. Installed GitHub Apps and some inherited organization permissions
remain unobservable to this session. Executor PR #1 is still open at
`68bd6ecbbf56229c0207df26bc37c1f173d95286`; that branch is not installed on `main`.

The exact target-state contract is recorded in
[`governance/expected-github-state.json`](governance/expected-github-state.json).
It is a proposal and audit checklist, not an applied GitHub payload or proof of
readback. Do not report any proposed value as configured.

## Governance and custody blockers

1. **Independent source and policy.** Create a separately controlled verifier
   repository and issuer identity. Neither ordinary application contributors nor
   administrators of `aqua-deployment` may be able to change the verifier source,
   mandatory inventory, trust pins or issuer. Require its immutable workflow through
   an organization-level ruleset for both application `main` and executor `main`.
   Its policy must pin all 17 check identities and App identity, exact test IDs,
   expected execution counts, definitions, relevant workflow/job/harness/reporter/
   lockfile bytes, and exact run/attempt. Execute the pinned tests in a fixed,
   clean worker without candidate workflows, scripts, hooks, caches, credentials or
   signer access; issue a trusted result bound to repository, commit, CI run and
   attempt. Candidate-owned check names, manifests, uploads and self-hashes are not
   independent evidence.
2. **GitHub plan limitation.** The organization was observed on GitHub Free. GitHub
   documents repository rulesets for public Free repositories, but organization
   rulesets are a Team/Enterprise capability; the required-workflow rule is
   organization/enterprise-level. The existing repository ruleset cannot establish
   owner-only governance while `Xolani-M` remains a repository admin. `aqualifestyleclub`
   must authorize a qualifying plan/configuration route and read back effective
   organization rules. No owner/admin setting was changed here.
3. **Executor protection.** Apply the proposed active main ruleset with no bypass
   actors, PR-only changes without required human approvals, deletion and
   non-fast-forward protections, exact required checks, and the independent
   required verifier. Configure Actions to allow only the four full-SHA-pinned
   dependencies listed in the contract, require SHA pinning, retain read-only
   workflow tokens and keep PR-review approval disabled. Configure
   `production-release` for `main` only, `can_admins_bypass=false`, no reviewers and
   no wait. Read back each effective setting. These settings are NOT applied.
4. **Credential isolation.** Do not put Render or Vercel secrets in
   `aqua-deployment` while `Xolani-M` remains its administrator: repository admins
   can modify workflows, Actions settings, environment protections and secrets.
   The owner must select an owner-exclusive deployment control plane or a broker
   whose credential issuance is bound to the independently verified workflow and
   cannot be redirected by this repository's admins. The current shared-admin
   boundary is BLOCKED; a separate repository name alone does not resolve it.
5. **Trigger identity.** Only after the executor/control-plane trust boundary is
   established, provision a trigger-only GitHub App with Actions:write and
   Metadata:read on the trusted executor. Store only that App's key in the
   application repository. It must have no provider permissions or access to
   executor secrets. Confirm the trigger can dispatch only the fixed workflow and
   that wrong/stale inputs are rejected before credential availability.
6. **Provider and runtime readiness.** After custody and independent verification,
   separately authorize persistent provider credentials in the trusted control
   plane, qualify Render credential scope and runtime/database privileges, Vercel
   project authentication and exact-source route, recovery and monitoring. Native
   provider auto-deploy must remain disabled to avoid races. No provider was
   contacted and no credential was provisioned in this preparation.

GitHub's documented plan and policy limits are linked from
[organization rulesets](https://docs.github.com/en/organizations/managing-organization-settings/creating-rulesets-for-repositories-in-your-organization),
[available rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets),
[required workflow enforcement](https://docs.github.com/en/code-security/how-tos/secure-at-scale/configure-organization-security/configure-specific-tools/enforce-dependency-review),
and [Actions settings](https://docs.github.com/en/rest/actions/permissions).

No production secrets, provider settings, production deployments, financial or
messaging capabilities, B6/B7 commissioning or live verification are part of this
branch. Do not describe production automatic deployment as operational until the
external custody, governance readbacks, provider prerequisites and a live authorized
rollout have passed.

Credential-free executor tests previously passed on PR #1 at
`68bd6ecbbf56229c0207df26bc37c1f173d95286` (27 passed, 0 failed, 0 skipped), and
PR #106's CI previously passed at `b57c2810bc15d1f7893126697a0bfbb3f5b3ade2`.
Those are carried-forward results for their exact earlier commits. The current PR
commit also runs the complete credential-free executor and attestation suites. The
attestation-specific command is
`node --test tools/deployment/authorization-attestation.test.mjs`.

The credential-free v2 attestation consumer prototype and its limits are documented
in [`docs/attestation-boundary.md`](docs/attestation-boundary.md). It reuses the
existing 17 required check names but is intentionally not wired into provider
admission: the verifier trust root, owner-controlled issuer, required external
workflow, and atomic durable replay store do not yet exist. Prototype acceptance
must not be reported as independent enforcement or production readiness.
