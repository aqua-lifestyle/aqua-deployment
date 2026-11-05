import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { standingPolicy } from './release-control.mjs';
import { objectDigest } from './github-evidence.mjs';
import { schemaSource, approvedSchemaReadback, verifySchemaFirst } from './commission-schema-first.mjs';
import { readinessRelease } from './readiness-release.mjs';
import { pr121CandidateSha, validatePr121Candidate } from './pr121-release.mjs';

const candidate = () => ({ sha: pr121CandidateSha, ciRunId: '42001784909', ciRunAttempt: 1,
  qualificationOnly: false, policySha256: '717b071718a7032c49055673092c1aa62114055c3d5ab22a8708ef5ca509f840',
  repository: 'aqua-lifestyle/aqua-lifestyle', executorRepository: 'aqua-lifestyle/aqua-deployment',
  environment: 'production-release', profile: 'normal-integrated',
  renderServiceId: 'srv-d9f0k8e1a83c73d8n1b0', vercelProjectId: 'prj_6qL1e43KhsWrRshY5GxdmGl3HGMz',
  vercelTeamId: 'team_Hc3BWfhTLfwLzwbgbtaasBUY' });

test('PR121 selects only the reviewed successor and preserves the original completed operation and financial holds', async () => {
  const q = candidate(), previous = readinessRelease(), before = objectDigest(approvedSchemaReadback);
  const carry = validatePr121Candidate(q).completedCarry;
  assert.equal(carry.candidateSha, q.sha);
  assert.deepEqual(carry, { ...previous.completedCarry, candidateSha: q.sha });
  assert.equal(carry.databaseOperationAuthorized, false);
  assert.equal(carry.financialActivationAuthorized, false);
  const pins = [...schemaSource.migrationFiles, ...schemaSource.holdSources, ...schemaSource.cleanStartSources];
  const digests = new Map(pins.map(p => [p.path, p.path === carry.guardOverride.path ? carry.guardOverride.candidateSha256 : p.sha256]));
  const calls = [], api = { gh: async path => {
    calls.push(path);
    return { status: 'ahead', files: path === `/compare/${carry.operationSourceSha}...${q.sha}`
      ? [{ filename: 'src/ExistingOperationalGate.cs', status: 'modified' }]
      : schemaSource.migrationFiles.map(p => ({ filename: p.path, status: p.status })) };
  } };
  const proof = await verifySchemaFirst(api, q, standingPolicy, async path => digests.get(path), approvedSchemaReadback, true);
  assert.equal(proof.initialSourceSha, carry.operationSourceSha);
  assert.equal(objectDigest(approvedSchemaReadback), before);
  assert.deepEqual(calls, [`/compare/${standingPolicy.firstReleaseRecovery.baseline.renderSha}...${q.sha}`,
    `/compare/${carry.operationSourceSha}...${q.sha}`]);
  for (const pin of pins)
    await assert.rejects(verifySchemaFirst(api, q, standingPolicy,
      async path => path === pin.path ? '0'.repeat(64) : digests.get(path), approvedSchemaReadback, true),
    /SCHEMA_OR_PAYOUT_GUARD_SOURCE_CHANGED/);
});

test('PR121 refuses other source, CI, attempt, purpose, policy and target identities', () => {
  const edits = [q => q.sha = 'b'.repeat(40), q => q.ciRunId = '42001784910', q => q.ciRunAttempt = 2,
    q => q.qualificationOnly = true, q => q.memberRelease = 'schema54-member-reads-v1',
    q => q.policySha256 = '0'.repeat(64), q => q.repository = 'other/source',
    q => q.executorRepository = 'other/executor', q => q.environment = 'other', q => q.profile = 'recovery-only',
    q => q.renderServiceId = 'other', q => q.vercelProjectId = 'other', q => q.vercelTeamId = 'other'];
  for (const edit of edits) { const q = candidate(); edit(q);
    assert.throws(() => validatePr121Candidate(q), /PR121_RELEASE_EXACT_SCOPE_REQUIRED/); }
});

test('PR121 binding cannot be edited to re-date history, replace the CI or grant a different release', () => {
  const bytes = readFileSync(new URL('../../governance/pr121-release-20261105.json', import.meta.url));
  for (const edit of [r => r.candidateSha = 'b'.repeat(40), r => r.ciRunId = '999', r => r.ciRunAttempt = 2,
    r => r.previousBindingSha256 = '0'.repeat(64), r => r.scope = 'financial-activation', r => r.observedAt = new Date().toISOString()]) {
    const r = JSON.parse(bytes); edit(r);
    assert.throws(() => validatePr121Candidate(candidate(), Buffer.from(JSON.stringify(r))), /PR121_RELEASE_RECORD_CHANGED/);
  }
});

test('PR121 still rejects unsupported ancestry and every additional migration', async () => {
  const q = candidate(), c = validatePr121Candidate(q).completedCarry;
  const pins = [...schemaSource.migrationFiles, ...schemaSource.holdSources, ...schemaSource.cleanStartSources];
  const read = async path => path === c.guardOverride.path ? c.guardOverride.candidateSha256 : pins.find(p => p.path === path)?.sha256;
  for (const comparison of [{ status: 'behind', files: [] }, { status: 'ahead', files: [{ filename: 'EF/Migrations/Other.cs' }] }]) {
    const api = { gh: async path => path === `/compare/${c.operationSourceSha}...${q.sha}` ? comparison :
      { status: 'ahead', files: schemaSource.migrationFiles.map(p => ({ filename: p.path, status: p.status })) } };
    await assert.rejects(verifySchemaFirst(api, q, standingPolicy, read, approvedSchemaReadback, true),
      /COMPLETED_M55_CANDIDATE_ANCESTRY_REQUIRED|SCHEMA_CHANGE_REQUIRES_SEPARATE_AUTHORIZATION/);
  }
});
