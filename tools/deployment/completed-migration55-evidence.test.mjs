import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { standingPolicy } from './release-control.mjs';
import { objectDigest } from './github-evidence.mjs';
import { approvedRecoveryReadback, validateFirstReleaseRecovery } from './first-release-recovery.mjs';
import { approvedSchemaReadback, schemaSource, completedMigration55PolicyKind,
  isCleanStartSchemaKind, validateSchemaReadback, verifySchemaFirst,
  validateCompletedCandidateCarryForward } from './commission-schema-first.mjs';

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

function compatibleFixture() {
  const f = fresh(), c = validateCompletedCandidateCarryForward();
  f.q.sha = c.candidateSha;
  const pins = [...schemaSource.migrationFiles, ...schemaSource.holdSources, ...schemaSource.cleanStartSources];
  const digests = new Map(pins.map(pin => [pin.path, pin.path === c.guardOverride.path ? c.guardOverride.candidateSha256 : pin.sha256]));
  const calls = [], api = { gh: async path => {
    calls.push(path);
    if (path === `/compare/${c.operationSourceSha}...${c.candidateSha}`)
      return { status: 'ahead', files: [{ filename: c.guardOverride.path, status: 'modified' }] };
    assert.equal(path, `/compare/${f.p.firstReleaseRecovery.baseline.renderSha}...${c.candidateSha}`);
    return { status: 'ahead', files: schemaSource.migrationFiles.map(pin => ({ filename: pin.path, status: pin.status })) };
  } };
  return { ...f, c, pins, digests, calls, api, read: async path => digests.get(path) };
}

test('exact candidate carry-forward preserves the historical operation SHA, observation, authority and database scope', async () => {
  const f = compatibleFixture(), before = objectDigest(f.r);
  const proof = await verifySchemaFirst(f.api, f.q, f.p, f.read, f.r, false, at);
  assert.equal(proof.initialSourceSha, f.c.operationSourceSha);
  assert.notEqual(proof.initialSourceSha, f.q.sha);
  assert.equal(f.r.observation.candidateSha, f.c.operationSourceSha);
  assert.equal(f.r.observation.authorization.sourceSha, f.c.operationSourceSha);
  assert.equal(f.r.observation.recovery.sourceSha, f.c.operationSourceSha);
  assert.equal(f.r.observation.databaseIdentitySha256, f.c.databaseIdentitySha256);
  assert.equal(f.r.observation.tenantId, f.c.tenantId);
  assert.equal(objectDigest(f.r), before);
  assert.equal(proof.historicalEvidenceDisposition, 'HISTORICAL_EVIDENCE_UNAVAILABLE');
  assert.equal(f.r.observation.cleanStart.schemaDigest, null);
  assert.equal(f.r.observation.application.beforeSchemaDigest, null);
  assert.equal(f.calls.length, 2);
});

test('qualification-only checks the same SQL, source guards and ancestry without creating production migration proof', async () => {
  const f = compatibleFixture(); f.q.qualificationOnly = true;
  const read = [];
  assert.equal(await verifySchemaFirst(f.api, f.q, f.p, async path => { read.push(path); return f.read(path); }, f.r, false, at), null);
  assert.equal(read.length, f.pins.length); assert.equal(read.length, 25);
  assert.deepEqual(f.calls, [`/compare/${f.p.firstReleaseRecovery.baseline.renderSha}...${f.q.sha}`,
    `/compare/${f.c.operationSourceSha}...${f.q.sha}`]);
});

test('carry-forward admits only the single reviewed stricter middleware digest; every SQL and safeguard pin still denies tampering', async () => {
  const f = compatibleFixture();
  for (const pin of f.pins) await assert.rejects(verifySchemaFirst(f.api, f.q, f.p,
    async path => path === pin.path ? '0'.repeat(64) : f.read(path), f.r, false, at), /SCHEMA_OR_PAYOUT_GUARD_SOURCE_CHANGED/);
  await assert.rejects(verifySchemaFirst(f.api, f.q, f.p,
    async path => path === f.c.guardOverride.path ? f.c.guardOverride.operationSourceSha256 : f.read(path), f.r, false, at),
  /SCHEMA_OR_PAYOUT_GUARD_SOURCE_CHANGED/);
});

test('carry-forward rejects unavailable/foreign ancestry and any new migration even for qualification-only', async () => {
  for (const result of [null, {}, { status: 'behind', files: [] }, { status: 'identical', files: [] },
    { status: 'ahead' }, { status: 'ahead', files: [{ filename: 'EF/Migrations/Unapproved.cs', status: 'added' }] }]) {
    const f = compatibleFixture(); f.q.qualificationOnly = true;
    const api = { gh: path => path === `/compare/${f.c.operationSourceSha}...${f.q.sha}` ? result : f.api.gh(path) };
    await assert.rejects(verifySchemaFirst(api, f.q, f.p, f.read, f.r, false, at),
      /COMPLETED_M55_CANDIDATE_ANCESTRY_REQUIRED|SCHEMA_COMPARISON_UNVERIFIABLE|SCHEMA_CHANGE_REQUIRES_SEPARATE_AUTHORIZATION/);
  }
});

test('carry-forward cannot broaden candidate, database, tenant, targets or policy, or refresh original evidence time', async () => {
  const f = compatibleFixture();
  for (const key of ['renderServiceId', 'vercelProjectId', 'vercelTeamId', 'environment']) {
    const p = structuredClone(f.p); p.scope[key] = 'foreign';
    await assert.rejects(verifySchemaFirst(f.api, f.q, p, f.read, f.r, false, at), /COMPLETED_M55_EXACT_SCOPE_REQUIRED/);
  }
  for (const change of [r => r.observation.databaseIdentitySha256 = 'a'.repeat(64), r => r.observation.tenantId = 2,
    r => r.observation.candidateSha = f.q.sha, r => r.observation.observedAt = new Date(at()).toISOString()]) {
    const r = structuredClone(f.r); change(r); const p = structuredClone(f.p); refresh(r, p);
    assert.throws(() => validateSchemaReadback(r, f.q, p, false, at), /COMPLETED_M55_OBSERVATION_CHANGED/);
  }
  assert.throws(() => validateSchemaReadback(f.r, f.q, f.p, false,
    () => Date.parse(f.r.observation.observedAt) + f.p.authorization.maxCiAgeSeconds * 1000 + 1),
  /B6_AUTHORIZATION_DDL_ORDER_OR_FRESHNESS_INVALID/);
});

test('the new carry-forward record is immutable and cannot authorize data changes, source substitution or activation', () => {
  const original = readFileSync(new URL('../../governance/completed-m55-candidate-carry-forward-20261103.json', import.meta.url));
  for (const change of [c => c.candidateSha = 'b'.repeat(40), c => c.operationSourceSha = c.candidateSha,
    c => c.databaseIdentitySha256 = '0'.repeat(64), c => c.guardOverride.candidateSha256 = c.guardOverride.operationSourceSha256,
    c => c.originalOperationEvidenceModified = true, c => c.databaseOperationAuthorized = true,
    c => c.financialActivationAuthorized = true, c => c.productionDeploymentAuthorized = true]) {
    const c = JSON.parse(original); change(c);
    assert.throws(() => validateCompletedCandidateCarryForward(Buffer.from(JSON.stringify(c))), /COMPLETED_M55_CARRY_FORWARD_CHANGED/);
  }
});
