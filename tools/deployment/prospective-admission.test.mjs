import assert from 'node:assert/strict';
import { test } from 'node:test';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { admissionJobName, freezeCandidate, main, requiredJobs, standingPolicy, targets } from './release-control.mjs';
import { approvedSchemaReadback, schemaSource } from './commission-schema-first.mjs';
import { approvedRecoveryReadback } from './first-release-recovery.mjs';
import { validateWeeklyReadinessFixCandidate } from './aqgreen-m55-source-successor.mjs';
import { createProspectiveAuthorization, digest, prospectiveRecovery,
  validateProspectiveFrontendComparison } from './prospective-release-recovery.mjs';
import { objectDigest, sha256, validateGitHubAdmission, verifyGitHubEvidence } from './github-evidence.mjs';
import { fixture, runnerEnv, zipFixture } from './fixtures/provider.mjs';

// Synthetic authenticated-API responses, not retained production observations.
// Only the inert git archive boundary is substituted. main(), prospective
// authentication, ZIP/digest checks, history, schema and receipt validators run.
function admissionFixture(t, { prospective = true, at = Date.parse('2026-11-13T07:00:00Z'), predecessor = false } = {}) {
  t.mock.method(Date, 'now', () => at);
  const dir = mkdtempSync(join(tmpdir(), 'aqua-prospective-admission-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const f = fixture();
  const executorSha = childProcess.execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const sourceDir = join(dir, 'source-git'), candidateDir = join(dir, 'candidate');
  mkdirSync(sourceDir); mkdirSync(candidateDir);
  const exec = childProcess.execFileSync;
  t.mock.method(childProcess, 'execFileSync', (command, args, options) => {
    if (command === 'git' && args[0] === '-C' && args[1] === sourceDir) {
      assert.deepEqual(args, ['-C', sourceDir, 'archive', '--format=tar', prospectiveRecovery.targetSha]);
      return f.state.frontendArchive;
    }
    return exec(command, args, options);
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const env = { ...runnerEnv(), GITHUB_SHA: executorSha, GITHUB_WORKFLOW_SHA: executorSha,
    GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_EVENT_PATH: join(dir, 'event.json'),
    SOURCE_DIR: sourceDir, CANDIDATE_DIR: candidateDir, GITHUB_OUTPUT: join(dir, 'output'),
    RELEASE_REPORT: join(dir, 'audit.jsonl'), AQUA_ADMISSION_RECEIPT_OUTPUT: join(dir, 'admission.json') };
  delete env.RENDER_API_KEY; delete env.VERCEL_TOKEN;
  const inputs = { ci_run_id: '43191377577', ci_run_attempt: '2', sha: prospectiveRecovery.targetSha,
    qualification_only: 'false', ...(prospective ? { prospective_mode: 'authorize',
      recovery_baseline_run_id: '5001' } : {}) };
  const q = freezeCandidate({ version: 1, repository: targets.repository, sha: inputs.sha,
    ciRunId: inputs.ci_run_id, ciRunAttempt: 2, ciUrl: 'https://github.com/example/ci' }, env,
  standingPolicy, false, 'full', prospective ? 'authorize' : 'none');
  f.state.candidate = q;
  const carry = validateWeeklyReadinessFixCandidate(q).completedCarry;
  for (const pin of [...schemaSource.migrationFiles, ...schemaSource.holdSources, ...schemaSource.cleanStartSources])
    f.state.sourceDigests.set(pin.path, carry.sourceOverrides.find(row => row.path === pin.path)?.candidateSha256 ??
      (carry.guardOverride.path === pin.path ? carry.guardOverride.candidateSha256 : pin.sha256));
  const sourceReads = [], calls = [];
  const workflowRun = (id, run_number, extra = {}) => ({ id, run_number, run_attempt: 1,
    head_sha: executorSha, head_branch: 'main', event: 'workflow_dispatch', path: '.github/workflows/deploy.yml',
    name: 'Qualified production executor', repository: { full_name: targets.executor.repository },
    head_repository: { full_name: targets.executor.repository }, ...extra });
  const current = workflowRun(456, prospective ? 3 : 2, { status: 'in_progress', actor: prospectiveRecovery.owner,
    created_at: new Date(at - 1000).toISOString() });
  const capture = workflowRun(5001, 1, { status: 'completed', conclusion: 'success', actor: prospectiveRecovery.owner });
  const incident = workflowRun(Number(prospectiveRecovery.incompleteReleaseRunId), 2, {
    run_attempt: 3, status: 'completed', conclusion: 'failure', head_sha: prospectiveRecovery.historicalAttemptExecutorSha });
  const attempts = [1, 2, 3].map(runAttempt => ({ runAttempt, runConclusion: 'failure', candidateConclusion: 'success',
    admissionConclusion: runAttempt < 3 ? 'success' : 'failure', productionConclusion: runAttempt < 3 ? 'failure' : 'skipped',
    failedStep: runAttempt < 3 ? prospectiveRecovery.historicalMutationStep : null }));
  const historicalBody = { contract: 'aqua.pinned-incomplete-release-incident', version: 1,
    runId: prospectiveRecovery.incompleteReleaseRunId, executorSha: incident.head_sha, originalOutcome: 'failure', attempts,
    auditArtifacts: { attempt1: 'unavailable', attempt2: 'unavailable', producerAuditDigest: null },
    controllerSourceSha256: prospectiveRecovery.historicalReleaseControllerSha256,
    providerEvidence: { renderServiceId: targets.render.id, renderDeploymentId: prospectiveRecovery.historicalRenderDeploymentId,
      sourceSha: prospectiveRecovery.historicalApplicationSha, status: 'deactivated', createdAt: '2026-11-09T10:25:00Z',
      vercelProjectId: targets.vercel.id, matchingVercelDeployments: 0,
      checkedCiRunId: prospectiveRecovery.historicalCiRunId, checkedSourceSha: prospectiveRecovery.historicalApplicationSha },
    observedAt: new Date(at - 2000).toISOString() };
  const baselineSha = prospectiveRecovery.currentBaselineSha;
  const health = { status: 'Healthy', buildId: baselineSha, databaseStatus: 'Healthy', redisStatus: 'Healthy',
    dataProtectionKeyStoreStatus: 'Healthy', paymentAvailability: 'Held' };
  const compare = { status: 'ahead', base_commit: { sha: baselineSha }, ahead_by: 1, behind_by: 0,
    total_commits: 1, commits: [{ sha: q.sha }], files: [{ filename: 'backend.cs', status: 'modified',
      additions: 1, deletions: 1, changes: 2 }] };
  const delta = validateProspectiveFrontendComparison(compare, baselineSha, q.sha);
  const body = { contract: 'aqua.prospective-release-baseline', version: 3, targetSha: q.sha,
    ciRunId: q.ciRunId, ciRunAttempt: q.ciRunAttempt, capturedAt: new Date(at - 2000).toISOString(),
    captureRunId: '5001', captureRunAttempt: 1, capturedByLogin: prospectiveRecovery.owner.login,
    capturedById: prospectiveRecovery.owner.id, executorSha,
    runtimeReadiness: { contract: 'aqua.production-readiness', version: 2, status: 'Ready', buildId: baselineSha,
      birdConfiguration: 'StartupValidated', yocoConfiguration: 'StartupValidated', profile: 'normal-integrated',
      restrictedOperations: 'ConfigurationHeld', d10Bindings: { requiredAssemblyDigest: '1'.repeat(64),
        requiredRuntimeAssemblyDigest: '2'.repeat(64), currentConfigurationDigest: '3'.repeat(64),
        intendedConfigurationDigest: '4'.repeat(64), intendedEnvironmentId: 'production-release', intendedBuildId: baselineSha } },
    render: { serviceId: targets.render.id, deploymentId: 'dep-current1', sourceSha: baselineSha,
      status: 'live', activeDeployments: 0, settingsDigest: '5'.repeat(64) }, health,
    vercel: { projectId: targets.vercel.id, deploymentId: 'dpl_Current1', sourceSha: null,
      sourceProvenance: 'UNVERIFIED_LEGACY', state: 'READY', activeDeployments: 0 },
    frontend: { contract: 'aqua.prospective-frontend-baseline', version: 1, comparisonBaseSha: baselineSha,
      targetSha: q.sha, totalCommits: delta.totalCommits, changedFileCount: delta.changedFileCount,
      changedFilesSha256: delta.changedFilesSha256, frontendChanged: false, reuseBaseline: true,
      productionAliasVerified: true, customDomainVerified: true, publicSiteStatus: 200,
      backendHealth: health, sourceProvenance: 'UNVERIFIED_LEGACY' },
    historicalIncident: { ...historicalBody, digest: digest(historicalBody) } };
  const boundary = { ...body, digest: digest(body) };
  inputs.recovery_baseline_sha256 = boundary.digest;
  if (!prospective) delete inputs.recovery_baseline_sha256;
  const report = structuredClone(f.state.report);
  report.context = { kind: 'ci', repository: q.repository, sha: q.sha, runId: q.ciRunId, runAttempt: 2 };
  const ci = { id: Number(q.ciRunId), run_attempt: 2, repository: { full_name: q.repository },
    head_repository: { full_name: q.repository }, event: 'push', head_branch: 'main', head_sha: q.sha,
    path: '.github/workflows/ci.yml', name: 'Continuous integration', status: 'completed', conclusion: 'success',
    updated_at: new Date(at - 3000).toISOString() };
  const jobs = (run, rows, attempt = 1) => ({ total_count: rows.length, jobs: rows.map(([name, conclusion], index) => ({
    id: index + 100, name, conclusion, status: 'completed', run_id: run.id, run_attempt: attempt,
    ...(name === 'Unattended recovery release' && conclusion === 'failure' ? {
      steps: [{ name: prospectiveRecovery.historicalMutationStep, conclusion: 'failure' }] } : {}) })) });
  const captureJobs = jobs(capture, [['Qualify immutable source candidate', 'success'],
    ['Capture prospective provider baseline', predecessor ? 'skipped' : 'success'],
    [admissionJobName, predecessor ? 'success' : 'skipped'], ['Unattended recovery release', predecessor ? 'success' : 'skipped']]);
  const priorRows = [{ ...q, releaseRunId: '5001', sha: baselineSha, phase: 'verified', renderSha: baselineSha,
    vercelSha: baselineSha, renderDeployId: 'dep-previous', vercelDeployId: 'dpl_Previous',
    renderReleaseRunAttempt: 1, vercelReleaseRunAttempt: 1 }];
  const artifactBytes = id => id === '7890' ? zipFixture('report.json', JSON.stringify(report)) : id === '8001' ?
    zipFixture('report.json', JSON.stringify(boundary)) : zipFixture('release-report.jsonl', JSON.stringify(priorRows[0]) + '\n');
  const artifact = id => ({ id: Number(id), name: id === '7890' ? `mandatory-security-${q.sha}-${q.ciRunId}-2` :
    id === '8001' ? `prospective-recovery-baseline-${q.sha}-5001-1` : 'production-release-audit-5001-1',
  expired: false, size_in_bytes: artifactBytes(id).length, digest: 'sha256:' + sha256(artifactBytes(id)),
  workflow_run: { id: id === '7890' ? ci.id : capture.id, repository_id: id === '7890' ? 789 : 987,
    head_repository_id: id === '7890' ? 789 : 987, head_sha: id === '7890' ? q.sha : executorSha, head_branch: 'main' } });
  const gh = f.api.gh, executor = f.api.executor;
  const runs = prospective ? [current, incident, capture] : [current, capture];
  f.api.gh = async route => {
    calls.push(['source', route]);
    if (route === `/actions/runs/${ci.id}`) return ci;
    if (route === `/actions/runs/${ci.id}/attempts/${ci.run_attempt}/jobs?per_page=100`) return { total_count: requiredJobs.length,
      jobs: requiredJobs.map((name, index) => ({ id: index + 100, name, status: 'completed', conclusion: 'success',
        run_id: ci.id, run_attempt: ci.run_attempt, check_run_url: `https://api.github.com/repos/${q.repository}/check-runs/${index + 200}` })) };
    if (route === `/actions/runs/${ci.id}/artifacts?per_page=100`) return { total_count: 1, artifacts: [artifact('7890')] };
    if (route === '/actions/artifacts/7890') return artifact('7890');
    if (route === '/git/ref/heads/main') return { object: { sha: q.sha } };
    if (route === `/compare/${baselineSha}...${q.sha}`) return compare;
    if (route === `/compare/${standingPolicy.firstReleaseRecovery.baseline.renderSha}...${q.sha}`)
      return { status: 'ahead', files: schemaSource.migrationFiles.map(pin => ({ filename: pin.path, status: pin.status })) };
    if (route === `/compare/${carry.operationSourceSha}...${q.sha}`) return { status: 'ahead', files: [] };
    if (route === '/pulls/1') return { ...f.state.pr, merge_commit_sha: q.sha };
    if (route === `/commits/${q.sha}/pulls?per_page=100`) return [{ ...f.state.pr, merge_commit_sha: q.sha }];
    return gh(route);
  };
  f.api.executor = async route => {
    calls.push(['executor', route]);
    if (route === '/actions/runs/456') return current;
    if (route === '/actions/runs/5001') return capture;
    if (route === '/actions/runs/5001/attempts/1/jobs?per_page=100') return captureJobs;
    if (route.startsWith('/actions/workflows/deploy.yml/runs?')) return { total_count: runs.length, workflow_runs: runs };
    if (route === '/actions/runs/5001/artifacts?per_page=100')
      return { total_count: 1, artifacts: [artifact(predecessor ? '8002' : '8001')] };
    if (route === '/actions/artifacts/8001') return artifact('8001');
    if (route === '/actions/artifacts/8002') return artifact('8002');
    const match = route.match(new RegExp(`^/actions/runs/${incident.id}/attempts/([123])(/jobs\\?per_page=100)?$`));
    if (match) return match[2] ? jobs(incident, [['Qualify immutable source candidate', 'success'],
      [admissionJobName, Number(match[1]) < 3 ? 'success' : 'failure'],
      ['Unattended recovery release', Number(match[1]) < 3 ? 'failure' : 'skipped']], Number(match[1])) :
      { ...incident, run_attempt: Number(match[1]) };
    return executor(route);
  };
  f.api.artifact = async (owner, id) => {
    calls.push(['artifact', owner, id]);
    assert.ok(owner === 'source' && id === '7890' || owner === 'executor' && ['8001', '8002'].includes(id));
    return artifactBytes(id);
  };
  for (const key of ['render', 'vercel', 'health', 'readiness', 'web', 'uploadVercel'])
    f.api[key] = async () => assert.fail('admission must not access providers');
  // main's real entry uses the default wall clock. Freeze that clock rather
  // than injecting incompatible function/numeric clocks into its callees.
  const options = { api: f.api, policy: standingPolicy,
    readSourceDigest: async path => { sourceReads.push(path); return f.readSourceDigest(path); } };
  const saveEvent = () => writeFileSync(env.GITHUB_EVENT_PATH, JSON.stringify({ inputs }));
  const prepare = async () => { saveEvent(); await main(env, { ...options, mode: 'candidate' }); };
  const admit = (extra = {}) => main(env, Object.defineProperties({ ...options, mode: 'admit' },
    Object.getOwnPropertyDescriptors(extra)));
  const readCandidate = () => JSON.parse(readFileSync(join(candidateDir, 'candidate.json')));
  const changeCandidate = edit => {
    const value = readCandidate(); edit(value); writeFileSync(join(candidateDir, 'candidate.json'), JSON.stringify(value));
  };
  return { ...f, env, inputs, options, prepare, admit, readCandidate, changeCandidate, saveEvent, q, boundary,
    current, capture, captureJobs, incident, runs, ci, report, compare, calls, sourceReads, carry, now: () => at,
    receiptExists: () => existsSync(env.AQUA_ADMISSION_RECEIPT_OUTPUT) };
}

test('main(admit) selects authenticated prospective recovery and writes a production-purpose bound receipt', async t => {
  const f = admissionFixture(t);
  await f.prepare();
  const historical = objectDigest(approvedSchemaReadback), legacy = objectDigest(approvedRecoveryReadback);
  await f.admit({ get recoveryReadback() { assert.fail('legacy recovery must not be invoked'); } });
  const q = f.readCandidate();
  assert.deepEqual(q.prospectiveRecovery.authorization, createProspectiveAuthorization(f.boundary, f.current, f.now()));
  const receipt = JSON.parse(readFileSync(f.env.AQUA_ADMISSION_RECEIPT_OUTPUT));
  const evidence = await verifyGitHubEvidence(f.api, q, standingPolicy, f.options.readSourceDigest, f.now);
  validateGitHubAdmission(receipt, q, standingPolicy, evidence, f.now);
  assert.equal(receipt.qualificationOnly, false);
  for (const key of ['sha', 'ciRunId', 'ciRunAttempt', 'executorSha', 'releaseRunId', 'releaseRunAttempt', 'policySha256'])
    assert.equal(receipt[key], q[key]);
  for (const key of ['qualificationOnly', 'executorSha', 'releaseRunAttempt', 'policySha256']) {
    const altered = { ...receipt, [key]: key === 'qualificationOnly' ? true : key === 'releaseRunAttempt' ? 2 : '0'.repeat(key === 'executorSha' ? 40 : 64) };
    assert.throws(() => validateGitHubAdmission(altered, q, standingPolicy, evidence, f.now), /ADMISSION_RECEIPT_MISMATCH/);
  }
  assert.throws(() => validateGitHubAdmission(receipt, q, standingPolicy, evidence,
    () => Date.parse(receipt.expiresAt)), /ADMISSION_RECEIPT_EXPIRED_OR_UNDATED/);
  const plan = JSON.parse(readFileSync(join(f.env.CANDIDATE_DIR, 'evidence-plan.json')));
  assert.equal(plan.baseline, null); assert.equal(plan.firstReleaseRecoveryEvidenceSha256, null);
  assert.equal(plan.prospectiveHistoricalRelease.outcome, 'incomplete');
  assert.ok(plan.prospectiveHistoricalRelease.attempts.every(row => row.auditArtifacts === 'unavailable'));
  assert.equal(f.sourceReads.filter(path => path.endsWith('/AQGreenSalesEvidencePayoutGuard.cs')).length, 1);
  assert.equal(objectDigest(approvedSchemaReadback), historical); assert.equal(objectDigest(approvedRecoveryReadback), legacy);
  assert.equal(f.posts.length, 0);
});

for (const [name, edit, code] of [
  ['wrong release owner', f => { f.current.actor = { login: 'foreign', id: 42 }; }, 'PROSPECTIVE_OWNER_AUTHORIZATION_REQUIRED'],
  ['expired owner authorization', f => { f.current.created_at = new Date(f.now() - 3601_000).toISOString(); }, 'PROSPECTIVE_OWNER_AUTHORIZATION_REQUIRED'],
  ['old-executor capture', f => { f.capture.head_sha = 'e'.repeat(40); }, 'PROSPECTIVE_BASELINE_RUN_UNAUTHENTICATED'],
  ['missing capture artifact', f => { const read = f.api.executor; f.api.executor = route => route === '/actions/runs/5001/artifacts?per_page=100' ? { total_count: 0, artifacts: [] } : read(route); }, 'PROSPECTIVE_BASELINE_ARTIFACT_UNVERIFIABLE'],
  ['corrupted archive', f => { const read = f.api.artifact; f.api.artifact = (owner, id) => id === '8001' ? Buffer.from('corrupt') : read(owner, id); }, 'PROSPECTIVE_BASELINE_ARTIFACT_UNVERIFIABLE'],
  ['capture ran production', f => { f.captureJobs.jobs.find(row => row.name === 'Unattended recovery release').conclusion = 'success'; }, 'PROSPECTIVE_BASELINE_RUN_INVALID'],
  ['stale baseline', f => { f.boundary.capturedAt = new Date(f.now() - 1801_000).toISOString(); }, 'PROSPECTIVE_BASELINE_UNVERIFIABLE'],
  ['released payment fence', f => { f.boundary.health.paymentAvailability = 'Available'; }, 'PROSPECTIVE_BASELINE_UNVERIFIABLE'],
  ['different CI binding', f => { f.boundary.ciRunAttempt = 3; const { digest: ignored, ...body } = f.boundary; f.boundary.digest = digest(body); }, 'PROSPECTIVE_BASELINE_IDENTITY_MISMATCH'],
  ['different dispatch digest', f => { f.inputs.recovery_baseline_sha256 = '0'.repeat(64); f.saveEvent(); }, 'PROSPECTIVE_BASELINE_IDENTITY_MISMATCH'],
  ['forged frozen authorization', f => f.changeCandidate(q => { q.prospectiveRecovery.authorization.releaseRunId = '999'; }), 'PROSPECTIVE_AUTHORIZATION_ARTIFACT_MISMATCH'],
  ['missing frozen proof', f => f.changeCandidate(q => { delete q.prospectiveRecovery; }), 'CANDIDATE_MODE_OR_AUTHORIZATION_MISMATCH'],
  ['missing separate proof file', f => rmSync(join(f.env.CANDIDATE_DIR, 'prospective-recovery.json')), 'PROSPECTIVE_AUTHORIZATION_ARTIFACT_REQUIRED']
]) test(`main(admit) fails closed: ${name}`, async t => {
  const f = admissionFixture(t); await f.prepare(); edit(f);
  await assert.rejects(f.admit(), { message: code }); assert.equal(f.receiptExists(), false);
});

test('main(admit) rejects an unverified dispatch object rather than treating it as prospective eligibility', async t => {
  const f = admissionFixture(t); await f.prepare();
  f.inputs.prospectiveRecovery = f.readCandidate().prospectiveRecovery; f.saveEvent();
  await assert.rejects(f.admit(), /EXECUTOR_INPUT_INVALID/); assert.equal(f.receiptExists(), false);
});

for (const [name, edit, code] of [
  ['unapproved security source', f => { f.state.sourceDigests.set('tools/deployment/mandatory-security-tests.json', '0'.repeat(64)); }, 'MANDATORY_SOURCE_CHANGED'],
  ['skipped mandatory case', f => { f.report.results[0].outcome = 'skipped'; }, 'MANDATORY_EXECUTION_NOT_QUALIFIED'],
  ['stale application CI', f => { f.ci.updated_at = new Date(f.now() - 86401_000).toISOString(); }, 'CI_EVIDENCE_STALE_OR_UNDATED'],
  ['different pinned CI attempt', f => { f.ci.run_attempt = 3; }, 'CI_EVENT_PROVENANCE_MISMATCH'],
  ['release history gap', f => { f.runs.splice(f.runs.indexOf(f.capture), 1); }, 'RELEASE_HISTORY_GAP_RECONCILE'],
  ['concurrent release', f => { f.incident.status = 'in_progress'; }, 'CONCURRENT_RELEASE_RUN'],
  ['changed incomplete-incident outcome', f => { const read = f.api.executor; f.api.executor = async route => {
    const value = await read(route);
    if (route === `/actions/runs/${f.incident.id}/attempts/1/jobs?per_page=100`)
      value.jobs.find(row => row.name === 'Unattended recovery release').conclusion = 'skipped';
    return value;
  }; }, 'PROSPECTIVE_HISTORICAL_RELEASE_STATE_CHANGED'],
  ['altered M55 readback', f => { const value = structuredClone(approvedSchemaReadback); value.observation.controls.financialOperationsHeld = false; f.options.schemaReadback = value; }, 'SCHEMA_EVIDENCE_CHANGED'],
  ['missing M55 operation ancestry', f => { const read = f.api.gh; f.api.gh = async route =>
    route === `/compare/${f.carry.operationSourceSha}...${f.q.sha}` ? { status: 'behind', files: [] } : read(route);
  }, 'COMPLETED_M55_CANDIDATE_ANCESTRY_REQUIRED'],
  ['unapproved migration delta', f => { const read = f.api.gh; f.api.gh = async route => {
    const value = await read(route);
    if (route === `/compare/${standingPolicy.firstReleaseRecovery.baseline.renderSha}...${f.q.sha}`)
      value.files.push({ filename: 'src/Migrations/Unauthorized.cs', status: 'added' });
    return value;
  }; }, 'SCHEMA_MIGRATION_NOT_APPROVED'],
  ['tampered inert source archive', f => writeFileSync(join(f.env.CANDIDATE_DIR, 'source.tar'), 'tampered'), 'CANDIDATE_CONTENT_MISMATCH'],
  ['self-consistent foreign archive', f => {
    const foreign = Buffer.from('foreign archive'); writeFileSync(join(f.env.CANDIDATE_DIR, 'source.tar'), foreign);
    f.changeCandidate(q => { q.sourceSha256 = sha256(foreign); });
  }, 'CANDIDATE_NOT_QUALIFIED_GIT_SOURCE'],
  ['qualification receipt substitution', f => f.changeCandidate(q => { q.qualificationOnly = true; }), 'CANDIDATE_PURPOSE_MISMATCH']
]) test(`main(admit) preserves ${name} protection`, async t => {
  const f = admissionFixture(t); await f.prepare(); edit(f);
  await assert.rejects(f.admit(), { message: code }); assert.equal(f.receiptExists(), false);
});

test('main(admit) still checks all 25 source, M55, financial and payout guard pins with prospective recovery', async t => {
  const f = admissionFixture(t); await f.prepare();
  for (const pin of [...schemaSource.migrationFiles, ...schemaSource.holdSources, ...schemaSource.cleanStartSources]) {
    const original = f.state.sourceDigests.get(pin.path); f.state.sourceDigests.set(pin.path, '0'.repeat(64));
    await assert.rejects(f.admit(), /MANDATORY_SOURCE_CHANGED|SCHEMA_OR_PAYOUT_GUARD_SOURCE_CHANGED/);
    assert.equal(f.receiptExists(), false); f.state.sourceDigests.set(pin.path, original);
  }
});

test('main(admit) without prospective evidence retains the original legacy expiry', async t => {
  const f = admissionFixture(t, { prospective: false }); await f.prepare();
  // Neither a flag in a stored artifact nor an unrelated option can select a
  // recovery path; main reconstructs and authenticates the qualified identity.
  f.changeCandidate(q => { q.prospectiveRecovery = { verified: true }; });
  await assert.rejects(f.admit(), /PROSPECTIVE_AUTHORIZATION_ARTIFACT_MISMATCH/);
  f.changeCandidate(q => { delete q.prospectiveRecovery; });
  await assert.rejects(f.admit(), /FIRST_RELEASE_RECOVERY_EVIDENCE_EXPIRED/);
  assert.equal(f.receiptExists(), false);
});

test('main(admit) retains legacy exact scope at the unchanged observation original valid interval', async t => {
  const f = admissionFixture(t, { prospective: false, at: Date.parse(approvedRecoveryReadback.observation.observedAt) + 1000 });
  await f.prepare();
  await assert.rejects(f.admit(), /NATIVE_RECOVERY_EXACT_SCOPE_REQUIRED/);
  assert.equal(f.receiptExists(), false);
});

test('main(admit) retains the legacy immutable-readback provenance digest', async t => {
  const f = admissionFixture(t, { prospective: false }); await f.prepare();
  const changed = structuredClone(approvedRecoveryReadback);
  changed.observation.observer.id = 42;
  await assert.rejects(f.admit({ recoveryReadback: changed }), /FIRST_RELEASE_RECOVERY_EVIDENCE_CHANGED/);
  assert.equal(f.receiptExists(), false);
});

test('main(admit) with an authenticated verified predecessor does not invoke first-release recovery', async t => {
  const f = admissionFixture(t, { prospective: false, predecessor: true }); await f.prepare();
  await f.admit({ get recoveryReadback() { assert.fail('verified predecessor does not use first-release recovery'); } });
  const plan = JSON.parse(readFileSync(join(f.env.CANDIDATE_DIR, 'evidence-plan.json')));
  assert.equal(plan.baseline.runId, '5001'); assert.equal(plan.verifiedReleases.length, 1);
  assert.equal(plan.firstReleaseRecoveryEvidenceSha256, null); assert.equal(f.receiptExists(), true);
});
