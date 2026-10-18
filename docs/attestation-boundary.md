# Deployment authorization attestation v2 (credential-free prototype)

## Status and scope

This is a local, credential-free consumer prototype. It does not issue signatures,
create a trusted policy, access GitHub, store replay state durably, or gate the
existing production workflow. `verifyPrototypeAttestation` returns
`enforcement: PROTOTYPE_ONLY` and is not called by `release-control.mjs` or
`.github/workflows/deploy.yml`. Do not connect it to provider credentials until the
external trust root, issuer, required enforcement and atomic replay store have been
independently provisioned and observed. Production remains BLOCKED.

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

The replay key is derived from audience, repository, source SHA, CI run ID/attempt
and policy version/digest. This prevents a newly issued UUID for the same deployment
authorization tuple from evading the one-use rule. The signed UUID separately
prevents reuse of the exact envelope.

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
7. The deployment workflow verifies the attestation and revalidates source/run /
   attempt immediately before secret availability and provider mutation. No
   candidate source or candidate-provided script may execute with provider keys.

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
