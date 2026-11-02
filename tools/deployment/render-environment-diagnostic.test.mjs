import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { diagnoseRenderEnvironment, providerCheckMode } from './verify-provider-credentials.mjs';
import { cleanStartRuntimeSettings } from './runtime-readiness.mjs';
import { targets } from './release-control.mjs';

const sha = 'a'.repeat(40), secret = 'diagnostic-token-canary', privateBody = 'private-response-canary';
const root = `https://api.render.com/v1/services/${targets.render.id}`;
function fixture() {
  const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REPOSITORY: targets.executor.repository, GITHUB_REPOSITORY_ID: '1423239668',
    GITHUB_REF: 'refs/heads/main', GITHUB_REF_PROTECTED: 'true', GITHUB_SHA: sha, GITHUB_WORKFLOW_SHA: sha,
    GITHUB_WORKFLOW_REF: `${targets.executor.repository}/.github/workflows/provider-credential-check.yml@refs/heads/main`,
    GITHUB_ACTOR: 'Xolani-M', GITHUB_ACTOR_ID: '86495928', GITHUB_TRIGGERING_ACTOR: 'Xolani-M',
    GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', PROVIDER_CHECK_MODE: 'render-env-diagnostic', RENDER_API_KEY: secret };
  const calls = [], reports = [];
  const fetcher = async (url, options) => {
    calls.push(url);
    assert.equal(options.method, 'GET'); assert.equal(options.body, undefined);
    assert.equal(options.redirect, 'error'); assert.equal(options.headers.Authorization, 'Bearer ' + secret);
    if (url === root) return Response.json({ id: targets.render.id, name: targets.render.name });
    assert.ok(url.startsWith(root + '/env-vars/'));
    const key = url.slice((root + '/env-vars/').length);
    assert.ok(Object.hasOwn(cleanStartRuntimeSettings, key));
    return Response.json({ key, value: cleanStartRuntimeSettings[key][0] });
  };
  const run = (read = fetcher) => diagnoseRenderEnvironment(env, { checkoutSha: sha, fetcher: read, emit: r => reports.push(r) });
  return { env, calls, reports, fetcher, run };
}

test('diagnostic uses only the fixed service and all thirteen ordered non-secret keys without Vercel credentials', async () => {
  const f = fixture(); assert.equal(await f.run(), true);
  const keys = Object.keys(cleanStartRuntimeSettings);
  assert.equal(keys.length, 13);
  assert.equal(keys.at(-1), 'App__AQGreenV2__Commissioning__AdmissionMode');
  assert.deepEqual(f.calls, [root, ...keys.map(k => root + '/env-vars/' + k)]);
  assert.deepEqual(f.reports.filter(r => r.key).map(r => r.key), keys);
  assert.ok(f.reports.filter(r => r.key).every(r => r.httpStatus === 200 && r.configurationSource === 'SERVICE_LEVEL'));
  assert.ok(f.reports.every(r => r.executorSha === sha && r.runId === '123' && r.runAttempt === 1));
  assert.ok(!JSON.stringify(f.reports).includes(secret));
  assert.ok(f.reports.every(r => !Object.hasOwn(r, 'value') && !Object.hasOwn(r, 'url')));
});

test('untrusted context, alternate modes, missing credentials and later attempts deny before any diagnostic request', async () => {
  for (const change of [e => e.GITHUB_EVENT_NAME = 'pull_request', e => e.GITHUB_REF = 'refs/heads/feature',
    e => e.GITHUB_REF_PROTECTED = 'false', e => e.GITHUB_ACTOR_ID = '1',
    e => e.GITHUB_WORKFLOW_SHA = 'b'.repeat(40), e => e.GITHUB_RUN_ATTEMPT = '2',
    e => e.GITHUB_RUN_ID = 'invalid', e => e.PROVIDER_CHECK_MODE = 'verify', e => e.PROVIDER_CHECK_MODE = 'invalid']) {
    const f = fixture(); change(f.env);
    await assert.rejects(f.run(), /CONTEXT_DENIED/); assert.equal(f.calls.length, 0);
  }
  const f = fixture(); delete f.env.RENDER_API_KEY;
  assert.equal(await f.run(), false); assert.equal(f.calls.length, 0);
  assert.equal(f.reports.at(-1).classification, 'CREDENTIAL_MISSING');
  assert.throws(() => providerCheckMode({ PROVIDER_CHECK_MODE: 'invalid' }), /CONTEXT_DENIED/);
});

test('each rejected variable read records its exact key and status then stops without retry or source fallback', async () => {
  const keys = Object.keys(cleanStartRuntimeSettings);
  for (const key of keys) {
    const f = fixture(); let failures = 0;
    assert.equal(await f.run(async (url, options) => {
      if (url === root + '/env-vars/' + key) {
        f.calls.push(url); failures++;
        return new Response(privateBody + secret, { status: 404 });
      }
      return f.fetcher(url, options);
    }), false);
    assert.equal(failures, 1); assert.equal(f.calls.length, keys.indexOf(key) + 2);
    const failure = f.reports.at(-1);
    assert.equal(failure.key, key); assert.equal(failure.httpStatus, 404);
    assert.equal(failure.classification, 'RESOURCE_OR_VARIABLE_UNAVAILABLE');
    assert.equal(failure.configurationSource, 'NOT_ESTABLISHED');
    assert.equal(failure.inheritedConfiguration, 'NOT_DETERMINED');
    assert.ok(!JSON.stringify(f.reports).includes(privateBody));
    assert.ok(!JSON.stringify(f.reports).includes(secret));
  }
});

test('HTTP, transport, format and configuration rejections stay distinct without disclosing bodies or values', async () => {
  const cases = [[401, 'AUTHENTICATION_REJECTED'], [403, 'PERMISSION_OR_POLICY_DENIED'],
    [429, 'RATE_LIMITED'], [500, 'PROVIDER_UNAVAILABLE'], [302, 'HTTP_REJECTED']];
  for (const [status, category] of cases) {
    const f = fixture();
    assert.equal(await f.run(async () => new Response(privateBody + secret, { status })), false);
    assert.equal(f.reports.at(-1).httpStatus, status);
    assert.equal(f.reports.at(-1).classification, category);
    assert.ok(!JSON.stringify(f.reports).includes(privateBody));
  }
  const network = fixture();
  assert.equal(await network.run(async () => { throw Error(secret + privateBody); }), false);
  assert.equal(network.reports.at(-1).classification, 'TRANSPORT_UNAVAILABLE');
  assert.equal(Object.hasOwn(network.reports.at(-1), 'httpStatus'), false);
  const malformed = fixture();
  assert.equal(await malformed.run(async () => new Response(privateBody)), false);
  assert.equal(malformed.reports.at(-1).classification, 'RESPONSE_IDENTITY_OR_SHAPE_UNVERIFIED');
  const changed = fixture();
  assert.equal(await changed.run((url, options) => url.endsWith('/ASPNETCORE_ENVIRONMENT') ?
    Response.json({ key: 'ASPNETCORE_ENVIRONMENT', value: privateBody }) : changed.fetcher(url, options)), false);
  assert.equal(changed.reports.find(r => r.key === 'ASPNETCORE_ENVIRONMENT').classification, 'ALLOWLISTED_CONFIGURATION_MISMATCH');
  const substituted = fixture();
  assert.equal(await substituted.run((url, options) => url.endsWith('/ASPNETCORE_ENVIRONMENT') ?
    Response.json({ key: privateBody, value: secret }) : substituted.fetcher(url, options)), false);
  assert.equal(substituted.reports.at(-1).key, 'ASPNETCORE_ENVIRONMENT');
  assert.equal(substituted.reports.at(-1).classification, 'RESPONSE_IDENTITY_OR_SHAPE_UNVERIFIED');
  const unexpectedSuccess = fixture();
  assert.equal(await unexpectedSuccess.run((url, options) => url.endsWith('/ASPNETCORE_ENVIRONMENT') ?
    Response.json({ key: 'ASPNETCORE_ENVIRONMENT', value: 'Production' }, { status: 201 }) :
    unexpectedSuccess.fetcher(url, options)), false);
  assert.equal(unexpectedSuccess.reports.at(-1).classification, 'HTTP_REJECTED');
  assert.equal(unexpectedSuccess.reports.at(-1).httpStatus, 201);
  for (const f of [network, malformed, changed, substituted]) for (const value of [secret, privateBody])
    assert.ok(!JSON.stringify(f.reports).includes(value));
});

test('diagnostic is opt-in, mutually exclusive with recovery readback, and gets only the existing protected Render secret', () => {
  const yaml = readFileSync(new URL('../../.github/workflows/provider-credential-check.yml', import.meta.url), 'utf8');
  assert.match(yaml, /render_env_diagnostic:[\s\S]*?type: boolean\s+default: false/);
  assert.match(yaml, /inputs\.native_recovery_readback && 'invalid'/);
  assert.match(yaml, /if: \$\{\{ !inputs\.render_env_diagnostic \}\}/);
  const diagnostic = yaml.slice(yaml.indexOf('      - name: Diagnose allowlisted Render'));
  assert.match(diagnostic, /if: \$\{\{ inputs\.render_env_diagnostic \}\}/);
  assert.deepEqual([...diagnostic.matchAll(/secrets\.(\w+)/g)].map(m => m[1]), ['RENDER_API_KEY']);
  assert.ok(yaml.indexOf('.mjs context') < yaml.indexOf('secrets.RENDER_API_KEY'));
  assert.doesNotMatch(yaml, /deploy\.yml|release-control\.mjs|upload-artifact|pull_request_target/);
});
