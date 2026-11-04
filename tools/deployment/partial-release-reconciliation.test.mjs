import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fixture } from './fixtures/provider.mjs';
import { targets, standingPolicy, freezeCandidate, deploy, evidencePlan, createAuditWriter,
  validateBaselineReceipt, validateResumeReceipt } from './release-control.mjs';
import { createGitHubAdmission, verifyGitHubEvidence, objectDigest, sha256 } from './github-evidence.mjs';
import { approvedRecoveryReadback } from './first-release-recovery.mjs';
import { approvedSchemaReadback, schemaSource, validateCompletedCandidateCarryForward } from './commission-schema-first.mjs';
import { partialReleaseRecord, partialReleaseRunId, partialReconciliationSha256,
  partialRenderProof, partialRenderReuse, validatePartialRenderOrigin } from './partial-release-reconciliation.mjs';
import { readinessRelease, readinessCandidateSha, readinessRecordDigest, validateReadinessCandidate,
  readinessContinuation, readinessContinuationDigest } from './readiness-release.mjs';

const record = partialReleaseRecord(), common = record.retainedAudit.common;
const baseline = record.retainedAudit.baseline;
const originalRun = () => ({ id: Number(partialReleaseRunId), run_number: 36, run_attempt: 2,
  head_sha: record.run.executorSha, head_branch: 'main', event: 'workflow_dispatch', path: '.github/workflows/deploy.yml',
  name: 'Qualified production executor', status: 'completed', conclusion: 'failure', actor: { ...record.run.actor },
  repository: { id: record.run.executorRepositoryId, full_name: common.executorRepository },
  head_repository: { id: record.run.executorRepositoryId, full_name: common.executorRepository } });
const originalJobs = attempt => record.run.attempts[attempt - 1].jobs.map(job => ({ ...job,
  run_id: Number(partialReleaseRunId), run_attempt: attempt, status: 'completed',
  steps: attempt === 1 && job.name === 'Unattended recovery release' ? [{
    name: 'Revalidate policy, provenance, providers and recovery before automatic deployment', conclusion: 'failure' }] : [] }));
// Actual three-annotation structure observed on both original checks: the two
// expected failures plus GitHub's unrelated runner-migration notice.
const runnerNotice = () => ({ annotation_level: 'notice', message:
  '"The ubuntu-latest label will migrate to Ubuntu 26 beginning October 19, 2026. For more information, see https://github.com/actions/runner-images/issues/14748"' });
const annotations = pin => [{ annotation_level: 'failure', message:
  `${pin.terminalFailureCode}. See the safe-release runbook; do not resume or retry provider requests blindly.` },
{ annotation_level: 'failure', message: 'Process completed with exit code 1.' }, runnerNotice()];

// Real orchestration/validators; synthetic CI/provider responses and a controlled
// clock. None of these responses is asserted to be a new production observation.
function continuationFixture(successor = false, reuse = false) {
  const f = fixture(), sourceRead = f.api.gh, executorRead = f.api.executor,
    renderRead = f.api.render, vercelRead = f.api.vercel;
  const binding = successor ? readinessRelease() : null;
  const active = binding ? { sha: binding.candidateSha, ciRunId: binding.ciRunId, ciRunAttempt: binding.ciRunAttempt } : common;
  f.state.policy = structuredClone(standingPolicy);
  // This unit boundary receives an already authenticated source archive. Supply
  // synthetic frontend bytes with the fixed candidate's tar label, just as CI
  // and provider responses below are substitutes. This is NOT evidence of the
  // real application tree; main()'s independent Git-byte authentication remains
  // covered by executor.test.mjs. Never use this tar as a production fixture.
  const tarSha = execFileSync('git', ['get-tar-commit-id'], { input: f.state.frontendArchive.subarray(0, 1024) }).toString().trim();
  f.wrongCommitArchive = f.state.frontendArchive;
  f.state.frontendArchive = Buffer.from(f.state.frontendArchive);
  const label = f.state.frontendArchive.indexOf(Buffer.from('comment=' + tarSha));
  assert.ok(label >= 512 && label < 1024);
  f.state.frontendArchive.write(active.sha, label + 'comment='.length, 'ascii');
  f.state.candidate = freezeCandidate({ version: 1, repository: common.repository, sha: active.sha,
    ciRunId: active.ciRunId, ciRunAttempt: active.ciRunAttempt }, f.state.env, f.state.policy);
  f.state.main = active.sha;
  f.state.clock = Date.parse('2026-11-04T09:00:00Z');
  f.state.pr.merge_commit_sha = active.sha;
  f.state.report.context = { kind: 'ci', repository: common.repository, sha: active.sha,
    runId: active.ciRunId, runAttempt: active.ciRunAttempt };
  f.state.recoveryReadback = structuredClone(approvedRecoveryReadback);
  f.state.schemaReadback = structuredClone(approvedSchemaReadback);
  f.state.vars.push({ envVar: { key: 'App__AQGreenV2__Commissioning__AdmissionMode', value: 'CLEAN_START' } });
  const carry = binding?.completedCarry ?? validateCompletedCandidateCarryForward();
  for (const pin of [...schemaSource.migrationFiles, ...schemaSource.holdSources, ...schemaSource.cleanStartSources])
    f.state.sourceDigests.set(pin.path, pin.path === carry.guardOverride.path ? carry.guardOverride.candidateSha256 : pin.sha256);
  f.state.project.targets.production.id = baseline.baselineVercelDeployId;
  f.state.renderRows = [
    { id: record.renderOperation.deployId, status: 'live', commit: { id: common.sha } },
    { id: baseline.baselineRenderDeployId, status: 'deactivated', commit: { id: baseline.baselineRenderSha } }
  ];
  const reusePin = reuse ? readinessContinuation() : null;
  if (reuse) {
    f.state.renderRows[0].status = 'deactivated';
    f.state.renderRows.unshift({id:reusePin.renderDeployId,status:'live',commit:{id:active.sha}});
  }
  f.state.originalRun = originalRun();
  f.state.originalJobs = [originalJobs(1), originalJobs(2)];
  f.state.originalAnnotations = record.run.attempts.map(annotations);
  const skipped = Array.from({ length: 35 }, (_, i) => ({ ...originalRun(), id: 100 + i,
    run_number: i + 1, run_attempt: 1, head_sha: 'e'.repeat(40) }));
  const metadata = async () => ({ ...await sourceRead('/actions/artifacts/7890'),
    name: `mandatory-security-${active.sha}-${active.ciRunId}-${active.ciRunAttempt}`,
    workflow_run: { id: Number(active.ciRunId), repository_id: 789, head_repository_id: 789,
      head_sha: active.sha, head_branch: 'main' } });
  f.api.gh = async route => {
    if (route === `/actions/runs/${active.ciRunId}`) return { ...await sourceRead('/actions/runs/123'),
      id: Number(active.ciRunId), run_attempt: active.ciRunAttempt, head_sha: active.sha, updated_at: '2026-11-04T08:16:20Z' };
    if (route === `/actions/runs/${active.ciRunId}/attempts/${active.ciRunAttempt}/jobs?per_page=100`) {
      const page = await sourceRead('/actions/runs/123/attempts/1/jobs?per_page=100');
      return { ...page, jobs: page.jobs.map(j => ({ ...j, run_id: Number(active.ciRunId), run_attempt: active.ciRunAttempt })) };
    }
    if (route === `/actions/runs/${active.ciRunId}/artifacts?per_page=100`)
      return { total_count: 1, artifacts: [await metadata()] };
    if (route === '/actions/artifacts/7890') return metadata();
    if (route === `/compare/${carry.operationSourceSha}...${active.sha}`)
      return { status: 'ahead', files: [{ filename: carry.guardOverride.path, status: 'modified' }] };
    if (route === `/compare/${standingPolicy.firstReleaseRecovery.baseline.renderSha}...${active.sha}`)
      return { status: 'ahead', files: schemaSource.migrationFiles.map(p => ({ filename: p.path, status: p.status })) };
    return sourceRead(route);
  };
  const failedArchive = successor ? Buffer.from(readFileSync(new URL('./fixtures/readiness-failed-41822854444-1.zip.b64', import.meta.url), 'utf8'), 'base64') : null;
  const failed = successor ? { ...originalRun(), id: 41822854444, run_number: 38, run_attempt: 1,
    head_sha: binding.readinessFailure.executorSha } : null;
  const stopped = successor ? { ...failed, id: 41817019405, run_number: 37,
    head_sha: 'a07d5fd14961a9661aa305f8b80a34bfaf591f62' } : null;
  const failedMeta = successor ? { id: Number(binding.readinessFailure.artifactId),
    name: 'production-release-audit-41822854444-1', expired: false, size_in_bytes: failedArchive.length,
    digest: 'sha256:' + binding.readinessFailure.archiveSha256, workflow_run: { id: failed.id,
      head_sha: failed.head_sha, head_branch: 'main', repository_id: 1423239668, head_repository_id: 1423239668 } } : null;
  const reuseArchive = reuse ? Buffer.from(readFileSync(new URL('./fixtures/readiness-render-41868204651-1.zip.b64', import.meta.url),'utf8'),'base64') : null;
  const reuseRun = reuse ? {...failed,id:Number(reusePin.runId),run_number:reusePin.runNumber,head_sha:reusePin.executorSha} : null;
  const reuseMeta = reuse ? {...failedMeta,id:Number(reusePin.artifactId),name:'production-release-audit-41868204651-1',
    size_in_bytes:reuseArchive.length,digest:'sha256:'+reusePin.archiveSha256,
    workflow_run:{...failedMeta.workflow_run,id:reuseRun.id,head_sha:reuseRun.head_sha}} : null;
  const artifactRead = f.api.artifact;
  f.api.artifact = async (owner, id) => reuse && owner === 'executor' && id === reusePin.artifactId ? reuseArchive :
    successor && owner === 'executor' && id === binding.readinessFailure.artifactId ? failedArchive : artifactRead(owner, id);
  f.api.executor = async route => {
    if (successor && route === '') return { id: 1423239668 };
    if (route === `/actions/runs/${f.state.candidate.releaseRunId}`)
      return { ...await executorRead(route), run_number: reuse ? 40 : successor ? 39 : 37 };
    if (route.startsWith('/actions/workflows/deploy.yml/runs?')) return { total_count: reuse ? 40 : successor ? 39 : 37,
      workflow_runs: [await f.api.executor(`/actions/runs/${f.state.candidate.releaseRunId}`), f.state.originalRun, ...skipped,
        ...(successor ? [failed, stopped] : []), ...(reuse ? [reuseRun] : [])] };
    if (reuse && route === '/actions/runs/41868204651/attempts/1/jobs?per_page=100')
      return {total_count:3,jobs:originalJobs(1).map(j=>({...j,run_id:reuseRun.id,run_attempt:1,
        id:j.name==='Unattended recovery release'?reusePin.productionJobId:j.id}))};
    if (reuse && route === '/actions/runs/41868204651/artifacts?per_page=100') return {total_count:1,artifacts:[reuseMeta]};
    if (reuse && route === '/actions/artifacts/'+reusePin.artifactId) return reuseMeta;
    if (successor && route === '/actions/runs/41817019405/attempts/1/jobs?per_page=100')
      return { total_count: 3, jobs: originalJobs(2).map(j => ({ ...j, run_id: stopped.id, run_attempt: 1 })) };
    if (successor && route === '/actions/runs/41822854444/attempts/1/jobs?per_page=100')
      return { total_count: 3, jobs: originalJobs(1).map(j => ({ ...j, id: j.name === 'Unattended recovery release' ? 126550639872 : j.id,
        run_id: failed.id, run_attempt: 1 })) };
    if (successor && route === '/actions/runs/41822854444/artifacts?per_page=100') return { total_count: 1, artifacts: [failedMeta] };
    if (successor && route === '/actions/artifacts/' + binding.readinessFailure.artifactId) return failedMeta;
    if (route === `/actions/runs/${partialReleaseRunId}/attempts/1`)
      return { ...f.state.originalRun, run_attempt: 1 };
    if (route === `/actions/runs/${partialReleaseRunId}`) return f.state.originalRun;
    for (const attempt of [1, 2]) {
      if (route === `/actions/runs/${partialReleaseRunId}/attempts/${attempt}/jobs?per_page=100`)
        return { total_count: 3, jobs: f.state.originalJobs[attempt - 1] };
      if (route === `/check-runs/${record.run.attempts[attempt - 1].failureCheckRunId}/annotations?per_page=100`)
        return f.state.originalAnnotations[attempt - 1];
    }
    if (skipped.some(r => route === `/actions/runs/${r.id}/attempts/1/jobs?per_page=100`)) {
      const id = Number(route.split('/')[3]);
      return { total_count: 3, jobs: record.run.attempts[1].jobs.map(j => ({ ...j,
        run_id: id, run_attempt: 1, status: 'completed' })) };
    }
    assert.ok(!route.includes(`/actions/runs/${partialReleaseRunId}/artifacts`) && !route.includes('/actions/artifacts/13307300799'),
      'the deleted artifact must not be downloaded or fabricated');
    return executorRead(route);
  };
  f.api.render = async (route, body) => {
    if (reuse) assert.equal(body, undefined, 'acknowledged new-source backend must never be redeployed');
    if (successor && body) {
      assert.equal(body.commitId, active.sha); f.posts.push({ provider: 'render', route, body });
      f.state.newRender = { id: 'dep-new', status: 'build_in_progress', commit: { id: active.sha } };
      f.state.renderRows.unshift(f.state.newRender); return structuredClone(f.state.newRender);
    }
    assert.equal(body, undefined, 'continuation must never POST to Render');
    if (reuse && route.endsWith('/deploys/'+reusePin.renderDeployId)) return f.state.renderRows.find(r=>r.id===reusePin.renderDeployId);
    if (route.endsWith('/deploys/' + record.renderOperation.deployId))
      return f.state.renderRows.find(r => r.id === record.renderOperation.deployId);
    if (route.endsWith('/deploys/' + baseline.baselineRenderDeployId))
      return f.state.renderRows.find(r => r.id === baseline.baselineRenderDeployId);
    return renderRead(route, body);
  };
  f.api.vercel = async (route, body) => {
    if (route === `/v13/deployments/${baseline.baselineVercelDeployId}`) return {
      id: baseline.baselineVercelDeployId, projectId: targets.vercel.id, target: 'production', readyState: 'READY' };
    if (route === `/v2/deployments/${baseline.baselineVercelDeployId}/aliases`)
      return { aliases: [{ alias: 'www.aqualifestyleclub.co.za' }] };
    return vercelRead(route, body);
  };
  f.api.health = async () => ({ status: 200, recovery: null, body: { status: 'Healthy',
    buildId: reuse || f.state.newRender?.status === 'live' ? active.sha : common.sha,
    environment: 'Production', databaseStatus: 'Healthy', redisStatus: 'Healthy', dataProtectionKeyStoreStatus: 'Healthy' } });
  f.execute = async (options = {}) => {
    const now = () => f.state.clock;
    const evidence = await verifyGitHubEvidence(f.api, f.state.candidate, f.state.policy, f.readSourceDigest, now);
    const receipt = createGitHubAdmission(f.state.candidate, f.state.policy, evidence, now);
    const plan = await evidencePlan(f.api, f.state.candidate, f.state.policy);
    return deploy(f.api, f.state.candidate, f.state.policy, createAuditWriter(f.state.candidate, r => f.reports.push(r)), {
      env: f.state.env, evidencePlan: plan, admissionReceipt: receipt, readSourceDigest: f.readSourceDigest, now,
      frontendArchive: f.state.frontendArchive, recoveryReadback: f.state.recoveryReadback,
      schemaReadback: f.state.schemaReadback, attempts: 2, pause: async () => {}, ...options });
  };
  return f;
}

test('exact retained rows and authenticated provider snapshots preserve the original failures and evidence limitations', () => {
  assert.equal(sha256(readFileSync(new URL('../../governance/partial-release-41798557430.json', import.meta.url))), partialReconciliationSha256);
  const a = record.retainedAudit, rows = a.events.map((e, i) => ({ ...a.common,
    ...(i >= 8 ? a.baseline : {}), ...(i >= 24 ? a.render : {}), ...e }));
  assert.equal(objectDigest(rows), record.originalArtifact.rowsSha256);
  assert.equal(rows.length, 30);
  assert.equal(rows.at(-1).code, 'API_REVISION_OR_RECOVERY_READINESS_FAILED');
  assert.equal(rows.some(r => r.phase.startsWith('vercel-') || r.phase === 'verified'), false);
  assert.equal(record.renderOperation.githubDeploymentId, '7541402640');
  assert.equal(record.renderOperation.statuses.at(-1).state, 'success');
  assert.equal(record.limitations.failedHealthResponse, 'NOT_RETAINED_CAUSE_UNDETERMINED');
  assert.equal(record.limitations.zipToReportLink, 'CARRIED_FORWARD_FROM_PRE_DELETION_AUTHENTICATED_DOWNLOAD_NOT_REDERIVED');
});

test('admission recognizes exactly both failed attempts without an original artifact or invented attempt-2 audit', async () => {
  const f = continuationFixture(), plan = await evidencePlan(f.api, f.state.candidate, f.state.policy);
  assert.deepEqual(plan.partialRenderContinuation, partialRenderProof());
  assert.equal(plan.historicalReconciliations[0].originalConclusion, 'failure');
  assert.deepEqual(plan.partialRenderContinuation.originalFailures.map(f => f.code),
    ['API_REVISION_OR_RECOVERY_READINESS_FAILED', 'TRUSTED_AUDIT_ARTIFACT_REQUIRED']);
  assert.ok(plan.priorFailedRuns.some(r => r.runId === partialReleaseRunId && r.runAttempt === 2 && r.basis === 'production-never-executed'));
  assert.equal(plan.baseline, null); assert.equal(plan.resume, null); assert.deepEqual(plan.verifiedReleases, []);
  assert.equal(f.state.providerCalls, 0);
});

test('the observed runner notice does not change the exact expected failure evidence', async () => {
  for (const withNotice of [true, false]) {
    const f = continuationFixture();
    if (!withNotice) f.state.originalAnnotations = f.state.originalAnnotations.map(rows => rows.filter(a => a.annotation_level === 'failure'));
    const plan = await evidencePlan(f.api, f.state.candidate, f.state.policy);
    assert.deepEqual(plan.partialRenderContinuation, partialRenderProof());
    assert.equal(f.state.providerCalls, 0);
  }
});

test('notices cannot hide missing, altered, duplicate or additional failures in either historical check', async () => {
  for (const attempt of [0, 1]) for (const edit of [
    rows => rows.splice(0, 1), rows => rows.splice(1, 1),
    rows => rows[0].message = 'A different terminal failure',
    rows => rows[1].message = 'Process completed with exit code 2.',
    rows => rows.push({ annotation_level: 'failure', message: 'Unexpected additional failure' }),
    rows => rows.push({ ...rows[0] }), rows => rows.push({ ...rows[1] }),
    rows => rows[0].annotation_level = 'notice', rows => rows[1].annotation_level = 'warning',
    rows => rows.push({ annotation_level: 'unknown', message: 'Unrecognized severity' }),
    rows => rows.push(null)
  ]) {
    const f = continuationFixture(); edit(f.state.originalAnnotations[attempt]);
    await assert.rejects(evidencePlan(f.api, f.state.candidate, f.state.policy), /PARTIAL_ORIGINAL_FAILURE_CHANGED/);
    assert.equal(f.state.providerCalls, 0);
  }
});

test('annotation inventory must be a complete bounded page before informational notices can be ignored', async () => {
  for (const value of [null, {}, [], Array.from({ length: 100 }, runnerNotice)]) {
    const f = continuationFixture();
    if (Array.isArray(value) && value.length === 100) value.splice(0, 2, ...f.state.originalAnnotations[0].slice(0, 2));
    f.state.originalAnnotations[0] = value;
    await assert.rejects(evidencePlan(f.api, f.state.candidate, f.state.policy), /PARTIAL_ORIGINAL_FAILURE_CHANGED/);
    assert.equal(f.state.providerCalls, 0);
  }
});

test('the subsequent admission-only failure remains non-mutating while continuation still reuses Render', async () => {
  const f = continuationFixture(), read = f.api.executor;
  // Actual subsequent run identity/outcome; job responses remain test substitutes.
  // The existing generic skipped-production classification needs no new exception.
  const stopped = { ...originalRun(), id: 41817019405, run_number: 37, run_attempt: 1,
    head_sha: 'a07d5fd14961a9661aa305f8b80a34bfaf591f62' };
  f.api.executor = async route => {
    const current = `/actions/runs/${f.state.candidate.releaseRunId}`;
    if (route === current) return { ...await read(route), run_number: 38 };
    if (route.startsWith('/actions/workflows/deploy.yml/runs?')) {
      const page = await read(route);
      return { total_count: 38, workflow_runs: page.workflow_runs.map(r => r.id === Number(f.state.candidate.releaseRunId) ?
        { ...r, run_number: 38 } : r).concat(stopped) };
    }
    if (route === `/actions/runs/${stopped.id}/attempts/1/jobs?per_page=100`)
      return { total_count: 3, jobs: originalJobs(2).map(j => ({ ...j, run_id: stopped.id, run_attempt: 1 })) };
    assert.ok(!route.includes(`/actions/runs/${stopped.id}/artifacts`), 'skipped production has no production audit');
    return read(route);
  };
  const plan = await evidencePlan(f.api, f.state.candidate, f.state.policy);
  assert.ok(plan.priorFailedRuns.some(r => r.runId === String(stopped.id) && r.runAttempt === 1 && r.basis === 'production-never-executed'));
  await f.execute();
  assert.deepEqual(f.posts.map(p => p.provider), ['vercel']);
  assert.equal(f.reports.at(-1).phase, 'verified');
  assert.equal(f.reports.at(-1).renderOriginRunId, partialReleaseRunId);
});

test('full continuation reuses Render, executes OIDC before Vercel, and records the actual cross-run origin', async () => {
  const f = continuationFixture(), readiness = f.api.readiness; let readinessCalls = 0;
  f.api.readiness = async sha => { readinessCalls++; assert.equal(sha, common.sha); return readiness(sha); };
  const upload = f.api.uploadVercel;
  f.api.uploadVercel = async (...args) => { assert.ok(readinessCalls > 0); return upload(...args); };
  await f.execute();
  assert.deepEqual(f.posts.map(p => p.provider), ['vercel']);
  assert.ok(f.state.uploads.length > 0); assert.ok(readinessCalls >= 3);
  assert.equal(f.reports.filter(r => r.phase === 'render-reconciled').length, 1);
  assert.equal(f.reports.some(r => r.phase === 'render-requesting' || r.phase === 'render-requested'), false);
  const last = f.reports.at(-1);
  assert.equal(last.phase, 'verified'); assert.equal(last.renderDeployId, record.renderOperation.deployId);
  assert.equal(last.renderOriginRunId, partialReleaseRunId); assert.equal(last.renderOriginExecutorSha, record.run.executorSha);
  assert.equal(last.releaseRunId, f.state.candidate.releaseRunId);
  validatePartialRenderOrigin(last, targets);
  validateBaselineReceipt(f.reports, { runId: last.releaseRunId, runAttempt: 1, sha: last.executorSha }, f.state.candidate);
  const forged = structuredClone(f.reports);
  forged.at(-1).renderOriginRunId = last.releaseRunId;
  assert.throws(() => validateBaselineReceipt(forged,
    { runId: last.releaseRunId, runAttempt: 1, sha: last.executorSha }, f.state.candidate), /PARTIAL_RENDER_ORIGIN_CHANGED/);
});

test('record tampering cannot rewrite failures, remove limits, change providers or create deployment authority', () => {
  for (const edit of [r => r.originalFailuresRewritten = true, r => r.deploymentAuthority = true,
    r => r.run.attempts[1].jobs[2].conclusion = 'failure', r => r.renderOperation.deployId = 'dep-foreign',
    r => r.retainedAudit.events.pop(), r => delete r.limitations.zipToReportLink]) {
    const r = structuredClone(record); edit(r);
    assert.throws(() => partialReleaseRecord(Buffer.from(JSON.stringify(r))), /PARTIAL_RECORD_CHANGED/);
  }
});

test('foreign source, CI attempt, policy, purpose, target and old-executor execution cannot adopt this Render operation', () => {
  const f = continuationFixture();
  for (const edit of [q => q.sha = 'a'.repeat(40), q => q.ciRunId = '123', q => q.ciRunAttempt = 3,
    q => q.policySha256 = 'b'.repeat(64), q => q.memberRelease = 'member', q => q.renderServiceId = 'srv-foreign',
    q => q.vercelProjectId = 'prj_foreign', q => q.releaseRunId = partialReleaseRunId,
    q => q.executorSha = record.run.executorSha, q => q.releaseRunAttempt = 2]) {
    const q = { ...f.state.candidate }; edit(q);
    assert.throws(() => partialRenderReuse(partialRenderProof(), q, targets), /PARTIAL_/);
  }
  assert.throws(() => partialRenderReuse(partialRenderProof(), f.state.candidate,
    { ...targets, vercel: { ...targets.vercel, productionUrl: 'https://foreign.invalid' } }), /PARTIAL_/);
  assert.throws(() => validateResumeReceipt([common], { ...f.state.candidate, releaseRunAttempt: 2 }), /RESUME_/);
});

test('changed authenticated history, skipped/executed stages or missing failure evidence cannot gain provider access', async () => {
  for (const edit of [f => f.state.originalRun.head_sha = 'a'.repeat(40), f => f.state.originalRun.run_attempt = 3,
    f => f.state.originalRun.actor.id++, f => f.state.originalRun.repository.id++,
    f => f.state.originalJobs[0][2].steps = [], f => f.state.originalJobs[0][2].id++,
    f => f.state.originalJobs[0][1].conclusion = 'failure', f => f.state.originalJobs[1][2].conclusion = 'failure',
    f => f.state.originalAnnotations[0] = [], f => f.state.originalAnnotations[1][0].message = 'success']) {
    const f = continuationFixture(); edit(f);
    await assert.rejects(f.execute());
    assert.equal(f.state.providerCalls, 0); assert.equal(f.posts.length, 0); assert.equal(f.state.uploads.length, 0);
  }
});

test('current missing, ambiguous, inactive or wrong-revision Render state cannot trigger redeployment or Vercel uploads', async () => {
  for (const edit of [f => f.state.renderRows.shift(), f => f.state.renderRows[0].status = 'deactivated',
    f => f.state.renderRows[0].commit.id = 'a'.repeat(40),
    f => f.state.renderRows.push({ id: 'dep-foreign', status: 'live', commit: { id: common.sha } }),
    f => f.state.renderRows.push({ id: 'dep-foreign', status: 'queued', commit: { id: common.sha } }),
    f => { f.state.renderRows[0].status = 'deactivated'; f.state.renderRows[1].status = 'live'; },
    f => f.state.renderRows[1].status = 'live']) {
    const f = continuationFixture(); edit(f);
    await assert.rejects(f.execute(), /RENDER_/);
    assert.equal(f.posts.length, 0); assert.equal(f.state.uploads.length, 0);
  }
});

test('the existing archive-commit guard still rejects a different frontend before provider access', async () => {
  const f = continuationFixture(); f.state.frontendArchive = f.wrongCommitArchive;
  await assert.rejects(f.execute(), /VERCEL_ARCHIVE_COMMIT_MISMATCH/);
  assert.equal(f.state.providerCalls, 0); assert.equal(f.state.uploads.length, 0);
});

test('financial holds, unhealthy state and protected OIDC failure remain pre-Vercel blockers', async () => {
  for (const edit of [f => f.state.vars.find(r => r.envVar.key === 'App__FinancialOperations__Enabled').envVar.value = 'true',
    f => f.state.vars.find(r => r.envVar.key === 'App__AQGreenV2__Commissioning__AdmissionMode').envVar.value = 'OTHER',
    f => f.api.health = async () => ({ status: 503, body: {} }),
    f => f.api.readiness = async () => { throw Error('synthetic OIDC failure'); },
    f => f.api.readiness = async () => ({ status: 200, body: { buildId: common.sha, status: 'Ready' } })]) {
    const f = continuationFixture(); edit(f);
    await assert.rejects(f.execute(), /RUNTIME_CONFIGURATION|API_REVISION|PROTECTED_RUNTIME/);
    assert.equal(f.posts.length, 0); assert.equal(f.state.uploads.length, 0);
  }
});

test('expired recovery, stale CI and admission expiry are not refreshed by historical reconciliation', async () => {
  for (const at of ['2026-11-05T06:00:00Z', '2026-11-05T09:00:00Z']) {
    const f = continuationFixture(); f.state.clock = Date.parse(at);
    await assert.rejects(f.execute(), /EVIDENCE_EXPIRED|EVIDENCE_STALE/);
    assert.equal(f.posts.length, 0); assert.equal(f.state.uploads.length, 0);
  }
  const f = continuationFixture(), read = f.api.readiness;
  f.api.readiness = async sha => { const result = await read(sha); f.state.clock += 3600_000; return result; };
  await assert.rejects(f.execute(), /ADMISSION_RECEIPT_EXPIRED/);
  assert.equal(f.posts.length, 0); assert.equal(f.state.uploads.length, 0);
});

test('Vercel drift and final source failure do not convert the reused backend into a verified full release', async () => {
  const drift = continuationFixture(); drift.state.project.targets.production.id = 'dpl_Foreign';
  await assert.rejects(drift.execute(), /VERCEL_/); assert.equal(drift.posts.length, 0);
  const f = continuationFixture(), read = f.api.vercel;
  f.api.vercel = async (...args) => { const web = await read(...args);
    if (args[0] === '/v13/deployments/dpl_New' && web.readyState === 'READY') web.meta.aquaSourceSha = 'a'.repeat(40);
    return web; };
  await assert.rejects(f.execute(), /VERCEL_/);
  assert.deepEqual(f.posts.map(p => p.provider), ['vercel']);
  assert.ok(!f.reports.some(r => r.phase === 'verified'));
  assert.equal(f.reports.at(-1).renderOriginRunId, partialReleaseRunId);
});

test('names-only Vercel results still require compiled public inputs and authoritative production aliases', async () => {
  for (const valid of [true, false]) {
    const f = continuationFixture(), read = f.api.vercel;
    let publicReads = 0;
    f.api.vercel = async (...args) => { const web = await read(...args);
      if (args[0] === '/v13/deployments/dpl_New') { web.env = ['NEXT_PUBLIC_ABP_API_URL', 'NEXT_PUBLIC_DEFAULT_TENANT_NAME'];
        web.build.env = [...web.env]; }
      return web; };
    const publicFetch = async (url, options) => {
      assert.equal(new URL(url).origin, targets.vercel.productionUrl); assert.equal(options.redirect, 'error');
      assert.deepEqual(options.headers, { 'Cache-Control': 'no-store' }); publicReads++;
      return new Response(new URL(url).pathname === '/login' ? '<script src="/_next/static/chunks/public-env.js"></script>' :
        `.parse({NEXT_PUBLIC_ABP_API_URL:"https://aqualifestyle-api.onrender.com",NEXT_PUBLIC_DEFAULT_TENANT_NAME:"${valid ? 'Default' : 'Foreign'}",NEXT_PUBLIC_MONITORING_ENDPOINT:void 0})`);
    };
    if (valid) { await f.execute({ publicFetch }); assert.equal(publicReads, 4);
      assert.equal(f.reports.at(-1).vercelPublicInputsObservation.configurationEvidence, 'compiled-literals-from-frozen-public-env-module'); }
    else { await assert.rejects(f.execute({ publicFetch }), /VERCEL_/);
      assert.ok(!f.reports.some(r => r.phase === 'verified')); }
    assert.deepEqual(f.posts.map(p => p.provider), ['vercel']);
  }
});

test('the exact readiness successor preserves history and performs one new-source Render operation before Vercel', async () => {
  const f = continuationFixture(true), plan = await evidencePlan(f.api, f.state.candidate, f.state.policy);
  assert.equal(plan.partialRenderContinuation, undefined);
  assert.equal(plan.acknowledgedBackend.renderDeployId, record.renderOperation.deployId);
  assert.ok(plan.historicalReconciliations.some(p => p.runId === '41822854444' && p.terminalFailureCode === 'PROTECTED_RUNTIME_READINESS_FAILED'));
  await f.execute();
  assert.deepEqual(f.posts.map(p => p.provider), ['render','vercel']);
  assert.equal(f.posts[0].body.commitId, readinessCandidateSha);
  const last = f.reports.at(-1);
  assert.equal(last.phase, 'verified'); assert.equal(last.renderSha, readinessCandidateSha);
  assert.equal(last.startingRenderDeployId, record.renderOperation.deployId);
  assert.equal(last.startingRenderSha, common.sha);
  assert.equal(last.startingBackendBindingSha256, readinessRecordDigest);
  assert.equal(last.renderOriginRunId, undefined);
  validateBaselineReceipt(f.reports, { runId: last.releaseRunId, runAttempt: 1, sha: last.executorSha }, f.state.candidate);
});

test('new-source bindings cannot select another CI, source, policy, target or alter completed history', () => {
  const f = continuationFixture(true);
  for (const edit of [q => q.sha = common.sha, q => q.ciRunAttempt++, q => q.ciRunId = common.ciRunId,
    q => q.policySha256 = 'a'.repeat(64), q => q.renderServiceId = 'srv-other', q => q.memberRelease = 'member']) {
    const q = { ...f.state.candidate }; edit(q);
    assert.throws(() => validateReadinessCandidate(q), /EXACT_SCOPE/);
  }
  const r = readinessRelease(); r.completedCarry.databaseOperationAuthorized = true;
  assert.throws(() => readinessRelease(Buffer.from(JSON.stringify(r))), /RECORD_CHANGED/);
  assert.throws(() => partialRenderReuse(partialRenderProof(), f.state.candidate, targets), /PARTIAL_RENDER_ORIGIN_CHANGED/);
});

test('the exact readiness failure still requires its authenticated unchanged archive and execution', async () => {
  for (const edit of [async f => { (await f.api.executor('/actions/artifacts/13316594385')).expired = true; },
    async f => { (await f.api.executor('/actions/artifacts/13316594385')).digest = 'sha256:' + 'a'.repeat(64); },
    async f => { (await f.api.executor('/actions/artifacts/13316594385')).workflow_run.repository_id = 1; },
    async f => { const read = f.api.artifact; f.api.artifact = (owner,id) => owner === 'executor' ? Buffer.from('altered archive') : read(owner,id); },
    async f => { const read = f.api.executor; f.api.executor = async route => { const result = await read(route);
      if (route === '/actions/runs/41822854444/attempts/1/jobs?per_page=100') result.jobs[2].steps = [];
      return result; }; }]) {
    const f = continuationFixture(true); await edit(f);
    await assert.rejects(f.execute(), /READINESS_FAILURE_|AUDIT_ARTIFACT_REQUIRED|ARTIFACT_/);
    assert.equal(f.state.providerCalls, 0); assert.equal(f.posts.length, 0);
  }
});

test('the successor never adopts an unreceipted new-SHA Render operation or repeats a rejected provider request', async () => {
  const f = continuationFixture(true);
  f.state.renderRows.push({ id:'dep-other',status:'live',commit:{id:readinessCandidateSha} });
  await assert.rejects(f.execute(), /RENDER_BASELINE_DRIFT/); assert.equal(f.posts.length, 0);
  const rejected = continuationFixture(true), read = rejected.api.render;
  let requests = 0;
  rejected.api.render = async (route, body) => { if (body) { requests++; throw Error('synthetic lost acknowledgement'); } return read(route, body); };
  await assert.rejects(rejected.execute(), /lost acknowledgement/);
  assert.equal(requests, 1); assert.equal(rejected.state.uploads.length, 0);
});

test('the successor still stops at altered schema sources, recovery expiry, financial holds or OIDC failure', async () => {
  for (const edit of [f => f.state.sourceDigests.set(readinessRelease().completedCarry.guardOverride.path, 'a'.repeat(64)),
    f => f.state.sourceDigests.set(schemaSource.migrationFiles[0].path, 'a'.repeat(64)),
    f => f.state.clock = Date.parse('2026-11-05T06:00:00Z'),
    f => f.state.vars.find(r => r.envVar.key === 'App__FinancialOperations__Enabled').envVar.value = 'true',
    f => f.api.readiness = async () => { throw Error('synthetic readiness rejection'); }]) {
    const f = continuationFixture(true); edit(f);
    await assert.rejects(f.execute(), /SOURCE_CHANGED|EVIDENCE_EXPIRED|RUNTIME_CONFIGURATION|PROTECTED_RUNTIME/);
    assert.equal(f.posts.some(p => p.provider === 'vercel'), false); assert.equal(f.state.uploads.length, 0);
  }
});

test('the actual acknowledged readiness-source deployment is reused with no Render request and fresh OIDC', async () => {
  const f=continuationFixture(true,true),plan=await evidencePlan(f.api,f.state.candidate,f.state.policy);
  assert.equal(plan.readinessRenderContinuation.runId,'41868204651');
  assert.equal(plan.readinessRenderContinuation.originalConclusion,'failure');
  assert.equal(plan.readinessRenderContinuation.terminalFailureCode,'API_REVISION_OR_RECOVERY_READINESS_FAILED');
  await f.execute();
  assert.deepEqual(f.posts.map(p=>p.provider),['vercel']);
  assert.equal(f.reports.some(r=>r.phase==='render-requesting'||r.phase==='render-requested'),false);
  const last=f.reports.at(-1);
  assert.equal(last.phase,'verified');assert.equal(last.renderDeployId,readinessContinuation().renderDeployId);
  assert.equal(last.renderOriginRunId,'41868204651');assert.equal(last.startingRenderSha,readinessCandidateSha);
  assert.equal(last.startingBackendBindingSha256,readinessContinuationDigest);
  validateBaselineReceipt(f.reports,{runId:last.releaseRunId,runAttempt:1,sha:last.executorSha},f.state.candidate);
});

test('the new-source continuation cannot change the archive, original failure, acknowledgement or disclosed limitations', async () => {
  const record=readinessContinuation();
  const archive=Buffer.from(readFileSync(new URL('./fixtures/readiness-render-41868204651-1.zip.b64',import.meta.url),'utf8'),'base64');
  assert.equal(sha256(archive),record.archiveSha256);
  for(const edit of[r=>r.renderDeployId='dep-other',r=>r.terminalFailureCode='success',
    r=>r.limitations.originalFailedHealthResponse='TRANSIENT_STARTUP_ASSUMED']){
    const r=structuredClone(record);edit(r);
    assert.throws(()=>readinessContinuation(Buffer.from(JSON.stringify(r))),/RECORD_CHANGED/);
  }
  const f=continuationFixture(true,true);
  (await f.api.executor('/actions/artifacts/'+record.artifactId)).digest='sha256:'+'a'.repeat(64);
  await assert.rejects(f.execute(),/ARTIFACT_CHANGED/);assert.equal(f.state.providerCalls,0);
});

test('new-source reuse rejects absent, wrong, inactive or duplicated live state without redeployment or frontend upload',async()=>{
  for(const edit of[f=>f.state.renderRows.shift(),f=>f.state.renderRows[0].commit.id=common.sha,
    f=>f.state.renderRows[0].status='deactivated',
    f=>{f.state.renderRows[0].status='deactivated';f.state.renderRows[1].status='live';},
    f=>f.state.renderRows.push({id:'dep-other',status:'live',commit:{id:readinessCandidateSha}})]){
    const f=continuationFixture(true,true);edit(f);
    await assert.rejects(f.execute(),/RENDER_/);assert.equal(f.posts.length,0);assert.equal(f.state.uploads.length,0);
  }
});

test('new-source reuse preserves OIDC and held operations before every frontend mutation',async()=>{
  for(const edit of[f=>f.api.readiness=async()=>{throw Error('synthetic OIDC failure');},
    f=>f.state.vars.find(v=>v.envVar.key==='App__FinancialOperations__Enabled').envVar.value='true',
    f=>f.state.clock=Date.parse('2026-11-05T06:00:00Z')]){
    const f=continuationFixture(true,true);edit(f);
    await assert.rejects(f.execute(),/PROTECTED_RUNTIME|RUNTIME_CONFIGURATION|EVIDENCE_EXPIRED/);
    assert.equal(f.posts.length,0);assert.equal(f.state.uploads.length,0);
  }
});
