import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { diagnoseRenderCommissionedState } from './verify-provider-credentials.mjs';
import { normalRuntimeSettings } from './runtime-readiness.mjs';
import { targets } from './release-control.mjs';

const executorSha = 'e25fa6ec5d604e1f616aece4ddc9741429549bd3';
const liveSha = 'b8d86e5e60997483423b273d5f426c08b411f573';
const liveId = 'dep-dbru710n74is738ah8bg';
const receiptId = 'dep-dbrgkstbedkc73difujg';
const historical = Object.freeze({
  currentConfigurationDigest: 'b89aa7a738f6b02eca7b90275c6d75c5443332d67675822e84112ce6904325ee',
  requiredAssemblyDigest: 'cd7ae851d640b40a2761c3838282e7d367103bfedccd265f73c0c628d31f9a35',
  requiredRuntimeAssemblyDigest: '8865ebcd4a7762e70a730864ced879f19997dd3a3657cc1140b6bb0ca9a7c4d6'
});
const decisionFor = () => ({ contractVersion: 'AQGreenD10CutoverV2', decisionId: 'D10-REDACTED-FIXTURE',
  requiredSchemaDigest: '1'.repeat(64), requiredAssemblyDigest: historical.requiredAssemblyDigest,
  requiredRuntimeAssemblyDigest: historical.requiredRuntimeAssemblyDigest,
  requiredDatabaseIdentityDigest: '4'.repeat(64), requiredConfigurationDigest: historical.currentConfigurationDigest });

function fixture({ mutate = () => {}, baselineAvailable = true } = {}) {
  const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REPOSITORY: targets.executor.repository, GITHUB_REPOSITORY_ID: '1423239668',
    GITHUB_REF: 'refs/heads/main', GITHUB_REF_PROTECTED: 'true', GITHUB_SHA: executorSha,
    GITHUB_WORKFLOW_SHA: executorSha,
    GITHUB_WORKFLOW_REF: `${targets.executor.repository}/.github/workflows/provider-credential-check.yml@refs/heads/main`,
    GITHUB_ACTOR: 'Xolani-M', GITHUB_ACTOR_ID: '86495928', GITHUB_TRIGGERING_ACTOR: 'Xolani-M',
    GITHUB_RUN_ID: '45000000000', GITHUB_RUN_ATTEMPT: '1',
    PROVIDER_CHECK_MODE: 'render-commissioned-state-diagnostic',
    RENDER_API_KEY: 'render-private-diagnostic-canary', GH_TOKEN: 'github-private-diagnostic-canary' };
  const decision = decisionFor();
  const decisionBytes = Buffer.from(JSON.stringify(decision));
  const values = { ...Object.fromEntries(Object.entries(normalRuntimeSettings).map(([key, allowed]) => [key, allowed[0]])),
    App__WeeklyCommissions__Enabled: 'true', App__FinancialOperations__Enabled: 'true',
    App__AQGreenV2__Commissioning__Enabled: 'true', Deployment__BuildId: liveSha,
    App__AQGreenV2__Commissioning__DecisionJsonBase64: decisionBytes.toString('base64'),
    App__AQGreenV2__Commissioning__DecisionSha256: createHash('sha256').update(decisionBytes).digest('hex') };
  const service = { id: targets.render.id, name: targets.render.name,
    repo: `https://github.com/${targets.repository}`, branch: 'main', suspended: 'not_suspended',
    autoDeployTrigger: 'off', autoDeploy: 'no', rootDir: '',
    serviceDetails: { runtime: 'docker', plan: 'starter', buildPlan: 'starter', numInstances: 1,
      region: 'frankfurt', maintenanceMode: { enabled: false }, disk: null,
      healthCheckPath: '/api/health', envSpecificDetails: { dockerContext: '.', dockerfilePath: './docker/api/Dockerfile',
        preDeployCommand: '', dockerCommand: '' } } };
  const deployment = { id: liveId, status: 'live', commit: { id: liveSha } };
  const health = { status: 200, recovery: null, receiver: 'Schema54', body: { result: {
    status: 'Healthy', buildId: liveSha, environment: 'Production', databaseStatus: 'Healthy',
    redisStatus: 'Healthy', dataProtectionKeyStoreStatus: 'Healthy', paymentAvailability: 'Available' } } };
  const calls = [], reports = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.method ?? 'GET', 'GET');
    assert.equal(options.body, undefined);
    const parsed = new URL(url);
    if (url === targets.render.healthUrl) {
      assert.equal(options.headers.Authorization, undefined);
      return Response.json(health.body, { status: health.status, headers: {
        ...(health.recovery === null ? {} : { 'x-aqua-recovery-suspended': health.recovery }),
        'x-aqua-yoco-receiver': health.receiver } });
    }
    assert.equal(parsed.origin, 'https://api.render.com');
    assert.equal(options.headers.Authorization, `Bearer ${env.RENDER_API_KEY}`);
    const renderPath = parsed.pathname.replace(/^\/v1/, '');
    if (renderPath === `/services/${targets.render.id}`) return Response.json(service);
    if (renderPath === `/services/${targets.render.id}/deploys`) return Response.json([{ deploy: deployment }]);
    const key = decodeURIComponent(renderPath.split('/').at(-1));
    assert.ok(Object.hasOwn(values, key), `allowlisted setting ${key}`);
    return Response.json({ key, value: values[key] });
  };
  mutate({ env, values, service, deployment, health, decision });
  const proof = { renderDeployId: receiptId, renderSha: liveSha, origin: { d10RuntimeBindings: { ...historical } } };
  const baseline = { runId: '43429695806', runAttempt: 1, sha: executorSha };
  const loadBaseline = async () => {
    if (!baselineAvailable) throw Error('SELECTED_BASELINE_ARTIFACT_UNAVAILABLE');
    return { proof, baseline, selectedByReleaseRunId: 44245360791 };
  };
  const run = (load = loadBaseline) => diagnoseRenderCommissionedState(env, { checkoutSha: executorSha, fetcher, loadBaseline: load,
    emit: row => reports.push(row) });
  return { env, values, service, deployment, health, decision, calls, reports, run };
}

test('commissioned Normal baseline reports authenticated D10, provider, history, health and payment predicates without secrets', async () => {
  const f = fixture();
  assert.equal(await f.run(), true);
  const row = f.reports.at(-1);
  assert.equal(row.diagnosticStatus, 'COMPLETE', JSON.stringify({ row, calls: f.calls.map(c => c.url) }));
  assert.deepEqual(row.historicalD10Comparisons, {
    currentConfigurationDigest: { result: 'PASS', expected: historical.currentConfigurationDigest,
      observed: historical.currentConfigurationDigest },
    requiredAssemblyDigest: { result: 'PASS', expected: historical.requiredAssemblyDigest,
      observed: historical.requiredAssemblyDigest },
    requiredRuntimeAssemblyDigest: { result: 'PASS', expected: historical.requiredRuntimeAssemblyDigest,
      observed: historical.requiredRuntimeAssemblyDigest }
  });
  assert.equal(row.deploymentIdentity.buildIdMatchesLiveCommit, 'PASS');
  assert.equal(row.deploymentIdentity.selectedReceiptOrReconciliation.result, 'PASS');
  assert.equal(row.backendHealth.http200, 'PASS');
  assert.equal(row.backendHealth.databaseHealthy, 'PASS');
  assert.equal(row.backendHealth.redisHealthy, 'PASS');
  assert.equal(row.backendHealth.keyStoreHealthy, 'PASS');
  assert.equal(row.backendHealth.recoveryClear, 'PASS');
  assert.equal(row.paymentAvailability.result, 'PASS');
  assert.ok(f.calls.every(call => (call.options.method ?? 'GET') === 'GET' && call.options.body === undefined));
  for (const secret of [f.env.RENDER_API_KEY, f.env.GH_TOKEN, f.values.App__AQGreenV2__Commissioning__DecisionJsonBase64,
    JSON.stringify(f.decision)]) assert.ok(!JSON.stringify(row).includes(secret));
});

test('commissioned-state diagnostic reports independent D10, build, service, normal-setting, history and health failures', async () => {
  const rewriteDecision = ({ values, decision }, field) => {
    decision[field] = 'f'.repeat(64);
    const bytes = Buffer.from(JSON.stringify(decision));
    values.App__AQGreenV2__Commissioning__DecisionJsonBase64 = bytes.toString('base64');
    values.App__AQGreenV2__Commissioning__DecisionSha256 = createHash('sha256').update(bytes).digest('hex');
  };
  const cases = [
    [({ values }) => { values.App__AQGreenV2__Commissioning__DecisionSha256 = '0'.repeat(64); },
      row => assert.equal(row.commissioningDecision.sha256Pin.result, 'FAIL', JSON.stringify(row))],
    [context => rewriteDecision(context, 'requiredConfigurationDigest'),
      row => assert.equal(row.historicalD10Comparisons.currentConfigurationDigest.result, 'FAIL')],
    [context => rewriteDecision(context, 'requiredAssemblyDigest'),
      row => assert.equal(row.historicalD10Comparisons.requiredAssemblyDigest.result, 'FAIL')],
    [context => rewriteDecision(context, 'requiredRuntimeAssemblyDigest'),
      row => assert.equal(row.historicalD10Comparisons.requiredRuntimeAssemblyDigest.result, 'FAIL')],
    [({ values }) => { values.Deployment__BuildId = 'f'.repeat(40); },
      row => assert.equal(row.deploymentIdentity.buildIdMatchesLiveCommit, 'FAIL')],
    [({ values }) => { values.App__FinancialOperations__Enabled = 'false'; },
      row => assert.equal(row.normalRuntimeSettings.App__FinancialOperations__Enabled.result, 'FAIL')],
    [({ service }) => { service.serviceDetails.region = 'wrong'; },
      row => assert.equal(row.service.checks.region, 'FAIL')],
    [({ deployment }) => { deployment.status = 'created'; },
      row => assert.equal(row.deploymentHistory.noActiveDeployments, 'FAIL')],
    [({ health }) => { health.body.result.databaseStatus = 'Unhealthy'; },
      row => assert.equal(row.backendHealth.databaseHealthy, 'FAIL')],
    [({ health }) => { health.recovery = 'true'; },
      row => assert.equal(row.backendHealth.recoveryClear, 'FAIL')],
    [({ health }) => { health.body.result.paymentAvailability = 'Unavailable'; },
      row => assert.equal(row.paymentAvailability.result, 'FAIL')]
  ];
  for (const [mutate, verify] of cases) {
    const f = fixture({ mutate });
    assert.equal(await f.run(), true);
    verify(f.reports.at(-1));
  }
});

test('missing authenticated baseline evidence remains UNKNOWN and is not replaced with the decision digests', async () => {
  const f = fixture({ baselineAvailable: false });
  assert.equal(await f.run(), true);
  const row = f.reports.at(-1);
  assert.equal(row.baselineEvidence.result, 'UNKNOWN');
  assert.equal(row.historicalD10Comparisons.status, 'UNKNOWN');
  assert.equal(row.diagnosticStatus, 'COMPLETE_WITH_UNKNOWN');
});

test('artifact download diagnostics report only the pinned artifact, stage, HTTP status and safe category', async () => {
  const f = fixture();
  const error = Error('GITHUB_ARTIFACT_DOWNLOAD_UNAVAILABLE');
  error.artifactDownloadDiagnostic = { artifactId: '14401816374', stage: 'redirected_storage',
    category: 'HTTP_STATUS', httpStatus: 403 };
  const signedUrl = 'https://storage.invalid/archive.zip?sig=private';
  assert.equal(await f.run(async () => { throw Object.assign(error, { signedUrl }); }), true);
  const baseline = f.reports.at(-1).baselineEvidence;
  assert.equal(baseline.code, 'GITHUB_ARTIFACT_DOWNLOAD_UNAVAILABLE');
  assert.deepEqual(baseline.downloadFailure, { artifactId: '14401816374', stage: 'redirected_storage',
    category: 'HTTP_STATUS', httpStatus: 403 });
  assert.ok(!JSON.stringify(baseline).includes(signedUrl));
});
