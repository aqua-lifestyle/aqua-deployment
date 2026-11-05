import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { standingPolicy } from './release-control.mjs';
import { objectDigest } from './github-evidence.mjs';
import { schemaSource, approvedSchemaReadback, verifySchemaFirst } from './commission-schema-first.mjs';
import { readinessRelease } from './readiness-release.mjs';
import { firstAccountCandidateSha, validateFirstAccountCandidate } from './first-account-release.mjs';

const candidate = () => ({ sha: firstAccountCandidateSha, ciRunId: '42044364779', ciRunAttempt: 1,
  qualificationOnly: false, policySha256: '717b071718a7032c49055673092c1aa62114055c3d5ab22a8708ef5ca509f840',
  repository: 'aqua-lifestyle/aqua-lifestyle', executorRepository: 'aqua-lifestyle/aqua-deployment',
  environment: 'production-release', profile: 'normal-integrated',
  renderServiceId: 'srv-d9f0k8e1a83c73d8n1b0', vercelProjectId: 'prj_6qL1e43KhsWrRshY5GxdmGl3HGMz',
  vercelTeamId: 'team_Hc3BWfhTLfwLzwbgbtaasBUY' });

test('first-account release changes only the exact reviewed source/CI and nonfinancial middleware pin', async () => {
  const q = candidate(), original = readinessRelease().completedCarry;
  const selected = validateFirstAccountCandidate(q), carry = selected.completedCarry;
  assert.deepEqual(carry, { ...original, candidateSha: q.sha,
    guardOverride: { ...original.guardOverride, candidateSha256: selected.candidateGuardSha256 } });
  assert.equal(carry.databaseOperationAuthorized, false); assert.equal(carry.financialActivationAuthorized, false);
  const before = objectDigest(approvedSchemaReadback);
  const pins = [...schemaSource.migrationFiles, ...schemaSource.holdSources, ...schemaSource.cleanStartSources];
  const digests = new Map(pins.map(p => [p.path, p.path === carry.guardOverride.path ? selected.candidateGuardSha256 : p.sha256]));
  const api = { gh: async path => ({ status: 'ahead', files: path === `/compare/${carry.operationSourceSha}...${q.sha}`
    ? [{ filename: selected.guardPath, status: 'modified' }]
    : schemaSource.migrationFiles.map(p => ({ filename: p.path, status: p.status })) }) };
  const proof = await verifySchemaFirst(api, q, standingPolicy, async path => digests.get(path), approvedSchemaReadback, true);
  assert.equal(proof.initialSourceSha, carry.operationSourceSha);
  assert.equal(objectDigest(approvedSchemaReadback), before);
  for (const pin of pins)
    await assert.rejects(verifySchemaFirst(api, q, standingPolicy,
      async path => path === pin.path ? '0'.repeat(64) : digests.get(path), approvedSchemaReadback, true),
    /SCHEMA_OR_PAYOUT_GUARD_SOURCE_CHANGED/);
  await assert.rejects(verifySchemaFirst(api, q, standingPolicy,
    async path => path === carry.guardOverride.path ? selected.previousGuardSha256 : digests.get(path), approvedSchemaReadback, true),
    /SCHEMA_OR_PAYOUT_GUARD_SOURCE_CHANGED/);
});

test('first-account release refuses other source, CI, attempt, policy, purpose or targets', () => {
  for (const edit of [q => q.sha = 'b'.repeat(40), q => q.ciRunId = '999', q => q.ciRunAttempt = 2,
    q => q.qualificationOnly = true, q => q.memberRelease = 'schema54-member-reads-v1', q => q.policySha256 = '0'.repeat(64),
    q => q.environment = 'other', q => q.profile = 'recovery-only', q => q.repository = 'other/source',
    q => q.executorRepository = 'other/executor', q => q.renderServiceId = 'other',
    q => q.vercelProjectId = 'other', q => q.vercelTeamId = 'other']) {
    const q = candidate(); edit(q);
    assert.throws(() => validateFirstAccountCandidate(q), /FIRST_ACCOUNT_RELEASE_EXACT_SCOPE_REQUIRED/);
  }
});

test('first-account record cannot replace middleware, predecessor authority or immutable completed facts', () => {
  const bytes = readFileSync(new URL('../../governance/first-account-release-20261105.json', import.meta.url));
  for (const edit of [r => r.candidateGuardSha256 = r.previousGuardSha256, r => r.guardPath = 'other.cs',
    r => r.previousBindingSha256 = '0'.repeat(64), r => r.ciRunAttempt = 2,
    r => r.scope = 'financial-activation', r => r.operationSourceSha = r.candidateSha]) {
    const record = JSON.parse(bytes); edit(record);
    assert.throws(() => validateFirstAccountCandidate(candidate(), Buffer.from(JSON.stringify(record))), /FIRST_ACCOUNT_RELEASE_RECORD_CHANGED/);
  }
});

test('first-account release cannot waive ancestry or authorize another migration', async () => {
  const q = candidate(), carry = validateFirstAccountCandidate(q).completedCarry;
  const pins = [...schemaSource.migrationFiles, ...schemaSource.holdSources, ...schemaSource.cleanStartSources];
  const read = async path => path === carry.guardOverride.path ? carry.guardOverride.candidateSha256 : pins.find(p => p.path === path)?.sha256;
  for (const result of [{ status: 'behind', files: [] }, { status: 'ahead', files: [{ filename: 'EF/Migrations/Other.cs' }] }]) {
    const api = { gh: async path => path === `/compare/${carry.operationSourceSha}...${q.sha}` ? result :
      { status: 'ahead', files: schemaSource.migrationFiles.map(p => ({ filename: p.path, status: p.status })) } };
    await assert.rejects(verifySchemaFirst(api, q, standingPolicy, read, approvedSchemaReadback, true),
      /COMPLETED_M55_CANDIDATE_ANCESTRY_REQUIRED|SCHEMA_CHANGE_REQUIRES_SEPARATE_AUTHORIZATION/);
  }
});
