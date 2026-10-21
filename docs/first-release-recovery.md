# First controlled release: retained legacy recovery pair

**NOT BUSINESS AUTHORITY.** Execution record v1 for the owner's explicit bounded
first-release recovery authorization. It does not authorize merging, provisioning
credentials, release dispatch, rollback, database work or provider mutations.

## Scope and authority

### Commission invalidation: schema-first policy v7

This is the bounded implementation of the owner's migration/recovery instruction,
not authorization to execute it. Policy v7 replaces the blanket schema rejection
only for the exact three migration paths/digests in `commission-schema-source.json`:
`20261021051549_AddAQGreenSalesEvidenceInvalidation`, its designer and model snapshot.
The payout service and guard source digests are pinned too. They were read from
CI-qualified application `73890aa1b7c843238bbca1b450000d43d8ef8b5b`. Candidate code is
read as inert regular Git blobs; it supplies neither policy nor operator evidence.
Any missing/modified/renamed/deleted/extra migration or changed payout guard denies.

`governance/commission-schema-readback.json` is UNVERIFIED. A protected executor PR
must eventually retain the original sanitized operator records and bind the
complete readback digest in `schemaFirst.evidenceSha256`. The existing trusted
administrator merge establishes custody/approval, not independent cryptographic
proof of the underlying database/B6 facts. No sensitive database values are needed.
The strict observation fields are defined by `validateSchemaReadback`:

1. **B6 first:** Agent 2's qualified acquisition and its acceptance reference/digest,
   exact Tenant and database-identity digest, observed schema digest and 54 applied
   migration count. Acquisition must use the unchanged production schema before
   any DDL. Do not repeat acquisition or change Agent 2's extraction profile here.
2. **Separate DDL authorization:** an explicit AUTHORIZED owner record naming the
   candidate SHA, exact migration ID and migration-file SHA-256, trusted actor and
   UTC authorization time. A general executor merge is not this authorization.
3. **Schema first:** separately authorized maintenance applies only this additive
   migration through the existing maintenance procedure. Verify its actual prior
   history and generated SQL first; if additional/unrecognized migrations are
   pending, stop. Never turn on API startup migration or install a pre-deploy hook.
   The applied readback must show 54→55, unchanged pre-existing history, matching
   pre-DDL B6 schema and working append-only guards, with original evidence references.
   These counts are required production observations, not inferred from source-file
   counts or fabricated from synthetic tests. A mismatch blocks rather than bypasses.
4. **Keep operations held:** record that financial operations, V2 commissioning,
   workers and startup migration remain held. Existing provider metadata and
   authenticated post-Render readiness independently recheck the configuration
   holds. Deployment does not authorize D10 or financial activity. The application
   payout guard also denies on unavailable schema before payout mutation.
5. **Recovery:** verify availability of the exact new source and an operator procedure
   that retains the migrated schema, invalidation facts and payout enforcement.
   Recovery mode is `forward-only-hold-aware`; legacy financial rollback is false.
   The new schema cannot be rolled back once invalidations exist. Do not restore an
   older database over those facts or enable financial operations on legacy binaries.

Timestamps must establish B6 acceptance ≤ exact DDL authorization < applied DDL ≤
operator readback. The initial readback must be within the existing 24-hour limit.
Original evidence references are immutable executor `governance/` blob URLs; this
reuses the existing approval boundary and does not fetch arbitrary URLs with tokens.
The same approved schema evidence and source pins can support later code-only
descendants after a verified same-policy production predecessor; additional DDL
or changed guard definitions require separate review, not a permissive fallback.

The retained-artifact recovery observation uses **version 2** for this path. It
retains exact provider identities/availability and configuration evidence, explicitly
sets `compatibility.schemaAndData=false` for legacy financial recovery, and adds
`recovery: {mode: 'forward-only-hold-aware', sourceSha: <candidate>,
schemaEvidenceSha256: <approved schema readback digest>, legacyFinancialRollbackAllowed: false}`.
Both artifact availability checks remain; provider rollback eligibility is not
permission to run the legacy backend financially. Old version-1 recovery claims
cannot authorize this mode. Both checked-in records intentionally remain UNVERIFIED.

The credential-free admission job consumes these facts before creating a receipt.
Production revalidates them before any provider read and again before mutations.
Policy/receipt/run/attempt/source binding, history serialization, uncertain-request
denial, Render-first sequencing and OIDC-before-Vercel remain unchanged. Qualification
mode can verify source/CI without applied production evidence; its receipt cannot deploy.

For a partial release, the existing same-run audit/retry path may finish only known,
acknowledged operations on the exact candidate. Lost responses, failed deployments
and unreceipted IDs still stop. A separately authorized operator can recover through
existing provider functionality with the same hold-aware source and retained schema;
never substitute the pinned legacy backend. Preserve original provider IDs/audits.
The controller does not automatically adopt a foreign recovery deployment or invent
a verified receipt; actual provider state must be reconciled before another release.

No operational B6 acquisition, applied-schema verification, provider rebuild or
recovery success is claimed by the synthetic controller tests. B6 acceptance and
explicit D10 authorization remain separate prerequisites for Placement V2 activation.

### Historical policy v6 retained-pair path

Policy v6 (`aqgreen-mvp-first-release-recovery-v1`) retains GitHub-evidence admission,
the 17 mandatory checks and the unchanged 240-test inventory. The only provenance
exception permits this exact Vercel deployment as a retained recovery artifact:

| Resource | Exact pin |
| --- | --- |
| Render service | `srv-d9f0k8e1a83c73d8n1b0` |
| Render deployment | `dep-db8av3dg1s2s739m6sgg` |
| Render source | `1251fb82979e18be53d1d0e7f5c6fab2d0c50a58` |
| Vercel team | `team_Hc3BWfhTLfwLzwbgbtaasBUY` |
| Vercel project | `prj_6qL1e43KhsWrRshY5GxdmGl3HGMz` |
| Vercel deployment | `dpl_EwGB3apX3P5JnU5KfG3rLzn21Kgf` |
| Production domain | `www.aqualifestyleclub.co.za` |
| Frontend root | `AqualLifeStyle/9.4.2/aqua-frontend` |

No frontend SHA is invented from custom metadata. Audit rows explicitly retain
`baselineVercelSourceProvenance: UNVERIFIED_LEGACY` and omit the unknown
`baselineVercelSha`. A source-bearing provider response still goes through normal
Git provenance checks. New deployments always require the exact qualified Git
archive, uploaded file identities, public build inputs, provider IDs and receipts.

## Required operator evidence: currently unavailable

`governance/first-release-recovery-readback.json` is deliberately **UNVERIFIED**.
No provider observation, rollback capability, compatibility result or supporting
record has been fabricated. Production admission fails before the environment job
with the current file. Qualification-only admission remains provider-free and does
not establish a deployed predecessor.

An approved administrator must review original, non-secret operator records of:

1. Both exact build artifacts remaining retrievable and eligible for provider
   rollback. READY/live metadata alone does not establish retained build availability.
2. The exact project/domain/root and Render revision above, with compatible runtime
   configuration. Render rollback can reuse prior settings; shared environment-group
   values are not necessarily restored. Vercel restores its original build inputs.
   Do not inspect or publish secret values to establish configuration compatibility.
3. Schema **and data** compatibility of the recovery pair with the exact candidate,
   including authorized writes during the release. Absence of a migration file alone
   is not complete compatibility evidence. Preserve Bird/Yoco, authentication and
   restricted worker settings. Do not create a fresh privileged-runtime redesign.

Store sanitized supporting records under `governance/` through the protected PR
process. Each `evidenceReference` must identify an immutable GitHub blob URL in this
executor repository, at an exact commit containing the original sanitized record.
The readback is an administrator-approved operator observation, **not independently
authenticated provider attestation**. The validator checks its structure and approval
binding; reference interpretation and truth remain the approving administrator's
responsibility. It does not fetch arbitrary URLs or send provider tokens to them.

The verified record has exactly these fields (values below are descriptions, not
evidence to copy as a completed result):

```text
contract = aqua.first-release-recovery-readback; version = 1; status = VERIFIED
observation:
  observedAt, expiresAt: UTC timestamps, expiry at most the existing CI age limit
  observer: {login, id}: an approved administrator's exact account/immutable ID
  candidateSha: exact intended application commit
  baseline: exact legacyRecoveryPair object exported by first-release-recovery.mjs
  renderArtifact: {retrievable: true, rollbackEligible: true, evidenceReference}
  vercelArtifact: {retrievable: true, rollbackEligible: true, evidenceReference}
  compatibility: {schemaAndData: true, configuration: true, evidenceReference}
```

Bind `firstReleaseRecovery.evidenceSha256` in the standing policy to the canonical
`objectDigest` of the complete reviewed readback. The policy digest binds this
evidence to candidate, same-run admission receipt and executor revision; the frozen
evidence plan and release audit retain the readback digest as well. Approval is the
existing trusted-administrator merge of the exact executor revision. This is one-time
first-release eligibility evidence, not a release token or new recurring approval gate.

## Enforcement and lifecycle

The credential-free admission job rejects unverified, malformed, mismatched, expired
or incomplete readbacks before provider credentials become available. Production
revalidates the same readback and complete authenticated release history before any
provider read. Live provider metadata must match the pinned Render deployment/SHA,
Vercel project/team/root, READY production artifact and its exact domain alias.
Domain-to-deployment binding comes from authenticated
`GET /v2/deployments/{exactDeploymentId}/aliases`, not the deployment's embedded
`alias` field, which can omit custom domains. Missing, duplicate, redirected,
conflicting or unavailable authoritative mappings deny without fallback.
The fixed project-domain GET must also show the intended domain verified for
that exact project, without a redirect. No domain verification mutation is performed.
IDs and eligibility are rechecked before Render, after Render before frontend uploads,
and again before Vercel creation. The operator evidence expires within the existing
24-hour CI limit and is checked by subsequent mutation guards. No claim of atomic
protection from a provider administrator deleting an artifact between checks is made.

Only complete history with no successful production predecessor permits this path.
After success, the normal verified source/file-proof predecessor is mandatory; a
missing or expired audit cannot reset the exception. Failed/partial provider work
still blocks a new dispatch. Existing same-run attempt reconciliation retains the
exact baseline IDs, provenance classification and readback digest; contradictory or
uncertain operations deny. No automatic rollback or retry has been added.
After a receipted Vercel operation, an alias may have moved to that exact replacement
ID; only the validated same-run receipt plus the authoritative alias mapping for
that exact replacement permits this normal reconciliation state.
The retained baseline and verified project-domain identity still cannot change.

## Controlled recovery, separately authorized

The legacy rollback instructions below apply only to the historical v6 path with
genuinely compatible schema/data. **They do not apply to the v7 commission migration**;
use the forward-only procedure above and preserve invalidation holds.

- Failure after Render but before Vercel: leave the original frontend unchanged;
  stop the release and preserve exact provider request/response IDs. If necessary,
  an authorized operator restores the pinned Render artifact after confirming the
  saved configuration and data remain compatible.
- Failure after Vercel: reconcile actual provider state, then an authorized operator
  restores the pinned pair in a compatible order using existing provider rollback.
  If compatibility, artifact availability or the operation outcome is uncertain,
  stop; do not force a rollback or blindly repeat requests.
- Never run EF Down, startup migrations, data restoration, payment/outbox replay or
  worker activation. Database recovery and its acceptable data-loss decision remain
  separate, explicitly authorized operations. A database backup does not replace
  application rollback artifacts.

The existing database-identity exception is carried forward unchanged. August 11
and August 21 successful production-backup restores are accepted historical evidence.
The October 20 read-only recovery observation reported AVAILABLE with startsAt
2026-10-16T02:44:00Z; it did not supply the latest recoverable point or maximum data
loss. This code does not invent that limit or commission another restore.

Validation uses the existing provider substitutes and receipt/history harness:

```bash
node --test tools/deployment/recovery-alias.test.mjs tools/deployment/first-release-recovery.test.mjs tools/deployment/executor.test.mjs tools/deployment/runtime-readiness.test.mjs tools/deployment/github-evidence.test.mjs tools/deployment/qualification-only.test.mjs
```

Local/CI results do not demonstrate live artifact availability, operator evidence,
provider rollback execution, current recovery-point suitability or production readiness.

Provider references: [Render rollback](https://render.com/docs/rollbacks),
[Vercel rollback](https://vercel.com/docs/instant-rollback),
[Vercel project-domain metadata](https://vercel.com/docs/rest-api/projects/get-a-project-domain).
