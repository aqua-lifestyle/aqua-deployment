# One-time setup and production holds

Implementation branch: `feature/automatic-qualified-executor`. This executor
reuses the reviewed PR106 controller; `tools/deployment/upstream.json` records
its source and digest. Never refresh executable files, targets or policy from an
application release candidate. Review any executor change under custodian control.

Inputs are only source SHA and CI run/attempt hints. The executor independently
qualifies all17 exact jobs and Actions App15368, current application main and merged
PR, executor workflow revision/run/attempt, archive bytes, governance and provider
safety. It fetches application Git objects without checkout or execution. Provider
secrets are referenced only in the fresh dependent production job running executor
code. Render deploy/health/revision precede Vercel exact-source/alias/revision and
public readiness; immutable receipts preserve both source and executor identity.
Unknown/failed/ambiguous operations stop automatically. No manual dispatch,
activation token or recurring approval is required by the automatic route.

Before credentials or live deployment:

1. Establish custodian-exclusive executor source and secret-management custody.
   Designated custodian: `aqualifestyleclub`; `Xolani-M` currently retains admin by
   explicit owner instruction. Audit inherited org/team/App/automation permissions.
   This is BLOCKED, not established by a separate repository or synthetic tests.
2. Apply prepared main deletion/non-fast-forward rules, no bypass actors;
   main-only `production-release`, admin bypass false, no reviewers/wait/custom
   approval. Keep Actions tokens read and PR approval disabled. Require full-SHA
   actions and allow only checkout/setup-node/upload-artifact/download-artifact.
3. Separately authorize installing this reviewed branch on main and application
   PR106. The existing executor main is documentation only. Do not perform a live
   test dispatch to production during preparation.
4. Provision an executor-only GitHub App with Actions:write/Metadata:read and no
   Contents/Workflows/Admin/Secrets write. Application CI automatically calls
   deploy.yml on main using its installation token. Application configuration is
   `DEPLOYMENT_TRIGGER_APP_ID` (variable) and
   `DEPLOYMENT_TRIGGER_APP_PRIVATE_KEY` (trigger-only secret). No provider keys go
   into the application repository. A compromised trigger can abuse availability;
   it cannot supply targets/code or obtain executor provider keys under the scoped
   App and qualified custody model.
5. Verify job-token access to public application Actions, checks, PRs, rulesets
   (including bypass visibility) and environments; executor governance/history and
   immutable artifacts. Missing evidence fails closed. Default repository tokens
   have not been live-qualified for all these reads. Do not grant the deployment
   runner admin merely to make the check pass. Resolve a supported observation
   permission route before claiming readiness.
6. Only after verified isolation, separately authorize persistent provider tokens in
   this repository's `production-release` environment: `RENDER_API_KEY` and
   `VERCEL_TOKEN`. No secrets have been added. Render's existing ADMIN key is
   broader than one service; qualify a dedicated narrower identity. Local Vercel
   CLI sign-in is not persistent automation authentication.
7. Retain native Render auto-deploy off and prevent native Vercel deployment races.
   Qualify the existing Git-source route's project/repository access, public build
   inputs and existing baseline revision. Current unlinked Vercel configuration
   remains blocked; this implementation does not reconnect it. Preserve runtime
   restrictions and qualify actual DB authority, backups/restore, alerts and receipt
   retention using the application infrastructure plan. No runtime flag was relaxed.

Receipts are retained as immutable GitHub artifacts for90days. Expired/missing,
partial or ambiguous history blocks rather than fabricating a predecessor. No
automatic rollback is attempted after financial/schema uncertainty or a lost POST.
Reconcile provider IDs and original receipts before any authorized retry.
The application takeover anchor38912818702 is an observed failed historical run,
not a successful deployment receipt or release token. Its attempts are checked for
positive evidence of no provider execution. Both histories reject missing runs;
pagination is bounded at2000runs and20attempts per run. Exceeding bounds or losing
history requires reconciliation rather than silently discarding evidence.

Independent security-verifier custody is still BLOCKED. The17 GitHub job successes
do not prove candidate-controlled test bodies were not weakened. This task does not
install a protected mandatory-test authority or claim protection against the
currently shared repository administrator. Source identity is not provider build
artifact attestation, and mocks do not establish production privilege isolation.

Validate locally on Node24+: `node --test tools/deployment/executor.test.mjs`.
Tests never call providers or production databases. Review-branch CI runs the same
credential-free suite. No secret provisioning, provider setting, production
deployment, B6/B7 commissioning or business capability activation is included.
