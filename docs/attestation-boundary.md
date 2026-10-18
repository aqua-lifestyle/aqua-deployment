# Deployment authorization attestation v2 (credential-free prototype)

## Status and scope

This is a credential-free consumer prototype, now required by both the controller's
`admit` preflight and the beginning of `release-control.mjs`'s `deploy()` provider
mutation sequence. Admission verifies without consuming replay state; the mutation
boundary verifies again and atomically reserves the attestation. Missing or invalid
authorization denies before provider API reads or mutations in these paths.
The verifier returns `enforcement: PROTOTYPE_ONLY`; it does not issue signatures,
create a trusted policy, access GitHub, or store replay state durably. The existing
workflow does not supply the required authorization, so its deployment path fails
closed at the controller boundary. Production remains BLOCKED.

This is not yet a pre-secret workflow gate. The current workflow places the
`production-release` environment on its production job before its admission steps,
so any configured environment secrets become available to that job before the
controller runs. At the time of this change, a read-only GitHub API check returned
404 for that environment, `main` had no branch protection, the repository had no
rulesets, and Actions allowed all actions. No provider credentials were provisioned
or inspected here. An independent attestation job must run without provider
credentials and become a required dependency before this environment job can be
considered safe.

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

## Replay-store contract

The validator intentionally does not ship an in-memory or database replay adapter.
The caller must inject `replayStore.consumeOnce({ attestationId, replayKey,
payloadSha256, expiresAt })`. It must return `true` only when both replay coordinates
are atomically reserved for the first time; duplicate reservations return `false`.
Errors, timeouts, unavailable storage and ambiguous commits deny authorization.
The prototype bounds the store call to five seconds by default; tests may inject a
shorter deadline. A timeout denies that authorization even if the store operation
later commits, in which case a retry is denied by the durable replay key.

The persistent store must provide a durable transaction/atomic insert with unique
constraints on both `attestation_id` and `replay_key`, for example:

```sql
CREATE TABLE consumed_deployment_attestations (
  attestation_id uuid PRIMARY KEY,
  replay_key char(64) NOT NULL UNIQUE,
  payload_sha256 char(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
```

The adapter inserts both keys in one transaction and accepts only one returned row.
It must use the database's atomic uniqueness behavior across processes/regions,
retain records for at least the attestation validity plus the configured replay
window, and avoid deleting a row while a corresponding deployment can still be
admitted. Retention, backup, restore and multi-region consistency must be qualified
before use. A process-local `Set`, cache, or mock store is only a test fixture and
cannot establish production replay safety.

The replay key is derived from audience, repository, source SHA, CI run ID/attempt,
policy version/digest and attestation ID. Reusing one signed authorization is
denied. A trusted verifier may issue a fresh ID for a retry only after the release
controller has reconciled the prior attempt; the controller's immutable receipts
remain responsible for preventing duplicate or ambiguous provider mutations. This
allows the existing safe retry path without accepting the old signature again.

## Authorization path and bypass inventory

At the inspected app PR #106 head, the release trigger dispatches only
`ci_run_id`, `ci_run_attempt` and `sha` to the executor. It carries no verifier run,
attestation artifact or trust-root identity. The executor's candidate job fetches
and archives the exact app Git source without executing it. The production job then
enters `production-release`, downloads the candidate, performs admission, and calls
`release-control.mjs deploy`. That controller's `deploy()` function is the sole
Render/Vercel mutation sequence in the existing executor and now requires a signed
authorization before its first API operation.

The remaining paths and limits are concrete:

- Direct or malformed workflow dispatch still reaches the same controller; it
  cannot reach provider API reads or mutations without a supplied valid
  authorization. The CLI has no trusted authorization source; its current workflow
  therefore denies with `INDEPENDENT_ATTESTATION_REQUIRED` before provider
  configuration admission reads.
- The production job receives any configured environment secrets before the
  controller-level check. The separate no-secret verifier job and `needs` edge are
  not installed because neither an independent verifier artifact nor its
  authenticated retrieval identity exists.
- The application repo remains connected to Vercel in the controller's intended
  configuration. A provider-native Git deployment could bypass this controller
  if enabled; its live status was not checked, as provider contact was prohibited.
  The source controller requires Render auto-deploy to be off, but live Render
  state likewise remains unverified.
- An executor administrator can currently change workflow/controller code and
  there is no main protection/ruleset. `Xolani-M` remains an administrator by
  owner instruction. Repository-local validator code therefore cannot establish
  administrator-resistant enforcement.
- Candidate code cannot supply the `authorization` object to the production CLI,
  but there is not yet an independent verifier to provide it. Do not add a
  candidate artifact, app CI manifest or executor-owned public key as a substitute.
- The controller's current deployment receipt and retry checks remain in force.
  A new verifier attestation ID is needed for a retry after the prior attempt is
  reconciled; a consumed signature cannot be replayed. The atomic store mock used
  by tests is not durable.

The focused integration tests prove that the controller denies absent, altered,
expired, stale, wrong-run/attempt and unverifiable attestations before Render or
Vercel is called; concurrent use of one signed authorization admits at most one
controller invocation. Existing Render-failure tests continue to prove Vercel is
not called after a failed backend deployment. These are local controller tests,
not a GitHub job-boundary or production credential-isolation proof.

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
5. A durable atomic replay store and trusted clock are provisioned and qualified.
6. Provider credentials remain in an owner-controlled deployment boundary that
   cannot be modified by application authors or administrators of the current
   `aqua-deployment` repository. `Xolani-M` remains its administrator; therefore it
   must not hold production provider secrets under the current access model.
7. The deployment workflow must verify the attestation in a separate job with no
   provider credentials, require that job before entering the production
   environment, and revalidate source/run/attempt immediately before provider
   mutation. No candidate source or candidate-provided script may execute with
   provider keys. The current workflow does not yet have this pre-secret verifier
   job or a trusted evidence source.

Current observations show `aqua-deployment` `main` is unprotected, has no environment
or secrets, and the organization is on GitHub Free. Owner-level organization
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

The test replay store is deliberately in-memory and test-only. These tests prove
local signature/claim classification and failure behavior, not external verifier
custody, GitHub enforcement, durable replay resistance, provider credentials or a
production deployment.
