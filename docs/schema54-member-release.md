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
   line is `ACCEPTED` and which binds the exact head qualifies. A later explicit
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
