import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { standingPolicy } from './release-control.mjs';
import { objectDigest } from './github-evidence.mjs';
import { schemaSource, approvedSchemaReadback, verifySchemaFirst } from './commission-schema-first.mjs';
import { validateRootUnboundCandidate } from './root-unbound-release.mjs';

const bytes = () => readFileSync(new URL('../../governance/root-unbound-release-20261106.json', import.meta.url));
const candidate = () => {
  const r = JSON.parse(bytes());
  return { sha: r.candidateSha, ciRunId: r.ciRunId, ciRunAttempt: r.ciRunAttempt,
    qualificationOnly: false, policySha256: r.policySha256,
    repository: 'aqua-lifestyle/aqua-lifestyle', executorRepository: 'aqua-lifestyle/aqua-deployment',
    environment: 'production-release', profile: 'normal-integrated',
    renderServiceId: 'srv-d9f0k8e1a83c73d8n1b0', vercelProjectId: 'prj_6qL1e43KhsWrRshY5GxdmGl3HGMz',
    vercelTeamId: 'team_Hc3BWfhTLfwLzwbgbtaasBUY' };
};
function fixture() {
  const q = candidate(), { completedCarry: carry } = validateRootUnboundCandidate(q);
  const pins = [...schemaSource.migrationFiles, ...schemaSource.holdSources, ...schemaSource.cleanStartSources];
  const read = async path => carry.sourceOverrides.find(p => p.path === path)?.candidateSha256 ??
    (path === carry.guardOverride.path ? carry.guardOverride.candidateSha256 : pins.find(p => p.path === path)?.sha256);
  const api = { gh: async path => ({ status: 'ahead', files: path === `/compare/${carry.operationSourceSha}...${q.sha}`
    ? carry.sourceOverrides.map(p => ({ filename: p.path, status: 'modified' }))
    : schemaSource.migrationFiles.map(p => ({ filename: p.path, status: p.status })) }) };
  return { q, carry, pins, read, api };
}

test('root-unbound binding retains completed history and changes only three reviewed source pins', async () => {
  const { q, carry, read, api } = fixture(), before = objectDigest(approvedSchemaReadback);
  assert.equal(carry.sourceOverrides.length, 3);
  assert.equal(carry.databaseOperationAuthorized, false);
  assert.equal(carry.financialActivationAuthorized, false);
  const proof = await verifySchemaFirst(api, q, standingPolicy, read, approvedSchemaReadback, true);
  assert.equal(proof.initialSourceSha, carry.operationSourceSha);
  assert.equal(objectDigest(approvedSchemaReadback), before);
});

test('root-unbound binding still checks every migration, payout, custody and commissioning source', async () => {
  const { q, pins, read, api } = fixture();
  for (const pin of pins)
    await assert.rejects(verifySchemaFirst(api, q, standingPolicy,
      async path => path === pin.path ? '0'.repeat(64) : read(path), approvedSchemaReadback, true),
    /SCHEMA_OR_PAYOUT_GUARD_SOURCE_CHANGED/);
});

test('root-unbound binding rejects other source, CI, purpose, target and policy', () => {
  for (const edit of [q => q.sha = 'b'.repeat(40), q => q.ciRunId = '999', q => q.ciRunAttempt = 2,
    q => q.qualificationOnly = true, q => q.memberRelease = 'schema54-member-reads-v1', q => q.policySha256 = '0'.repeat(64),
    q => q.environment = 'other', q => q.profile = 'recovery-only', q => q.repository = 'other/source',
    q => q.executorRepository = 'other/executor', q => q.renderServiceId = 'other',
    q => q.vercelProjectId = 'other', q => q.vercelTeamId = 'other']) {
    const q = candidate(); edit(q);
    assert.throws(() => validateRootUnboundCandidate(q), /ROOT_UNBOUND_RELEASE_EXACT_SCOPE_REQUIRED|FIRST_ACCOUNT_RELEASE_EXACT_SCOPE_REQUIRED/);
  }
  for (const edit of [r => r.sourceOverrides.pop(), r => r.sourceOverrides[0].path = 'other.cs',
    r => r.scope = 'financial-activation', r => r.previousBindingSha256 = '0'.repeat(64)]) {
    const r = JSON.parse(bytes()); edit(r);
    assert.throws(() => validateRootUnboundCandidate(candidate(), Buffer.from(JSON.stringify(r))), /ROOT_UNBOUND_RELEASE_RECORD_CHANGED/);
  }
});

test('root-unbound binding cannot waive ancestry or authorize another migration', async () => {
  const { q, carry, read } = fixture();
  for (const result of [{ status: 'behind', files: [] }, { status: 'ahead', files: [{ filename: 'EF/Migrations/Other.cs' }] }]) {
    const api = { gh: async path => path === `/compare/${carry.operationSourceSha}...${q.sha}` ? result :
      { status: 'ahead', files: schemaSource.migrationFiles.map(p => ({ filename: p.path, status: p.status })) } };
    await assert.rejects(verifySchemaFirst(api, q, standingPolicy, read, approvedSchemaReadback, true),
      /COMPLETED_M55_CANDIDATE_ANCESTRY_REQUIRED|SCHEMA_CHANGE_REQUIRES_SEPARATE_AUTHORIZATION/);
  }
});
