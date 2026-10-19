# Deployment authorization attestation v2 (credential-free prototype)

## Status and scope

This credential-free consumer runs in a distinct `admission` job with no Render or
Vercel credentials and no production environment. The provider job depends on
candidate qualification and successful admission, and repeats signature, claim,
admission-receipt and admission-job checks before any Render/Vercel API operation.
Admission reserves the signed attestation in PostgreSQL before producing a same-run
artifact. It does not read either provider. Its verifier retrieval adapter and
durable-store credential are not configured, so admission currently fails closed
and production remains BLOCKED. The validator reports `PROTOTYPE_ONLY`; local code
and tests do not prove independent verifier custody or administrator-resistant
enforcement.

The authorization bundle is read only from a fixed runner-temporary file populated
by an authenticated external verifier adapter. No such adapter is installed; a
missing file denies. The admission job also needs the dedicated
`ATTESTATION_REPLAY_DATABASE_URL` capability, limited to INSERT on the replay table
and distinct from any provider credential. The provider job's environment secrets
are not made available to admission. GitHub readback on 2026-10-19 found no
repository rulesets, `main` branch protection or `production-release` environment;
Actions permits all actions and SHA pinning is off. No GitHub settings, secrets or
provider settings were changed.

The consumer uses Node's built-in `node:crypto` Ed25519 verification. The only
private signing key used in tests is ephemeral test material; this repository has no
signing key. The external issuer must keep its private key outside application and
executor repositories and outside the test worker.

## Threat model

Untrusted inputs include application code and test definitions, CI job names and
results, reports and artifacts, PR-provided manifests, executor inputs, uploaded
attestations, and arbitrary JSON encodings. Candidate manifests, self-computed
hashes, success booleans, signatures over candidate-authored reports, and passing
check names alone are not independent evidence.

The trusted caller must obtain all of these through an independently authenticated
channel:

- A versioned trust root containing the accepted audience, active policy version and
digest, verifier identity/repository/workflow/immutable revision, Ed25519 public
keys, issuer status, revocations, clock limits and maximum attestation lifetime.
- Expected repository, exact source SHA, CI run ID and current attempt from GitHub.
- The exact 17 required check identities and expected producer App IDs.
- The stable mandatory-test inventory: IDs, file/name identities, definition SHA-256
values and expected execution counts.

The expected inventory and trust root must not be loaded from the candidate commit,
its artifact, or an executor repository administrators can rewrite. GitHub's
current required contexts remain available from `release-control.mjs`; the
independent verifier must pin its own reviewed copy and reconcile changes through a
separately controlled policy update.
The independently authenticated trust root also commits to a canonical digest of
the complete mandatory-check and mandatory-test inventory, including test IDs,
file/name identities, definition digests and expected execution counts. Changing
the supplied `expected` inventory without changing that trusted digest is rejected.

## Signed contract

The JSON payload is canonical UTF-8 JSON: object keys are sorted recursively, there
is no insignificant whitespace, duplicate keys are rejected by canonical-byte
comparison, and unknown fields are rejected. The envelope is:

```json
{
  "keyId": "owner-controlled-key-id",
  "payload": "base64url(canonical-payload-bytes)",
  "signature": "base64url(Ed25519-signature-over-exact-payload-bytes)"
}
```

The version 2 payload schema is
[`schemas/deployment-authorization-attestation-v2.schema.json`](../schemas/deployment-authorization-attestation-v2.schema.json).
It binds a unique attestation UUID, issuer and key, verifier identity and immutable
revision, audience, application repository/source commit/CI run/current attempt,
active policy version and digest, issue/expiry times, all 17 exact check identities
and their producer/status/conclusion/source/run/attempt, every expected mandatory
test identity and definition digest with execution count/outcome, and a digest of
the verifier's raw execution evidence.

A trusted verifier must itself fetch/check all GitHub records and verify test
execution. The attestation is its signed statement, not a substitute for that work.
The validator compares claims against independently supplied `expected` and
`trustRoot` objects. It rejects changes to the payload or signature; wrong or absent
claims; noncanonical or malformed JSON; extra/missing/duplicate checks or tests;
wrong producer, run, attempt, source or verifier revision; non-success/skipped test
outcomes; unknown/revoked issuer keys or policies; wrong audience; invalid time
bounds; and unavailable crypto, clock or replay dependencies.

`verifyPrototypeAttestation({ envelope, trustRoot, expected, replayStore, now,
cryptoProvider })` is the explicit trust-root interface. `expected` and `trustRoot`
are authorities, not caller-controlled convenience defaults. The optional `now` and
`cryptoProvider` are dependency-injection seams for deterministic tests and outage
probes; production callers must use a trusted clock and the supported Node crypto
provider. Any exception or unavailable dependency denies authorization.

### Authenticated retrieval contract (not yet installed)

The admission workflow expects a strict JSON bundle at a runner-temporary path; it
does not create that bundle from the candidate artifact. A trusted adapter must
authenticate the running workflow to the separately controlled verifier, then
retrieve the trust root, expected inventory/source claims and signed envelope over
that authenticated channel. If the adapter uses GitHub OIDC, the verifier must
validate issuer, audience, repository, workflow path, immutable workflow SHA, ref,
run ID and attempt, and independently re-query the application CI run/check/test
evidence. The source request is a lookup key, not proof. The verifier's policy and
inventory must be loaded from the custodian-controlled revision, and the signer
must attest only after an isolated worker proves the exact definitions/counts.

The returned `trustRoot.policy.inventorySha256` commits to the canonical inventory;
its public signing key must itself be authenticated from outside both
`aqua-lifestyle/aqua-lifestyle` and `aqua-deployment` admin custody (for example,
an organization-controlled secret/variable or an owner-controlled verifier service
with an independently pinned root). An artifact from the candidate run, a self-hash,
or a public key shipped by this executor is not a trust source. No issuer URL,
repository, trust-root key or retrieval credential is configured here. The current
workflow intentionally fails at the missing-bundle check.

## Replay-store contract

`PostgresReplayStore` is the persistent adapter. It issues one parameterized
`INSERT ... ON CONFLICT DO NOTHING RETURNING` guarded by unique constraints on
`attestation_id` and `replay_key`. The caller injects
`replayStore.consumeOnce({ attestationId, replayKey,
payloadSha256, expiresAt })`. It must return `true` only when both replay coordinates
are atomically reserved for the first time; duplicate reservations return `false`.
Errors, timeouts, unavailable storage and ambiguous commits deny authorization.
The prototype bounds the store call to five seconds by default; tests may inject a
shorter deadline. A timeout denies that authorization even if the store operation
later commits, in which case a retry is denied by the durable replay key.

The schema is
[`schemas/deployment-authorization-replay.sql`](../schemas/deployment-authorization-replay.sql).
Provision it outside the executor with a database owner; admission receives INSERT
only, with no SELECT, UPDATE, DELETE, schema, migration or provider privileges. The
single statement is atomic across concurrent runners. Rows are permanent replay
tombstones. The disposable PostgreSQL integration test races 64 requests and
requires one winner. This establishes adapter behavior in local PostgreSQL, not
production database availability, identity, permissions, backup/restore or
multi-region behavior. Test-only in-memory stores remain for cryptographic unit
tests.

The schema's uniqueness contract is:

```sql
CREATE TABLE aqua_deployment_authorization_replay (
  attestation_id uuid PRIMARY KEY,
  replay_key char(64) NOT NULL UNIQUE CHECK (replay_key ~ '^[a-f0-9]{64}$'),
  payload_sha256 char(64) NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
GRANT INSERT ON aqua_deployment_authorization_replay TO aqua_admission;
```

An insert timeout or lost response denies authorization even if PostgreSQL committed
it. A retry then fails closed and requires a newly issued attestation after release
reconciliation. Do not remove old tombstones or restore a database snapshot that
forgets successful reservations.

The replay key is derived from audience, repository, source SHA, CI run ID/attempt,
policy version/digest and attestation ID. Reusing one signed authorization is
denied. A trusted verifier may issue a fresh ID for a retry only after the release
controller has reconciled the prior attempt; the controller's immutable receipts
remain responsible for preventing duplicate or ambiguous provider mutations. This
allows the existing safe retry path without accepting the old signature again.

## Authorization path and bypass inventory

At the inspected app PR #106 head, the release trigger dispatches only
`ci_run_id`, `ci_run_attempt` and `sha`. The executor candidate job fetches and
archives exact app Git source without executing it. A separate admission job runs
without provider credentials or the production environment, verifies authorization
and reserves replay state. The production job depends on candidate and admission,
downloads same-run artifacts, verifies the receipt and successful admission job,
then enters the controller's provider sequence.

The remaining paths and limits are concrete:

- Direct or malformed workflow dispatch still reaches candidate qualification,
  but cannot pass admission without a signed bundle and durable replay reservation.
  Admission does not read Render or Vercel.
- Production is guarded by `needs: [candidate, admission]` and an explicit success
  condition. The production environment is attached only to that dependent job.
  The workflow remains modifiable by executor administrators until external owner
  governance protects it; repository-local code cannot protect its own gate.
- The application repo remains connected to Vercel in the controller's intended
  configuration. A provider-native Git deployment could bypass this controller
  if enabled; its live status was not checked, as provider contact was prohibited.
  The source controller requires Render auto-deploy to be off, but live Render
  state likewise remains unverified.
- An executor administrator can currently change workflow/controller code and
  there is no main protection/ruleset. `Xolani-M` remains an administrator by
  owner instruction. Repository-local validator code therefore cannot establish
  administrator-resistant enforcement.
- Candidate code cannot supply the authorization bundle through its candidate
  artifact. An authenticated verifier retrieval adapter is not installed and the
  fixed input file is absent, so admission fails closed. Do not use candidate
  manifests or an executor-owned trust root as a substitute.
- The controller's current deployment receipt and retry checks remain in force.
  A fresh verifier attestation ID is required after reconciling a prior attempt;
  a consumed signature cannot be replayed.

Focused tests prove absent, altered, expired, stale, wrong-run/attempt and
unverifiable attestations, missing receipts, or absent/skipped admission jobs deny
before provider reads. Workflow-source tests check job ordering and secret placement.
Disposable PostgreSQL tests prove exactly one winner among 64 concurrent
reservations. These tests do not prove GitHub's effective job isolation, independent
issuer custody, production database configuration, provider behavior or deployment.

## Enforcement boundary and remaining setup

To become independently enforceable:

1. A separate security custodian owns a verifier repository, immutable policy
   revisions, verifier workflow and signing identity. Ordinary application authors
   and `aqua-deployment` administrators must lack write, secret-management and
   bypass authority over them.
2. Organization-owned rules require that exact verifier workflow/check for both
   application `main` and the trusted deployment-control branch. Ordinary repository
   admins must not be able to remove or bypass these organization rules.
3. The verifier independently checks all 17 GitHub check contexts/producer IDs and
   test-definition pins, then executes the protected test set with a fixed harness
   against the exact immutable commit, without candidate actions, scripts, hooks,
   dependency lifecycle hooks, caches, secrets or signer access.
4. A separate issuer signs the canonical report only after authenticating the worker
   result. The check/attestation must bind the exact source, main CI run and current
   attempt, policy digest, verifier workflow revision, evidence digest and expiry.
5. The code now includes a durable PostgreSQL adapter. Provision its schema and
   separate INSERT-only identity using
   [`schemas/deployment-authorization-replay.sql`](../schemas/deployment-authorization-replay.sql),
   then qualify production durability and backup behavior and configure the
   admission-only `ATTESTATION_REPLAY_DATABASE_URL` secret.
6. Provider credentials remain in an owner-controlled deployment boundary that
   cannot be modified by application authors or administrators of the current
   `aqua-deployment` repository. `Xolani-M` remains its administrator; therefore it
   must not hold production provider secrets under the current access model.
7. Install the authenticated verifier retrieval adapter that writes the strict
   `{ envelope, expected, trustRoot }` bundle to the fixed runner-temporary path,
   authenticating source, issuer, policy, workflow revision and run/attempt through
   the separately controlled verifier. The pre-secret job dependency is implemented,
   but retrieval is absent and admission intentionally fails until it exists. No
   candidate source or candidate-provided script may execute with provider keys.

Current observations show `aqua-deployment` `main` is unprotected, has no
`production-release` environment, and the organization is on GitHub Free. Owner-level organization
rulesets/required workflows, a separate verifier/issuer and credential custody are
not installed. The contract is not a substitute for those controls or for provider,
runtime, PostgreSQL, recovery, deployment and production evidence.

## Tests

Run on Node 24 or later:

```bash
node --test tools/deployment/authorization-attestation.test.mjs
node --test tools/deployment/*.test.mjs
```

The focused test fixture uses all 17 check contexts from the executor controller
and two representative stable test identities copied from PR #106's
`mandatory-security-tests.json` at `b57c2810bc15d1f7893126697a0bfbb3f5b3ade2`.
The second fixture does not import or trust that candidate-controlled manifest, and
it does not claim to cover the manifest's full 240-test inventory. A separately
controlled verifier must pin and verify the complete applicable inventory and
pass it as `expected.tests`; the prototype only checks exact agreement with that
trusted input. For these two fixtures, `definitionSha256` is the pinned digest of
the complete test source file, not a source-derived per-function digest.

The cryptographic unit suite uses a test-only in-memory replay store; the separate
PostgreSQL integration test exercises the durable SQL adapter. These tests prove
local signature/claim classification and isolated database atomicity, not external
verifier custody, GitHub enforcement, production database durability, provider
credentials or a production deployment.
