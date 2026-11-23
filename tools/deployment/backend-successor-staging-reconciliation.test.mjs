import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { clients, freezeCandidate, standingPolicy, targets } from './release-control.mjs';
import { objectDigest, sha256 } from './github-evidence.mjs';
import { normalRuntimeSettings } from './runtime-readiness.mjs';
import { validateInterruptedSuccessorRecord, authenticateInterruptedSuccessorDiagnostic,
  validateInterruptedSuccessorAudit, validateHistoricalContext, validateHistoricalArtifact,
  isReconciledHistoricalRun } from './historical-release-reconciliation.mjs';

const original = validateInterruptedSuccessorRecord();
const identity = r => ({ version: 4, repository: r.source.repository, sha: r.source.sha,
  ciRunId: r.source.ciRunId, ciRunAttempt: r.source.ciRunAttempt,
  releaseRunId: r.originalRun.id, releaseRunAttempt: 1,
  policySha256: r.originalRun.policySha256, environment: r.scope.environment, profile: r.scope.profile,
  renderServiceId: r.scope.renderServiceId, vercelProjectId: r.scope.vercelProjectId,
  vercelTeamId: r.scope.vercelTeamId, executorRepository: targets.executor.repository,
  executorSha: r.originalRun.executorSha, backendSuccessor: r.source.backendSuccessor,
  combinedRelease: r.source.combinedRelease });

function syntheticEvidence() {
  const r = structuredClone(original), first = identity(r), a = r.originalAudit, d = r.diagnostic;
  const rows = [
    { ...first, phase: 'evidence-selected', authorizationId: 'a'.repeat(64),
      evidenceSha256: 'b'.repeat(64), inventorySha256: standingPolicy.authorization.inventorySha256,
      evidenceArtifactId: '14709678648' },
    { ...first, phase: 'backend-baseline-selected', baselineRenderDeployId: a.baselineRenderDeployId,
      baselineRenderSha: a.baselineRenderSha },
    { ...first, phase: 'backend-decision-verified' },
    { ...first, phase: 'backend-classified', schemaTransition: 'additive' },
    { ...first, phase: 'backend-successor-staging', stagedSchemaTransition: 'none',
      payloadPinSha256: a.payloadPinSha256, payloadBytes: a.payloadBytes },
    { ...first, phase: 'failed', code: r.originalRun.terminalCode }
  ];
  r.originalAudit.rowsSha256 = objectDigest(rows);
  const stage = { contract: 'aqua.successor-staging-read-diagnostic', version: 1,
    runId: d.runId, runAttempt: 1, executorSha: d.executorSha,
    failedReleaseRunId: r.originalRun.id, observedAt: d.stagingObservedAt,
    evidence: { status: 'MATCH', auditArtifactId: a.artifactId, archiveSha256: a.archiveSha256 },
    stagedPayload: 'MATCH', stagedPin: 'UNVERIFIED',
    deploymentHistory: { status: 'MATCH', current: { id: a.baselineRenderDeployId, status: 'live',
      commitSha: a.baselineRenderSha }, postRunDeployments: [] } };
  const deployments = [{ id: a.baselineRenderDeployId, status: 'live', commitSha: a.baselineRenderSha },
    ...Array.from({ length: 132 }, (_, i) => ({ id: `dep-synthetic${i.toString(36)}`,
      status: 'deactivated', commitSha: 'a'.repeat(40) }))];
  d.renderHistorySha256 = objectDigest([...deployments].sort((x, y) => x.id.localeCompare(y.id)));
  const commissioned = { contract: 'aqua.commissioned-state-read-diagnostic', runId: d.runId,
    executorSha: d.executorSha, observedAt: d.commissionedObservedAt, diagnosticStatus: 'COMPLETE',
    baselineEvidence: { result: 'PASS' }, service: { result: 'PASS' },
    normalRuntimeSettings: Object.fromEntries(Object.keys(normalRuntimeSettings).map(key => [key, { result: 'PASS' }])),
    deploymentHistory: { observedCount: 133, oneLive: 'PASS', noActiveDeployments: 'PASS', deployments,
      liveDeployment: { id: a.baselineRenderDeployId, commitSha: a.baselineRenderSha } },
    commissioningDecision: { sha256Pin: { result: 'PASS' } },
    historicalD10Comparisons: Object.fromEntries(['intendedConfigurationDigest','requiredAssemblyDigest',
      'requiredRuntimeAssemblyDigest'].map(key => [key, { result: 'PASS' }])),
    backendHealth: Object.fromEntries(['http200','statusHealthy','buildMatchesLiveCommit','production',
      'databaseHealthy','redisHealthy','keyStoreHealthy','recoveryClear','paymentAvailable']
      .map(key => [key, 'PASS'])), paymentAvailability: { result: 'PASS' },
    currentFailingPredicates: [], exactCurrentFailingPredicate: 'NOT_ESTABLISHED' };
  const context = { check: 'trusted-main-context', result: 'PASS' };
  const logFor = () => Buffer.from([context,stage,commissioned].map((row, i) =>
    `2026-11-22T17:36:${(32 + i).toString().padStart(2,'0')}Z ${JSON.stringify(row)}`).join('\n') + '\n');
  const log = logFor();
  d.jobLogSha256 = sha256(log);
  d.stagingRowSha256 = objectDigest(stage);
  d.commissionedRowSha256 = objectDigest(commissioned);
  const run = { id: Number(d.runId), run_number: 18, run_attempt: 1, head_sha: d.executorSha,
    status: 'completed', conclusion: 'success', event: 'workflow_dispatch', head_branch: 'main',
    path: '.github/workflows/provider-credential-check.yml', actor: { login: 'Xolani-M', id: 86495928 },
    repository: { full_name: targets.executor.repository }, head_repository: { full_name: targets.executor.repository },
    created_at: '2026-11-22T17:36:13Z', updated_at: '2026-11-22T17:36:36Z' };
  const job = { id: Number(d.jobId), run_id: run.id, run_attempt: 1, status: 'completed', conclusion: 'success',
    steps: [
      { name: 'Validate trusted main context without provider credentials', conclusion: 'success' },
      { name: 'Diagnose commissioned baseline with fixed GET-only evidence', conclusion: 'success' },
      ...['Verify fixed provider identities and GET permissions only','Diagnose allowlisted Render environment reads only',
        'Inspect fixed Render baseline with GET only'].map(name => ({ name, conclusion: 'skipped' }))
    ] };
  const api = { executor: async route => {
    if (route === `/actions/runs/${d.runId}`) return run;
    if (route === `/actions/runs/${d.runId}/attempts/1/jobs?per_page=100`)
      return { total_count: 1, jobs: [job] };
    throw Error('UNEXPECTED_GITHUB_READ');
  }, diagnosticJobLog: async () => logFor() };
  const descriptor = { artifactId: a.artifactId, runId: r.originalRun.id, runAttempt: 1,
    sha: r.originalRun.executorSha };
  return { r, rows, stage, commissioned, run, job, log, api, descriptor };
}

test('immutable original record and exact context retain the failure without a deployment authority', () => {
  const bytes = readFileSync(new URL('../../governance/backend-successor-staging-reconciliation-45006063824.json', import.meta.url));
  assert.equal(sha256(bytes), '9fda395ac84957fba80d3e6256bff95321b56b2bff2082bd3d5d18df1590dc33');
  assert.equal(isReconciledHistoricalRun(45006063824), true);
  assert.equal(isReconciledHistoricalRun(45006063825), false);
  assert.throws(() => validateInterruptedSuccessorRecord(Buffer.from(bytes.toString().replace('UNVERIFIED','MATCH'))),
    /INTERRUPTED_SUCCESSOR_RECORD_CHANGED/);
  const f = syntheticEvidence();
  const run = { id: Number(f.r.originalRun.id), run_number: 88, run_attempt: 1,
    head_sha: f.r.originalRun.executorSha, status: 'completed', conclusion: 'failure',
    actor: f.r.originalRun.actor, repository: { full_name: targets.executor.repository },
    head_repository: { full_name: targets.executor.repository }, head_branch: 'main',
    event: 'workflow_dispatch', path: '.github/workflows/deploy.yml', name: 'Qualified production executor' };
  const production = { id: Number(f.r.originalRun.productionJobId), run_id: run.id,
    run_attempt: 1, status: 'completed', conclusion: 'failure', name: 'Unattended recovery release',
    steps: [{ name: 'Revalidate policy, provenance, providers and recovery before automatic deployment',
      conclusion: 'failure' }] };
  const q = freezeCandidate({ repository: targets.repository, sha: f.r.source.sha, ciRunId: '999', ciRunAttempt: 1 },
    { GITHUB_REPOSITORY: targets.executor.repository, GITHUB_RUN_ID: '1000', GITHUB_RUN_ATTEMPT: '1',
      GITHUB_REF: 'refs/heads/main', GITHUB_REF_PROTECTED: 'true',
      GITHUB_WORKFLOW_REF: `${targets.executor.repository}/.github/workflows/deploy.yml@refs/heads/main`,
      GITHUB_SHA: '4e8a63ab4731530d29ed68a9d9c913dfbb3a01c4',
      GITHUB_WORKFLOW_SHA: '4e8a63ab4731530d29ed68a9d9c913dfbb3a01c4' },
    standingPolicy, false, f.r.source.combinedRelease);
  assert.deepEqual(validateHistoricalContext(run, 1, production, q, targets), f.r.originalRun);
  for (const changed of [{ ...q, sha: 'c'.repeat(40) }, { ...q, memberRelease: 'a'.repeat(64) },
    { ...q, releaseRunAttempt: 2 }, { ...q, combinedRelease: undefined }])
    assert.throws(() => validateHistoricalContext(run, 1, production, changed, targets));
  assert.throws(() => validateHistoricalContext({ ...run, conclusion: 'success' }, 1, production, q, targets));
  const meta = { id: Number(f.r.originalAudit.artifactId), name: `production-release-audit-${run.id}-1`,
    expired: false, digest: 'sha256:' + f.r.originalAudit.archiveSha256,
    workflow_run: { id: run.id, head_sha: run.head_sha, head_branch: 'main',
      repository_id: 1423239668, head_repository_id: 1423239668 } };
  validateHistoricalArtifact(f.r.originalRun, f.descriptor, meta);
  assert.throws(() => validateHistoricalArtifact(f.r.originalRun, f.descriptor,
    { ...meta, digest: 'sha256:' + 'f'.repeat(64) }), /INTERRUPTED_SUCCESSOR_ARTIFACT_CHANGED/);
});

test('diagnostic log and audit authenticate the exact partial write without making the run successful', async () => {
  const f = syntheticEvidence();
  const proof = await authenticateInterruptedSuccessorDiagnostic(f.api, f.r);
  const result = validateInterruptedSuccessorAudit(f.rows, f.descriptor, f.r.originalRun, targets, proof, f.r);
  assert.equal(result.outcome, 'ACKNOWLEDGED_PARTIAL_RENDER_CONFIGURATION_WRITE');
  assert.equal(result.originalConclusion, 'failure');
  assert.equal(result.pin, 'UNVERIFIED');
  assert.equal(result.noRecordedPostRunDeployment, true);
  assert.equal(result.configurationTriggeredRestartAbsenceEstablished, false);
  assert.equal(result.databaseWriteAbsenceEstablishedByHealth, false);
  assert.equal(result.successfulFullReleasePredecessor, false);
  assert.equal(result.deploymentAuthority, false);
  assert.equal(result.automaticResumeAuthorized, false);
  assert.equal(result.migrationAuthority, false);
  assert.equal(result.financialAuthority, false);
  assert.throws(() => validateInterruptedSuccessorAudit(f.rows, f.descriptor,
    f.r.originalRun, targets, structuredClone(proof), f.r), /INTERRUPTED_SUCCESSOR_EFFECT_UNVERIFIABLE/);
  for (const change of [
    rows => rows[4].phase = 'backend-render-requesting',
    rows => rows[4].payloadPinSha256 = 'f'.repeat(64),
    rows => rows[5].code = 'SUCCESS',
    rows => rows[1].baselineRenderDeployId = 'dep-foreign',
    rows => rows[2].releaseRunId = '45006063825',
    rows => rows.splice(5, 0, { ...rows[4], phase: 'backend-schema-job-requesting' }),
    rows => rows[4].renderDeployId = 'dep-unaccounted'
  ]) {
    const altered = structuredClone(f.rows); change(altered);
    assert.throws(() => validateInterruptedSuccessorAudit(altered, f.descriptor,
      f.r.originalRun, targets, proof, f.r), /INTERRUPTED_SUCCESSOR_EFFECT_UNVERIFIABLE/);
  }
  assert.throws(() => validateInterruptedSuccessorAudit(f.rows,
    { ...f.descriptor, runId: '45006063825' }, f.r.originalRun, targets, proof, f.r));
});

test('changed diagnostic log, status, pin, provider history or context fail closed', async () => {
  for (const change of [
    f => f.api.diagnosticJobLog = async () => Buffer.from('substituted log'),
    f => f.run.conclusion = 'failure',
    f => f.run.head_sha = 'f'.repeat(40),
    f => f.job.steps[1].conclusion = 'failure',
    f => f.stage.stagedPin = 'MATCH',
    f => f.stage.deploymentHistory.postRunDeployments.push({ id: 'dep-other' }),
    f => f.commissioned.paymentAvailability.result = 'FAIL'
  ]) {
    const f = syntheticEvidence(); change(f);
    await assert.rejects(authenticateInterruptedSuccessorDiagnostic(f.api, f.r));
  }
});

test('only the exact GitHub job log is fetched; the signed storage redirect never gets credentials', async () => {
  const requests = [], log = Buffer.from('synthetic bounded log');
  const api = clients({ GH_TOKEN: 'synthetic-job-token' }, async (url, options) => {
    requests.push({ url: new URL(url), options });
    if (url.startsWith('https://api.github.com/')) return new Response(null, { status: 302,
      headers: { location: 'https://productionresultssa0.blob.core.windows.net/logs/pinned.txt?sig=fixture' } });
    return new Response(log, { status: 200 });
  });
  await assert.rejects(api.diagnosticJobLog('137293951126'), /DIAGNOSTIC_JOB_LOG_NOT_APPROVED/);
  assert.equal(requests.length, 0);
  assert.deepEqual(await api.diagnosticJobLog('137293951125'), log);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer synthetic-job-token');
  assert.equal(requests[0].options.redirect, 'manual');
  assert.equal(requests[1].options.headers?.Authorization, undefined);
  assert.equal(requests[1].options.redirect, 'error');
  const hostile = clients({ GH_TOKEN: 'synthetic-job-token' }, async () => new Response(null, { status: 302,
    headers: { location: 'https://untrusted.example/logs?sig=fixture' } }));
  await assert.rejects(hostile.diagnosticJobLog('137293951125'), /DIAGNOSTIC_JOB_LOG_REDIRECT_INVALID/);
  const missingCredential = clients({}, async () => assert.fail('no unauthenticated job-log request'));
  await assert.rejects(missingCredential.diagnosticJobLog('137293951125'), /GITHUB_EXECUTOR_JOB_CREDENTIAL_REQUIRED/);
  const oversized = clients({ GH_TOKEN: 'synthetic-job-token' }, async (url) =>
    url.startsWith('https://api.github.com/') ? new Response(null, { status: 302,
      headers: { location: 'https://productionresultssa0.blob.core.windows.net/logs/pinned.txt?sig=fixture' } }) :
      new Response(Buffer.alloc(256 * 1024 + 1), { status: 200 }));
  await assert.rejects(oversized.diagnosticJobLog('137293951125'), /DIAGNOSTIC_JOB_LOG_TOO_LARGE/);
});
