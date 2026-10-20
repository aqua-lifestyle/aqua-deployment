# Normal production integrations and OIDC readiness

Owner authorization permits Bird/Yoco credentials only in the production API
runtime, with startup validation preserved. Policy v5, epoch
aqgreen-mvp-vercel-files-v1, selects normal-integrated explicitly. Old receipts
and qualification-only receipts cannot authorize this policy or a production run.

Only the environment-bound production job has id-token: write. It requests a fresh
GitHub OIDC token for https://aqualifestyle-api.onrender.com/api/deployment-readiness,
using GitHub's runner-provided request credential. Neither token is logged,
persisted, included in receipts/artifacts, forwarded to providers or exposed to
candidate/admission. Redirects and OIDC/readiness failures deny authorization. The
API checks GitHub signing keys, issuer/audience/lifetime and immutable repository,
owner, workflow, main/ref, run/attempt and production-release environment claims.

Render environment enumeration, secret files, and individual credentials are
rejected by the provider client before network access. Only a fixed allowlist of
non-secret settings is read individually: Production, recovery=false, Bird=true,
supported Yoco mode and existing restricted-operation switches=false. Secret
presence/format is checked by the application's unchanged startup validator and
reported by the protected readiness endpoint. No Render runtime credential value
enters the executor. Deployment authentication remains a separate provider key;
its broader provider-side scope is not narrowed by this code.
Vercel build-input verification lists undecrypted metadata, rejects Bird/Yoco
credential names, and supplies the two approved public values as explicit deployment build inputs.
It never requests bulk environment decryption or reads the sensitive project values.
No reclassification of those entries is required. Missing effective public-input
evidence on the deployment itself denies; live provider readback remains unqualified.

## First-release bootstrap

The legacy API has no readiness endpoint. With no verified production predecessor
(established from complete authenticated history), keep the exact healthy live
revision and non-secret restricted configuration checks, verified compatible
rollback source pair, migration rejection and frozen CI/run evidence. This is not
a successful detailed-readiness claim for the old API. After Render deploys the
exact source, authenticated readiness is mandatory before any Vercel POST and again
before recording success. A 404, wrong SHA, unavailable auth or missing status
stops there; there is no fallback. With a verified production predecessor,
authenticated readiness is mandatory before Render too. Qualification-only runs
with production skipped never create a predecessor.

The [Vercel file-source correction](vercel-file-source.md) supports the existing
unlinked project, while preserving fail-closed predecessor validation. The old
metadata-only frontend source still cannot authenticate a rollback baseline.
This task does not fabricate a predecessor, reconnect Git or deploy a bootstrap release. Database
privileges, production backup/rollback qualification and provider credentials remain
separate prerequisites. Configuration does not prove independent IAM isolation.

Both PRs need separately authorized review/merge, then fresh application-main CI
and production-purpose admission. The runtime must reach GitHub discovery/JWKS.
Local RSA fixtures and mock tests do not prove real OIDC or production deployment.
