import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { diagnoseToken, runDiagnostic } from './evidence-token-diagnostic.mjs';

const executor = 'aqua-lifestyle/aqua-deployment', sha = 'a'.repeat(40);
const source = '1b748dfdaf3b63fb9dcc42f781ab79d5c39ca503';
const url = `https://api.github.com/repos/aqua-lifestyle/aqua-lifestyle/git/commits/${source}`;
const secret = 'evidence-private-canary', privateBody = 'private-response-canary';
function fixture() {
  const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: executor,
    GITHUB_REPOSITORY_ID: '1423239668', GITHUB_REF: 'refs/heads/main', GITHUB_REF_PROTECTED: 'true',
    GITHUB_SHA: sha, GITHUB_WORKFLOW_SHA: sha,
    GITHUB_WORKFLOW_REF: `${executor}/.github/workflows/evidence-token-diagnostic.yml@refs/heads/main`,
    GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_ACTOR: 'Xolani-M',
    GITHUB_ACTOR_ID: '86495928', GITHUB_TRIGGERING_ACTOR: 'Xolani-M', AQGREEN_EVIDENCE_READ_TOKEN: secret,
    GH_TOKEN: 'job-token-canary', RENDER_API_KEY: 'render-canary', VERCEL_TOKEN: 'vercel-canary',
    DIAGNOSTIC_URL: 'https://attacker.invalid/', SOURCE_SHA: 'b'.repeat(40) };
  const calls = [], output = [];
  const fetcher = async (endpoint, options) => {
    calls.push({ endpoint, options }); return Response.json({ sha: source, url, message: privateBody });
  };
  const run = (read = fetcher, mode = 'verify', checkoutSha = sha) => runDiagnostic(env,
    { mode, checkoutSha, fetcher: read, emit: line => output.push(line) });
  return { env, calls, output, fetcher, run };
}

test('both trusted administrators can issue only the fixed authenticated GET and report the exact object match', async () => {
  for (const [login, id] of [['Xolani-M', '86495928'], ['aqualifestyleclub', '307076734']]) {
    const f = fixture(); Object.assign(f.env, { GITHUB_ACTOR: login, GITHUB_ACTOR_ID: id, GITHUB_TRIGGERING_ACTOR: login });
    assert.equal(await f.run(), 0); assert.equal(f.calls.length, 1);
    const { endpoint, options } = f.calls[0]; assert.equal(endpoint, url);
    assert.equal(options.method, 'GET'); assert.equal(options.body, undefined);
    assert.equal(options.redirect, 'manual'); assert.ok(options.signal instanceof AbortSignal);
    assert.deepEqual(options.headers, { Authorization: `Bearer ${secret}`, Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28' });
    assert.deepEqual(JSON.parse(f.output[0]), { httpStatus: 200, classification: 'COMMIT_OBJECT_MATCH',
      objectMatch: 'MATCH', verdict: 'TOKEN ACCESS VERIFIED' });
    for (const value of [secret, privateBody, 'job-token-canary', 'render-canary', 'vercel-canary', url])
      assert.ok(!f.output.join('').includes(value));
  }
});

test('untrusted context, replaced checkout, another workflow and reruns deny before any credential request', async () => {
  for (const change of [e => e.GITHUB_ACTIONS = 'false', e => e.GITHUB_EVENT_NAME = 'pull_request',
    e => e.GITHUB_EVENT_NAME = 'pull_request_target', e => e.GITHUB_REPOSITORY = 'foreign/repository',
    e => e.GITHUB_REPOSITORY_ID = '1', e => e.GITHUB_REF = 'refs/heads/feature',
    e => e.GITHUB_REF_PROTECTED = 'false', e => e.GITHUB_SHA = 'b'.repeat(40),
    e => e.GITHUB_WORKFLOW_SHA = 'b'.repeat(40), e => e.GITHUB_WORKFLOW_REF = 'foreign/workflow',
    e => e.GITHUB_RUN_ID = '', e => e.GITHUB_RUN_ATTEMPT = '2', e => e.GITHUB_ACTOR_ID = '307076734',
    e => e.GITHUB_TRIGGERING_ACTOR = 'contributor']) {
    const f = fixture(); change(f.env); assert.equal(await f.run(), 1); assert.equal(f.calls.length, 0);
    assert.deepEqual(JSON.parse(f.output[0]), { classification: 'PROTECTED_CONTEXT_DENIED',
      objectMatch: 'NOT_DETERMINED', verdict: 'TOKEN ACCESS INDETERMINATE' });
  }
  const f = fixture(); assert.equal(await f.run(f.fetcher, 'verify', 'b'.repeat(40)), 1); assert.equal(f.calls.length, 0);
});

test('pre-secret context mode is credential-free, and unsupported modes cannot issue a request', async () => {
  const f = fixture(); delete f.env.AQGREEN_EVIDENCE_READ_TOKEN;
  assert.equal(await f.run(f.fetcher, 'context'), 0); assert.equal(f.calls.length, 0); assert.deepEqual(f.output, []);
  assert.equal(await f.run(f.fetcher, 'deploy'), 1); assert.equal(f.calls.length, 0);
  assert.equal(JSON.parse(f.output[0]).classification, 'DIAGNOSTIC_MODE_INVALID');
});

test('missing or malformed explicit read token stays indeterminate with no job-token or provider fallback', async () => {
  for (const value of [undefined, '', ' ', 'token\nheader', 'token\0suffix']) {
    const f = fixture(); f.env.AQGREEN_EVIDENCE_READ_TOKEN = value;
    assert.equal(await f.run(), 1); assert.equal(f.calls.length, 0);
    assert.deepEqual(JSON.parse(f.output[0]), { classification: 'CREDENTIAL_MISSING_OR_INVALID',
      objectMatch: 'NOT_DETERMINED', verdict: 'TOKEN ACCESS INDETERMINATE' });
  }
});

test('401 and 403 establish observed request denial without parsing private bodies or inventing a missing permission', async () => {
  for (const [status, classification] of [[401, 'AUTHENTICATION_REJECTED'], [403, 'ACCESS_OR_POLICY_DENIED']]) {
    const f = fixture(); let calls = 0;
    assert.equal(await f.run(async () => { calls++; return { status, get body() { assert.fail('must not read error body'); } }; }), 1);
    assert.equal(calls, 1);
    assert.deepEqual(JSON.parse(f.output[0]), { httpStatus: status, classification,
      objectMatch: 'NOT_DETERMINED', verdict: 'TOKEN ACCESS DENIED' });
  }
});

test('404, rate limits, server errors and redirects retain their observed statuses and indeterminate capability', async () => {
  for (const [status, classification] of [[404, 'RESOURCE_OR_ACCESS_UNAVAILABLE'], [429, 'RATE_LIMITED'],
    [500, 'GITHUB_UNAVAILABLE'], [503, 'GITHUB_UNAVAILABLE'], [302, 'REDIRECT_REJECTED'], [400, 'HTTP_REJECTED']]) {
    const f = fixture(); let calls = 0;
    assert.equal(await f.run(async (endpoint, options) => {
      calls++; assert.equal(endpoint, url); assert.equal(options.redirect, 'manual');
      return new Response(privateBody + secret, { status, headers: { location: 'https://attacker.invalid/' } });
    }), 1);
    assert.equal(calls, 1);
    assert.deepEqual(JSON.parse(f.output[0]), { httpStatus: status, classification,
      objectMatch: 'NOT_DETERMINED', verdict: 'TOKEN ACCESS INDETERMINATE' });
    assert.doesNotMatch(f.output[0], /canary|attacker/);
  }
});

test('a 200 response cannot verify a substituted SHA, repository or unrecognizable object', async () => {
  for (const object of [{ sha: 'b'.repeat(40), url }, { sha: source, url: url.replace('aqua-lifestyle/aqua-lifestyle', 'foreign/repo') },
    { sha: source }, {}, null, []]) {
    const f = fixture(); assert.equal(await f.run(async () => Response.json(object)), 1);
    assert.deepEqual(JSON.parse(f.output[0]), { httpStatus: 200, classification: 'COMMIT_OBJECT_MISMATCH',
      objectMatch: 'MISMATCH', verdict: 'TOKEN ACCESS INDETERMINATE' });
  }
});

test('invalid, oversized or interrupted success bodies are not exposed or converted to an object mismatch', async () => {
  for (const response of [new Response(privateBody + secret), new Response('x'.repeat(1024 * 1024 + 1)),
    new Response(new ReadableStream({ start(controller) { controller.error(Error(privateBody + secret)); } }))]) {
    const f = fixture(); assert.equal(await f.run(async () => response), 1);
    assert.deepEqual(JSON.parse(f.output[0]), { httpStatus: 200, classification: 'RESPONSE_UNVERIFIABLE',
      objectMatch: 'NOT_DETERMINED', verdict: 'TOKEN ACCESS INDETERMINATE' });
  }
});

test('transport failures expose no error text, do not invent an HTTP status and never retry', async () => {
  const f = fixture(); let calls = 0;
  assert.equal(await f.run(async () => { calls++; throw Error(privateBody + secret); }), 1); assert.equal(calls, 1);
  assert.deepEqual(JSON.parse(f.output[0]), { classification: 'TRANSPORT_UNAVAILABLE',
    objectMatch: 'NOT_DETERMINED', verdict: 'TOKEN ACCESS INDETERMINATE' });
  await assert.rejects(diagnoseToken({ ...f.env, GITHUB_REF_PROTECTED: 'false' },
    { checkoutSha: sha, fetcher: f.fetcher }), /PROTECTED_CONTEXT_DENIED/);
  assert.equal(f.calls.length, 0);
});

test('workflow is input-free, protected-main/manual/first-attempt only, and limits the read secret to one fixed step', () => {
  const yaml = readFileSync(new URL('../../.github/workflows/evidence-token-diagnostic.yml', import.meta.url), 'utf8');
  assert.match(yaml, /workflow_dispatch:/);
  assert.match(yaml, /github.ref == 'refs\/heads\/main' && github.ref_protected/);
  assert.match(yaml, /github.run_attempt == 1/);
  assert.match(yaml, /github.repository_id == '1423239668'/);
  for (const id of ['86495928', '307076734']) assert.ok(yaml.includes(`github.actor_id == '${id}'`));
  assert.doesNotMatch(yaml, /inputs:|pull_request|push:|workflow_run|repository_dispatch|environment:|id-token:|write|npm|RENDER|VERCEL/);
  assert.match(yaml, /permissions:\s+contents: read/);
  assert.match(yaml, /ref: \$\{\{ github.sha \}\}/); assert.match(yaml, /persist-credentials: false/);
  assert.deepEqual([...yaml.matchAll(/uses: (\S+)/g)].map(m => m[1]), [
    'actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803',
    'actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38']);
  assert.ok(yaml.indexOf('.mjs context') < yaml.indexOf('secrets.AQGREEN_EVIDENCE_READ_TOKEN'));
  assert.deepEqual([...yaml.matchAll(/secrets\.(\w+)/g)].map(m => m[1]), ['AQGREEN_EVIDENCE_READ_TOKEN']);
  assert.doesNotMatch(yaml, /deploy\.yml|release-control\.mjs|fetch-source\.mjs|upload-artifact|curl/);
  assert.doesNotMatch(readFileSync(new URL('../../.github/workflows/test.yml', import.meta.url), 'utf8'), /secrets\./);
});
