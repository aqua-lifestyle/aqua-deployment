// Credential-free consumer prototype. The trust root, expected context and replay
// store must be supplied by a separately trusted caller; this module cannot create
// independent authority from candidate-controlled inputs.
import { createHash, createPublicKey, verify as nodeVerify } from 'node:crypto';

const CONTRACT = 'aqua.deployment.authorization-attestation';
const VERSION = 2;
const MAX_PAYLOAD_BYTES = 1024 * 1024;
const MAX_ENCODED_PAYLOAD_LENGTH = Math.ceil(MAX_PAYLOAD_BYTES * 4 / 3);
const DEFAULT_REPLAY_TIMEOUT_MS = 5000;
const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[A-Z][A-Z0-9._:-]{1,127}$/;
const validAppId = x => Number.isSafeInteger(x) && x > 0;

export class AttestationDenied extends Error {
  constructor(code) { super(code); this.name = 'AttestationDenied'; this.code = code; }
}

const deny = code => { throw new AttestationDenied(code); };
const own = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const positiveId = x => typeof x === 'string' && /^[1-9]\d*$/.test(x);
const positiveInteger = x => Number.isSafeInteger(x) && x > 0;
const canonicalJson = value => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  deny('ATTESTATION_MALFORMED');
};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const base64url = value => typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value);
const decodeBase64url = value => {
  if (!base64url(value)) deny('ATTESTATION_MALFORMED');
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.toString('base64url') !== value) deny('ATTESTATION_MALFORMED');
  return bytes;
};
function isoMillis(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))
    deny('ATTESTATION_TIME_INVALID');
  const millis = Date.parse(value);
  if (!Number.isFinite(millis) || new Date(millis).toISOString() !== value) deny('ATTESTATION_TIME_INVALID');
  return millis;
}
function validateExpected(expected, trustRoot) {
  if (!trustRoot || typeof trustRoot !== 'object' || trustRoot.version !== 1 ||
      typeof trustRoot.audience !== 'string' || !trustRoot.audience) deny('TRUST_ROOT_INVALID');
  if (!expected || expected.audience !== trustRoot.audience ||
      expected.policyVersion !== trustRoot.policy?.version || expected.policyDigest !== trustRoot.policy?.sha256 ||
      trustRoot.policy?.status !== 'active' || !DIGEST.test(expected.policyDigest ?? '') ||
      typeof expected.policyVersion !== 'string' || !expected.policyVersion)
    deny('POLICY_UNTRUSTED_OR_REVOKED');
  if (!expected.source || expected.source.repository !== 'aqua-lifestyle/aqua-lifestyle' ||
      !SHA.test(expected.source.commitSha ?? '') || !positiveId(expected.source.ciRunId) ||
      !positiveInteger(expected.source.ciRunAttempt)) deny('EXPECTED_SOURCE_INVALID');
  if (!expected.verifier || typeof expected.verifier.identity !== 'string' ||
      !expected.verifier.identity || typeof expected.verifier.repository !== 'string' ||
      typeof expected.verifier.workflow !== 'string' || !SHA.test(expected.verifier.revision ?? ''))
    deny('EXPECTED_VERIFIER_INVALID');
  if (!Array.isArray(expected.mandatoryChecks) || expected.mandatoryChecks.length !== 17 ||
      new Set(expected.mandatoryChecks.map(x => x.context)).size !== 17 ||
      expected.mandatoryChecks.some(x => typeof x.context !== 'string' || !x.context || !validAppId(x.integrationId)))
    deny('TRUSTED_CHECK_INVENTORY_INVALID');
  if (!Array.isArray(expected.tests) || expected.tests.length === 0 ||
      new Set(expected.tests.map(x => x.id)).size !== expected.tests.length ||
      new Set(expected.tests.map(x => JSON.stringify([x?.file, x?.name]))).size !== expected.tests.length ||
      expected.tests.some(x => !x || !ID.test(x.id ?? '') || typeof x.file !== 'string' || !x.file ||
        typeof x.name !== 'string' || !x.name || !DIGEST.test(x.definitionSha256 ?? '') ||
        !positiveInteger(x.expectedExecutions))) deny('TRUSTED_TEST_INVENTORY_INVALID');
  if (!Number.isSafeInteger(trustRoot.maxLifetimeSeconds) || trustRoot.maxLifetimeSeconds < 1 ||
      trustRoot.maxLifetimeSeconds > 3600 || !Number.isSafeInteger(trustRoot.clockSkewSeconds) ||
      trustRoot.clockSkewSeconds < 0 || trustRoot.clockSkewSeconds > 60 ||
      !Array.isArray(trustRoot.issuers) || trustRoot.issuers.length === 0 || trustRoot.issuers.length > 100 ||
      new Set(trustRoot.issuers.map(x => x?.keyId)).size !== trustRoot.issuers.length ||
      trustRoot.issuers.some(x => !x || typeof x.identity !== 'string' || !x.identity ||
        typeof x.keyId !== 'string' || !x.keyId || !['active', 'revoked'].includes(x.status) ||
        typeof x.publicKeyPem !== 'string' || !x.verifier || typeof x.verifier.identity !== 'string' ||
        typeof x.verifier.repository !== 'string' || typeof x.verifier.workflow !== 'string' ||
        !SHA.test(x.verifier.revision ?? '')) ||
      !Array.isArray(trustRoot.revokedKeyIds) || trustRoot.revokedKeyIds.some(x => typeof x !== 'string') ||
      !Array.isArray(trustRoot.revokedAttestationIds) ||
      trustRoot.revokedAttestationIds.some(x => typeof x !== 'string') ||
      !Array.isArray(trustRoot.revokedPolicies) || trustRoot.revokedPolicies.some(x => typeof x !== 'string'))
    deny('TRUST_ROOT_INVALID');
  if (trustRoot.revokedPolicies.includes(expected.policyVersion) ||
      trustRoot.revokedPolicies.includes(expected.policyDigest)) deny('POLICY_UNTRUSTED_OR_REVOKED');
}
function validateClaim(claim, expected, issuer) {
  if (!own(claim, ['contract', 'version', 'attestationId', 'issuer', 'verifier', 'audience',
    'source', 'policy', 'issuedAt', 'expiresAt', 'mandatoryChecks', 'tests', 'executionEvidenceSha256', 'verdict']) ||
      claim.contract !== CONTRACT || claim.version !== VERSION ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(claim.attestationId ?? '') ||
      claim.verdict !== 'PASS' || !DIGEST.test(claim.executionEvidenceSha256 ?? '')) deny('ATTESTATION_MALFORMED');
  if (!own(claim.issuer, ['identity', 'keyId']) || claim.issuer.identity !== issuer.identity ||
      claim.issuer.keyId !== issuer.keyId) deny('UNKNOWN_ISSUER_OR_KEY');
  if (!own(claim.verifier, ['identity', 'repository', 'workflow', 'revision']) ||
      claim.verifier.identity !== expected.verifier.identity ||
      claim.verifier.repository !== expected.verifier.repository ||
      claim.verifier.workflow !== expected.verifier.workflow ||
      claim.verifier.revision !== expected.verifier.revision ||
      issuer.verifier?.identity !== expected.verifier.identity ||
      issuer.verifier?.repository !== expected.verifier.repository ||
      issuer.verifier?.workflow !== expected.verifier.workflow ||
      issuer.verifier?.revision !== expected.verifier.revision) deny('VERIFIER_IDENTITY_MISMATCH');
  if (claim.audience !== expected.audience) deny('AUDIENCE_MISMATCH');
  if (!own(claim.source, ['repository', 'commitSha', 'ciRunId', 'ciRunAttempt']) ||
      claim.source.repository !== expected.source.repository || claim.source.commitSha !== expected.source.commitSha ||
      claim.source.ciRunId !== expected.source.ciRunId || claim.source.ciRunAttempt !== expected.source.ciRunAttempt)
    deny('SOURCE_IDENTITY_MISMATCH');
  if (!own(claim.policy, ['version', 'sha256']) || claim.policy.version !== expected.policyVersion ||
      claim.policy.sha256 !== expected.policyDigest) deny('POLICY_UNTRUSTED_OR_REVOKED');

  if (!Array.isArray(claim.mandatoryChecks) || claim.mandatoryChecks.length !== expected.mandatoryChecks.length)
    deny('MANDATORY_CHECK_INVENTORY_MISMATCH');
  const checks = new Map(expected.mandatoryChecks.map(x => [x.context, x]));
  const seenChecks = new Set();
  for (const row of claim.mandatoryChecks) {
    if (!own(row, ['context', 'integrationId', 'status', 'conclusion', 'commitSha', 'ciRunId', 'ciRunAttempt']) ||
        !checks.has(row.context) || seenChecks.has(row.context)) deny('MANDATORY_CHECK_INVENTORY_MISMATCH');
    const pinned = checks.get(row.context);
    if (row.integrationId !== pinned.integrationId || row.status !== 'completed' || row.conclusion !== 'success' ||
        row.commitSha !== expected.source.commitSha || row.ciRunId !== expected.source.ciRunId ||
        row.ciRunAttempt !== expected.source.ciRunAttempt) deny('MANDATORY_CHECK_NOT_VERIFIED');
    seenChecks.add(row.context);
  }
  if (seenChecks.size !== checks.size) deny('MANDATORY_CHECK_INVENTORY_MISMATCH');

  if (!Array.isArray(claim.tests) || claim.tests.length !== expected.tests.length)
    deny('MANDATORY_TEST_INVENTORY_MISMATCH');
  const tests = new Map(expected.tests.map(x => [x.id, x]));
  const seenTests = new Set();
  for (const row of claim.tests) {
    if (!own(row, ['id', 'file', 'name', 'definitionSha256', 'outcome', 'executions']) ||
        !tests.has(row.id) || seenTests.has(row.id)) deny('MANDATORY_TEST_INVENTORY_MISMATCH');
    const pinned = tests.get(row.id);
    if (row.file !== pinned.file || row.name !== pinned.name || row.definitionSha256 !== pinned.definitionSha256 ||
        row.outcome !== 'passed' || row.executions !== pinned.expectedExecutions)
      deny('MANDATORY_TEST_NOT_VERIFIED');
    seenTests.add(row.id);
  }
  if (seenTests.size !== tests.size) deny('MANDATORY_TEST_INVENTORY_MISMATCH');
}

const nodeCrypto = Object.freeze({
  importEd25519PublicKey: pem => createPublicKey(pem),
  verifyEd25519: (key, payload, signature) => nodeVerify(null, payload, key, signature)
});

/**
 * Verify one credential-free prototype attestation. Trust root and expected claims
 * must come from an independent, authenticated authority. replayStore.consumeOnce
 * must implement the atomic persistent contract documented in docs/attestation-boundary.md.
 */
export async function verifyPrototypeAttestation({ envelope, trustRoot, expected, replayStore,
  now = Date.now, cryptoProvider = nodeCrypto, replayTimeoutMs = DEFAULT_REPLAY_TIMEOUT_MS } = {}) {
  try {
    if (!cryptoProvider || typeof cryptoProvider.importEd25519PublicKey !== 'function' ||
        typeof cryptoProvider.verifyEd25519 !== 'function') deny('CRYPTO_DEPENDENCY_UNAVAILABLE');
    validateExpected(expected, trustRoot);
    if (!own(envelope, ['keyId', 'payload', 'signature']) || typeof envelope.keyId !== 'string' ||
        envelope.keyId.length === 0 || envelope.keyId.length > 128 ||
        typeof envelope.payload !== 'string' || envelope.payload.length > MAX_ENCODED_PAYLOAD_LENGTH ||
        typeof envelope.signature !== 'string' || envelope.signature.length !== 86)
      deny('ATTESTATION_MALFORMED');
    const payloadBytes = decodeBase64url(envelope.payload);
    const signature = decodeBase64url(envelope.signature);
    if (payloadBytes.length === 0 || payloadBytes.length > MAX_PAYLOAD_BYTES || signature.length !== 64)
      deny('ATTESTATION_MALFORMED');
    const key = trustRoot.issuers.find(x => x.keyId === envelope.keyId);
    if (!key || key.status !== 'active' || trustRoot.revokedKeyIds.includes(envelope.keyId))
      deny('UNKNOWN_ISSUER_OR_KEY');
    let authentic;
    try {
      const publicKey = cryptoProvider.importEd25519PublicKey(key.publicKeyPem);
      if (publicKey.asymmetricKeyType !== 'ed25519') deny('TRUST_ROOT_INVALID');
      authentic = cryptoProvider.verifyEd25519(publicKey, payloadBytes, signature);
    } catch (error) {
      if (error instanceof AttestationDenied) throw error;
      deny('CRYPTO_DEPENDENCY_UNAVAILABLE');
    }
    if (authentic !== true) deny('ATTESTATION_SIGNATURE_INVALID');
    let text, claim;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(payloadBytes);
      claim = JSON.parse(text);
    } catch { deny('ATTESTATION_MALFORMED'); }
    if (canonicalJson(claim) !== text) deny('ATTESTATION_NON_CANONICAL');
    validateClaim(claim, expected, key);
    if (trustRoot.revokedAttestationIds.includes(claim.attestationId)) deny('ATTESTATION_REVOKED');

    const issued = isoMillis(claim.issuedAt), expires = isoMillis(claim.expiresAt);
    const current = typeof now === 'function' ? now() : NaN;
    if (!Number.isSafeInteger(current)) deny('CLOCK_UNAVAILABLE');
    const skew = trustRoot.clockSkewSeconds * 1000;
    if (issued > current + skew) deny('ATTESTATION_ISSUED_IN_FUTURE');
    if (expires <= current) deny('ATTESTATION_EXPIRED');
    if (expires <= issued || expires - issued > trustRoot.maxLifetimeSeconds * 1000)
      deny('ATTESTATION_LIFETIME_INVALID');

    if (!replayStore || typeof replayStore.consumeOnce !== 'function') deny('REPLAY_STORE_UNAVAILABLE');
    if (!Number.isSafeInteger(replayTimeoutMs) || replayTimeoutMs < 1) deny('REPLAY_STORE_UNAVAILABLE');
    const replayKey = sha256(Buffer.from(JSON.stringify([
      claim.audience, claim.source.repository, claim.source.commitSha, claim.source.ciRunId,
      claim.source.ciRunAttempt, claim.policy.version, claim.policy.sha256
    ])));
    let consumed;
    let timeout;
    try {
      consumed = await Promise.race([
        replayStore.consumeOnce({ attestationId: claim.attestationId, replayKey,
          payloadSha256: sha256(payloadBytes), expiresAt: claim.expiresAt }),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('replay store timeout')), replayTimeoutMs); })
      ]);
    } catch { deny('REPLAY_STORE_UNAVAILABLE'); }
    finally { clearTimeout(timeout); }
    if (consumed !== true) deny('ATTESTATION_REPLAYED');
    return Object.freeze({ verdict: 'PASS', enforcement: 'PROTOTYPE_ONLY', attestationId: claim.attestationId,
      audience: claim.audience, repository: claim.source.repository, commitSha: claim.source.commitSha,
      ciRunId: claim.source.ciRunId, ciRunAttempt: claim.source.ciRunAttempt,
      policyVersion: claim.policy.version, verifierRevision: claim.verifier.revision,
      checksVerified: claim.mandatoryChecks.length, testsVerified: claim.tests.length,
      executionEvidenceSha256: claim.executionEvidenceSha256 });
  } catch (error) {
    if (error instanceof AttestationDenied) throw error;
    throw new AttestationDenied('ATTESTATION_UNVERIFIABLE');
  }
}

export const attestationContractVersion = VERSION;
