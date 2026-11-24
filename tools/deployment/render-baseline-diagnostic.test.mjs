import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { diagnoseRenderBaseline, providerCheckMode } from './verify-provider-credentials.mjs';
import { targets } from './release-control.mjs';

const sha = 'a'.repeat(40), token = 'render-private-canary', privateBody = 'provider-private-canary';
const revision = 'b8d86e5e60997483423b273d5f426c08b411f573';
const fullId = 'dep-dbrgkstbedkc73difujg', laterId = 'dep-dbru710n74is738ah8bg';
const root = `https://api.render.com/v1/services/${targets.render.id}`;
function fixture() {
  const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REPOSITORY: targets.executor.repository, GITHUB_REPOSITORY_ID: '1423239668',
    GITHUB_REF: 'refs/heads/main', GITHUB_REF_PROTECTED: 'true', GITHUB_SHA: sha, GITHUB_WORKFLOW_SHA: sha,
    GITHUB_WORKFLOW_REF: `${targets.executor.repository}/.github/workflows/provider-credential-check.yml@refs/heads/main`,
    GITHUB_ACTOR: 'Xolani-M', GITHUB_ACTOR_ID: '86495928', GITHUB_TRIGGERING_ACTOR: 'Xolani-M',
    GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', PROVIDER_CHECK_MODE: 'render-baseline-diagnostic',
    RENDER_API_KEY: token };
  const service = { id: targets.render.id, name: targets.render.name,
    repo: `https://github.com/${targets.repository}`, branch: 'main', suspended: 'not_suspended',
    autoDeployTrigger: 'off', autoDeploy: 'no', rootDir: '',
    serviceDetails: { runtime: 'docker', healthCheckPath: '/api/health', plan: 'starter',
      buildPlan: 'starter', numInstances: 1, region: 'frankfurt', maintenanceMode: { enabled: false },
      envSpecificDetails: { dockerContext: '.', dockerfilePath: './docker/api/Dockerfile',
        preDeployCommand: '', dockerCommand: '' } }, private: privateBody };
  const deployments = [{ deploy: { id: laterId, status: 'live', commit: { id: revision }, private: privateBody } },
    { deploy: { id: fullId, status: 'deactivated', commit: { id: revision } } }];
  const calls = [], reports = [];
  const fetcher = async (url, options) => {
    calls.push(url);
    assert.equal(options.method, 'GET'); assert.equal(options.body, undefined);
    assert.equal(options.redirect, 'error'); assert.equal(options.headers.Authorization, `Bearer ${token}`);
    assert.ok([root, root + '/deploys?limit=100'].includes(url), 'only the fixed Render service and history');
    return Response.json(url === root ? service : deployments);
  };
  const run = (read = fetcher) => diagnoseRenderBaseline(env,
    { checkoutSha: sha, fetcher: read, emit: row => reports.push(row) });
  return { env, service, deployments, calls, reports, fetcher, run };
}

test('authenticated GETs distinguish the stale full receipt ID from the later same-SHA live deployment', async () => {
  const f = fixture(); assert.equal(await f.run(), true, JSON.stringify(f.reports));
  assert.deepEqual(f.calls, [root, root + '/deploys?limit=100']);
  const row = f.reports.at(-1);
  assert.equal(row.result, 'PASS');
  assert.equal(row.classification, 'OBSOLETE_FULL_RECEIPT_RENDER_ID');
  assert.deepEqual(row.observed.liveDeployments, [{ id: laterId, status: 'live', revision }]);
  assert.equal(row.observed.deploymentStatuses.deactivated, 1);
  assert.equal(row.predicates.serviceTargetMatch, true);
  assert.equal(row.predicates.serviceProfileMatch, true);
  assert.equal(row.predicates.oneLiveNoActive, true);
  assert.equal(row.predicates.originalFullReceiptMatch, false);
  assert.equal(row.predicates.laterObservedBaselineMatch, true);
  assert.equal(row.expected.fullReleaseDeployId, fullId);
  assert.equal(row.expected.laterObservedDeployId, laterId);
  assert.equal(row.failedReleaseRunId, '43935894260');
  for (const sensitive of [token, privateBody]) assert.ok(!JSON.stringify(f.reports).includes(sensitive));
});

test('current full-receipt ID and actual service or history drift remain distinct observations', async () => {
  const full = fixture(); full.deployments[0].deploy.id = fullId;
  full.deployments[1].deploy.id = laterId;
  assert.equal(await full.run(), true, JSON.stringify(full.reports));
  assert.equal(full.reports.at(-1).classification, 'NO_CURRENT_RENDER_DRIFT');
  const service = fixture(); service.service.serviceDetails.plan = 'standard';
  assert.equal(await service.run(), true);
  assert.equal(service.reports.at(-1).observed.serviceProfileChecks.plan, false);
  assert.equal(service.reports.at(-1).classification, 'RENDER_DRIFT_REQUIRES_RECONCILIATION');
  const identity = fixture(); identity.service.name = 'foreign-name-' + privateBody;
  assert.equal(await identity.run(), true);
  assert.equal(identity.reports.at(-1).observed.serviceTargetChecks.name, false);
  assert.ok(!JSON.stringify(identity.reports).includes(privateBody));
  const concurrent = fixture(); concurrent.deployments.push({ deploy: {
    id: 'dep-pending', status: 'build_in_progress', commit: { id: revision } } });
  assert.equal(await concurrent.run(), true);
  assert.equal(concurrent.reports.at(-1).predicates.oneLiveNoActive, false);
  assert.equal(concurrent.reports.at(-1).classification, 'RENDER_DRIFT_REQUIRES_RECONCILIATION');
});

test('context, credential, provider denials and malformed histories stay GET-only and fail closed', async () => {
  for (const change of [e => e.GITHUB_REF_PROTECTED = 'false', e => e.GITHUB_ACTOR_ID = '1',
    e => e.GITHUB_RUN_ATTEMPT = '2', e => e.PROVIDER_CHECK_MODE = 'verify']) {
    const f = fixture(); change(f.env);
    await assert.rejects(f.run(), /CONTEXT_DENIED/); assert.equal(f.calls.length, 0);
  }
  const absent = fixture(); delete absent.env.RENDER_API_KEY;
  assert.equal(await absent.run(), false); assert.equal(absent.calls.length, 0);
  assert.equal(absent.reports.at(-1).classification, 'CREDENTIAL_MISSING');
  for (const status of [401, 403, 404, 429, 500]) {
    const f = fixture();
    assert.equal(await f.run((url, options) => url.endsWith('limit=100') ?
      new Response(privateBody + token, { status }) : f.fetcher(url, options)), false);
    assert.equal(f.reports.at(-1).httpStatus, status, JSON.stringify(f.reports));
    assert.equal(f.calls.length, 1);
    assert.ok(!JSON.stringify(f.reports).includes(privateBody + token));
  }
  const invalid = fixture(); invalid.deployments[0].deploy.status = 'unknown';
  assert.equal(await invalid.run(), false);
  assert.equal(invalid.reports.at(-1).classification, 'RESPONSE_OR_HISTORY_UNVERIFIABLE');
  assert.deepEqual(invalid.calls, [root, root + '/deploys?limit=100']);
});

test('protected workflow gives the new mutually exclusive GET-only mode just the existing Render secret', () => {
  const yaml = readFileSync(new URL('../../.github/workflows/provider-credential-check.yml', import.meta.url), 'utf8');
  assert.match(yaml, /render_baseline_diagnostic:[\s\S]*?type: boolean\s+default: false/);
  assert.match(yaml, /inputs\.render_baseline_diagnostic && \(\(inputs\.render_env_diagnostic \|\| inputs\.native_recovery_readback\) && 'invalid'/);
  const stepStart = yaml.indexOf('      - name: Inspect fixed Render baseline');
  const stepEnd = yaml.indexOf('\n      - name:', stepStart + 1);
  const step = yaml.slice(stepStart, stepEnd);
  assert.match(step, /if: \$\{\{ inputs\.render_baseline_diagnostic && !inputs\.render_env_diagnostic && !inputs\.render_commissioned_state_diagnostic && !inputs\.native_recovery_readback && !inputs\.render_decision_path_diagnostic \}\}/);
  assert.deepEqual([...step.matchAll(/secrets\.(\w+)/g)].map(m => m[1]), ['RENDER_API_KEY']);
  assert.doesNotMatch(step, /VERCEL_TOKEN|deploy\.yml|release-control\.mjs|upload-artifact/);
  assert.throws(() => providerCheckMode({ PROVIDER_CHECK_MODE: 'invalid' }), /CONTEXT_DENIED/);
});
