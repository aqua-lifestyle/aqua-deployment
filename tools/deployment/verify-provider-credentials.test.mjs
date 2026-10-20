import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { providerCheckContext, verifyProviderCredentials } from './verify-provider-credentials.mjs';
import { targets, standingPolicy } from './release-control.mjs';
import { runtimeSettings } from './runtime-readiness.mjs';

const sha = 'a'.repeat(40), renderSecret = 'render-private-canary', vercelSecret = 'vercel-private-canary';
const privateResponse = 'provider-response-private-canary';
const renderRoot = 'https://api.render.com/v1', vercelRoot = 'https://api.vercel.com';
function setup() {
  const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REPOSITORY: targets.executor.repository, GITHUB_REPOSITORY_ID: '1423239668',
    GITHUB_REF: 'refs/heads/main', GITHUB_REF_PROTECTED: 'true', GITHUB_SHA: sha,
    GITHUB_WORKFLOW_SHA: sha,
    GITHUB_WORKFLOW_REF: `${targets.executor.repository}/.github/workflows/provider-credential-check.yml@refs/heads/main`,
    GITHUB_ACTOR: 'Xolani-M', GITHUB_ACTOR_ID: '86495928', GITHUB_TRIGGERING_ACTOR: 'Xolani-M',
    RENDER_API_KEY: renderSecret, VERCEL_TOKEN: vercelSecret };
  const baseline = standingPolicy.firstReleaseRecovery.baseline;
  const responses = new Map();
  const add = (root, path, body) => responses.set(root + path + (root === vercelRoot ?
    (path.includes('?') ? '&' : '?') + `teamId=${targets.vercel.teamId}` : ''), body);
  add(renderRoot, '/users', { id: 'usr-d9f04o3tqb8s73bbhjbg', email: privateResponse });
  add(renderRoot, `/services/${targets.render.id}`, { id: targets.render.id, name: targets.render.name });
  add(renderRoot, `/services/${targets.render.id}/deploys?limit=1`, []);
  add(renderRoot, `/services/${targets.render.id}/deploys/${baseline.renderDeployId}`,
    { id: baseline.renderDeployId, commit: { id: baseline.renderSha } });
  for (const key of Object.keys(runtimeSettings)) add(renderRoot,
    `/services/${targets.render.id}/env-vars/${key}`, { key, value: privateResponse });
  responses.set(`${vercelRoot}/v2/teams/${targets.vercel.teamId}`, { id: targets.vercel.teamId });
  add(vercelRoot, `/v9/projects/${targets.vercel.id}`,
    { id: targets.vercel.id, accountId: targets.vercel.teamId });
  add(vercelRoot, `/v10/projects/${targets.vercel.id}/env?decrypt=false`,
    { envs: [{ key: 'SENSITIVE', value: privateResponse }] });
  add(vercelRoot, `/v6/deployments?projectId=${targets.vercel.id}&limit=1`, { deployments: [] });
  add(vercelRoot, `/v13/deployments/${baseline.vercelDeployId}`,
    { id: baseline.vercelDeployId, projectId: targets.vercel.id });
  add(vercelRoot, `/v2/deployments/${baseline.vercelDeployId}/aliases`, { aliases: [] });
  add(vercelRoot, `/v9/projects/${targets.vercel.id}/domains/${baseline.productionDomain}`,
    { name: baseline.productionDomain, projectId: targets.vercel.id });
  const calls = [], reports = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    assert.ok(responses.has(url), 'only approved fixed GET destinations');
    assert.equal(options.method, 'GET'); assert.equal(options.body, undefined);
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, `Bearer ${url.startsWith(renderRoot) ? renderSecret : vercelSecret}`);
    return Response.json(responses.get(url));
  };
  const run = (transport = fetcher, checkoutSha = sha) => verifyProviderCredentials(env,
    { checkoutSha, fetcher: transport, emit: row => reports.push(row) });
  return { env, responses, calls, reports, fetcher, run };
}

test('both approved administrators can verify credentials only from the exact protected main workflow', async () => {
  for (const admin of standingPolicy.authorization.administrators) {
    const f = setup(); f.env.GITHUB_ACTOR = admin.login; f.env.GITHUB_ACTOR_ID = String(admin.id);
    f.env.GITHUB_TRIGGERING_ACTOR = admin.login;
    assert.equal(await f.run(), true);
  }
  for (const change of [e => e.GITHUB_ACTIONS = 'false', e => e.GITHUB_EVENT_NAME = 'pull_request',
    e => e.GITHUB_EVENT_NAME = 'pull_request_target', e => e.GITHUB_REPOSITORY = 'untrusted/fork',
    e => e.GITHUB_REPOSITORY_ID = '1', e => e.GITHUB_REF = 'refs/heads/feature',
    e => e.GITHUB_REF_PROTECTED = 'false', e => e.GITHUB_SHA = 'b'.repeat(40),
    e => e.GITHUB_WORKFLOW_SHA = 'b'.repeat(40), e => e.GITHUB_WORKFLOW_REF = 'another/workflow',
    e => e.GITHUB_ACTOR_ID = '307076734', e => e.GITHUB_TRIGGERING_ACTOR = 'contributor']) {
    const f = setup(); change(f.env);
    await assert.rejects(f.run(), /CONTEXT_DENIED/); assert.equal(f.calls.length, 0);
  }
  assert.throws(() => providerCheckContext(setup().env, 'c'.repeat(40)), /CONTEXT_DENIED/);
});

test('required reads are GET-only on fixed targets, with provider tokens and responses absent from output', async () => {
  const f = setup(); assert.equal(await f.run(), true);
  assert.equal(f.calls.length, f.responses.size);
  assert.ok(f.calls.every(c => !c.url.includes('decrypt=true') && !c.url.includes('/secret-files')));
  assert.deepEqual(f.reports.filter(r => r.result === 'PASS'), [
    { provider: 'Render', result: 'PASS', authentication: 'PASS', requiredReads: 'PASS' },
    { provider: 'Vercel', result: 'PASS', authentication: 'PASS', requiredReads: 'PASS' }
  ]);
  for (const secret of [renderSecret, vercelSecret, privateResponse])
    assert.ok(!JSON.stringify(f.reports).includes(secret));
});

test('team-scoped verification does not depend on personal user access and uses documented endpoint context', async () => {
  const f = setup();
  assert.equal(await f.run((url, options) => new URL(url).pathname === '/v2/user' ?
    new Response(null, { status: 404 }) : f.fetcher(url, options)), true);
  assert.ok(!f.calls.some(c => new URL(c.url).pathname === '/v2/user'));
  assert.ok(f.calls.some(c => c.url === vercelRoot + '/v2/teams/' + targets.vercel.teamId));
  assert.ok(f.calls.some(c => c.url === vercelRoot + '/v9/projects/' + targets.vercel.id + '?teamId=' + targets.vercel.teamId));
  for (const body of [{ id: targets.vercel.id, accountId: 'another-team' },
    { id: 'another-project', accountId: targets.vercel.teamId }]) {
    const x = setup(), projectUrl = vercelRoot + '/v9/projects/' + targets.vercel.id + '?teamId=' + targets.vercel.teamId;
    x.responses.set(projectUrl, body);
    assert.equal(await x.run(), false);
    const failure = x.reports.find(r => r.provider === 'Vercel' && r.result === 'FAIL');
    assert.equal(failure.check, 'project'); assert.equal(failure.authentication, 'PASS');
    assert.equal(failure.failureCategory, 'RESPONSE_IDENTITY_OR_FORMAT_UNVERIFIED');
    assert.ok(!x.calls.some(c => c.url.includes('/env?')));
  }
});

test('missing credentials deny before any provider request without CLI or other-token fallback', async () => {
  for (const name of ['RENDER_API_KEY', 'VERCEL_TOKEN']) for (const value of [undefined, '', '   ']) {
    const f = setup(); f.env[name] = value;
    assert.equal(await f.run(), false); assert.equal(f.calls.length, 0);
    assert.deepEqual(f.reports, [{ check: name, result: 'FAIL', code: 'CREDENTIAL_MISSING' }]);
  }
});

test('every failed permission read stops that provider without retry, redirect or scope expansion', async () => {
  for (const url of setup().responses.keys()) {
    const f = setup(), failedProvider = url.startsWith(renderRoot) ? 'Render' : 'Vercel';
    let failedCalls = 0;
    const ok = await f.run(async (request, options) => {
      if (request === url) { failedCalls++; return new Response(privateResponse, { status: 403 }); }
      return f.fetcher(request, options);
    });
    assert.equal(ok, false); assert.equal(failedCalls, 1);
    const failure = f.reports.find(r => r.provider === failedProvider && r.result === 'FAIL');
    assert.ok(failure); assert.equal(failure.requiredReads, 'FAIL');
    assert.ok(f.reports.some(r => r.provider === failedProvider && r.httpStatus === 403));
    assert.ok(!JSON.stringify(f.reports).includes(privateResponse));
  }
  for (const status of [401, 402, 429, 500, 302]) {
    const f = setup();
    assert.equal(await f.run(async () => new Response(privateResponse, { status,
      headers: { location: 'https://attacker.invalid/' } })), false);
    assert.ok(f.reports.filter(r => r.httpStatus).every(r => r.httpStatus === status));
  }
});

test('substituted identities/resources, malformed bodies and secret-bearing errors cannot pass or leak', async () => {
  for (const [url, body] of setup().responses) {
    const f = setup(); f.responses.set(url, Array.isArray(body) ? {} : null);
    assert.equal(await f.run(), false);
  }
  for (const path of ['/users', `/v2/teams/${targets.vercel.teamId}`,
    `/v9/projects/${targets.vercel.id}`]) {
    const f = setup(), url = [...f.responses.keys()].find(url => new URL(url).pathname.endsWith(path));
    f.responses.set(url, { id: 'wrong-identity', user: { id: 'wrong-user' }, accountId: 'wrong-team' });
    assert.equal(await f.run(), false);
  }
  for (const transport of [async () => { throw Error(renderSecret + vercelSecret + privateResponse); },
    async () => new Response('invalid-json-' + privateResponse)]) {
    const f = setup(); assert.equal(await f.run(transport), false);
    for (const secret of [renderSecret, vercelSecret, privateResponse])
      assert.ok(!JSON.stringify(f.reports).includes(secret));
  }
});

test('Vercel diagnostics distinguish observed HTTP classes without exposing provider messages or guessing a 404 cause', async () => {
  const expected = [[400, 'REQUEST_CONTEXT_REJECTED', 'bad_request'],
    [401, 'AUTHENTICATION_REJECTED'], [402, 'PAYMENT_REQUIRED'],
    [403, 'PERMISSION_OR_POLICY_DENIED', 'forbidden'],
    [404, 'RESOURCE_OR_CONTEXT_NOT_FOUND', 'not_found'], [429, 'RATE_LIMITED', 'rate_limited']];
  for (const [status, category, providerCode] of expected) {
    const f = setup();
    assert.equal(await f.run((url, options) => url.startsWith(vercelRoot) ?
      Response.json({ error: { code: providerCode ?? privateResponse,
        message: privateResponse + vercelSecret } }, { status }) : f.fetcher(url, options)), false);
    const failure = f.reports.find(r => r.provider === 'Vercel' && r.result === 'FAIL');
    assert.equal(failure.httpStatus, status); assert.equal(failure.failureCategory, category);
    assert.equal(failure.providerErrorCode, providerCode);
    assert.equal(failure.authentication, 'NOT_VERIFIED');
    assert.ok(!f.reports.some(r => r.provider === 'Vercel' && r.check === 'project'));
    for (const secret of [renderSecret, vercelSecret, privateResponse])
      assert.ok(!JSON.stringify(f.reports).includes(secret));
  }
  const f = setup();
  assert.equal(await f.run((url, options) => url.startsWith(vercelRoot) ?
    Response.json({ error: { code: 'forbidden', message: privateResponse } }, { status: 401 }) :
    f.fetcher(url, options)), false);
  assert.equal(f.reports.find(r => r.provider === 'Vercel' && r.result === 'FAIL').failureCategory,
    'AUTHENTICATION_REJECTED'); // Status is not replaced by an ambiguous generic code.
});

test('dedicated workflow exposes provider secrets only in the protected main GET-check step', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/provider-credential-check.yml', import.meta.url), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request|push:|workflow_run|repository_dispatch|id-token:|write|npm ci/);
  assert.match(workflow, /github.ref == 'refs\/heads\/main' && github.ref_protected/);
  assert.match(workflow, /github.repository_id == '1423239668'/);
  for (const id of ['86495928', '307076734']) assert.ok(workflow.includes(`github.actor_id == '${id}'`));
  assert.match(workflow, /environment: production-release/);
  assert.match(workflow, /ref: \$\{\{ github.sha \}\}/);
  assert.ok(workflow.indexOf('.mjs context') < workflow.indexOf('secrets.RENDER_API_KEY'));
  assert.deepEqual([...workflow.matchAll(/secrets\.(\w+)/g)].map(m => m[1]), ['RENDER_API_KEY', 'VERCEL_TOKEN']);
  assert.doesNotMatch(workflow, /release-control\.mjs|deploy\.yml|upload-artifact/);
  assert.match(workflow, /verify-provider-credentials.mjs verify/);
  assert.doesNotMatch(readFileSync(new URL('../../.github/workflows/test.yml', import.meta.url), 'utf8'), /secrets\./);
});
