import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { diagnoseRenderDecisionPath, providerCheckMode } from './verify-provider-credentials.mjs';
import { targets } from './release-control.mjs';

const sha = 'a'.repeat(40);
const key = 'App__AQGreenV2__Commissioning__DecisionPath';
const required = 'environment:App:AQGreenV2:Commissioning:DecisionJsonBase64';
const url = `https://api.render.com/v1/services/${targets.render.id}/env-vars/${key}`;
const credential = 'render-token-canary';
const privateValue = 'private-value-canary';

function fixture() {
  const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REPOSITORY: targets.executor.repository, GITHUB_REPOSITORY_ID: '1423239668',
    GITHUB_REF: 'refs/heads/main', GITHUB_REF_PROTECTED: 'true', GITHUB_SHA: sha,
    GITHUB_WORKFLOW_SHA: sha,
    GITHUB_WORKFLOW_REF: `${targets.executor.repository}/.github/workflows/provider-credential-check.yml@refs/heads/main`,
    GITHUB_ACTOR: 'Xolani-M', GITHUB_ACTOR_ID: '86495928', GITHUB_TRIGGERING_ACTOR: 'Xolani-M',
    GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', PROVIDER_CHECK_MODE: 'render-decision-path-diagnostic',
    RENDER_API_KEY: credential };
  const reports = [], calls = [];
  const run = fetcher => diagnoseRenderDecisionPath(env, { checkoutSha: sha,
    fetcher: async (requestUrl, options) => {
      calls.push(requestUrl);
      assert.equal(requestUrl, url);
      assert.equal(options?.method, 'GET'); assert.equal(options?.body, undefined);
      assert.equal(options?.redirect, 'error');
      assert.equal(options?.headers?.Authorization, `Bearer ${credential}`);
      return fetcher(requestUrl, options);
    }, emit: row => reports.push(row) });
  return { env, reports, calls, run };
}

test('one exact service-level GET returns MATCH without exposing the value or credential', async () => {
  const f = fixture();
  assert.equal(await f.run(async () => Response.json({ key, value: required })), true);
  assert.deepEqual(f.calls, [url]);
  assert.deepEqual(f.reports.map(r => ({ result: r.result, httpStatus: r.httpStatus,
    configurationSource: r.configurationSource, inheritedConfiguration: r.inheritedConfiguration })),
  [{ result: 'MATCH', httpStatus: 200, configurationSource: 'SERVICE_LEVEL',
    inheritedConfiguration: 'NOT_DETERMINED' }]);
  assert.equal(f.reports[0].renderServiceId, targets.render.id);
  assert.equal(f.reports[0].key, key);
  assert.ok(!JSON.stringify(f.reports).includes(required));
  assert.ok(!JSON.stringify(f.reports).includes(credential));
});

test('different service-level value is MISMATCH; only exact key HTTP 404 is MISSING', async () => {
  const changed = fixture();
  assert.equal(await changed.run(async () => Response.json({ key, value: privateValue })), false);
  assert.equal(changed.reports[0].result, 'MISMATCH');
  assert.equal(changed.reports[0].configurationSource, 'SERVICE_LEVEL');
  assert.ok(!JSON.stringify(changed.reports).includes(privateValue));
  const absent = fixture();
  assert.equal(await absent.run(async () => new Response(privateValue, { status: 404 })), false);
  assert.deepEqual(absent.calls, [url]);
  assert.equal(absent.reports[0].result, 'MISSING');
  assert.equal(absent.reports[0].configurationSource, 'SERVICE_LEVEL_ABSENT');
  assert.equal(absent.reports[0].inheritedConfiguration, 'NOT_DETERMINED');
  assert.equal(absent.reports[0].httpStatus, 404);
  assert.ok(!JSON.stringify(absent.reports).includes(privateValue));
});

test('401/403, masked or substituted keys, non-200 success and transport failures are UNVERIFIED', async () => {
  for (const status of [401, 403]) {
    const f = fixture();
    assert.equal(await f.run(async () => new Response(privateValue + credential, { status })), false);
    assert.deepEqual(f.calls, [url]);
    assert.equal(f.reports[0].result, 'UNVERIFIED');
    assert.equal(f.reports[0].httpStatus, status);
    assert.equal(f.reports[0].configurationSource, 'NOT_ESTABLISHED');
    assert.ok(!JSON.stringify(f.reports).includes(privateValue));
    assert.ok(!JSON.stringify(f.reports).includes(credential));
  }
  for (const response of [Response.json({ key: 'SomeForeignKey', value: required }),
    Response.json({ key, value: null }), Response.json({ key, value: '********' }),
    Response.json({ key, value: required }, { status: 201 }),
    new Response(privateValue, { status: 200 })]) {
    const f = fixture();
    assert.equal(await f.run(async () => response), false);
    assert.equal(f.reports[0].result, 'UNVERIFIED');
    assert.ok(!JSON.stringify(f.reports).includes(privateValue));
    assert.ok(!JSON.stringify(f.reports).includes(required));
  }
  const network = fixture();
  assert.equal(await network.run(async () => { throw Error(credential + privateValue); }), false);
  assert.equal(network.reports[0].result, 'UNVERIFIED');
  assert.equal(Object.hasOwn(network.reports[0], 'httpStatus'), false);
  assert.ok(!JSON.stringify(network.reports).includes(credential));
});

test('protected context, first attempt, mode and credential gate requests', async () => {
  for (const change of [e => e.GITHUB_EVENT_NAME = 'pull_request', e => e.GITHUB_REF = 'refs/heads/feature',
    e => e.GITHUB_REF_PROTECTED = 'false', e => e.GITHUB_ACTOR_ID = '1',
    e => e.GITHUB_WORKFLOW_SHA = 'b'.repeat(40), e => e.GITHUB_RUN_ATTEMPT = '2',
    e => e.GITHUB_RUN_ID = 'invalid', e => e.PROVIDER_CHECK_MODE = 'render-env-diagnostic']) {
    const f = fixture(); change(f.env);
    await assert.rejects(f.run(async () => Response.json({ key, value: required })), /CONTEXT_DENIED/);
    assert.equal(f.calls.length, 0); assert.equal(f.reports.length, 0);
  }
  const missing = fixture(); delete missing.env.RENDER_API_KEY;
  assert.equal(await missing.run(async () => { throw Error('fetch must not occur'); }), false);
  assert.equal(missing.calls.length, 0);
  assert.equal(missing.reports[0].result, 'UNVERIFIED');
  assert.equal(providerCheckMode(fixture().env), 'render-decision-path-diagnostic');
});

test('existing workflow isolates one opt-in mode and only its Render credential', () => {
  const yaml = readFileSync(new URL('../../.github/workflows/provider-credential-check.yml', import.meta.url), 'utf8');
  assert.match(yaml, /render_decision_path_diagnostic:[\s\S]*?type: boolean\s+default: false/);
  assert.match(yaml, /inputs\.render_decision_path_diagnostic && \(\(inputs\.render_commissioned_state_diagnostic \|\| inputs\.render_baseline_diagnostic \|\| inputs\.render_env_diagnostic \|\| inputs\.native_recovery_readback\) && 'invalid'/);
  const step = yaml.slice(yaml.indexOf('      - name: Compare fixed service-level D10 DecisionPath'),
    yaml.indexOf('      - name: Inspect fixed Render baseline'));
  assert.match(step, /if: \$\{\{ inputs\.render_decision_path_diagnostic && !inputs\.render_env_diagnostic && !inputs\.render_baseline_diagnostic && !inputs\.render_commissioned_state_diagnostic && !inputs\.native_recovery_readback \}\}/);
  assert.deepEqual([...step.matchAll(/secrets\.(\w+)/g)].map(m => m[1]), ['RENDER_API_KEY']);
  assert.match(step, /verify-provider-credentials\.mjs verify/);
  assert.ok(yaml.indexOf('.mjs context') < yaml.indexOf('      - name: Compare fixed service-level D10 DecisionPath'));
  assert.doesNotMatch(yaml, /upload-artifact|pull_request_target|id-token:|release-control\.mjs|deploy\.yml/);
});
