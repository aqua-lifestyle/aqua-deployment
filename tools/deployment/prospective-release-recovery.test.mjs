import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanStartRuntimeSettings } from './runtime-readiness.mjs';
import { schemaSource, verifySchemaFirst, validateCompletedCandidateCarryForward } from './commission-schema-first.mjs';
import { admissionJobName, ReleaseFailure, safeBaselineDiagnostic, targets, validateAdmissionJob,
  validateDispatchInputs, evidencePlan, policyDigest, standingPolicy } from './release-control.mjs';
import { captureProspectiveBaseline, classifyPinnedIncompleteAttempt, createProspectiveAuthorization,
  digest, ProspectiveBaselineDenied, prospectiveBaselinePhases, prospectiveRecovery, prospectiveSettingKeys,
  selectPinnedHistoricalRenderDeployment,
  validateD10RuntimeEvidence, validatePinnedHistoricalIncidentEvidence, validateProspectiveAuthorization,
  validateProspectiveBaseline, validateProspectiveFrontendComparison } from './prospective-release-recovery.mjs';

const now = Date.parse('2026-11-12T16:00:00.000Z');
const owner = { login: 'aqualifestyleclub', id: 307076734 };
const targetSha = prospectiveRecovery.targetSha;
const baselineSha = prospectiveRecovery.currentBaselineSha;
const executorSha = 'f'.repeat(40);
const renderService = { id: targets.render.id, name: targets.render.name,
  repo: `https://github.com/${targets.repository}`, branch: 'main', suspended: 'not_suspended',
  autoDeployTrigger: 'off', autoDeploy: 'no', rootDir: '', serviceDetails: { runtime: 'docker',
    healthCheckPath: '/api/health', envSpecificDetails: { dockerContext: '.', dockerfilePath: './docker/api/Dockerfile',
      preDeployCommand: '', dockerCommand: '' } } };
const healthFor = buildId => ({ status: 'Healthy', buildId, databaseStatus: 'Healthy', redisStatus: 'Healthy',
  dataProtectionKeyStoreStatus: 'Healthy', paymentAvailability: 'Held' });
const run = { id: 5001, run_attempt: 1, event: 'workflow_dispatch', head_branch: 'main', status: 'in_progress',
  head_sha: executorSha, actor: owner };
const candidate = { sha: targetSha, ciRunId: '43191377577', ciRunAttempt: 2, executorSha };
const runtimeReadiness = buildId => ({ status: 200, body: { contract: 'aqua.production-readiness', version: 2,
  status: 'Ready', buildId, birdConfiguration: 'StartupValidated', yocoConfiguration: 'StartupValidated',
  profile: 'normal-integrated', restrictedOperations: 'ConfigurationHeld', d10Bindings: {
    requiredAssemblyDigest: '1'.repeat(64), requiredRuntimeAssemblyDigest: '2'.repeat(64),
    currentConfigurationDigest: '3'.repeat(64), intendedConfigurationDigest: '4'.repeat(64),
    intendedEnvironmentId: 'production-release', intendedBuildId: buildId } } });

function historicalIncident(at = now) {
  const attempts = [1, 2, 3].map(runAttempt => ({ runAttempt, runConclusion: 'failure', candidateConclusion: 'success',
    admissionConclusion: runAttempt < 3 ? 'success' : 'failure',
    productionConclusion: runAttempt < 3 ? 'failure' : 'skipped',
    failedStep: runAttempt < 3 ? prospectiveRecovery.historicalMutationStep : null }));
  const body = { contract: 'aqua.pinned-incomplete-release-incident', version: 1,
    runId: prospectiveRecovery.incompleteReleaseRunId,
    executorSha: prospectiveRecovery.historicalAttemptExecutorSha, originalOutcome: 'failure', attempts,
    auditArtifacts: { attempt1: 'unavailable', attempt2: 'unavailable', producerAuditDigest: null },
    controllerSourceSha256: prospectiveRecovery.historicalReleaseControllerSha256,
    providerEvidence: { renderServiceId: prospectiveRecovery.renderServiceId,
      renderDeploymentId: prospectiveRecovery.historicalRenderDeploymentId,
      sourceSha: prospectiveRecovery.historicalApplicationSha, status: 'deactivated',
      createdAt: '2026-11-09T10:25:00.000Z', vercelProjectId: prospectiveRecovery.vercelProjectId,
      matchingVercelDeployments: 0, checkedCiRunId: prospectiveRecovery.historicalCiRunId,
      checkedSourceSha: prospectiveRecovery.historicalApplicationSha },
    observedAt: new Date(at).toISOString() };
  return { ...body, digest: digest(body) };
}

const historicalJobNames = ['Qualify immutable source candidate', admissionJobName, 'Unattended recovery release'];
function providerFixture(overrides = {}) {
  const settings = [...Object.entries(cleanStartRuntimeSettings).map(([key, values]) => ({ key, value: values[0] })),
    { key: 'App__AutomaticPayouts__Enabled', value: 'false' }];
  const renderHistory = [
    { id: 'dep-current1', status: 'live', commit: { id: baselineSha } },
    { id: prospectiveRecovery.historicalRenderDeploymentId, status: 'deactivated',
      commit: { id: prospectiveRecovery.historicalApplicationSha } }
  ];
  const vercelHistory = [{ uid: 'dpl_current1', state: 'READY', meta: {}, created: now - 86_400_000 }];
  const calls = [];
  const files = [
    { filename: 'AqualLifeStyle/9.4.2/aspnet-core/src/AqualLifeStyle.Application/Program.cs', status: 'modified',
      additions: 1, deletions: 1, changes: 2 },
    { filename: 'AqualLifeStyle/9.4.2/aspnet-core/test/RegistrationTests.cs', status: 'added',
      additions: 10, deletions: 0, changes: 10 }
  ];
  const compare = (from, to, changed = files) => ({ status: 'ahead', base_commit: { sha: from }, head_commit: { sha: to },
    ahead_by: 2, behind_by: 0, total_commits: 2, commits: [{ sha: 'a'.repeat(40) }, { sha: to }], files: changed });
  const attemptRun = (attempt, overrides = {}) => ({ id: Number(prospectiveRecovery.incompleteReleaseRunId),
    run_attempt: attempt, run_number: 54, head_sha: prospectiveRecovery.historicalAttemptExecutorSha,
    head_branch: 'main', event: 'workflow_dispatch', path: '.github/workflows/deploy.yml',
    name: 'Qualified production executor', status: 'completed', conclusion: 'failure',
    repository: { full_name: 'aqua-lifestyle/aqua-deployment' },
    head_repository: { full_name: 'aqua-lifestyle/aqua-deployment' },
    created_at: '2026-11-09T10:00:00.000Z', updated_at: '2026-11-09T10:30:00.000Z', ...overrides });
  const historicalRun = attemptRun(3);
  const historicalRuns = { 1: attemptRun(1, { created_at: '2026-11-09T10:00:00.000Z', updated_at: '2026-11-09T10:10:00.000Z' }),
    2: attemptRun(2, { created_at: '2026-11-09T10:15:00.000Z', updated_at: '2026-11-09T10:20:00.000Z' }), 3: historicalRun };
  const historicalJobs = attempt => ({ total_count: 3, jobs: historicalJobNames.map((name, index) => ({
    id: attempt * 10 + index, run_id: Number(prospectiveRecovery.incompleteReleaseRunId), run_attempt: attempt,
    name, status: 'completed', conclusion: name === historicalJobNames[0] ? 'success' :
      name === historicalJobNames[1] ? attempt < 3 ? 'success' : 'failure' : attempt < 3 ? 'failure' : 'skipped',
    ...(name === historicalJobNames[2] && attempt < 3 ? { steps: [{
      name: prospectiveRecovery.historicalMutationStep, conclusion: 'failure' }] } : {}) })) });
  const api = {
    render: async (route, body) => {
      calls.push(['render', route, body]);
      if (route.includes('/env-vars/')) {
        const key = route.split('/env-vars/')[1];
        const row = settings.find(x => x.key === key);
        return row && { key, value: row.value };
      }
      if (route === `/services/${targets.render.id}`) return renderService;
      if (route === `/services/${targets.render.id}/deploys/${prospectiveRecovery.historicalRenderDeploymentId}`)
        return { id: prospectiveRecovery.historicalRenderDeploymentId,
          commit: { id: prospectiveRecovery.historicalApplicationSha }, status: 'deactivated',
          createdAt: '2026-11-09T10:05:00.000Z' };
      throw Error(`Unexpected Render read ${route}`);
    },
    readiness: async sourceSha => { calls.push(['readiness', sourceSha]); return runtimeReadiness(sourceSha); },
    vercel: async (route, body) => {
      calls.push(['vercel', route, body]);
      if (route === `/v9/projects/${targets.vercel.id}`) return { id: targets.vercel.id,
        accountId: targets.vercel.teamId, name: targets.vercel.name, rootDirectory: targets.vercel.rootDirectory,
        nodeVersion: '24.x', autoAssignCustomDomains: true, targets: { production: { id: 'dpl_current1' } } };
      if (route === '/v13/deployments/dpl_current1') return { id: 'dpl_current1', projectId: targets.vercel.id,
        target: 'production', readyState: 'READY', gitSource: overrides.legacyFrontend === false ?
          { sha: baselineSha, repoId: '789' } : null };
      if (route === '/v2/deployments/dpl_current1/aliases') return { aliases: [
        { alias: new URL(targets.vercel.productionUrl).hostname, deploymentId: 'dpl_current1', projectId: targets.vercel.id }] };
      if (route.startsWith(`/v9/projects/${targets.vercel.id}/domains/`)) return {
        name: new URL(targets.vercel.productionUrl).hostname, projectId: targets.vercel.id, verified: true };
      throw Error(`Unexpected Vercel read ${route}`);
    },
    health: async () => ({ status: 200, recovery: null, body: healthFor(baselineSha) }),
    web: async () => 200,
    webHealth: async sha => { calls.push(['web-health', sha]); return healthFor(sha); },
    gh: async route => {
      calls.push(['gh', route]);
      if (route === `/compare/${baselineSha}...${targetSha}`) return compare(baselineSha, targetSha,
        overrides.compareFiles ?? files);
      throw Error(`Unexpected GitHub source read ${route}`);
    },
    executor: async route => {
      calls.push(['executor', route]);
      if (route === `/actions/runs/${prospectiveRecovery.incompleteReleaseRunId}`) return historicalRun;
      const attemptMatch = route.match(/\/actions\/runs\/(\d+)\/attempts\/(\d+)(?:\/jobs\?per_page=100)?$/);
      if (attemptMatch && route.includes('/jobs?')) return historicalJobs(Number(attemptMatch[2]));
      if (attemptMatch) return historicalRuns[Number(attemptMatch[2])];
      if (route === `/actions/runs/${prospectiveRecovery.incompleteReleaseRunId}/artifacts?per_page=100`)
        return { total_count: 0, artifacts: [] };
      if (route.startsWith('/contents/tools/deployment/release-control.mjs?ref=')) return { type: 'file',
        path: 'tools/deployment/release-control.mjs', encoding: 'base64', content: '', size: 0 };
      throw Error(`Unexpected executor read ${route}`);
    }
  };
  return { api, calls, settings, renderHistory, vercelHistory, compare, files, historicalRun, historicalRuns,
    historicalJobs, ...overrides };
}

const validators = { validateRender: () => {}, validateVercel: () => {}, validateHealth: () => {},
  deploymentHistory: async (f, provider) => provider === 'render' ? f.renderHistory : f.vercelHistory,
  repositoryId: 789, vercelTarget: targets.vercel, now };

async function captured(overrides = {}) {
  const f = providerFixture(overrides);
  const phases = [];
  const boundary = await captureProspectiveBaseline(f.api, candidate, run, { ...validators,
    deploymentHistory: (_api, provider) => provider === 'render' ? f.renderHistory : f.vercelHistory,
    readHistoricalIncident: overrides.readHistoricalIncident ?? (async () => historicalIncident(now)),
    onPhase: phase => phases.push(phase) });
  return { ...f, boundary, phases };
}

test('captures exact serving baseline separately from target; unknown-source READY frontend is compatibility-checked and reused', async () => {
  const f = await captured();
  assert.equal(f.boundary.targetSha, targetSha);
  assert.equal(f.boundary.render.sourceSha, baselineSha);
  assert.equal(f.boundary.runtimeReadiness.buildId, baselineSha);
  assert.equal(f.boundary.health.buildId, baselineSha);
  assert.equal(f.boundary.vercel.sourceSha, null);
  assert.equal(f.boundary.vercel.sourceProvenance, 'UNVERIFIED_LEGACY');
  assert.equal(f.boundary.frontend.frontendChanged, false);
  assert.equal(f.boundary.frontend.reuseBaseline, true);
  assert.deepEqual(f.boundary.frontend.backendHealth, healthFor(baselineSha));
  assert.equal(f.boundary.render.settingsDigest, digest(f.settings));
  assert.ok(prospectiveSettingKeys.includes('App__AutomaticPayouts__Enabled'));
  assert.equal(f.settings.find(x => x.key === 'App__AutomaticPayouts__Enabled').value, 'false');
  assert.deepEqual(f.phases, ['release-context', 'render-settings', 'render-service', 'render-deployment-history',
    'api-health', 'vercel-project', 'vercel-deployment-history', 'vercel-production-deployment',
    'frontend-compatibility', 'historical-release', 'runtime-readiness', 'baseline-artifact']);
  assert.ok(f.calls.some(call => call[0] === 'readiness' && call[1] === baselineSha));
  assert.ok(!f.calls.some(call => call[0] === 'readiness' && call[1] === targetSha),
    'predeployment readiness is checked only against the currently serving revision');
  assert.ok(f.calls.every(([, route]) => typeof route !== 'string' ||
    !(route.endsWith('/deploys') || route.includes('POST'))));
  assert.ok(f.calls.filter(([provider]) => ['render', 'vercel'].includes(provider))
    .every(([, , body]) => body === undefined));
  assert.equal(validateProspectiveBaseline(f.boundary, targetSha, now), f.boundary);
});

test('retains an authenticated baseline runtime binding with distinct baseline and target SHAs', async () => {
  let retained;
  const f = providerFixture();
  await captureProspectiveBaseline(f.api, candidate, run, { ...validators,
    deploymentHistory: (_api, provider) => provider === 'render' ? f.renderHistory : f.vercelHistory,
    readHistoricalIncident: async () => historicalIncident(now),
    onD10RuntimeEvidence: evidence => { retained = evidence; } });
  const expected = { applicationSha: targetSha, runtimeSha: baselineSha,
    applicationCiRunId: candidate.ciRunId, applicationCiRunAttempt: candidate.ciRunAttempt,
    captureRunId: String(run.id), captureRunAttempt: run.run_attempt, executorSha };
  assert.equal(retained.applicationSha, targetSha);
  assert.equal(retained.runtimeSha, baselineSha);
  assert.equal(retained.runtimeReadiness.buildId, baselineSha);
  assert.equal(validateD10RuntimeEvidence(retained, expected, now), retained);
  for (const [alter, pattern] of [
    [e => { e.runtimeSha = targetSha; }, /PROSPECTIVE_D10_RUNTIME_EVIDENCE_UNVERIFIABLE/],
    [e => { e.runtimeReadiness.d10Bindings.intendedBuildId = targetSha; }, /PROSPECTIVE_D10_RUNTIME_EVIDENCE_UNVERIFIABLE/],
    [e => { e.captureRunAttempt++; }, /PROSPECTIVE_D10_RUNTIME_EVIDENCE_UNVERIFIABLE/],
    [e => { e.digest = '0'.repeat(64); }, /PROSPECTIVE_D10_RUNTIME_EVIDENCE_DIGEST_MISMATCH/]
  ]) {
    const altered = structuredClone(retained); alter(altered);
    assert.throws(() => validateD10RuntimeEvidence(altered, expected, now), pattern);
  }
});

test('baseline denies non-healthy or incompatible frontend, wrong source, incomplete diff and unsafe money state', async () => {
  for (const edit of [
    f => { f.api.web = async () => 503; },
    f => { f.api.webHealth = async () => healthFor(targetSha); },
    f => { f.api.vercel = async route => route.endsWith('/aliases') ? { aliases: [] } :
      route.startsWith(`/v9/projects/${targets.vercel.id}/domains/`) ? { name: 'wrong.example', projectId: targets.vercel.id, verified: true } :
        providerFixture().api.vercel(route); },
    f => { f.api.webHealth = async () => ({ ...healthFor(baselineSha), paymentAvailability: 'Available' }); },
    f => { f.compare = undefined; f.api.gh = async () => ({ status: 'ahead', base_commit: { sha: baselineSha },
      head_commit: { sha: targetSha }, ahead_by: 2, behind_by: 0, total_commits: 2,
      commits: [{ sha: targetSha }], files: [] }); }
  ]) {
    const f = providerFixture(); edit(f);
    await assert.rejects(captureProspectiveBaseline(f.api, candidate, run, { ...validators,
      deploymentHistory: (_api, provider) => provider === 'render' ? f.renderHistory : f.vercelHistory,
      readHistoricalIncident: async () => historicalIncident(now) }));
  }
  const unsafe = providerFixture();
  unsafe.settings.find(x => x.key === 'App__AutomaticPayouts__Enabled').value = 'true';
  await assert.rejects(captureProspectiveBaseline(unsafe.api, candidate, run, { ...validators,
    deploymentHistory: (_api, provider) => provider === 'render' ? unsafe.renderHistory : unsafe.vercelHistory,
    readHistoricalIncident: async () => historicalIncident(now) }), /PROSPECTIVE_FINANCIAL_FENCE_NOT_HELD/);
  const pending = providerFixture(); pending.vercelHistory.push({ uid: 'dpl-pending', state: 'BUILDING' });
  await assert.rejects(captureProspectiveBaseline(pending.api, candidate, run, { ...validators,
    deploymentHistory: (_api, provider) => provider === 'render' ? pending.renderHistory : pending.vercelHistory,
    readHistoricalIncident: async () => historicalIncident(now) }), /PROSPECTIVE_VERCEL_OPERATION_PENDING/);
});

test('verified frontend comparison is complete and detects changes on both sides of a rename', () => {
  // GitHub's authenticated compare response has base_commit and an ordered
  // commits array, but no top-level head_commit property.
  const githubCompare = { status: 'ahead', base_commit: { sha: baselineSha },
    merge_base_commit: { sha: baselineSha }, ahead_by: 2, behind_by: 0, total_commits: 2,
    commits: [{ sha: 'c'.repeat(40) }, { sha: targetSha }], files: [
      { filename: 'AqualLifeStyle/9.4.2/aspnet-core/src/AqualLifeStyle.Application/ProgrammeParticipations/AQGreenV2WeeklyCommissionReadiness.cs',
        status: 'modified', additions: 2, deletions: 1, changes: 3 },
      { filename: 'AqualLifeStyle/9.4.2/aspnet-core/test/AqualLifeStyle.Tests/Commissions/AQGreenV2WeeklyCommissionReadinessRegistrationTests.cs',
        status: 'added', additions: 34, deletions: 0, changes: 34 }
    ] };
  const githubShape = validateProspectiveFrontendComparison(githubCompare, baselineSha, targetSha);
  assert.equal(githubShape.frontendChanged, false);
  assert.equal(githubShape.changedFileCount, 2);
  assert.throws(() => validateProspectiveFrontendComparison({ ...githubCompare,
    commits: [{ sha: 'c'.repeat(40) }, { sha: 'd'.repeat(40) }] }, baselineSha, targetSha),
  /PROSPECTIVE_FRONTEND_SOURCE_COMPARISON_UNVERIFIABLE/);

  const renamedIntoFrontend = { filename: 'AqualLifeStyle/9.4.2/aqua-frontend/app/page.tsx',
    previous_filename: 'legacy/page.tsx', status: 'renamed', additions: 1, deletions: 1, changes: 2 };
  const renamedOutOfFrontend = { filename: 'legacy/page.tsx',
    previous_filename: 'AqualLifeStyle/9.4.2/aqua-frontend/app/page.tsx', status: 'renamed', additions: 1, deletions: 1, changes: 2 };
  for (const file of [renamedIntoFrontend, renamedOutOfFrontend]) {
    const result = validateProspectiveFrontendComparison({ status: 'ahead', base_commit: { sha: baselineSha },
      head_commit: { sha: targetSha }, ahead_by: 2, behind_by: 0, total_commits: 2,
      commits: [{ sha: 'a'.repeat(40) }, { sha: targetSha }], files: [file] }, baselineSha, targetSha);
    assert.equal(result.frontendChanged, true);
  }
  for (const bad of [
    { status: 'ahead', base_commit: { sha: baselineSha }, head_commit: { sha: targetSha }, ahead_by: 2,
      behind_by: 0, total_commits: 2, commits: [{ sha: 'a'.repeat(40) }, { sha: targetSha }], files: [] },
    { status: 'ahead', base_commit: { sha: baselineSha }, head_commit: { sha: 'c'.repeat(40) }, ahead_by: 2,
      behind_by: 0, total_commits: 2, commits: [{ sha: 'a'.repeat(40) }, { sha: targetSha }], files: [] },
    { status: 'ahead', base_commit: { sha: baselineSha }, head_commit: { sha: targetSha }, ahead_by: 2,
      behind_by: 0, total_commits: 2, commits: [{ sha: targetSha }], files: [] },
    { status: 'ahead', base_commit: { sha: baselineSha }, head_commit: { sha: targetSha }, ahead_by: 2,
      behind_by: 0, total_commits: 2, commits: [{ sha: 'a'.repeat(40) }, { sha: targetSha }], files: [
        { filename: 'outside', status: 'renamed', additions: 0, deletions: 0, changes: 0 }] }
  ]) assert.throws(() => validateProspectiveFrontendComparison(bad, baselineSha, targetSha),
    /PROSPECTIVE_FRONTEND_SOURCE_COMPARISON_UNVERIFIABLE/);
  const identical = validateProspectiveFrontendComparison({ status: 'identical',
    base_commit: { sha: targetSha }, head_commit: { sha: targetSha }, ahead_by: 0, behind_by: 0,
    total_commits: 0, commits: [], files: [] }, targetSha, targetSha);
  assert.equal(identical.frontendChanged, false);
});

test('only the exact historical incident with authenticated provider evidence is classified incomplete', () => {
  const incident = historicalIncident();
  assert.equal(validatePinnedHistoricalIncidentEvidence(incident, now), incident);
  const historical = { id: Number(prospectiveRecovery.incompleteReleaseRunId),
    head_sha: prospectiveRecovery.historicalAttemptExecutorSha, status: 'completed', conclusion: 'failure' };
  const production = { status: 'completed', conclusion: 'failure', steps: [{
    name: prospectiveRecovery.historicalMutationStep, conclusion: 'failure' }] };
  const result = classifyPinnedIncompleteAttempt(historical, 1, production,
    prospectiveRecovery.historicalMutationStep, incident, now);
  assert.equal(result.outcome, 'incomplete');
  assert.equal(result.auditArtifacts, 'unavailable');
  assert.equal(result.producerAuditDigest, null);
  assert.equal(result.runConclusion, 'failure');
  for (const [alter, pattern] of [
    e => { e.providerEvidence.status = 'live'; },
    e => { e.providerEvidence.renderDeploymentId = 'dep-other'; },
    e => { e.providerEvidence.vercelProjectId = 'prj-other'; },
    e => { e.providerEvidence.createdAt = new Date(now + 60_000).toISOString(); },
    e => { e.auditArtifacts.producerAuditDigest = 'a'.repeat(64); },
    e => { e.attempts[0].productionConclusion = 'success'; },
    e => { e.digest = '0'.repeat(64); }
  ].map(edit => [edit, /PROSPECTIVE_HISTORICAL|PROSPECTIVE_BASELINE_DIGEST/])) {
    const altered = structuredClone(incident); alter(altered);
    assert.throws(() => validatePinnedHistoricalIncidentEvidence(altered, now), pattern);
  }
  assert.throws(() => classifyPinnedIncompleteAttempt({ ...historical, head_sha: executorSha }, 1,
    production, prospectiveRecovery.historicalMutationStep, incident, now), /PROSPECTIVE_HISTORICAL_RELEASE_STATE_CHANGED/);
  assert.throws(() => classifyPinnedIncompleteAttempt(historical, 2, production,
    prospectiveRecovery.historicalMutationStep, incident, now), /PROSPECTIVE_HISTORICAL_RELEASE_STATE_CHANGED/);
});

test('historical Render evidence selects the pinned deployment when the same SHA has another deployment', () => {
  const pinned = { id: prospectiveRecovery.historicalRenderDeploymentId,
    commit: { id: prospectiveRecovery.historicalApplicationSha } };
  const other = { id: 'dep-dborrlbbc2fs73d1rig0', commit: { id: prospectiveRecovery.historicalApplicationSha } };
  assert.equal(selectPinnedHistoricalRenderDeployment([pinned, other]), pinned);
  assert.throws(() => selectPinnedHistoricalRenderDeployment([other]),
    /PROSPECTIVE_HISTORICAL_PROVIDER_OUTCOME_UNVERIFIABLE/);
  assert.throws(() => selectPinnedHistoricalRenderDeployment([pinned, { ...pinned }]),
    /PROSPECTIVE_HISTORICAL_PROVIDER_OUTCOME_UNVERIFIABLE/);
});

test('qualification-only candidate cannot enter production; capture remains read-only', () => {
  assert.throws(() => validateDispatchInputs({ ci_run_id: candidate.ciRunId,
    ci_run_attempt: String(candidate.ciRunAttempt), sha: targetSha, qualification_only: true,
    prospective_mode: 'authorize', recovery_baseline_run_id: '5001',
    recovery_baseline_sha256: 'a'.repeat(64) }), /EXECUTOR_INPUT_INVALID/);
  assert.equal(validateDispatchInputs({ ci_run_id: candidate.ciRunId,
    ci_run_attempt: String(candidate.ciRunAttempt), sha: targetSha, qualification_only: true,
    prospective_mode: 'capture-baseline' }).prospectiveMode, 'capture-baseline');
  assert.equal(validateDispatchInputs({ ci_run_id: candidate.ciRunId,
    ci_run_attempt: String(candidate.ciRunAttempt), sha: targetSha, qualification_only: false,
    prospective_mode: 'authorize', recovery_baseline_run_id: '5001',
    recovery_baseline_sha256: 'a'.repeat(64) }).prospectiveMode, 'authorize');
});

test('exact weekly-readiness successor reuses completed Migration 55 evidence without authorizing new DDL', async () => {
  const carry = validateCompletedCandidateCarryForward();
  const baseline = standingPolicy.firstReleaseRecovery.baseline.renderSha;
  const migrationCompare = { status: 'ahead', files: schemaSource.migrationFiles.map(pin => ({
    filename: pin.path, status: pin.status })) };
  const api = { gh: async route => {
    if (route === `/compare/${baseline}...${targetSha}`) return migrationCompare;
    if (route === `/compare/${carry.operationSourceSha}...${targetSha}`)
      return { status: 'ahead', files: [] };
    throw new Error(`Unexpected schema comparison ${route}`);
  } };
  const readSource = async path => {
    if (path === carry.guardOverride.path) return carry.guardOverride.candidateSha256;
    return [...schemaSource.migrationFiles, ...schemaSource.holdSources, ...schemaSource.cleanStartSources]
      .find(pin => pin.path === path)?.sha256;
  };
  assert.equal(await verifySchemaFirst(api, { sha: targetSha, qualificationOnly: true },
    standingPolicy, readSource, undefined, true, () => now), null);
  assert.deepEqual(await api.gh(`/compare/${baseline}...${targetSha}`), migrationCompare);
  await assert.rejects(verifySchemaFirst(api, { sha: 'c'.repeat(40), qualificationOnly: true },
    standingPolicy, readSource, undefined, true, () => now), /COMPLETED_M55_EXACT_SCOPE_REQUIRED/);
  const alteredApi = { gh: async route => route === `/compare/${baseline}...${targetSha}` ? {
    status: 'ahead', files: [...migrationCompare.files, { filename: 'AqualLifeStyle/9.4.2/aspnet-core/src/X/Migrations/Unauthorized.cs',
      status: 'added' }] } : { status: 'ahead', files: [] } };
  await assert.rejects(verifySchemaFirst(alteredApi, { sha: targetSha, qualificationOnly: true },
    standingPolicy, readSource, undefined, true, () => now), /SCHEMA_MIGRATION_NOT_APPROVED/);
});

test('baseline holds, current-source identity, OIDC readiness and capture owner are mandatory', async () => {
  const f = await captured();
  for (const mutate of [
    b => { b.render.sourceSha = 'a'.repeat(40); },
    b => { b.render.status = 'build_in_progress'; },
    b => { b.render.activeDeployments = 1; },
    b => { b.health.paymentAvailability = 'Available'; },
    b => { b.runtimeReadiness.d10Bindings.requiredAssemblyDigest = '0'.repeat(64); },
    b => { b.runtimeReadiness.version = 1; delete b.runtimeReadiness.d10Bindings; },
    b => { b.vercel.sourceProvenance = 'GIT_SOURCE'; },
    b => { b.frontend.reuseBaseline = false; },
    b => { b.targetSha = 'b'.repeat(40); }
  ]) {
    const altered = structuredClone(f.boundary); mutate(altered);
    altered.digest = digest(Object.fromEntries(Object.entries(altered).filter(([key]) => key !== 'digest')));
    assert.throws(() => validateProspectiveBaseline(altered, targetSha, now),
      /PROSPECTIVE_BASELINE|D10_RUNTIME_BINDINGS|PROSPECTIVE_RUNTIME_READINESS/);
  }
  assert.throws(() => validateProspectiveBaseline({ ...f.boundary, digest: '0'.repeat(64) }, targetSha, now),
    /PROSPECTIVE_BASELINE_DIGEST_MISMATCH/);
  await assert.rejects(captureProspectiveBaseline(f.api, candidate,
    { ...run, actor: { login: 'someone-else', id: 42 } }, { ...validators,
      deploymentHistory: (_api, provider) => provider === 'render' ? f.renderHistory : f.vercelHistory,
      readHistoricalIncident: async () => historicalIncident(now) }), /PROSPECTIVE_BASELINE_CONTEXT_REQUIRED/);
  assert.throws(() => validateProspectiveBaseline(f.boundary, targetSha, now + 1801_000), /PROSPECTIVE_BASELINE_UNVERIFIABLE/);
  assert.ok(prospectiveBaselinePhases.includes('runtime-readiness'));
  assert.deepEqual(safeBaselineDiagnostic(new ProspectiveBaselineDenied(
    'PROSPECTIVE_D10_RUNTIME_BINDINGS_REQUIRED', 'runtime-readiness'), 'render-settings'),
  { code: 'PROSPECTIVE_D10_RUNTIME_BINDINGS_REQUIRED', phase: 'runtime-readiness' });
  assert.deepEqual(safeBaselineDiagnostic(new ReleaseFailure('PROVIDER_READ_REJECTED'), 'render-settings'),
    { code: 'PROVIDER_READ_REJECTED', phase: 'render-settings' });
  const raw = safeBaselineDiagnostic(new Error('Bearer do-not-log provider-body'), 'render-settings');
  assert.deepEqual(raw, { code: 'UNEXPECTED_RELEASE_ERROR', phase: 'render-settings' });
  assert.doesNotMatch(JSON.stringify(raw), /Bearer|do-not-log|provider-body/);
});

test('fresh owner authorization binds the complete baseline and exact target release attempt', async () => {
  const { boundary } = await captured();
  const releaseRun = { id: 5002, run_attempt: 1, created_at: new Date(now).toISOString(), actor: owner };
  const policy = { authorization: { administrators: [owner] } };
  const authorization = createProspectiveAuthorization(boundary, releaseRun, now);
  const release = { sha: targetSha, releaseRunId: String(releaseRun.id),
    releaseRunAttempt: releaseRun.run_attempt, actorCreatedAt: releaseRun.created_at };
  assert.equal(validateProspectiveAuthorization(authorization, boundary, release, policy, now), authorization);
  assert.throws(() => validateProspectiveAuthorization({ ...authorization, approvedById: 42 }, boundary,
    release, policy, now), /PROSPECTIVE_OWNER_AUTHORIZATION_REQUIRED/);
  assert.throws(() => validateProspectiveAuthorization(authorization, boundary,
    { ...release, sha: 'b'.repeat(40) }, policy, now), /PROSPECTIVE_OWNER_AUTHORIZATION_REQUIRED/);
  assert.throws(() => validateProspectiveAuthorization(authorization, boundary, release, policy, now + 3601_000),
    /PROSPECTIVE_OWNER_AUTHORIZATION_REQUIRED/);
});

test('baseline workflow separates baseline capture from owner-authorized production release', async () => {
  const release = { releaseRunId: '5002', releaseRunAttempt: 1 };
  const jobs = [
    { name: 'Qualify immutable source candidate', status: 'completed', conclusion: 'success' },
    { name: 'Capture prospective provider baseline', status: 'completed', conclusion: 'skipped' },
    { name: admissionJobName, status: 'completed', conclusion: 'success' },
    { name: 'Unattended recovery release', status: 'in_progress', conclusion: null }
  ].map((job, index) => ({ ...job, run_id: 5002, run_attempt: 1, id: 90 + index }));
  await validateAdmissionJob({ executor: async () => ({ total_count: jobs.length, jobs }) }, release);
  const bad = jobs.map(row => ({ ...row }));
  bad[1].conclusion = 'success';
  await assert.rejects(validateAdmissionJob({ executor: async () => ({ total_count: bad.length, jobs: bad }) }, release),
    /ADMISSION_JOB_NOT_SUCCESSFUL/);
});

test('evidence admission accepts only the authenticated incomplete incident and preserves it as failed', async () => {
  const incident = historicalIncident(Date.now() - 5000);
  const currentId = 90000;
  const currentRun = { id: currentId, run_number: 61, run_attempt: 1,
    head_sha: executorSha, head_branch: 'main', event: 'workflow_dispatch',
    path: '.github/workflows/deploy.yml', name: 'Qualified production executor', status: 'in_progress',
    repository: { full_name: 'aqua-lifestyle/aqua-deployment' },
    head_repository: { full_name: 'aqua-lifestyle/aqua-deployment' } };
  const runs = Array.from({ length: 61 }, (_, index) => {
    const runNumber = index + 1;
    if (runNumber === 61) return currentRun;
    const isIncident = runNumber === 54;
    return { id: isIncident ? Number(prospectiveRecovery.incompleteReleaseRunId) : 100000 + runNumber,
      run_number: runNumber, run_attempt: isIncident ? 3 : 1,
      head_sha: isIncident ? prospectiveRecovery.historicalAttemptExecutorSha : 'c'.repeat(40),
      head_branch: 'main', event: 'workflow_dispatch', path: '.github/workflows/deploy.yml',
      name: 'Qualified production executor', status: 'completed',
      conclusion: runNumber <= 50 ? 'success' : 'failure',
      repository: { full_name: 'aqua-lifestyle/aqua-deployment' },
      head_repository: { full_name: 'aqua-lifestyle/aqua-deployment' } };
  });
  const incidentAttempt = (attempt) => ({ ...runs[53], run_attempt: attempt, conclusion: 'failure' });
  const production = (runRow, attempt) => {
    const incidentRun = String(runRow.id) === prospectiveRecovery.incompleteReleaseRunId;
    const skipped = !incidentRun || attempt === 3;
    const jobs = [
      { name: 'Qualify immutable source candidate', conclusion: incidentRun ? 'success' : 'success' },
      { name: admissionJobName, conclusion: incidentRun && attempt === 3 ? 'failure' : 'success' },
      { name: 'Unattended recovery release', conclusion: skipped ? 'skipped' : 'failure',
        ...(!skipped ? { steps: [{ name: prospectiveRecovery.historicalMutationStep, conclusion: 'failure' }] } : {}) }
    ].map((job, index) => ({ ...job, id: attempt * 10 + index, run_id: runRow.id,
      run_attempt: attempt, status: 'completed' }));
    return { total_count: jobs.length, jobs };
  };
  const api = { executor: async route => {
    if (route === `/actions/runs/${currentId}`) return currentRun;
    if (route.startsWith('/actions/workflows/deploy.yml/runs?'))
      return { total_count: runs.length, workflow_runs: runs };
    const jobRoute = route.match(/^\/actions\/runs\/(\d+)\/attempts\/(\d+)\/jobs\?per_page=100$/);
    if (jobRoute) {
      const runRow = runs.find(row => row.id === Number(jobRoute[1]));
      return production(runRow, Number(jobRoute[2]));
    }
    const attemptRoute = route.match(/^\/actions\/runs\/(\d+)\/attempts\/(\d+)$/);
    if (attemptRoute && Number(attemptRoute[1]) === Number(prospectiveRecovery.incompleteReleaseRunId))
      return incidentAttempt(Number(attemptRoute[2]));
    throw new Error(`Unexpected evidence-plan GitHub read ${route}`);
  } };
  const qualified = { releaseRunId: String(currentId), releaseRunAttempt: 1,
    executorSha, sha: targetSha, policySha256: policyDigest(standingPolicy), qualificationOnly: false,
    prospectiveRecovery: { boundary: { historicalIncident: incident } } };
  const plan = await evidencePlan(api, qualified, standingPolicy);
  assert.equal(plan.prospectiveHistoricalRelease.runId, prospectiveRecovery.incompleteReleaseRunId);
  assert.equal(plan.prospectiveHistoricalRelease.outcome, 'incomplete');
  assert.deepEqual(plan.prospectiveHistoricalRelease.attempts.map(row => row.runAttempt), [1, 2, 3]);
  assert.ok(plan.prospectiveHistoricalRelease.attempts.every(row => row.runConclusion === 'failure'));
  assert.ok(plan.prospectiveHistoricalRelease.attempts.every(row => row.auditArtifacts === 'unavailable'));
  assert.ok(plan.prospectiveHistoricalRelease.attempts.every(row => !Object.hasOwn(row, 'providerOutcome')),
    'unknown attempt-level provider outcomes are not reconstructed');
  assert.equal(plan.verifiedReleases.length, 0);
  assert.equal(plan.baseline, null);

  const corrupted = structuredClone(incident);
  corrupted.providerEvidence.renderDeploymentId = 'dep-not-the-incident';
  const invalidQualified = { ...qualified, prospectiveRecovery: { boundary: { historicalIncident: corrupted } } };
  await assert.rejects(evidencePlan(api, invalidQualified, standingPolicy),
    /PROSPECTIVE_HISTORICAL_RELEASE_STATE_CHANGED/);
});
