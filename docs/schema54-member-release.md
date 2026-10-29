# Pinned schema-54 member release

> **NOT BUSINESS AUTHORITY.** This worklog records execution state and evidence. It
> cannot confirm or supersede a business-policy decision.

Owner direction, 29 October 2026: implement and execute a narrow, protected
member-experience release independently of the full AQGreen V2 cutover. Reuse the
already accepted application amendment; require review/admission of this executor
change. No migration, retirement, D10, payment processing or new paid resource.

## Exact scope

`tools/deployment/member-release.json` pins frontend main
`53341b578bf08a61c554bf36f165beb82626b9e7`, compatibility receiver
`4eba3799fc3ece12b4de00b5e3019738f1e159c6`, its tree/manifest, and the actual
existing Render/Vercel baseline identities. No receiver/SHA/target override input
exists. Changing the pair requires another reviewed executor change.

Select `release_mode=schema54-member-reads-v1` in the **existing** `deploy.yml`.
Default `full` preserves the original conservation/migration-55/readiness gates.
The new mode does not attest those gates passed and cannot supply a full-release
predecessor receipt. Authenticated completed member audits resolve only their own
provider history; the existing full-release schema/recovery admission must still
verify its actual current baseline and conservation/migration evidence. Its policy digest is bound into candidate, admission, release
key and redacted audit. Qualification-only receipts remain non-deploying.

The fixed compatibility artifact contains no migration-55 implementation or D10 activation
path and is compiled with `YOCO_CUTOVER_COMPAT`. Its startup validates the exact
54-migration prefix (or that prefix plus 55 for later full-cutover continuity).
**The Schema54 header alone does not prove that migration 55 is absent.** Before
dispatch and after deployment, Xolani-M must use the existing authenticated TLS,
bounded READ ONLY metadata path to verify the actual database still has exactly
54 migrations, no invalidation table and the pinned database identity. Record
only status evidence in the existing PR #9 operational trail. Do not read member
or financial rows. Do not dispatch this mode on an altered schema. The executor
has no database credentials, SQL client, schema/data writer or configuration
writer; it cannot itself apply a migration or retirement.

## Admission and execution

1. Aqua accepts the **exact new executor PR head**. An APPROVED review at that
   commit qualifies; alternatively an authenticated review/comment whose first
   line is `ACCEPTED` and which binds the exact head qualifies. Aqua's recorded
   native COMMENTED review with exact body `Review and Accepted` also qualifies;
   negative, conditional or appended wording does not select this spelling.
   A later explicit
   rejection, dismissed review, identity mismatch or changed revision fails.
   Reuse the existing reviewer qualification/independence record.
2. Complete the protected merge and mandatory executor main-push safety CI.
   Application main must still be the exact frontend pin, with its existing
   successful 17-job main-push CI and mandatory-security artifact. Reuse accepted
   evidence while fresh; no application redevelopment or duplicate acceptance.
3. Xolani-M performs the metadata verification above and dispatches the existing
   workflow on executor main, supplying the pinned frontend SHA and its actual
   CI run/attempt, `qualification_only=false`, and the exact release mode. Record
   the native metadata result as an authenticated comment on the existing executor
   amendment PR: first line `SCHEMA54_SOURCE_VERIFIED`, then one JSON object with
   `executorSha`, `frontendSha`, `receiverSha`, `databaseResource`, `databaseName`,
   `tenantId: 1`, `migrationCount: 54`, `migration55Absent: true`,
   `identityTlsReadOnlyVerified: true` and UTC `observedAt`. The executor requires
   this exact source/target-bound operator evidence, posted within 60 seconds of
   observation and less than one hour old on every recheck. This is an actual
   operator readback, not an independent database attestation or invented receipt.
   The workflow retains the same non-cancelling `production-release` concurrency,
   main-only governance, protected environment, three jobs and provider secrets
   confined to production. It verifies operator account, exact Aqua acceptance,
   executor main CI, candidate Git bytes and receiver manifest/tree before use.
4. Record a 40-minute execution deadline and Xolani-M cancellation responsibility
   in the same immutable operational audit. Verify exact baseline identities,
   existing Starter/one-instance service, maintenance/auto-deploy off, existing
   target/domain, safe public build inputs and all configured holds.
5. Request **only** the receiver pin on the existing Render service. Sample health
   and the receiver header through the handoff. Wait for live revision identity,
   no active deployments, and old deployment replacement. Verify capabilities,
   anonymous read rejection, public capability access, blocked checkout and
   invalid-signature rejection. Both old/new binaries retain the accepted durable
   receipt/deduplication protocol and graceful-drain implementation.
6. Only then upload the authenticated frontend archive through the existing
   content-addressed Vercel mechanism and deploy to the existing production
   project. Recheck source/admission, receiver, flags, domain and provider histories
   before creation; verify effective build configuration, READY deployment,
   production alias and receiver health afterwards.
7. Verify the actual database metadata again and test the real signed-in member
   view on desktop/mobile through existing authorized member access: dashboard,
   account, products, programmes, AQGreen, Onyx, progress, earnings and existing
   read-only sections. No synthetic account/JWT, provider signature or fixture
   can substitute for production evidence. Keep personal responses out of logs.

## Stop, partial failure and full-cutover separation

There is no automatic provider POST retry, rollback, configuration repair or
partial-run adoption. Lost responses, expired admission/window, changed source,
foreign deployment, failed health/authentication/fence, alias/configuration drift
or provider failure stops the release. Audit request intent before each POST and
record acknowledged deployment IDs immediately. If Render succeeds and Vercel
fails, report the exact receiver-live/frontend-old state and preserve the fence.
Xolani-M can cancel a still-running own deployment through the existing Render
controls; do not disable webhook reception or revert the fence. A retry requires
reconciling the recorded provider state and a reviewed baseline update, not a new
dispatch that silently adopts matching metadata. No new recovery instance is used.

The `member-deployed` terminal record establishes provider deployment evidence,
not `PRODUCTION VERIFIED` member access and not genuine Yoco signed-delivery,
retention or duplicate evidence. Record those separately. Automatic payouts and
workers remain disabled. The authentic Yoco escalation, retirement, conservation
acceptance, migration 55, full V2 release, D10 and reconciliation gates are unchanged.
Do not adopt this different-source pair as a same-SHA full-release predecessor.

## Validation and current state

Branch `feat/schema54-member-release`, based on executor main
`9d691fe0aa02193e7330c68a68d0bd3fb9bb709a`. No application files changed.

- Local receiver manifest/tree inspection matched the actual accepted Git objects.
- The final local focused/regression run passed 96 tests, zero failed/skipped:
  member mode, schema-first/conservation, qualification, executor and GitHub
  evidence. An earlier broader Vercel/runtime/evidence-access run passed 117,
  zero failed/skipped; later edits touched member authority/history only. These
  use controlled provider substitutes, not production/provider delivery evidence.
- Required new exact-source CI, exact executor acceptance, protected merge,
  admission, deployment and signed-in production verification remain outstanding
  until their actual results are recorded on the PR/operational trail.

## Owner-authorized acceptance-parser correction

PR #12 is MERGED as `051bf90f7ba037657c9e9d244a6e6ffc81b9c7f1`; its main CI
passed 162 tests. Aqua's review #5695158604 accepts exact head
`0dbbf1d36e29d52d7f8c59f3efad06898389b3d5` with `Review and Accepted`.
The initial parser rejected that valid spelling. The owner explicitly directed
correction without another human decision or duplicate acceptance.

Only protected parser-correction PR #13 can carry this existing acceptance:
its exact merge must be the executing revision, its comparison from `051bf90`
must have precisely the one correction commit plus merge and modifications to
only this document, `member-release.mjs` and its focused test. Policy, source pins,
workflow, provider clients and every other executor file must remain unchanged.
The original PR #12 merge/head and authenticated review are reverified; any
explicit rejection of the correction blocks. This is truthful carried-forward
acceptance of the reviewed release, not a claim that Aqua reviewed the correction.
Other PR numbers and unrelated descendants cannot use this exception and still
require their own exact-source acceptance. Main CI, schema-54 operator evidence,
protected admission and all runtime/financial/full-cutover gates remain mandatory.

## Reconciled frontend continuation, 29 October 2026

The actual receiver deployment from run `40850715880` is live as
`dep-dbhh7l8m7kps73etljfg`, exact source `4eba379...`; Vercel was never requested.
The original failed health response cannot be recovered. A controlled complete
read-only observation now passes all eight unchanged readiness predicates:
https://github.com/aqua-lifestyle/aqua-deployment/pull/9#issuecomment-6497700449 .
This does not establish which historical field failed. No configuration or
revision mismatch was found; no speculative health/configuration fix is applied.

The owner directed completion of this recorded partial release. Protected PR #14
adds only its operational reconciliation: `member-continuation.json` pins the
original run, producing executor, artifact ID, ZIP digest, canonical receipt
digest and acknowledged Render deployment. GitHub-only admission authenticates
the original immutable ZIP and the exact pre-Vercel failure. The committed 1089-byte
ZIP fixture is that non-sensitive public operational audit, not production member
or financial data, synthetic historical acceptance or a provider-delivery claim.

Only this failed run can be reconciled, only for the fixed member-release purpose.
The full-release history guard is unchanged. Ambiguous/altered receipts, foreign
deployments, attempted frontend mutations, changed source, expired evidence and
other failed runs still deny. A fresh candidate/admission and schema-54 native
operator readback remain mandatory. Before any frontend upload the executor
verifies the exact live deployment, all eight readiness fields, receiver header,
capabilities, authentication/fence negatives, holds, unchanged frontend baseline,
project/domain and public build inputs. It issues **no Render POST** on this path.
Readiness failures now retain each actual/expected checked field and failed-field
names in the safe audit; assertions are unchanged. Original source/policy pins and
all financial, retirement, migration-55, D10 and full-cutover gates remain intact.

PR #14 may carry the original Aqua source acceptance only when its protected
executing merge compares directly from `97526c0` with exactly the one reconciliation
commit plus merge and these six paths: member release source/test, release-control,
this document, the fixed reconciliation JSON and operational ZIP fixture. Existing
policy, targets, workflow, provider clients, application code and source pins must
be unchanged. Any rejection by Aqua still blocks. This records the owner's existing
operational continuation direction; it does not claim a new Aqua review or repeat
her prior decision. Other PRs cannot inherit this exception.

Validation: six focused continuation tests passed, zero failed/skipped, including
actual archive-digest substitution, altered receipt, wrong/current rejected source,
no Render POST, wrong live source/deployment, holds, read failure and per-field
diagnostics. Required PR/main CI and actual frontend/member verification are
recorded separately when performed. No application source or production mutation
occurred during this preparation.

## Read-only qualification of the deployed frontend

Run `40883686654` reconciled the existing receiver without another Render deploy,
then uploaded and created frontend `53341b578bf08a61c554bf36f165beb82626b9e7` as
`dpl_7PcajvRJGKp2AzuJGaLPLHy2bqUD`. Vercel reports READY and the production domain
maps to it. That run nevertheless FAILED at
`VERCEL_EFFECTIVE_BUILD_INPUTS_UNVERIFIABLE`; do not rewrite its historical result
or treat READY as proof of configuration or authenticated member access.

The verified cause is an incorrect response-shape assumption: Vercel's
[official deployment model](https://github.com/vercel/sdk/blob/main/docs/models/getdeploymentresponsebodybuild.md)
returns environment **names** as `string[]`, rather than readable value maps.
Names alone cannot verify effective values. Do not replace them with requested
values, decrypt project secrets or redeploy to repeat the completed operation.

`verifyObservedFileDeployment` adds a GET-only post-deployment qualification path.
Its caller must authenticate the original upload/create audit through the existing
GitHub artifact reader, including workflow/repository/source identity and ZIP
digest. The original audit is artifact `12901649081`, SHA-256
`771a509135c2d03f69e357a1fe97988d424c96065ef5fd71455a38ccc248cb97`.
Metadata echoes alone do not establish source provenance. The existing source
proof, exact project, production target, build/install commands and root checks
remain mandatory. Names-only metadata without observations continues to fail.

For this frozen frontend, the accepted `public-env.ts` digest
`da0b258523ed6ee8d8ce5f00f874518e0a212adce7418807427c244d9f43921e`
binds direct static public-variable references. Next.js documents that these
[public references are inlined at build time](https://nextjs.org/docs/app/guides/environment-variables#bundling-environment-variables-for-the-browser).
Read the actual production login page and its same-origin public JS assets, with
bounded response sizes/timeouts and no provider credentials. Parse only the two
literal values in the compiled schema input, without evaluating JavaScript or
using a schema default as evidence. Require consistent observed values matching
the approved inputs, hashes of the observed assets, and authenticated project/
production-domain mapping to the same deployment before and after readback.
Missing values, conflicts, redirects, source changes and alias drift fail closed.
The protected generated deployment hostname is not bypassed.

This is verification of an already-created deployment, with no provider POST,
source-pin change, new deploy admission or full-release bypass. The general
deployment path is unchanged. Record the separate qualification evidence in the
existing PR #9 trail. Actual signed-in member verification still requires an
approved Tenant 1 Member session; public assets and synthetic sessions cannot
replace it. Retain no credentials, cookie files, HARs, member screenshots or raw
personal API responses. Retirement, conservation acceptance, migration 55, D10,
worker and payout holds remain unchanged.

Focused local validation: all 13 Vercel-source tests PASS, zero failed/skipped.
These include observed-value success, missing/conflicting/default-only values,
provider conflicts, source/provenance/binding mismatches, alias drift, credential
separation, HTTP failure and response-size limits. Required PR/main CI and live
post-deployment qualification are recorded separately when actually completed.
