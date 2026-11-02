import assert from 'node:assert/strict';
import { test } from 'node:test';
import { standingPolicy } from './release-control.mjs';
import { objectDigest } from './github-evidence.mjs';
import { approvedRecoveryReadback, validateFirstReleaseRecovery } from './first-release-recovery.mjs';
import { approvedSchemaReadback, schemaSource, completedMigration55PolicyKind,
  isCleanStartSchemaKind, validateSchemaReadback, verifySchemaFirst } from './commission-schema-first.mjs';

// Actual redacted, executor-pinned operation records with a controlled clock and
// source-comparison substitute. This is component evidence, not a live release.
const fresh = () => ({ r: structuredClone(approvedSchemaReadback), p: structuredClone(standingPolicy),
  q: { sha: 'a4755801ce89868d7791422f3c983363ab76bf30', qualificationOnly: false } });
const at = () => Date.parse(approvedSchemaReadback.observation.observedAt) + 1000;
const refresh = (r, p) => { p.schemaFirst.evidenceSha256 = objectDigest(r); };

test('bounded v4 validates actual alternative evidence while historical fingerprints remain unavailable', () => {
  const { r, p, q } = fresh();
  const proof = validateSchemaReadback(r, q, p, false, at);
  assert.equal(p.schemaFirst.kind, completedMigration55PolicyKind);
  assert.equal(proof.schemaEvidenceKind, 'COMPLETED_ADDITIVE_MIGRATION55_V1');
  assert.equal(proof.historicalEvidenceDisposition, 'HISTORICAL_EVIDENCE_UNAVAILABLE');
  assert.equal(r.observation.cleanStart.schemaDigest, null);
  assert.equal(r.observation.application.beforeSchemaDigest, null);
  assert.equal(proof.initialSourceSha, q.sha);
  assert.equal(proof.recoveryMode, 'forward-only-hold-aware');
  assert.equal(isCleanStartSchemaKind(p.schemaFirst.kind), true);
});

test('bounded v4 retains every source pin and exact additive-migration comparison before issuing proof', async () => {
  const { r, p, q } = fresh(), read = [], calls = [];
  const pins = [...schemaSource.migrationFiles, ...schemaSource.holdSources, ...schemaSource.cleanStartSources];
  const digests = new Map(pins.map(x => [x.path, x.sha256]));
  const api = { gh: async path => { calls.push(path); return { status: 'ahead',
    files: schemaSource.migrationFiles.map(x => ({ filename: x.path, status: x.status })) }; } };
  const proof = await verifySchemaFirst(api, q, p, async path => { read.push(path); return digests.get(path); }, r, false, at);
  assert.equal(read.length, pins.length);
  assert.deepEqual(calls, [`/compare/${p.firstReleaseRecovery.baseline.renderSha}...${q.sha}`]);
  assert.equal(proof.schemaEvidenceKind, 'COMPLETED_ADDITIVE_MIGRATION55_V1');
  await assert.rejects(verifySchemaFirst(api, q, p, async () => '0'.repeat(64), r, false, at), /SCHEMA_OR_PAYOUT_GUARD_SOURCE_CHANGED/);
});

test('bounded v4 cannot select another candidate or targets, including baseline and qualification paths', async () => {
  for (const baseline of [false, true]) {
    for (const qualificationOnly of [false, true]) {
      const { r, p, q } = fresh(); q.sha = 'b'.repeat(40); q.qualificationOnly = qualificationOnly;
      await assert.rejects(verifySchemaFirst({}, q, p, async () => { throw Error('Source must not be read'); }, r, baseline, at), /COMPLETED_M55_EXACT_SCOPE_REQUIRED/);
    }
  }
  for (const key of ['renderServiceId', 'vercelProjectId', 'vercelTeamId', 'environment']) {
    const { r, p, q } = fresh(); p.scope[key] = 'another-target';
    assert.throws(() => validateSchemaReadback(r, q, p, false, at), /COMPLETED_M55_EXACT_SCOPE_REQUIRED/);
  }
});

test('bounded v4 rejects missing, forged, substituted or broadened alternative evidence after a self-hash refresh', () => {
  const edits = [
    r => delete r.alternativeEvidence,
    r => r.alternativeEvidence.kind = 'GENERIC_WAIVER',
    r => r.alternativeEvidence.historicalEvidenceDisposition = 'RECOVERED',
    r => r.alternativeEvidence.bundleSha256 = '0'.repeat(64),
    r => r.alternativeEvidence.ownerAuthorizationSha256 = '1'.repeat(64),
    r => r.alternativeEvidence.ownerAuthorizationReference = r.alternativeEvidence.operationEvidenceReference,
    r => r.alternativeEvidence.operationEvidenceSha256 = '2'.repeat(64),
    r => r.alternativeEvidence.operationEvidenceReference = 'https://example.invalid/evidence',
    r => delete r.alternativeEvidence.operationEvidenceSha256,
    r => r.alternativeEvidence.waiver = true
  ];
  for (const edit of edits) {
    const { r, p, q } = fresh(); edit(r); refresh(r, p);
    assert.throws(() => validateSchemaReadback(r, q, p, false, at), /SCHEMA_EVIDENCE_REQUIRED|COMPLETED_M55_PINNED_EVIDENCE_REQUIRED/);
  }
});

test('bounded v4 pins the complete actual observation, not merely syntactically valid receipt digests', () => {
  const edits = [
    o => o.databaseIdentitySha256 = 'a'.repeat(64), o => o.tenantId = 2,
    o => o.cleanStart.resetReceiptDigest = 'b'.repeat(64),
    o => o.cleanStart.independentAcceptanceDigest = 'c'.repeat(64),
    o => o.cleanStart.ownerAuthorizationDigest = 'd'.repeat(64),
    o => o.cleanStart.paymentEvidenceDigest = 'e'.repeat(64),
    o => o.application.migrationId = 'another-migration',
    o => o.application.beforeHistoryDigest = 'f'.repeat(64),
    o => o.application.afterHistoryDigest = 'a'.repeat(64),
    o => o.authorization.authorizedAt = o.observedAt,
    o => o.controls.financialOperationsHeld = false,
    o => o.controls.workersHeld = false,
    o => o.cleanStart.automaticPayoutsDisabled = false,
    o => o.recovery.legacyFinancialRollbackAllowed = true,
    o => o.observedAt = new Date(at()).toISOString()
  ];
  for (const edit of edits) {
    const { r, p, q } = fresh(); edit(r.observation); refresh(r, p);
    assert.throws(() => validateSchemaReadback(r, q, p, false, at), /COMPLETED_M55_OBSERVATION_CHANGED/);
  }
});

test('bounded v4 preserves unavailable meaning and cannot backfill either historical fingerprint', () => {
  for (const value of ['0'.repeat(64), 'a'.repeat(64), '', undefined]) {
    const { r, p, q } = fresh();
    r.observation.cleanStart.schemaDigest = value; r.observation.application.beforeSchemaDigest = value; refresh(r, p);
    assert.throws(() => validateSchemaReadback(r, q, p, false, at), /COMPLETED_M55_OBSERVATION_CHANGED/);
  }
});

test('bounded v4 remains subject to original observation freshness and cannot refresh historical time', () => {
  const { r, p, q } = fresh();
  assert.throws(() => validateSchemaReadback(r, q, p, false,
    () => Date.parse(r.observation.observedAt) + p.authorization.maxCiAgeSeconds * 1000 + 1), /B6_AUTHORIZATION_DDL_ORDER_OR_FRESHNESS_INVALID/);
  r.status = 'UNVERIFIED'; refresh(r, p);
  assert.throws(() => validateSchemaReadback(r, q, p, false, at), /SCHEMA_EVIDENCE_REQUIRED/);
});

test('bounded v4 requires explicit executor selection and never falls back to older evidence versions', () => {
  for (const kind of ['commission-invalidation-clean-start-v1', 'commission-invalidation-schema-first-v1', 'UNKNOWN']) {
    const { r, p, q } = fresh(); p.schemaFirst.kind = kind;
    assert.throws(() => validateSchemaReadback(r, q, p, false, at), /SCHEMA_EVIDENCE_REQUIRED|SCHEMA_POLICY_INVALID/);
  }
  for (const version of [1, 2, 3, 5]) {
    const { r, p, q } = fresh(); r.version = version; refresh(r, p);
    assert.throws(() => validateSchemaReadback(r, q, p, false, at), /SCHEMA_EVIDENCE_REQUIRED/);
  }
  const { r, p, q } = fresh();
  r.version = 3; delete r.alternativeEvidence; p.schemaFirst.kind = 'commission-invalidation-clean-start-v1'; refresh(r, p);
  assert.throws(() => validateSchemaReadback(r, q, p, false, at), /CLEAN_START_CLASSIFICATION_RESET_AND_INDEPENDENT_ACCEPTANCE_REQUIRED/);
});

test('bounded v4 does not waive the separate first-release recovery evidence gate', () => {
  const { r, p, q } = fresh();
  const proof = validateSchemaReadback(r, q, p, false, at);
  const missingRecovery = { ...structuredClone(approvedRecoveryReadback), status: 'UNVERIFIED' };
  p.firstReleaseRecovery.evidenceSha256 = objectDigest(missingRecovery);
  assert.throws(() => validateFirstReleaseRecovery(missingRecovery, q, p, at, proof), /FIRST_RELEASE_RECOVERY_EVIDENCE_REQUIRED/);
});
