import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { freezeCandidate, standingPolicy, targets } from './release-control.mjs';
import { objectDigest, sha256 } from './github-evidence.mjs';
import { zipFixture } from './fixtures/provider.mjs';
import { validateFailedSuccessorRenderRecord, authenticateFailedSuccessorAdmission,
  validateFailedSuccessorRenderAudit, validateHistoricalContext, validateHistoricalArtifact,
  isReconciledHistoricalRun } from './historical-release-reconciliation.mjs';

const pinned = validateFailedSuccessorRenderRecord();

function fixture({ changeReceipt = () => {}, changePlan = () => {}, changeRun = () => {} } = {}) {
  const r = structuredClone(pinned), x = r.run, s = r.source, a = r.audit, m = r.admission;
  const identity = { version: 4, repository: s.repository, sha: s.sha, ciRunId: s.ciRunId,
    ciRunAttempt: s.ciRunAttempt, releaseRunId: x.id, releaseRunAttempt: 1,
    executorRepository: targets.executor.repository, executorSha: x.executorSha,
    policySha256: s.policySha256, environment: r.scope.environment, profile: r.scope.profile,
    renderServiceId: r.scope.renderServiceId, vercelProjectId: r.scope.vercelProjectId,
    vercelTeamId: r.scope.vercelTeamId, backendSuccessor: s.backendSuccessor,
    combinedRelease: s.combinedRelease };
  const rows = [
    { ...identity, phase: 'evidence-selected', authorizationId: m.authorizationId },
    { ...identity, phase: 'backend-baseline-selected', baselineRenderDeployId: a.baselineRenderDeployId,
      baselineRenderSha: a.baselineRenderSha },
    { ...identity, phase: 'backend-decision-verified' },
    { ...identity, phase: 'backend-classified', schemaTransition: 'additive', migrationFiles: 3 },
    { ...identity, phase: 'backend-successor-staging', stagedSchemaTransition: 'none',
      payloadPinSha256: a.initialPayloadPinSha256 },
    { ...identity, phase: 'backend-successor-staged', payloadPinSha256: a.initialPayloadPinSha256 },
    { ...identity, phase: 'backend-render-requesting' },
    { ...identity, phase: 'backend-render-requested', renderDeployId: r.renderObservation.targetDeployId },
    { ...identity, phase: 'failed', code: x.terminalCode, renderDeployId: r.renderObservation.targetDeployId }
  ];
  r.audit.rowsSha256 = objectDigest(rows);
  const receipt = { contract: 'aqua.github-evidence-admission', version: 2,
    releaseRunId: x.id, releaseRunAttempt: 1, executorRepository: targets.executor.repository,
    executorSha: x.executorSha, repository: s.repository, sha: s.sha, ciRunId: s.ciRunId,
    ciRunAttempt: s.ciRunAttempt, policySha256: s.policySha256, environment: r.scope.environment,
    profile: r.scope.profile, renderServiceId: r.scope.renderServiceId,
    vercelProjectId: r.scope.vercelProjectId, vercelTeamId: r.scope.vercelTeamId,
    qualificationOnly: false, backendSuccessor: s.backendSuccessor, combinedRelease: s.combinedRelease,
    authorizationId: m.authorizationId };
  const plan = { policySha256: s.policySha256, baseline: { runId: '43429695806' },
    historicalReconciliations: [{ runId: '45006063824', originalConclusion: 'failure',
      payload: 'MATCH', pin: 'UNVERIFIED', deploymentAuthority: false }] };
  changeReceipt(receipt); changePlan(plan);
  const receiptBytes = Buffer.from(JSON.stringify(receipt)), planBytes = Buffer.from(JSON.stringify(plan));
  const archive = zipFixture('admission-receipt.json', receiptBytes, { 'evidence-plan.json': planBytes });
  m.receiptSha256 = sha256(receiptBytes); m.planSha256 = sha256(planBytes); m.archiveSha256 = sha256(archive);
  const run = { id: Number(x.id), run_number: 89, run_attempt: 1, head_sha: x.executorSha,
    status: 'completed', conclusion: 'failure', created_at: x.createdAt, actor: x.actor,
    event: 'workflow_dispatch', head_branch: 'main', path: '.github/workflows/deploy.yml',
    name: 'Qualified production executor', repository: { full_name: targets.executor.repository },
    head_repository: { full_name: targets.executor.repository } };
  changeRun(run);
  const production = { id: Number(x.productionJobId), run_id: run.id, run_attempt: 1,
    status: 'completed', conclusion: 'failure', name: 'Unattended recovery release',
    steps: [{ name: 'Revalidate policy, provenance, providers and recovery before automatic deployment',
      conclusion: 'failure' }] };
  const metadata = { id: Number(m.artifactId), name: `verified-admission-${x.id}-1`,
    expired: false, digest: 'sha256:' + sha256(archive), size_in_bytes: archive.length,
    workflow_run: { id: Number(x.id), head_sha: x.executorSha, head_branch: 'main',
      repository_id: 1423239668, head_repository_id: 1423239668 } };
  const api = { executor: async route => {
    if (route === '') return { id: 1423239668, full_name: targets.executor.repository };
    if (route === `/actions/runs/${x.id}/artifacts?per_page=100`)
      return { total_count: 1, artifacts: [metadata] };
    if (route === `/actions/artifacts/${m.artifactId}`) return metadata;
    throw Error('UNEXPECTED_GITHUB_READ');
  }, artifact: async (owner, id) => {
    assert.equal(owner, 'executor'); assert.equal(id, m.artifactId); return archive;
  } };
  const descriptor = { artifactId: a.artifactId, runId: x.id, runAttempt: 1, sha: x.executorSha };
  return { r, rows, receipt, plan, run, production, metadata, api, descriptor };
}

test('whole-file authority preserves the failed update, unknown owner decision and no deployment permission', () => {
  const bytes = readFileSync(new URL('../../governance/render-update-failed-reconciliation-45098115310.json', import.meta.url));
  assert.equal(sha256(bytes), '16590aedacff9774dee37594174a5e5deb72af4c95d2c878b631357343c056eb');
  assert.equal(isReconciledHistoricalRun(45098115310), true);
  assert.equal(isReconciledHistoricalRun(45098115311), false);
  assert.equal(pinned.run.priorOwnerReleaseAuthorization, 'UNVERIFIED');
  assert.equal(pinned.renderObservation.targetStatus, 'update_failed');
  assert.equal(pinned.failureObservation.providerIssuedFailureReason, 'UNKNOWN');
  assert.equal(pinned.failureObservation.startupDefectCorrected, false);
  assert.throws(() => validateFailedSuccessorRenderRecord(Buffer.from(bytes.toString().replace('UNVERIFIED','CONFIRMED'))),
    /SUCCESSOR_RENDER_RECORD_CHANGED/);
  const f = fixture();
  const q = freezeCandidate({ repository: targets.repository, sha: f.r.source.sha, ciRunId: '999', ciRunAttempt: 1 },
    { GITHUB_REPOSITORY: targets.executor.repository, GITHUB_RUN_ID: '1000', GITHUB_RUN_ATTEMPT: '1',
      GITHUB_REF: 'refs/heads/main', GITHUB_REF_PROTECTED: 'true',
      GITHUB_WORKFLOW_REF: `${targets.executor.repository}/.github/workflows/deploy.yml@refs/heads/main`,
      GITHUB_SHA: 'a'.repeat(40), GITHUB_WORKFLOW_SHA: 'a'.repeat(40) },
    standingPolicy, false, f.r.source.combinedRelease);
  assert.deepEqual(validateHistoricalContext(f.run, 1, f.production, q, targets), pinned.run);
  for (const changed of [{ ...q, sha: 'b'.repeat(40) }, { ...q, combinedRelease: undefined },
    { ...q, memberRelease: 'a'.repeat(64) }, { ...q, releaseRunAttempt: 2 }])
    assert.throws(() => validateHistoricalContext(f.run, 1, f.production, changed, targets));
  assert.throws(() => validateHistoricalContext({ ...f.run, conclusion: 'success' }, 1, f.production, q, targets));
  const auditMetadata = { id: Number(f.r.audit.artifactId), name: `production-release-audit-${f.run.id}-1`,
    expired: false, digest: 'sha256:' + f.r.audit.archiveSha256,
    workflow_run: { id: f.run.id, head_sha: f.run.head_sha, head_branch: 'main',
      repository_id: 1423239668, head_repository_id: 1423239668 } };
  validateHistoricalArtifact(f.r.run, f.descriptor, auditMetadata);
  assert.throws(() => validateHistoricalArtifact(f.r.run, f.descriptor,
    { ...auditMetadata, digest: 'sha256:' + 'f'.repeat(64) }), /SUCCESSOR_RENDER_ORIGINAL_ARTIFACT_CHANGED/);
});

test('operational admission authenticates exactly the original combined purpose, not owner authorization', async () => {
  const f = fixture(), proof = await authenticateFailedSuccessorAdmission(f.api, f.r);
  assert.equal(proof.priorOwnerReleaseAuthorization, 'UNVERIFIED');
  const result = validateFailedSuccessorRenderAudit(f.rows, f.descriptor, f.r.run, targets, proof, f.r);
  assert.equal(result.originalConclusion, 'failure');
  assert.equal(result.outcome, 'ACKNOWLEDGED_RENDER_UPDATE_FAILED_AFTER_SUCCESSOR_STAGING');
  assert.equal(result.renderStatus, 'update_failed');
  assert.equal(result.renderDeployId, 'dep-dc1q0d3l550s73f78dbg');
  assert.equal(result.originalOwnerReleaseAuthorization, 'UNVERIFIED');
  assert.equal(result.providerIssuedFailureReason, 'UNKNOWN');
  assert.equal(result.startupDefectCorrected, false);
  for (const authority of ['successfulFullReleasePredecessor','automaticResumeAuthorized',
    'replayAuthority','deploymentAuthority','migrationAuthority','financialAuthority'])
    assert.equal(result[authority], false);
  assert.throws(() => validateFailedSuccessorRenderAudit(f.rows, f.descriptor, f.r.run,
    targets, structuredClone(proof), f.r), /SUCCESSOR_RENDER_EFFECT_UNVERIFIABLE/);
  for (const change of [
    rows => rows[7].renderDeployId = 'dep-foreign',
    rows => rows[8].code = 'SUCCESS',
    rows => rows[6].phase = 'backend-render-ready',
    rows => rows[4].payloadPinSha256 = 'f'.repeat(64),
    rows => rows[3].releaseRunId = '45098115311',
    rows => rows.splice(8, 0, { ...rows[7], phase: 'backend-schema-job-requesting' }),
    rows => rows[7].vercelDeployId = 'dpl-foreign'
  ]) {
    const altered = structuredClone(f.rows); change(altered);
    assert.throws(() => validateFailedSuccessorRenderAudit(altered, f.descriptor, f.r.run,
      targets, proof, f.r), /SUCCESSOR_RENDER_EFFECT_UNVERIFIABLE/);
  }
});

test('foreign, altered, expired and contradictory original admission evidence denies', async () => {
  for (const [options,expected] of [
    [{ changeReceipt: r => r.sha = 'b'.repeat(40) }, /SUCCESSOR_RENDER_ADMISSION_PURPOSE_CHANGED/],
    [{ changeReceipt: r => r.qualificationOnly = true }, /SUCCESSOR_RENDER_ADMISSION_PURPOSE_CHANGED/],
    [{ changePlan: p => p.historicalReconciliations[0].pin = 'MATCH' }, /SUCCESSOR_RENDER_ADMISSION_PURPOSE_CHANGED/],
    [{ changeReceipt: r => r.executorSha = 'f'.repeat(40) }, /SUCCESSOR_RENDER_ADMISSION_PURPOSE_CHANGED/]
  ]) {
    const f = fixture(options);
    await assert.rejects(authenticateFailedSuccessorAdmission(f.api, f.r), expected);
  }
  const f = fixture(); f.metadata.expired = true;
  await assert.rejects(authenticateFailedSuccessorAdmission(f.api, f.r), /GITHUB_ARTIFACT_PROVENANCE_INVALID/);
});
