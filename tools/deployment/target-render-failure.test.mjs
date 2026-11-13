import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fixture } from './fixtures/provider.mjs';
import { targets, standingPolicy, freezeCandidate, evidencePlan, deploy, createAuditWriter,
  validateBaselineReceipt, validateResumeReceipt, admissionJobName } from './release-control.mjs';
import { schemaSource } from './commission-schema-first.mjs';
import { validateWeeklyReadinessFixCandidate } from './aqgreen-m55-source-successor.mjs';
import { createGitHubAdmission, verifyGitHubEvidence, objectDigest, sha256 } from './github-evidence.mjs';
import { cleanStartRuntimeSettings } from './runtime-readiness.mjs';
import { createProspectiveAuthorization, digest, prospectiveRecovery } from './prospective-release-recovery.mjs';
import { validateTargetFailureRecord, validateHistoricalContext, validateHistoricalArtifact,
  validateHistoricalAudit, selectTargetFailure } from './historical-release-reconciliation.mjs';

const record = validateTargetFailureRecord(), pin = record.run, identity = record.originalIdentity;
const archive = Buffer.from(readFileSync(new URL('./fixtures/failed-render-43397240173-1.zip.b64', import.meta.url), 'utf8'), 'base64');
const report = execFileSync('funzip', [], { input: archive, maxBuffer: 1024 * 1024 });
const rows = report.toString().trim().split('\n').map(JSON.parse);
const descriptor = { runId: pin.runId, runAttempt: 1, sha: pin.executorSha, artifactId: pin.artifactId };
const metadata = () => ({ id: Number(pin.artifactId), name: `production-release-audit-${pin.runId}-1`,
  digest: 'sha256:' + pin.archiveSha256, expired: false, size_in_bytes: archive.length,
  workflow_run: { id: Number(pin.runId), head_sha: pin.executorSha, head_branch: 'main',
    repository_id: 1423239668, head_repository_id: 1423239668 } });

// Offline orchestration fixture: original audit bytes; synthetic current CI,
// prospective authorization, Git archive label and provider responses. No live
// provider or source code is executed. main's archive boundary has separate tests.
function targetFixture(t) {
  const at = Date.parse('2026-11-13T11:00:00Z');
  t.mock.method(Date, 'now', () => at);
  const f = fixture(), gh = f.api.gh, executor = f.api.executor, artifact = f.api.artifact;
  f.state.policy = structuredClone(standingPolicy);
  f.state.candidate = freezeCandidate({ version: 1, repository: identity.repository, sha: identity.sha,
    ciRunId: identity.ciRunId, ciRunAttempt: identity.ciRunAttempt }, f.state.env, f.state.policy, false, 'full', 'authorize');
  const q = f.state.candidate, carry = validateWeeklyReadinessFixCandidate(q).completedCarry;
  const tar = Buffer.from(f.state.frontendArchive);
  const oldSha = execFileSync('git', ['get-tar-commit-id'], { input: tar.subarray(0, 1024) }).toString().trim();
  const label = tar.indexOf(Buffer.from('comment=' + oldSha)); assert.ok(label >= 512 && label < 1024);
  tar.write(q.sha, label + 'comment='.length, 'ascii'); f.state.frontendArchive = tar;
  f.state.main = q.sha; f.state.pr.merge_commit_sha = q.sha;
  f.state.report.context = { kind: 'ci', repository: q.repository, sha: q.sha, runId: q.ciRunId, runAttempt: q.ciRunAttempt };
  for (const p of [...schemaSource.migrationFiles, ...schemaSource.holdSources, ...schemaSource.cleanStartSources])
    f.state.sourceDigests.set(p.path, carry.sourceOverrides.find(x => x.path === p.path)?.candidateSha256 ??
      (carry.guardOverride.path === p.path ? carry.guardOverride.candidateSha256 : p.sha256));
  f.state.vars.push({ envVar: { key: 'App__AQGreenV2__Commissioning__AdmissionMode', value: 'CLEAN_START' } },
    { envVar: { key: 'App__AutomaticPayouts__Enabled', value: 'false' } });
  f.state.project.targets.production.id = record.baseline.vercelDeployId;
  f.state.renderRows = [
    { id: record.renderOperation.deployId, status: 'update_failed', commit: { id: q.sha } },
    { id: record.baseline.renderDeployId, status: 'live', commit: { id: record.baseline.renderSha } }
  ];
  const run = (id, number, extra = {}) => ({ id, run_number: number, run_attempt: 1, head_sha: q.executorSha,
    head_branch: 'main', event: 'workflow_dispatch', path: '.github/workflows/deploy.yml', name: 'Qualified production executor',
    repository: { full_name: targets.executor.repository }, head_repository: { full_name: targets.executor.repository }, ...extra });
  const original = run(Number(pin.runId), 79, { head_sha: pin.executorSha, status: 'completed', conclusion: 'failure', actor: pin.actor });
  const incident = run(Number(prospectiveRecovery.incompleteReleaseRunId), 54, { head_sha: prospectiveRecovery.historicalAttemptExecutorSha,
    run_attempt: 3, status: 'completed', conclusion: 'failure' });
  const current = run(Number(q.releaseRunId), 80, { status: 'in_progress', actor: prospectiveRecovery.owner,
    created_at: new Date(at - 1000).toISOString() });
  const history = Array.from({ length: 80 }, (_, i) => i === 79 ? current : i === 78 ? original : i === 53 ? incident :
    run(10000 + i, i + 1, { status: 'completed', conclusion: 'success' }));
  const incidentBody = { contract: 'aqua.pinned-incomplete-release-incident', version: 1,
    runId: String(incident.id), executorSha: incident.head_sha, originalOutcome: 'failure',
    attempts: [1, 2, 3].map(runAttempt => ({ runAttempt, runConclusion: 'failure', candidateConclusion: 'success',
      admissionConclusion: runAttempt < 3 ? 'success' : 'failure', productionConclusion: runAttempt < 3 ? 'failure' : 'skipped',
      failedStep: runAttempt < 3 ? prospectiveRecovery.historicalMutationStep : null })),
    auditArtifacts: { attempt1: 'unavailable', attempt2: 'unavailable', producerAuditDigest: null },
    controllerSourceSha256: prospectiveRecovery.historicalReleaseControllerSha256,
    providerEvidence: { renderServiceId: targets.render.id, renderDeploymentId: prospectiveRecovery.historicalRenderDeploymentId,
      sourceSha: prospectiveRecovery.historicalApplicationSha, status: 'deactivated', createdAt: '2026-11-09T10:32:59.90393Z',
      vercelProjectId: targets.vercel.id, matchingVercelDeployments: 0, checkedCiRunId: prospectiveRecovery.historicalCiRunId,
      checkedSourceSha: prospectiveRecovery.historicalApplicationSha }, observedAt: new Date(at).toISOString() };
  const health = sha => ({ status: 'Healthy', buildId: sha, databaseStatus: 'Healthy',
    redisStatus: 'Healthy', dataProtectionKeyStoreStatus: 'Healthy', paymentAvailability: 'Held' });
  const readiness = sha => ({ contract: 'aqua.production-readiness', version: 2, status: 'Ready', buildId: sha,
    birdConfiguration: 'StartupValidated', yocoConfiguration: 'StartupValidated', profile: 'normal-integrated',
    restrictedOperations: 'ConfigurationHeld', d10Bindings: { requiredAssemblyDigest: '1'.repeat(64), requiredRuntimeAssemblyDigest: '2'.repeat(64),
      currentConfigurationDigest: '3'.repeat(64), intendedConfigurationDigest: '4'.repeat(64), intendedEnvironmentId: 'production-release', intendedBuildId: sha } });
  const body = { contract: 'aqua.prospective-release-baseline', version: 3, targetSha: q.sha, ciRunId: q.ciRunId,
    ciRunAttempt: q.ciRunAttempt, capturedAt: new Date(at - 2000).toISOString(), captureRunId: '5001', captureRunAttempt: 1,
    capturedByLogin: current.actor.login, capturedById: current.actor.id, executorSha: q.executorSha,
    runtimeReadiness: readiness(record.baseline.renderSha), render: { serviceId: targets.render.id,
      deploymentId: record.baseline.renderDeployId, sourceSha: record.baseline.renderSha, status: 'live', activeDeployments: 0,
      settingsDigest: digest([...Object.entries(cleanStartRuntimeSettings).map(([key, values]) => ({ key, value: values[0] })),
        { key: 'App__AutomaticPayouts__Enabled', value: 'false' }]) }, health: health(record.baseline.renderSha),
    vercel: { projectId: targets.vercel.id, deploymentId: record.baseline.vercelDeployId, sourceSha: null,
      sourceProvenance: 'UNVERIFIED_LEGACY', state: 'READY', activeDeployments: 0 },
    frontend: { contract: 'aqua.prospective-frontend-baseline', version: 1, comparisonBaseSha: record.baseline.renderSha,
      targetSha: q.sha, totalCommits: 2, changedFileCount: 2, changedFilesSha256: '5'.repeat(64), frontendChanged: false,
      reuseBaseline: true, productionAliasVerified: true, customDomainVerified: true, publicSiteStatus: 200,
      backendHealth: health(record.baseline.renderSha), sourceProvenance: 'UNVERIFIED_LEGACY' },
    historicalIncident: { ...incidentBody, digest: digest(incidentBody) } };
  const boundary = { ...body, digest: digest(body) };
  f.state.candidate = { ...q, prospectiveRecovery: { boundary, authorization: createProspectiveAuthorization(boundary, current, at) } };
  const sourceMeta = async () => ({ ...await gh('/actions/artifacts/7890'),
    name: `mandatory-security-${q.sha}-${q.ciRunId}-${q.ciRunAttempt}`, workflow_run: { id: Number(q.ciRunId),
      head_sha: q.sha, head_branch: 'main', repository_id: 789, head_repository_id: 789 } });
  f.api.gh = async route => {
    if (route === `/actions/runs/${q.ciRunId}`) return { ...await gh('/actions/runs/123'), id: Number(q.ciRunId),
      run_attempt: q.ciRunAttempt, head_sha: q.sha, updated_at: new Date(at - 1000).toISOString() };
    if (route === `/actions/runs/${q.ciRunId}/attempts/${q.ciRunAttempt}/jobs?per_page=100`) {
      const page = await gh('/actions/runs/123/attempts/1/jobs?per_page=100');
      return { ...page, jobs: page.jobs.map(j => ({ ...j, run_id: Number(q.ciRunId), run_attempt: q.ciRunAttempt })) };
    }
    if (route === `/actions/runs/${q.ciRunId}/artifacts?per_page=100`) return { total_count: 1, artifacts: [await sourceMeta()] };
    if (route === '/actions/artifacts/7890') return sourceMeta();
    if (route === `/compare/${carry.operationSourceSha}...${q.sha}`) return { status: 'ahead', files: [] };
    if (route === `/compare/${standingPolicy.firstReleaseRecovery.baseline.renderSha}...${q.sha}`)
      return { status: 'ahead', files: schemaSource.migrationFiles.map(p => ({ filename: p.path, status: p.status })) };
    return gh(route);
  };
  const jobPage = (r, attempt = 1) => {
    const isOriginal = r.id === original.id, isIncident = r.id === incident.id;
    const names = ['Qualify immutable source candidate', admissionJobName, 'Unattended recovery release',
      ...(isOriginal ? ['Capture prospective provider baseline'] : [])];
    return { total_count: names.length, jobs: names.map(name => ({ name, run_id: r.id, run_attempt: attempt,
      status: 'completed', conclusion: name === names[0] ? 'success' : name === admissionJobName ?
        isIncident && attempt === 3 ? 'failure' : 'success' : name === 'Capture prospective provider baseline' ? 'skipped' :
        isOriginal || isIncident && attempt < 3 ? 'failure' : 'skipped',
      ...(name === 'Unattended recovery release' && (isOriginal || isIncident && attempt < 3) ? { steps: [{
        name: prospectiveRecovery.historicalMutationStep, conclusion: 'failure' }] } : {}) })) };
  };
  f.state.original = original; f.state.meta = metadata(); f.state.archive = archive;
  f.api.executor = async route => {
    if (route === '') return { id: 1423239668 };
    if (route === `/actions/runs/${q.releaseRunId}`) return current;
    if (route.startsWith('/actions/workflows/deploy.yml/runs?')) return { total_count: history.length, workflow_runs: history };
    if (route === `/actions/runs/${pin.runId}/artifacts?per_page=100`) return { total_count: 1, artifacts: [f.state.meta] };
    if (route === `/actions/artifacts/${pin.artifactId}`) return f.state.meta;
    const match = route.match(/^\/actions\/runs\/(\d+)\/attempts\/(\d+)(\/jobs\?per_page=100)?$/);
    if (match && match[1] !== q.releaseRunId) {
      const r = history.find(r => r.id === Number(match[1])); assert.ok(r);
      return match[3] ? jobPage(r, Number(match[2])) : { ...r, run_attempt: Number(match[2]) };
    }
    return executor(route);
  };
  f.api.artifact = (owner, id) => owner === 'executor' && id === pin.artifactId ? f.state.archive : artifact(owner, id);
  const render = f.api.render;
  f.state.historyReads = 0;
  f.api.render = async (route, body) => {
    if (body) {
      f.posts.push({ provider: 'render', route, body });
      f.state.newRender = { id: 'dep-new', status: 'build_in_progress', commit: { id: q.sha } };
      f.state.renderRows.unshift(f.state.newRender); return structuredClone(f.state.newRender);
    }
    if (route.endsWith('/deploys?limit=100')) {
      f.state.historyReads++; f.beforeHistory?.(f.state.historyReads);
      return f.state.renderRows.map(deploy => ({ deploy: structuredClone(deploy) }));
    }
    if (route.endsWith('/deploys/dep-new')) {
      f.state.newRender.status = 'live';
      for (const d of f.state.renderRows) if (d.id !== 'dep-new' && d.status === 'live') d.status = 'deactivated';
    }
    const d = f.state.renderRows.find(d => route.endsWith('/deploys/' + d.id));
    return d ? structuredClone(d) : render(route);
  };
  const vercel = f.api.vercel;
  f.api.vercel = async (route, body) => {
    assert.equal(body, undefined, 'the accepted prospective frontend is reused, never redeployed');
    if (route === `/v13/deployments/${record.baseline.vercelDeployId}`) return { id: record.baseline.vercelDeployId,
      projectId: targets.vercel.id, target: 'production', readyState: 'READY', gitSource: null };
    if (route === `/v2/deployments/${record.baseline.vercelDeployId}/aliases`)
      return { aliases: [{ alias: 'www.aqualifestyleclub.co.za' }] };
    if (route.endsWith('/domains/www.aqualifestyleclub.co.za')) return { name: 'www.aqualifestyleclub.co.za', projectId: targets.vercel.id, verified: true };
    return vercel(route);
  };
  f.api.web = async () => 200;
  f.api.webHealth = async () => health(f.state.newRender?.status === 'live' ? q.sha : record.baseline.renderSha);
  f.api.health = async () => ({ status: 200, recovery: null, body: { ...await f.api.webHealth(), environment: 'Production' } });
  f.api.readiness = async sha => ({ status: 200, body: readiness(sha) });
  f.api.uploadVercel = async () => assert.fail('no frontend upload');
  f.execute = async () => {
    const candidate = f.state.candidate;
    const evidence = await verifyGitHubEvidence(f.api, candidate, standingPolicy, f.readSourceDigest);
    const admissionReceipt = createGitHubAdmission(candidate, standingPolicy, evidence);
    const plan = await evidencePlan(f.api, candidate, standingPolicy);
    await deploy(f.api, candidate, standingPolicy, createAuditWriter(candidate, row => f.reports.push(row)), {
      env: f.state.env, evidencePlan: plan, admissionReceipt, readSourceDigest: f.readSourceDigest,
      frontendArchive: f.state.frontendArchive, attempts: 2, pause: async () => {} });
  };
  return f;
}

test('original acknowledged failure is authenticated as failed history, never a predecessor or continuation', async t => {
  const f = targetFixture(t), q = f.state.candidate;
  assert.equal(sha256(archive), pin.archiveSha256); assert.equal(sha256(report), pin.reportSha256);
  assert.equal(objectDigest(rows), pin.rowsSha256);
  const production = { name: 'Unattended recovery release', run_id: Number(pin.runId), run_attempt: 1,
    status: 'completed', conclusion: 'failure', steps: [{ name: prospectiveRecovery.historicalMutationStep, conclusion: 'failure' }] };
  assert.deepEqual(validateHistoricalContext(f.state.original, 1, production, q, targets), pin);
  validateHistoricalArtifact(pin, descriptor, metadata());
  const proof = validateHistoricalAudit(rows, descriptor, pin, targets);
  assert.equal(selectTargetFailure([proof], q, targets), proof);
  for (const key of ['mutationFree', 'successfulFullReleasePredecessor', 'retryOrContinuationAuthority', 'replayAuthority', 'deploymentAuthority'])
    assert.equal(proof[key], false);
  assert.throws(() => validateBaselineReceipt(rows, descriptor, q));
  assert.throws(() => validateResumeReceipt(rows, { ...q, releaseRunAttempt: 2 }));
  const plan = await evidencePlan(f.api, q, standingPolicy);
  assert.deepEqual(plan.historicalReconciliations, [proof]); assert.equal(plan.baseline, null);
  assert.equal(plan.resume, null); assert.equal(plan.partialRenderContinuation, undefined);
  assert.equal(plan.prospectiveHistoricalRelease.runId, prospectiveRecovery.incompleteReleaseRunId);
  assert.equal(plan.prospectiveHistoricalRelease.outcome, 'incomplete');
});

test('both collision guards permit only the reconciled failed ID; one new Render operation can complete', async t => {
  const f = targetFixture(t); await f.execute();
  assert.deepEqual(f.posts.map(p => [p.provider, p.body.commitId]), [['render', identity.sha]]);
  const last = f.reports.at(-1);
  assert.equal(last.phase, 'verified'); assert.equal(last.renderDeployId, 'dep-new');
  assert.notEqual(last.renderDeployId, record.renderOperation.deployId);
  assert.equal(last.renderSha, identity.sha); assert.equal(last.vercelBaselineReused, true);
  assert.equal(f.reports.find(row => row.phase === 'evidence-selected').reconciledTargetFailure.renderDeployId,
    record.renderOperation.deployId);
});

for (const [name, edit] of [
  ['missing failed ID', f => f.state.renderRows.shift()],
  ['changed failed source', f => { f.state.renderRows[0].commit.id = 'a'.repeat(40); }],
  ['changed terminal outcome', f => { f.state.renderRows[0].status = 'build_failed'; }],
  ['active failed operation', f => { f.state.renderRows[0].status = 'update_in_progress'; }],
  ['foreign target operation', f => f.state.renderRows.push({ id: 'dep-foreign', status: 'update_failed', commit: { id: identity.sha } })],
  ['competing operation', f => f.state.renderRows.push({ id: 'dep-pending', status: 'queued', commit: { id: 'a'.repeat(40) } })],
  ['duplicate ID', f => f.state.renderRows.push(structuredClone(f.state.renderRows[0]))],
  ['baseline source drift', f => { f.beforeHistory = count => { if (count === 1) f.state.renderRows[1].commit.id = 'a'.repeat(40); }; }]
]) test(`live collision validation rejects ${name} before POST`, async t => {
  const f = targetFixture(t); edit(f);
  await assert.rejects(f.execute(), /RECONCILED_TARGET_FAILURE_STATE_CHANGED|RENDER_PROVENANCE_RECEIPT_REQUIRED/);
  assert.equal(f.posts.length, 0);
});

test('the immediate pre-POST check rejects terminal-state and new-target drift after initial validation', async t => {
  const f = targetFixture(t);
  f.beforeHistory = count => { if (count === 2) f.state.renderRows[0].status = 'update_in_progress'; };
  await assert.rejects(f.execute(), /RECONCILED_TARGET_FAILURE_STATE_CHANGED/); assert.equal(f.posts.length, 0);
});

test('pre-POST target collision guard still rejects another terminal failure of the same source', async t => {
  const f = targetFixture(t);
  f.beforeHistory = count => { if (count === 2) f.state.renderRows.push({ id: 'dep-other', status: 'update_failed', commit: { id: identity.sha } }); };
  await assert.rejects(f.execute(), /RENDER_CHANGED_BEFORE_REQUEST/); assert.equal(f.posts.length, 0);
});

test('unknown provider states still deny without a provider mutation', async t => {
  const f = targetFixture(t); f.state.renderRows[0].status = 'unknown';
  await assert.rejects(f.execute(), /UNKNOWN_RENDER_DEPLOYMENT_STATE/); assert.equal(f.posts.length, 0);
});

test('record, original artifact, candidate, audit and proof substitutions cannot gain reconciliation', async t => {
  const f = targetFixture(t), q = f.state.candidate;
  const changed = structuredClone(record); changed.mutationFree = true;
  assert.throws(() => validateTargetFailureRecord(Buffer.from(JSON.stringify(changed))), /TARGET_FAILURE_RECORD_CHANGED/);
  for (const edit of [m => { m.expired = true; }, m => { m.digest = 'sha256:' + '0'.repeat(64); }, m => { m.workflow_run.repository_id = 1; }]) {
    const m = metadata(); edit(m); assert.throws(() => validateHistoricalArtifact(pin, descriptor, m), /TARGET_FAILURE_ORIGINAL_ARTIFACT_REQUIRED/);
  }
  for (const edit of [a => { a.at(-1).code = 'PROVIDER_READ_REJECTED'; }, a => { a[25].renderDeployId = 'dep-other'; }, a => { a.push({ ...a.at(-1), phase: 'verified' }); }]) {
    const a = structuredClone(rows); edit(a); assert.throws(() => validateHistoricalAudit(a, descriptor, pin, targets), /TARGET_FAILURE_ORIGINAL_AUDIT_REQUIRED/);
  }
  const proof = validateHistoricalAudit(rows, descriptor, pin, targets);
  const production = { name: 'Unattended recovery release', run_id: Number(pin.runId), run_attempt: 1,
    status: 'completed', conclusion: 'failure', steps: [{ name: prospectiveRecovery.historicalMutationStep, conclusion: 'failure' }] };
  for (const edit of [r => { r.run_attempt = 2; }, r => { r.head_sha = 'a'.repeat(40); },
    r => { r.actor = { login: 'foreign', id: 1 }; }, r => { r.conclusion = 'success'; }]) {
    const r = structuredClone(f.state.original); edit(r);
    assert.throws(() => validateHistoricalContext(r, 1, production, q, targets), /TARGET_FAILURE_EXECUTION_CHANGED/);
  }
  for (const edit of [x => { x.sha = 'a'.repeat(40); }, x => { x.memberRelease = 'member'; }, x => { x.releaseRunAttempt = 2; },
    x => { x.prospectiveRecovery.boundary.render.deploymentId = 'dep-other'; }, x => { x.policySha256 = '0'.repeat(64); }]) {
    const x = structuredClone(q); edit(x); assert.throws(() => selectTargetFailure([proof], x, targets), /TARGET_FAILURE_CANDIDATE_OR_BASELINE_CHANGED/);
  }
  assert.throws(() => selectTargetFailure([{ ...proof, terminalState: 'live' }], q, targets), /TARGET_FAILURE_PROOF_CHANGED/);
  f.state.archive = Buffer.from('corrupt archive');
  await assert.rejects(evidencePlan(f.api, q, standingPolicy), /GITHUB_ARTIFACT_DIGEST_MISMATCH/);
});
