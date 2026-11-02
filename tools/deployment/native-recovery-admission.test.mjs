import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { objectDigest } from './github-evidence.mjs';
import { standingPolicy, policyDigest } from './release-control.mjs';
import { approvedSchemaReadback, validateSchemaReadback } from './commission-schema-first.mjs';
import { approvedRecoveryReadback, legacyRecoveryPair, nativeRecoveryPolicyKind,
  validateFirstReleaseRecovery, validateLegacyProviderPair, validNativeHeldFrontend } from './first-release-recovery.mjs';
const pins = JSON.parse(readFileSync(new URL('./native-recovery-source.json', import.meta.url)));
const at = () => Date.parse(approvedRecoveryReadback.observation.observedAt) + 1000;
const fixture = () => {
  const r = structuredClone(approvedRecoveryReadback), p = structuredClone(standingPolicy), q = { sha: pins.candidateSha };
  const schema = validateSchemaReadback(approvedSchemaReadback, q, p, false, at);
  return { r, p, q, schema, validate: () => validateFirstReleaseRecovery(r, q, p, at, schema) };
};
const refresh = f => { f.p.firstReleaseRecovery.evidenceSha256 = objectDigest(f.r); };
test('native v3 admits actual held pair and source-based recovery without asserting cached rollback eligibility', () => {
  const f = fixture(), proof = f.validate();
  assert.equal(proof.kind, nativeRecoveryPolicyKind);
  assert.equal(proof.renderSha, pins.heldPair.renderSha);
  assert.equal(proof.vercelSha, pins.heldPair.vercelSha);
  assert.equal(proof.frontendSourceProvenance, 'VERIFIED_MEMBER_SOURCE_AUDIT');
  assert.equal(proof.cachedRollbackAuthorized, false); assert.equal(proof.databaseRollbackAllowed, false);
  assert.equal(f.r.observation.nativeRecovery.cachedArtifactEligibility, 'NOT_VERIFIED');
  assert.equal(f.r.observation.nativeRecovery.cachedRollbackAuthorized, false);
  assert.deepEqual(f.p.firstReleaseRecovery.baseline, legacyRecoveryPair);
  assert.equal(f.p.firstReleaseRecovery.baseline.renderSha, pins.sourceComparisonBaselineSha);
  assert.equal(typeof policyDigest(f.p), 'string');
});
test('native recovery cannot silently replace source/migration baselines or select another candidate, identity or target', () => {
  const edits = [f => f.q.sha = 'a'.repeat(40), f => f.r.observation.candidateSha = 'b'.repeat(40),
    f => f.r.observation.baseline.renderSha = legacyRecoveryPair.renderSha,
    f => f.r.observation.baseline.vercelDeployId = 'dpl_Other',
    f => f.r.observation.nativeRecovery.databaseIdentitySha256 = 'c'.repeat(64),
    f => f.r.observation.nativeRecovery.tenantId = 2,
    f => f.p.scope.renderServiceId = 'srv-other',
    f => f.schema.evidenceSha256 = 'd'.repeat(64),
    f => f.schema.schemaEvidenceKind = 'another-kind'];
  for (const edit of edits) { const f = fixture(); edit(f); refresh(f); assert.throws(f.validate, /NATIVE_RECOVERY_|FIRST_RELEASE_RECOVERY_/); }
  const f = fixture(); f.p.firstReleaseRecovery.baseline.renderSha = pins.heldPair.renderSha;
  assert.throws(() => policyDigest(f.p), /STANDING_POLICY_INVALID/);
});
test('native recovery keeps evidence provenance, held-only compatibility and financial/schema prohibitions strict', () => {
  const edits = [
    n => n.ownerAuthoritySha256 = '0'.repeat(64), n => n.ownerAuthorityReference = 'https://attacker.invalid/',
    n => n.observationSha256 = '1'.repeat(64), n => n.frontendSourceEvidenceSha256 = '2'.repeat(64),
    n => n.observationReference = n.ownerAuthorityReference, n => n.sourceAvailable = false,
    n => n.receiverSourceSha = legacyRecoveryPair.renderSha, n => n.usesCurrentConfiguration = false,
    n => n.cachedArtifactEligibility = 'VERIFIED', n => n.cachedRollbackAuthorized = true,
    n => n.databaseRollbackAllowed = true, n => n.fallback = 'anything'
  ];
  for (const edit of edits) { const f = fixture(); edit(f.r.observation.nativeRecovery); refresh(f); assert.throws(f.validate, /NATIVE_RECOVERY_EVIDENCE_REQUIRED/); }
  for (const edit of [o => o.compatibility.schemaAndData = true, o => o.compatibility.configuration = false,
    o => o.recovery.legacyFinancialRollbackAllowed = true, o => o.recovery.mode = 'legacy-rollback']) {
    const f = fixture(); edit(f.r.observation); refresh(f); assert.throws(f.validate, /NATIVE_RECOVERY_HOLD_PRESERVING_METHOD_REQUIRED/);
  }
});
test('native recovery does not manufacture fresh observations or bypass existing expiry and observer checks', () => {
  for (const edit of [r => r.status = 'UNVERIFIED', r => r.observation.observer.id = 1,
    r => r.observation.expiresAt = new Date(at()).toISOString(),
    r => r.observation.expiresAt = '2099-01-01T00:00:00Z']) {
    const f = fixture(); edit(f.r); refresh(f); assert.throws(f.validate, /FIRST_RELEASE_RECOVERY_/);
  }
  const f = fixture(); f.r.observation.observedAt = new Date(at()).toISOString(); refresh(f);
  assert.throws(f.validate, /NATIVE_RECOVERY_VERIFIED_OBSERVATION_REQUIRED/);
});
test('native readback requires explicit matching policy/version and cannot use old cached-artifact contracts', () => {
  for (const kind of ['pinned-legacy-forward-remediation-v1', 'pinned-legacy-retained-artifact-v1', 'UNKNOWN']) {
    const f = fixture(); f.p.firstReleaseRecovery.kind = kind;
    assert.throws(f.validate, /FIRST_RELEASE_RECOVERY_EVIDENCE_REQUIRED/);
  }
  for (const version of [1, 2, 4]) { const f = fixture(); f.r.version = version; refresh(f); assert.throws(f.validate, /FIRST_RELEASE_RECOVERY_EVIDENCE_REQUIRED/); }
});
test('native source provenance permits only the previously qualified immutable frontend deployment', () => {
  const proof = fixture().validate();
  const web = { id: proof.vercelDeployId, projectId: proof.vercelProjectId };
  assert.equal(validNativeHeldFrontend(proof, web), true);
  assert.equal(validNativeHeldFrontend(proof, { ...web, id: 'dpl_Other', meta: { aquaSourceSha: proof.vercelSha } }), false);
  assert.equal(validNativeHeldFrontend(proof, { ...web, gitSource: { sha: 'a'.repeat(40), repoId: pins.sourceRepositoryId } }), false);
  assert.equal(validNativeHeldFrontend(proof, { ...web, gitSource: { sha: proof.vercelSha, repoId: '1' } }), false);
  assert.equal(validNativeHeldFrontend({ ...proof, kind: 'UNVERIFIED_LEGACY' }, web), false);
});
test('native provider pair preserves authoritative aliases, exact revisions and acknowledged partial-rollout handling', () => {
  const proof = fixture().validate();
  const render = { id: proof.renderDeployId, commit: { id: proof.renderSha }, status: 'deactivated' };
  const web = { id: proof.vercelDeployId, projectId: proof.vercelProjectId, target: 'production', readyState: 'READY' };
  const project = { id: proof.vercelProjectId, accountId: proof.vercelTeamId, rootDirectory: proof.rootDirectory,
    targets: { production: { id: proof.vercelDeployId } } };
  const domain = { name: proof.productionDomain, projectId: proof.vercelProjectId, verified: true };
  const mapping = { deploymentId: proof.vercelDeployId, aliases: [{ alias: proof.productionDomain }] };
  validateLegacyProviderPair(proof, render, web, project, domain, undefined, mapping);
  assert.throws(() => validateLegacyProviderPair(proof, render, web, project, domain, undefined, { ...mapping, aliases: [] }), /IDENTITY_MISMATCH/);
  assert.throws(() => validateLegacyProviderPair(proof, { ...render, commit: { id: 'a'.repeat(40) } }, web, project, domain, undefined, mapping), /IDENTITY_MISMATCH/);
  project.targets.production.id = 'dpl_Replacement'; const moved = { ...mapping, deploymentId: 'dpl_Replacement' };
  assert.throws(() => validateLegacyProviderPair(proof, render, web, project, domain, undefined, moved), /IDENTITY_MISMATCH/);
  validateLegacyProviderPair(proof, render, web, project, domain, 'dpl_Replacement', moved);
});
