import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { requiredJobs } from './release-control.mjs';
import { AttestationDenied, verifyPrototypeAttestation } from './authorization-attestation.mjs';

const NOW = Date.parse('2026-10-18T12:00:00.000Z');
const POLICY_VERSION = 'mandatory-security-v1';
const POLICY_SHA = 'a'.repeat(64);
const SOURCE_SHA = 'b'.repeat(40);
const VERIFIER_SHA = 'c'.repeat(40);
const EVIDENCE_SHA = 'd'.repeat(64);
const keyPair = generateKeyPairSync('ed25519');
const publicKeyPem = keyPair.publicKey.export({ type: 'spki', format: 'pem' });
// Deliberately synthetic verifier coordinates: no independent verifier has been
// provisioned. These are test values, not repository or workflow paths.
const verifier = Object.freeze({ identity: 'test-only-verifier', repository: 'UNCONFIGURED',
  workflow: 'UNCONFIGURED', revision: VERIFIER_SHA });
const checks = requiredJobs.map(context => ({ context, integrationId: 15368 }));
const tests = [
  { id: 'AQUA-SEC-0001', file: 'tools/deployment/release-control.test.mjs',
    name: 'successful full push inventory qualifies the exact current main source',
    definitionSha256: '66852c046d7f4de7e8411865559eb7ca6f0943228aea0f8c02bca62a24753e45', expectedExecutions: 1 },
  { id: 'AQUA-SEC-0002', file: 'tools/deployment/release-control.test.mjs',
    name: 'unqualified CI conclusion=failure cannot qualify a source candidate',
    definitionSha256: '66852c046d7f4de7e8411865559eb7ca6f0943228aea0f8c02bca62a24753e45', expectedExecutions: 1 }
];
const expected = Object.freeze({ audience: 'aqua-lifestyle/aqua-deployment:production-release',
  policyVersion: POLICY_VERSION, policyDigest: POLICY_SHA,
  source: { repository: 'aqua-lifestyle/aqua-lifestyle', commitSha: SOURCE_SHA, ciRunId: '39100000000', ciRunAttempt: 2 },
  verifier, mandatoryChecks: checks, tests });
const trustRoot = () => ({ version: 1, audience: expected.audience,
  policy: { version: POLICY_VERSION, sha256: POLICY_SHA, status: 'active' },
  maxLifetimeSeconds: 300, clockSkewSeconds: 30, revokedPolicies: [], revokedKeyIds: [], revokedAttestationIds: [],
  issuers: [{ identity: 'owner-controlled-verifier', keyId: 'test-ed25519-v1', status: 'active', publicKeyPem,
    verifier }] });
const canonical = value => value && typeof value === 'object' ?
  (Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]))) : value;
const bytesFor = value => Buffer.from(JSON.stringify(canonical(value)));
const uuid = '123e4567-e89b-42d3-a456-426614174000';
function claim() {
  return {
    contract: 'aqua.deployment.authorization-attestation', version: 2, attestationId: uuid,
    issuer: { identity: 'owner-controlled-verifier', keyId: 'test-ed25519-v1' },
    verifier: { ...verifier }, audience: expected.audience, source: { ...expected.source },
    policy: { version: POLICY_VERSION, sha256: POLICY_SHA },
    issuedAt: '2026-10-18T11:59:00.000Z', expiresAt: '2026-10-18T12:04:00.000Z',
    mandatoryChecks: checks.map(x => ({ ...x, status: 'completed', conclusion: 'success',
      commitSha: SOURCE_SHA, ciRunId: expected.source.ciRunId, ciRunAttempt: expected.source.ciRunAttempt })),
    tests: tests.map(x => ({ id: x.id, file: x.file, name: x.name,
      definitionSha256: x.definitionSha256, outcome: 'passed', executions: x.expectedExecutions })),
    executionEvidenceSha256: EVIDENCE_SHA, verdict: 'PASS'
  };
}
function signedEnvelope(change = x => x) {
  const payload = change(claim());
  const payloadBytes = bytesFor(payload);
  return { keyId: 'test-ed25519-v1', payload: payloadBytes.toString('base64url'),
    signature: sign(null, payloadBytes, keyPair.privateKey).toString('base64url') };
}
class TestReplayStore {
  #ids = new Set();
  #keys = new Set();
  async consumeOnce({ attestationId, replayKey }) {
    if (this.#ids.has(attestationId) || this.#keys.has(replayKey)) return false;
    this.#ids.add(attestationId); this.#keys.add(replayKey); return true;
  }
}
const verify = (overrides = {}) => verifyPrototypeAttestation({ envelope: signedEnvelope(),
  trustRoot: trustRoot(), expected, replayStore: new TestReplayStore(), now: () => NOW, ...overrides });
const denied = async (promise, code) => {
  await assert.rejects(promise, error => error instanceof AttestationDenied && error.code === code);
};

test('valid v2 evidence binds the exact source, current CI attempt, 17 checks and test definitions', async () => {
  const store = new TestReplayStore();
  const result = await verifyPrototypeAttestation({ envelope: signedEnvelope(), trustRoot: trustRoot(),
    expected, replayStore: store, now: () => NOW });
  assert.equal(result.verdict, 'PASS'); assert.equal(result.enforcement, 'PROTOTYPE_ONLY');
  assert.equal(result.checksVerified, 17); assert.equal(result.testsVerified, tests.length);
  assert.equal(result.commitSha, SOURCE_SHA); assert.equal(result.ciRunAttempt, 2);
});

test('altered payload and altered signature are denied', async () => {
  const valid = signedEnvelope();
  const payload = JSON.parse(Buffer.from(valid.payload, 'base64url'));
  payload.verdict = 'FAIL';
  await denied(verify({ envelope: { ...valid, payload: bytesFor(payload).toString('base64url') } }), 'ATTESTATION_SIGNATURE_INVALID');
  const signature = Buffer.from(valid.signature, 'base64url'); signature[0] ^= 1;
  await denied(verify({ envelope: { ...valid, signature: signature.toString('base64url') } }), 'ATTESTATION_SIGNATURE_INVALID');
});

test('wrong repository, source SHA, CI run or attempt is denied', async () => {
  for (const [field, value] of [['repository', 'evil/repository'], ['commitSha', 'e'.repeat(40)], ['ciRunId', '39100000001']]) {
    const envelope = signedEnvelope(c => { c.source[field] = value; return c; });
    await denied(verify({ envelope }), 'SOURCE_IDENTITY_MISMATCH');
  }
  const envelope = signedEnvelope(c => { c.source.ciRunAttempt = 3; return c; });
  await denied(verify({ envelope }), 'SOURCE_IDENTITY_MISMATCH');
});

test('wrong audience, verifier identity or immutable verifier revision is denied', async () => {
  const audience = signedEnvelope(c => { c.audience = 'other:production'; return c; });
  await denied(verify({ envelope: audience }), 'AUDIENCE_MISMATCH');
  const revision = signedEnvelope(c => { c.verifier.revision = 'f'.repeat(40); return c; });
  await denied(verify({ envelope: revision }), 'VERIFIER_IDENTITY_MISMATCH');
  const identity = signedEnvelope(c => { c.verifier.identity = 'candidate-workflow'; return c; });
  await denied(verify({ envelope: identity }), 'VERIFIER_IDENTITY_MISMATCH');
});

test('expired, future-dated and overlong evidence is denied', async () => {
  const expired = signedEnvelope(c => { c.expiresAt = '2026-10-18T11:59:59.999Z'; return c; });
  await denied(verify({ envelope: expired }), 'ATTESTATION_EXPIRED');
  const future = signedEnvelope(c => { c.issuedAt = '2026-10-18T12:00:31.000Z'; return c; });
  await denied(verify({ envelope: future }), 'ATTESTATION_ISSUED_IN_FUTURE');
  const long = signedEnvelope(c => { c.expiresAt = '2026-10-18T12:05:00.001Z'; return c; });
  await denied(verify({ envelope: long }), 'ATTESTATION_LIFETIME_INVALID');
});

test('unknown or revoked issuer keys and revoked policies are denied', async () => {
  await denied(verify({ envelope: { ...signedEnvelope(), keyId: 'unregistered-key' } }), 'UNKNOWN_ISSUER_OR_KEY');
  const unknownIssuer = signedEnvelope(c => { c.issuer.identity = 'unknown-issuer'; return c; });
  await denied(verify({ envelope: unknownIssuer }), 'UNKNOWN_ISSUER_OR_KEY');
  const revokedKey = trustRoot(); revokedKey.revokedKeyIds.push('test-ed25519-v1');
  await denied(verify({ trustRoot: revokedKey }), 'UNKNOWN_ISSUER_OR_KEY');
  const revokedPolicy = trustRoot(); revokedPolicy.revokedPolicies.push(POLICY_VERSION);
  await denied(verify({ trustRoot: revokedPolicy }), 'POLICY_UNTRUSTED_OR_REVOKED');
  const wrongPolicyDigest = signedEnvelope(c => { c.policy.sha256 = 'f'.repeat(64); return c; });
  await denied(verify({ envelope: wrongPolicyDigest }), 'POLICY_UNTRUSTED_OR_REVOKED');
  const revokedAttestation = trustRoot(); revokedAttestation.revokedAttestationIds.push(uuid);
  await denied(verify({ trustRoot: revokedAttestation }), 'ATTESTATION_REVOKED');
  const inactiveIssuer = trustRoot(); inactiveIssuer.issuers[0].status = 'revoked';
  await denied(verify({ trustRoot: inactiveIssuer }), 'UNKNOWN_ISSUER_OR_KEY');
  const duplicateIssuer = trustRoot(); duplicateIssuer.issuers.push({ ...duplicateIssuer.issuers[0] });
  await denied(verify({ trustRoot: duplicateIssuer }), 'TRUST_ROOT_INVALID');
});

test('missing, duplicate, unsuccessful and wrong-producer mandatory checks are denied', async () => {
  const missing = signedEnvelope(c => { c.mandatoryChecks.pop(); return c; });
  await denied(verify({ envelope: missing }), 'MANDATORY_CHECK_INVENTORY_MISMATCH');
  const duplicate = signedEnvelope(c => { c.mandatoryChecks[16] = { ...c.mandatoryChecks[0] }; return c; });
  await denied(verify({ envelope: duplicate }), 'MANDATORY_CHECK_INVENTORY_MISMATCH');
  const skipped = signedEnvelope(c => { c.mandatoryChecks[0].conclusion = 'skipped'; return c; });
  await denied(verify({ envelope: skipped }), 'MANDATORY_CHECK_NOT_VERIFIED');
  const wrongApp = signedEnvelope(c => { c.mandatoryChecks[0].integrationId = 999; return c; });
  await denied(verify({ envelope: wrongApp }), 'MANDATORY_CHECK_NOT_VERIFIED');
});

test('missing, renamed, duplicate or weakened mandatory test definitions are denied', async () => {
  const missing = signedEnvelope(c => { c.tests.pop(); return c; });
  await denied(verify({ envelope: missing }), 'MANDATORY_TEST_INVENTORY_MISMATCH');
  const renamed = signedEnvelope(c => { c.tests[0].name = 'candidate replacement'; return c; });
  await denied(verify({ envelope: renamed }), 'MANDATORY_TEST_NOT_VERIFIED');
  const weakened = signedEnvelope(c => { c.tests[0].definitionSha256 = 'f'.repeat(64); return c; });
  await denied(verify({ envelope: weakened }), 'MANDATORY_TEST_NOT_VERIFIED');
  const skipped = signedEnvelope(c => { c.tests[0].outcome = 'skipped'; return c; });
  await denied(verify({ envelope: skipped }), 'MANDATORY_TEST_NOT_VERIFIED');
  const count = signedEnvelope(c => { c.tests[0].executions = 0; return c; });
  await denied(verify({ envelope: count }), 'MANDATORY_TEST_NOT_VERIFIED');
});

test('replay is denied, reissuance for the same source tuple is denied, and replay-store failure never authorizes', async () => {
  const store = new TestReplayStore(), envelope = signedEnvelope();
  const args = { envelope, trustRoot: trustRoot(), expected, replayStore: store, now: () => NOW };
  assert.equal((await verifyPrototypeAttestation(args)).verdict, 'PASS');
  await denied(verifyPrototypeAttestation(args), 'ATTESTATION_REPLAYED');
  const reissued = signedEnvelope(c => { c.attestationId = '223e4567-e89b-42d3-a456-426614174000'; return c; });
  await denied(verifyPrototypeAttestation({ ...args, envelope: reissued }), 'ATTESTATION_REPLAYED');
  const concurrentStore = new TestReplayStore(), concurrentEnvelope = signedEnvelope(c => { c.attestationId = '323e4567-e89b-42d3-a456-426614174000'; return c; });
  const concurrentArgs = { ...args, envelope: concurrentEnvelope, replayStore: concurrentStore };
  const concurrent = await Promise.allSettled([verifyPrototypeAttestation(concurrentArgs), verifyPrototypeAttestation(concurrentArgs)]);
  assert.equal(concurrent.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(concurrent.filter(x => x.status === 'rejected').length, 1);
  await denied(verify({ envelope: signedEnvelope(), replayStore: undefined }), 'REPLAY_STORE_UNAVAILABLE');
  await denied(verify({ envelope: signedEnvelope(), replayStore: { consumeOnce: async () => { throw Error('offline'); } } }), 'REPLAY_STORE_UNAVAILABLE');
  await denied(verify({ envelope: signedEnvelope(), replayTimeoutMs: 1,
    replayStore: { consumeOnce: () => new Promise(() => {}) } }), 'REPLAY_STORE_UNAVAILABLE');
});

test('malformed, noncanonical, oversized and unverifiable input is denied', async () => {
  await denied(verify({ envelope: null }), 'ATTESTATION_MALFORMED');
  await denied(verify({ envelope: { keyId: 'test-ed25519-v1', payload: '***', signature: '***' } }), 'ATTESTATION_MALFORMED');
  const valid = signedEnvelope();
  const padded = { ...valid, payload: `${valid.payload}=` };
  await denied(verify({ envelope: padded }), 'ATTESTATION_MALFORMED');
  const invalidJson = Buffer.from('{');
  await denied(verify({ envelope: { keyId: 'test-ed25519-v1', payload: invalidJson.toString('base64url'),
    signature: sign(null, invalidJson, keyPair.privateKey).toString('base64url') } }), 'ATTESTATION_MALFORMED');
  await denied(verify({ envelope: { ...valid, payload: Buffer.alloc(1024 * 1024 + 1).toString('base64url') } }),
    'ATTESTATION_MALFORMED');
  await denied(verify({ envelope: { ...valid, payload: 'A'.repeat(2 * 1024 * 1024) } }), 'ATTESTATION_MALFORMED');
  const noncanonical = Buffer.from(JSON.stringify(claim()));
  const nonCanonicalEnvelope = { keyId: 'test-ed25519-v1', payload: noncanonical.toString('base64url'),
    signature: sign(null, noncanonical, keyPair.privateKey).toString('base64url') };
  await denied(verify({ envelope: nonCanonicalEnvelope }), 'ATTESTATION_NON_CANONICAL');
  const unavailable = { importEd25519PublicKey() { throw Error('unavailable'); }, verifyEd25519() { return false; } };
  await denied(verify({ envelope: valid, cryptoProvider: unavailable }), 'CRYPTO_DEPENDENCY_UNAVAILABLE');
  await denied(verify({ envelope: valid, cryptoProvider: null }), 'CRYPTO_DEPENDENCY_UNAVAILABLE');
  await denied(verify({ envelope: valid, now: () => NaN }), 'CLOCK_UNAVAILABLE');
});

test('store receives both unique replay coordinates and the verified payload digest', async () => {
  const envelope = signedEnvelope(), captured = [];
  const store = { async consumeOnce(value) { captured.push(value); return true; } };
  await verifyPrototypeAttestation({ envelope, trustRoot: trustRoot(), expected, replayStore: store, now: () => NOW });
  assert.equal(captured.length, 1);
  assert.equal(captured[0].attestationId, uuid);
  assert.match(captured[0].replayKey, /^[a-f0-9]{64}$/);
  assert.match(captured[0].payloadSha256, /^[a-f0-9]{64}$/);
  assert.equal(captured[0].expiresAt, '2026-10-18T12:04:00.000Z');
});
