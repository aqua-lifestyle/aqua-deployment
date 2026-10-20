# Qualified Vercel file deployment

Execution record v1. The owner authorized this bounded executor correction only;
this document is not business authority, deployment authorization or provider proof.
Baseline: executor main `19d6213f0e40983d6e0e9629ac32cf3aae27ec17`.

## Contract

Policy v5 / `aqgreen-mvp-vercel-files-v1` approves `vercel-files-v1`, the existing
frontend root and exactly these non-secret inputs:

- `NEXT_PUBLIC_ABP_API_URL=https://aqualifestyle-api.onrender.com`
- `NEXT_PUBLIC_DEFAULT_TENANT_NAME=Default`

The policy digest, exact executor revision and existing candidate/admission receipt
bind that configuration. Previous policy and qualification-only receipts cannot
authorize it. There is no Git-link setup, new credential type or application change.

The production entry first verifies the candidate archive byte-for-byte against
`git archive` from independently fetched qualified Git objects. Only then does it
prepare the frontend files from that exact archive. The tar commit comment and
self-hashes are consistency checks, never independent source authentication.
Git and GNU tar stream bounded input; no candidate file is extracted to disk or
executed on the Actions runner. Symlinks, executable files, ambiguous paths,
tracked runtime dotenv files, generated output and conflicting build configuration
deny. The actual frontend root and existing `npm ci` / `npm run build` commands
remain unchanged. Candidate package/config files are parsed as data only.

Only after Render readiness passes does the executor POST unique file contents to
the fixed Vercel `/v2/files` endpoint with its documented SHA1 integrity header.
The source proof records the full archive SHA256, each path/size/SHA1/SHA256,
manifest digest, public input values/digest, and precedence rule. A SHA1 collision
between different SHA256 contents denies. The subsequent `/v13/deployments` request
references those uploaded hashes and the fixed existing project/root. No `gitSource`
or candidate deployment instruction is accepted. A Git-linked project denies to
avoid introducing a second deployment route.

## Public build precedence

Project environment inspection remains metadata-only (`decrypt=false`). Sensitive
entries are intentionally unreadable; this is not absence. Both expected production
keys must exist once, with no branch override. Readable plain conflicts and Bird/Yoco
credential names deny. No environment-value GET or bulk decryption is performed.

The executor supplies exactly the approved map in both request `env` and `build.env`.
Vercel's deployment build-environment override is the selected precedence mechanism;
source `vercel.json` environment overrides, changed build commands and direct
Next configuration overrides of these keys deny. Authenticated deployment reads
must return the approved effective values, build/install commands and bound source
digest; missing/redacted or contradictory evidence denies. Root authority is the
fixed request root plus authenticated project readbacks before/after deployment;
a contradictory deployment root also denies. Only approved public values are
recorded, never unrelated environment values. This verifies provider-reported
configuration, not an independent attestation of application semantics or browser
bundle bytes. Live provider behavior remains unqualified until separately authorized.

## Receipts, uncertainty and recovery

Immutable audit records bracket file uploads with requesting/uploaded phases.
Every upload checks admission expiry. Full GitHub evidence is rechecked between
batches of at most 32 inert uploads and immediately before deployment creation,
avoiding thousands of redundant artifact/governance API calls. Changed CI during
a batch blocks deployment creation; no claim of atomic cross-provider revocation
is made. A lost/rejected upload or
missing completion record blocks retries; no POST is automatically retried. After
uploads the controller rechecks provider histories, project/root/baseline, public
metadata, authenticated API readiness and admission before deployment creation.
The existing deployment ID, READY state, production target/domain and final API
readiness checks remain. Echoed custom metadata alone never permits adoption: the
original upload/create acknowledgements and same-run receipt chain are required.
Subsequent verified file deployments retain that proof in the predecessor audit.

Policy v6 adds only the [explicit pinned first-release retained-artifact exception](first-release-recovery.md).
Other CLI deployments with only custom source metadata remain rejected. Original
operator eligibility/compatibility evidence is still missing; no historical source
proof is fabricated. The database-identity exception and historical August restores
are carried forward. Current recovery-point suitability, provider credentials and
live OIDC remain separate prerequisites. No production operation is authorized.

## Validation and references

Focused tests use real disposable Git archives and controlled provider substitutes.
An inert preparation check also uses application main
`0c1d861f8fc199bc04f6b1009f748d5ab83815fc` (495 frontend files), without execution
or provider access. Local/CI results do not establish successful provider uploads,
effective live build precedence, recovery or production deployment.

- [Vercel file upload and integrity header](https://vercel.com/docs/rest-api/deployments/upload-deployment-files)
- [File-based deployment request](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment)
- [Official deployment environment contract](https://github.com/vercel/vercel/blob/main/packages/client/src/types.ts)
- [Official CLI build-environment overrides](https://vercel.com/docs/cli/deploy#build-env)

Focused validation: `node --test tools/deployment/vercel-source.test.mjs tools/deployment/runtime-readiness.test.mjs tools/deployment/executor.test.mjs tools/deployment/github-evidence.test.mjs tools/deployment/qualification-only.test.mjs tools/deployment/evidence-access.test.mjs` — 79 passed, 0 failed, 0 skipped. All 495 prepared current-main frontend file contents also match their original Git blob IDs. No provider operation was performed. Hosted CI will bind these changes to the PR commit.
