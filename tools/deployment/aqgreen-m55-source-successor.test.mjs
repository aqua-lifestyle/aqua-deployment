import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { objectDigest, sha256, verifyGitHubEvidence } from './github-evidence.mjs';
import { approvedSchemaReadback, schemaSource, verifySchemaFirst } from './commission-schema-first.mjs';
import { standingPolicy } from './release-control.mjs';
import { validateCompletedCandidateCarryForward } from './commission-schema-first.mjs';
import {
  validateWeeklyReadinessFixCandidate, validAqGreenOwnerAcceptance,
  weeklyReadinessFixCandidateSha, weeklyReadinessFixRecordDigest,
  validateWeeklyReadinessCiRefresh, weeklyReadinessCiRefreshDigest
} from './aqgreen-m55-source-successor.mjs';
import { fixture as evidenceFixture } from './fixtures/provider.mjs';

const bindingBytes = () => readFileSync(new URL('../../governance/aqgreen-m55-source-successor-20261113.json', import.meta.url));
const m55Bytes = () => readFileSync(new URL('../../governance/completed-m55-candidate-carry-forward-20261103.json', import.meta.url));
const record = () => JSON.parse(bindingBytes());
const q = () => {
  const r = record();
  return { sha: r.application.mergeCommit, ciRunId: r.application.ciRunId,
    ciRunAttempt: r.application.ciRunAttempt, policySha256: r.policySha256, qualificationOnly: false,
    repository: 'aqua-lifestyle/aqua-lifestyle', executorRepository: 'aqua-lifestyle/aqua-deployment',
    environment: 'production-release', profile: 'normal-integrated', renderServiceId: 'srv-d9f0k8e1a83c73d8n1b0',
    vercelProjectId: 'prj_6qL1e43KhsWrRshY5GxdmGl3HGMz', vercelTeamId: 'team_Hc3BWfhTLfwLzwbgbtaasBUY' };
};
function fixture() {
  const selected = validateWeeklyReadinessFixCandidate(q()), carry = selected.completedCarry;
  const pins = [...schemaSource.migrationFiles, ...schemaSource.holdSources, ...schemaSource.cleanStartSources];
  const read = async path => carry.sourceOverrides.find(row => row.path === path)?.candidateSha256 ??
    (path === carry.guardOverride.path ? carry.guardOverride.candidateSha256 : pins.find(row => row.path === path)?.sha256);
  const compareBase = standingPolicy.firstReleaseRecovery.baseline.renderSha;
  const apiCalls = [];
  const api = { gh: async route => {
    apiCalls.push(route);
    if (route === `/compare/${compareBase}...${q().sha}`)
      return { status: 'ahead', files: schemaSource.migrationFiles.map(row => ({ filename: row.path, status: row.status })) };
    if (route === `/compare/${carry.operationSourceSha}...${q().sha}`)
      return { status: 'ahead', files: [] };
    throw Error(`Unexpected GitHub comparison ${route}`);
  } };
  return { selected, carry, pins, read, api, apiCalls };
}

test('exact b8 successor accepts only the chained five source bindings and retains M55 facts', () => {
  const bytes = bindingBytes(), r = record(), f = fixture();
  assert.equal(sha256(bytes), weeklyReadinessFixRecordDigest);
  assert.equal(weeklyReadinessFixCandidateSha, 'b8d86e5e60997483423b273d5f426c08b411f573');
  assert.deepEqual(f.selected.sourceBindings.map(row => [row.path, row.previousCandidateSha256, row.candidateSha256]),
    r.sourceBindings.map(row => [row.path, row.previousCandidateSha256, row.candidateSha256]));
  assert.deepEqual(r.sourceBindings.filter(row => row.previousCandidateSha256 !== row.candidateSha256)
    .map(row => row.path), [r.ownerAcceptance.reviewedPath]);
  assert.equal(r.ownerAcceptance.githubReviewState, 'COMMENTED');
  assert.equal(r.ownerAcceptance.reviewBody, 'Reviewed and Accepted');
  assert.equal(validAqGreenOwnerAcceptance(r.ownerAcceptance, r.sourceBindings), true);

  const originalM55 = JSON.parse(m55Bytes());
  assert.equal(sha256(m55Bytes()), r.m55HistoricalBinding.carryForwardRecordSha256);
  assert.equal(f.carry.completedEvidenceSha256, originalM55.completedEvidenceSha256);
  assert.equal(f.carry.operationSourceSha, originalM55.operationSourceSha);
  assert.equal(f.carry.migrationDefinitionSha256, originalM55.migrationDefinitionSha256);
  assert.equal(f.carry.reviewedSqlSha256, originalM55.reviewedSqlSha256);
  for (const key of ['originalOperationEvidenceModified', 'historicalObservationTimesRefreshed',
    'databaseOperationAuthorized', 'financialActivationAuthorized', 'productionDeploymentAuthorized'])
    assert.equal(f.carry[key], false);
  assert.equal(f.carry.guardOverride.candidateSha256, '3c57877be5bec0a4e9368ce6cc79771e338fa7e1116beab2fc9b215f79b764b3');
  assert.equal(originalM55.guardOverride.candidateSha256,
    'e39cacea3bec6fe765d794d053cb9d21019a8164302cf3a9a987bc3253e8b00f');
});

test('complete M55 source/readback pre-provider path passes offline without modifying accepted evidence', async () => {
  const f = fixture(), readbackDigest = objectDigest(approvedSchemaReadback), manifestDigest = objectDigest(schemaSource);
  const proof = await verifySchemaFirst(f.api, q(), standingPolicy, f.read, approvedSchemaReadback, true);
  assert.equal(proof.initialSourceSha, f.carry.operationSourceSha);
  assert.equal(proof.schemaEvidenceKind, 'COMPLETED_ADDITIVE_MIGRATION55_V1');
  assert.equal(proof.historicalEvidenceDisposition, 'HISTORICAL_EVIDENCE_UNAVAILABLE');
  assert.equal(f.apiCalls.length, 2);
  assert.ok(f.apiCalls[0].includes(`/compare/${standingPolicy.firstReleaseRecovery.baseline.renderSha}...`));
  assert.ok(f.apiCalls[1].includes(`/compare/${f.carry.operationSourceSha}...`));
  assert.equal(objectDigest(approvedSchemaReadback), readbackDigest);
  assert.equal(objectDigest(schemaSource), manifestDigest);
  assert.equal(sha256(bindingBytes()), weeklyReadinessFixRecordDigest);
  assert.equal(sha256(m55Bytes()), f.selected.m55HistoricalBinding.carryForwardRecordSha256);
});

test('all 25 manifest, migration, payout, and Clean Start pins reject any changed bytes', async () => {
  const f = fixture();
  assert.equal(f.pins.length, 25);
  for (const pin of f.pins) {
    await assert.rejects(verifySchemaFirst(f.api, q(), standingPolicy,
      async path => path === pin.path ? '0'.repeat(64) : f.read(path), approvedSchemaReadback, true),
    /SCHEMA_OR_PAYOUT_GUARD_SOURCE_CHANGED/);
  }
  for (const compare of [
    { status: 'ahead', files: [...schemaSource.migrationFiles.map(row => ({ filename: row.path, status: row.status })),
      { filename: 'AqualLifeStyle/9.4.2/aspnet-core/src/Unauthorized/Migrations/Extra.cs', status: 'added' }] },
    { status: 'behind', files: [] }
  ]) {
    const api = { gh: async route => route.startsWith('/compare/') && route.includes('...') &&
      route.endsWith(q().sha) ? compare : f.api.gh(route) };
    await assert.rejects(verifySchemaFirst(api, q(), standingPolicy, f.read, approvedSchemaReadback, true),
      /SCHEMA_MIGRATION_NOT_APPROVED|SCHEMA_COMPARISON_UNVERIFIABLE/);
  }
});

test('candidate, CI attempt, source record, and authorized owner-review provenance cannot be substituted', () => {
  for (const edit of [
    value => { value.sha = 'c'.repeat(40); },
    value => { value.ciRunId = '43191377578'; },
    value => { value.ciRunAttempt = 1; },
    value => { value.policySha256 = '0'.repeat(64); },
    value => { value.qualificationOnly = 'true'; },
    value => { value.memberRelease = 'other'; },
    value => { value.repository = 'other/source'; },
    value => { value.executorRepository = 'other/executor'; },
    value => { value.environment = 'other'; },
    value => { value.profile = 'other'; },
    value => { value.renderServiceId = 'other'; },
    value => { value.vercelProjectId = 'other'; },
    value => { value.vercelTeamId = 'other'; }
  ]) {
    const value = q(); edit(value);
    assert.throws(() => validateWeeklyReadinessFixCandidate(value), /AQGREEN_SOURCE_SUCCESSOR_EXACT_SCOPE_REQUIRED/);
  }
  const changed = JSON.parse(bindingBytes());
  changed.sourceBindings[0].candidateSha256 = '0'.repeat(64);
  assert.throws(() => validateWeeklyReadinessFixCandidate(q(), Buffer.from(JSON.stringify(changed))),
    /AQGREEN_SOURCE_SUCCESSOR_RECORD_CHANGED/);
  const r = record();
  for (const edit of [
    value => { value.githubReviewState = 'APPROVED'; },
    value => { value.reviewer.id = 1; },
    value => { value.reviewBody = 'Not accepted'; },
    value => { value.reviewedCommitSha = 'a'.repeat(40); },
    value => { value.reviewedPathSha256 = '0'.repeat(64); }
  ]) {
    const review = structuredClone(r.ownerAcceptance); edit(review);
    assert.equal(validAqGreenOwnerAcceptance(review, r.sourceBindings), false);
  }
  assert.equal(validAqGreenOwnerAcceptance(r.ownerAcceptance,
    r.sourceBindings.filter(row => row.path !== r.ownerAcceptance.reviewedPath)), false);
});

test('exact CI refresh carries attempt 3 without rewriting source bindings or completed M55 evidence', async () => {
  const f = fixture(), original = bindingBytes(), m55 = m55Bytes();
  const refresh = validateWeeklyReadinessCiRefresh();
  const current = { ...q(), ciRunAttempt: 3 };
  const selected = validateWeeklyReadinessFixCandidate(current);
  assert.equal(sha256(readFileSync(new URL('../../governance/aqgreen-ci-refresh-43191377577-3.json', import.meta.url))),
    weeklyReadinessCiRefreshDigest);
  assert.equal(selected.ciRefresh.ci.runAttempt, 3);
  assert.equal(selected.application.ciRunAttempt, 2, 'original binding remains historical');
  assert.equal(refresh.sourceSuccessorRecordSha256, weeklyReadinessFixRecordDigest);
  assert.deepEqual(selected.completedCarry, f.carry);
  const proof = await verifySchemaFirst(f.api, current, standingPolicy, f.read, approvedSchemaReadback, false);
  assert.equal(proof.initialSourceSha, f.carry.operationSourceSha);
  assert.deepEqual(bindingBytes(), original); assert.deepEqual(m55Bytes(), m55);
  const payout = schemaSource.holdSources.find(pin => pin.path.endsWith('/AQGreenSalesEvidencePayoutGuard.cs'));
  await assert.rejects(verifySchemaFirst(f.api, current, standingPolicy,
    async path => path === payout.path ? '0'.repeat(64) : f.read(path), approvedSchemaReadback, false),
  /SCHEMA_OR_PAYOUT_GUARD_SOURCE_CHANGED/);
});

test('CI refresh never admits another run, future attempt, source, policy or edited refresh record', () => {
  const current = { ...q(), ciRunAttempt: 3 };
  for (const edit of [value => { value.ciRunId = '43191377578'; }, value => { value.ciRunAttempt = 4; },
    value => { value.sha = 'a'.repeat(40); }, value => { value.policySha256 = '0'.repeat(64); },
    value => { value.vercelTeamId = 'other'; }]) {
    const value = { ...current }; edit(value);
    assert.throws(() => validateWeeklyReadinessFixCandidate(value), /AQGREEN_SOURCE_SUCCESSOR_EXACT_SCOPE_REQUIRED/);
  }
  const changed = validateWeeklyReadinessCiRefresh(); changed.ci.runAttempt = 4;
  assert.throws(() => validateWeeklyReadinessCiRefresh(Buffer.from(JSON.stringify(changed))), /AQGREEN_CI_REFRESH_RECORD_CHANGED/);
});

test('exact refresh retains live CI freshness, current-attempt and push provenance enforcement', async () => {
  const refresh = validateWeeklyReadinessCiRefresh(), f = evidenceFixture();
  const completed = Date.parse(refresh.ci.completedAt), current = { ...q(), ciRunAttempt: 3 };
  const run = { id: Number(current.ciRunId), run_attempt: 3, head_sha: current.sha, status: 'completed', conclusion: 'success',
    event: 'push', head_branch: 'main', path: '.github/workflows/ci.yml', updated_at: refresh.ci.completedAt,
    repository: { full_name: current.repository }, head_repository: { full_name: current.repository } };
  const api = { gh: async route => { assert.equal(route, `/actions/runs/${current.ciRunId}`); return run; } };
  await assert.rejects(verifyGitHubEvidence(api, q(), standingPolicy, f.readSourceDigest, () => completed + 1000),
    /CI_EVIDENCE_CONTEXT_MISMATCH/);
  await assert.rejects(verifyGitHubEvidence(api, current, standingPolicy, f.readSourceDigest, () => completed + 86401_000),
    /CI_EVIDENCE_STALE_OR_UNDATED/);
  run.event = 'workflow_dispatch';
  await assert.rejects(verifyGitHubEvidence(api, current, standingPolicy, f.readSourceDigest, () => completed + 1000),
    /CI_EVIDENCE_CONTEXT_MISMATCH/);
});
