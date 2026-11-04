# Bounded native-held first-release recovery admission

The owner authorized one versioned correction, recorded in
`governance/native-held-recovery-authority-20261102.json`. Policy kind
`held-native-first-release-recovery-v1` selects recovery readback version3, only
with the existing bounded completed-migration55 schema proof and exact accepted
candidate. Legacy versions1/2 remain strict and unchanged.

## Two different baselines

The existing `firstReleaseRecovery.baseline`, `legacyRecoveryPair`, source/migration
comparison baseline1251fb8 and schema/source pins remain unchanged. The provider
and recovery pair is separately frozen in `native-recovery-source.json`: held
Render receiver4eba379/deploy dep-dbhh7l8m7kps73etljfg and qualified frontend53341b5/
deploy dpl_7PcajvRJGKp2AzuJGaLPLHy2bqUD, on the same fixed targets/domain/root.
Normal current-provider source ancestry and additive-migration comparisons still run.

Frontend provenance uses the existing authenticated member upload/qualification
record for that same immutable deployment ID. Fresh authoritative project/domain
mapping is required. Metadata echoes never prove a foreign deployment's source,
and member receipts are not relabelled as full-release predecessor receipts.

## Actual protected observation

The [4 November combined correction](recovery-vercel-admission-20261104.md) selects
the separately versioned `first-release-recovery-readback-20261104.json`, backed by
the actual successful protected observation from run `41782065591/1`. It reuses the
existing exact candidate carry-forward for `1b748df` while preserving the original
operation/authority source and all original records below. The 24-hour recovery
expiry and current release checks remain enforced.

The [current live-baseline correction](render-live-recovery-baseline.md) selects
the unique `live` Render deployment from the existing complete bounded history,
not the newest attempted deployment. It retains exact held ID/revision, direct
GET/health checks, holds and Vercel checks, and allows only the exact reconciled
terminal failure among attempts after the live baseline. All active or unexpected
later operations and observation drift still deny. Original observations below
are historical and are not re-dated by this predicate correction.

The existing `provider-credential-check.yml` has a GET-only observation purpose,
selected with `native_recovery_readback=true`. It preserves main/admin/context
gates, the same two protected secrets and fixed commands. It performs no mutation,
token fallback, secret-value enumeration, deployment or rollback.

Run41458997824 at executor b24661e, observed2026-11-02T14:08:02.802Z, verified the
current Render and Vercel IDs, revision, source-audit association, authoritative
aliases/domain mapping before/after, HTTP health, no-disk single-instance Starter
Docker profile and existing operational holds. Its sanitized record and exact
producer/log/record digests are in `governance/native-held-baseline-observation-20261102.json`.
All readback timestamps retain their actual observation times and existing expiry.

## Selected mechanism and limitations

Primary protection is Render's native health-gated rollout and retention of the
serving instance on pre-cutover failure, applicable to the verified no-disk web
service. Controlled recovery uses the exact approved held receiver source and
current configuration through existing Render functionality; source availability
is not cached-artifact availability and recovery/build duration is not guaranteed.

Cached-artifact eligibility remains `NOT_VERIFIED`; this readback does not authorize
cached rollback. A cached action requires separate actual eligibility, safe settings,
target/schema compatibility and operation authority. No automatic fallback or new
recovery system is added. Database rollback and legacy financial rollback remain
forbidden; migration55, invalidations and financial history remain preserved.

Existing per-mutation source/CI/security, freshness, target/revision/provider-history,
replay, protected-readiness, Render-first, acknowledged-ID/partial-state and
financial/worker/payout/Normal gates remain. Public/member experience must still
be verified in the authorized release journey. The compatibility claim is only
for the held receiver, not unrestricted legacy financial operation.

Passing this admission contract does not authorize deployment or demonstrate a
rollback/rehearsal. No production write, setting/credential change or financial
activation was performed while implementing it.
