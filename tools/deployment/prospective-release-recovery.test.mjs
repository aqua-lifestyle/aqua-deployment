import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runtimeSettings } from './runtime-readiness.mjs';
import { admissionJobName, targets, validateAdmissionJob, validateDispatchInputs } from './release-control.mjs';
import { captureProspectiveBaseline, classifyPinnedIncompleteAttempt, createProspectiveAuthorization,
  digest, prospectiveRecovery, prospectiveSettingKeys, validateProspectiveAuthorization,
  validateProspectiveBaseline } from './prospective-release-recovery.mjs';

const now = Date.parse('2026-11-09T18:00:00.000Z');
const owner = { login: 'aqualifestyleclub', id: 307076734 };
const sha = prospectiveRecovery.targetSha;
const oldSha = 'e'.repeat(40);
const executorSha = 'f'.repeat(40);
const service = { id: targets.render.id, name: targets.render.name,
  repo: `https://github.com/${targets.repository}`, branch: 'main', suspended: 'not_suspended',
  autoDeployTrigger: 'off', autoDeploy: 'no', rootDir: '', serviceDetails: { runtime: 'docker',
    healthCheckPath: '/api/health', envSpecificDetails: { dockerContext: '.', dockerfilePath: './docker/api/Dockerfile',
      preDeployCommand: '', dockerCommand: '' } } };

function providerFixture(overrides = {}) {
  const settings = [...Object.entries(runtimeSettings).map(([key, values]) => ({ key, value: values[0] })),
    { key: 'App__AutomaticPayouts__Enabled', value: 'false' }];
  const rows = [
    { id: 'dep-current1', status: 'live', commit: { id: oldSha } }
  ];
  const calls = [];
  const api = {
    render: async route => {
      calls.push(['render', route]);
      if (route.includes('/env-vars/')) {
        const key = route.split('/env-vars/')[1];
        const row = settings.find(x => x.key === key);
        return row && { key, value: row.value };
      }
      if (route === `/services/${targets.render.id}`) return service;
      throw Error(`Unexpected Render read ${route}`);
    },
    vercel: async route => {
      calls.push(['vercel', route]);
      if (route === `/v9/projects/${targets.vercel.id}`) return { id: targets.vercel.id,
        accountId: targets.vercel.teamId, name: targets.vercel.name, rootDirectory: targets.vercel.rootDirectory,
        nodeVersion: '24.x', autoAssignCustomDomains: true, targets: { production: { id: 'dpl_current1' } } };
      if (route === '/v13/deployments/dpl_current1') return { id: 'dpl_current1', projectId: targets.vercel.id,
        target: 'production', readyState: 'READY', gitSource: { sha: oldSha } };
      throw Error(`Unexpected Vercel read ${route}`);
    },
    health: async () => ({ status: 200, recovery: null, body: { status: 'Healthy', buildId: oldSha,
      environment: 'Production', databaseStatus: 'Healthy', redisStatus: 'Healthy',
      dataProtectionKeyStoreStatus: 'Healthy', paymentAvailability: 'Held' } })
  };
  return { api, calls, settings, rows, ...overrides };
}

const run = { id: 5001, run_attempt: 1, event: 'workflow_dispatch', head_branch: 'main', status: 'in_progress',
  head_sha: executorSha, actor: owner };
const candidate = { sha, ciRunId: '42660068700', ciRunAttempt: 2, executorSha };
const validators = { validateRender: () => {}, validateVercel: () => {}, validateHealth: () => {},
  deploymentHistory: async (_api, provider) => provider === 'render' ? [{ id: 'dep-current1', status: 'live', commit: { id: oldSha } }] :
    [{ uid: 'dpl_current1', state: 'READY' }], repositoryId: 123, now };

async function captured(overrides) {
  const f = providerFixture(overrides);
  const boundary = await captureProspectiveBaseline(f.api, candidate, run, { ...validators,
    deploymentHistory: overrides?.deploymentHistory ?? validators.deploymentHistory });
  return { ...f, boundary };
}

test('captures fresh authenticated Render/Vercel identity and held financial settings without provider writes', async () => {
  const f = await captured();
  assert.equal(f.boundary.targetSha, sha);
  assert.equal(f.boundary.render.sourceSha, oldSha);
  assert.equal(f.boundary.health.paymentAvailability, 'Held');
  assert.equal(f.boundary.render.settingsDigest, digest(f.settings));
  assert.ok(prospectiveSettingKeys.includes('App__AutomaticPayouts__Enabled'));
  assert.equal(f.settings.find(x => x.key === 'App__AutomaticPayouts__Enabled').value, 'false');
  assert.ok(f.calls.every(([, route]) => !route.endsWith('/deploys') && !route.includes('POST')));
  assert.equal(validateProspectiveBaseline(f.boundary, sha, now), f.boundary);
});

test('rejects an unverified or changed deployment baseline, health, configuration, or operation state', async () => {
  const f = await captured();
  for (const mutate of [
    b => { b.render.sourceSha = 'a'.repeat(40); },
    b => { b.render.status = 'build_in_progress'; },
    b => { b.render.activeDeployments = 1; },
    b => { b.health.paymentAvailability = 'Available'; },
    b => { b.digest = '0'.repeat(64); },
    b => { b.targetSha = 'b'.repeat(40); }
  ]) {
    const altered = structuredClone(f.boundary); mutate(altered);
    assert.throws(() => validateProspectiveBaseline(altered, sha, now), /PROSPECTIVE_BASELINE/);
  }
  const unsafe = providerFixture();
  unsafe.settings.find(x => x.key === 'App__AutomaticPayouts__Enabled').value = 'true';
  await assert.rejects(captureProspectiveBaseline(unsafe.api, candidate, run, validators), /PROSPECTIVE_FINANCIAL_FENCE_NOT_HELD/);
  await assert.rejects(captureProspectiveBaseline(providerFixture().api, candidate,
    { ...run, actor: { login: 'someone-else', id: 42 } }, validators), /PROSPECTIVE_BASELINE_CONTEXT_REQUIRED/);
  const conflicting = providerFixture();
  await assert.rejects(captureProspectiveBaseline(conflicting.api, candidate, run, { ...validators,
    deploymentHistory: async () => [{ id: 'dep-pending', status: 'update_in_progress' }] }), /PROSPECTIVE_RENDER_OPERATION_PENDING/);
  await assert.rejects(captureProspectiveBaseline(providerFixture().api, candidate, run, { ...validators,
    deploymentHistory: async (_api, provider) => provider === 'render' ? validators.deploymentHistory(null, provider) :
      [{ uid: 'dpl-pending', state: 'BUILDING' }] }), /PROSPECTIVE_VERCEL_OPERATION_PENDING/);
  assert.throws(() => validateProspectiveBaseline(f.boundary, sha, now + 1801_000), /PROSPECTIVE_BASELINE_UNVERIFIABLE/);
});

test('binds explicit owner authorization to the fresh baseline, exact target and release attempt', async () => {
  const { boundary } = await captured();
  const releaseRun = { id: 5002, run_attempt: 1, created_at: new Date(now).toISOString(), actor: owner };
  const policy = { authorization: { administrators: [owner] } };
  const authorization = createProspectiveAuthorization(boundary, releaseRun, now);
  const release = { sha, releaseRunId: String(releaseRun.id), releaseRunAttempt: releaseRun.run_attempt,
    actorCreatedAt: releaseRun.created_at };
  assert.equal(validateProspectiveAuthorization(authorization, boundary, release, policy, now), authorization);
  assert.throws(() => validateProspectiveAuthorization({ ...authorization, approvedById: 42 }, boundary,
    release, policy, now), /PROSPECTIVE_OWNER_AUTHORIZATION_REQUIRED/);
  assert.throws(() => validateProspectiveAuthorization(authorization, { ...boundary, digest: '0'.repeat(64) },
    release, policy, now), /PROSPECTIVE/);
  assert.throws(() => validateProspectiveAuthorization(authorization, boundary, { ...release, sha: 'b'.repeat(40) },
    policy, now), /PROSPECTIVE_OWNER_AUTHORIZATION_REQUIRED/);
  assert.throws(() => createProspectiveAuthorization(boundary, { ...releaseRun,
    actor: { login: 'someone-else', id: 42 } }, now), /PROSPECTIVE_OWNER_AUTHORIZATION_REQUIRED/);
  assert.throws(() => validateDispatchInputs({ ci_run_id: '42660068700', ci_run_attempt: '2', sha,
    qualification_only: true, prospective_mode: 'authorize', recovery_baseline_run_id: '5001',
    recovery_baseline_sha256: boundary.digest }), /EXECUTOR_INPUT_INVALID/);
  assert.throws(() => validateDispatchInputs({ ci_run_id: '42660068700', ci_run_attempt: '2', sha,
    qualification_only: false, prospective_mode: 'authorize', recovery_baseline_run_id: '5001' }), /EXECUTOR_INPUT_INVALID/);
  assert.equal(validateDispatchInputs({ ci_run_id: '42660068700', ci_run_attempt: '2', sha,
    qualification_only: false, prospective_mode: 'authorize', recovery_baseline_run_id: '5001',
    recovery_baseline_sha256: boundary.digest }).prospectiveMode, 'authorize');
});

test('classifies only the pinned historical run as incomplete and rejects successful or other run identities', () => {
  const historical = { id: Number(prospectiveRecovery.incompleteReleaseRunId), status: 'completed', conclusion: 'failure' };
  const production = { status: 'completed', conclusion: 'failure', steps: [] };
  const result = classifyPinnedIncompleteAttempt(historical, 3, production,
    'Revalidate policy, provenance, providers and recovery before automatic deployment');
  assert.equal(result.outcome, 'incomplete');
  assert.equal(result.runId, prospectiveRecovery.incompleteReleaseRunId);
  assert.throws(() => classifyPinnedIncompleteAttempt(historical, 3,
    { ...production, conclusion: 'success' }, result.deploymentStep), /PROSPECTIVE_HISTORICAL_RELEASE_STATE_CHANGED/);
  assert.throws(() => classifyPinnedIncompleteAttempt({ ...historical, id: 98765 }, 3,
    production, result.deploymentStep), /PROSPECTIVE_HISTORICAL_RELEASE_STATE_CHANGED/);
});

test('four-job prospective release admission requires baseline capture to be skipped and production still running', async () => {
  const release = { releaseRunId: '5002', releaseRunAttempt: 1 };
  const jobs = [
    { name: 'Qualify immutable source candidate', status: 'completed', conclusion: 'success' },
    { name: 'Capture prospective provider baseline', status: 'completed', conclusion: 'skipped' },
    { name: admissionJobName, status: 'completed', conclusion: 'success' },
    { name: 'Unattended recovery release', status: 'in_progress', conclusion: null }
  ].map((job, index) => ({ ...job, run_id: 5002, run_attempt: 1, id: 90 + index }));
  const api = { executor: async () => ({ total_count: jobs.length, jobs }) };
  await validateAdmissionJob(api, release);
  const bad = jobs.map(row => ({ ...row }));
  bad[1].conclusion = 'success';
  await assert.rejects(validateAdmissionJob({ executor: async () => ({ total_count: bad.length, jobs: bad }) }, release),
    /ADMISSION_JOB_NOT_SUCCESSFUL/);
});
