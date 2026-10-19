import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { approvedCredentialContext, checkCredential } from './verify-evidence-credential.mjs';
import { approvedReadbacks } from './governance-readback.mjs';
import { fixture } from './fixtures/provider.mjs';
import { targets } from './release-control.mjs';

const executor = targets.executor.repository, source = targets.repository;
const head = 'd'.repeat(40), label = `readpat-${head}`, token = 'private-evidence-canary';
function setup() {
  const event = { action: 'labeled', repository: { full_name: executor }, label: { name: label },
    sender: { login: 'Xolani-M', id: 86495928 }, pull_request: { number: 1, state: 'open',
      head: { sha: head, repo: { full_name: executor } }, base: { ref: 'main', repo: { full_name: executor } },
      labels: [{ name: label }] } };
  const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'pull_request', GITHUB_REPOSITORY: executor,
    GITHUB_REF: 'refs/pull/1/merge', GITHUB_RUN_ATTEMPT: '1', GITHUB_ACTOR: 'Xolani-M',
    GITHUB_ACTOR_ID: '86495928', GITHUB_TRIGGERING_ACTOR: 'Xolani-M',
    GITHUB_WORKFLOW_REF: `${executor}/.github/workflows/credential-check.yml@refs/pull/1/merge`,
    GH_TOKEN: 'own-job-canary', AQGREEN_EVIDENCE_READ_TOKEN: token,
    RENDER_API_KEY: 'forbidden-render-canary', VERCEL_TOKEN: 'forbidden-vercel-canary' };
  const f = fixture(), calls = [], reports = [];
  let check = { id: 777, name: 'Executor safety tests', app: { id: 15368 }, head_sha: head,
    status: 'completed', conclusion: 'success' };
  const route = async (repository, path) => {
    if (repository === executor) {
      if (path === '/pulls/1') return structuredClone(event.pull_request);
      if (path.startsWith(`/commits/${head}/check-runs?`)) return { total_count: 1, check_runs: [check] };
      if (path.startsWith('/rules/branches/main')) return [
        { type: 'deletion', ruleset_id: 25403847 }, { type: 'non_fast_forward', ruleset_id: 25403847 }];
      if (path === '/rulesets/25403847') {
        const live = structuredClone(approvedReadbacks.rulesets.find(r => r.repository === executor).ruleset);
        delete live.bypass_actors; return live;
      }
    }
    if (path === '/actions/runs?per_page=1') return { total_count: 1, workflow_runs: [{ id: 123, run_attempt: 1 }] };
    if (path.startsWith('/actions/workflows/ci.yml/runs?')) return { workflow_runs: [await f.api.gh('/actions/runs/123')] };
    if (path.startsWith('/contents/')) return { type: 'file', sha: 'a'.repeat(40) };
    if (repository === source && path === '/rulesets/19085283') return { id: 19085283, enforcement: 'active',
      source, source_type: 'Repository', target: 'branch', rules: [{ type: 'deletion' }, { type: 'non_fast_forward' }] };
    // Shared fixture supplies source jobs/checks, environment and artifact data.
    return f.api.gh(path);
  };
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.method, 'GET');
    const parsed = new URL(url);
    if (parsed.hostname === 'storage.example.invalid') {
      assert.equal(options.headers, undefined);
      return new Response(await f.api.artifact('source', '7890'));
    }
    assert.equal(parsed.origin, 'https://api.github.com');
    if (parsed.pathname === '/user') return Response.json({ login: 'Xolani-M', id: 86495928 });
    const match = parsed.pathname.match(/^\/repos\/(aqua-lifestyle\/(?:aqua-deployment|aqua-lifestyle))(.*)$/);
    assert.ok(match, 'only the two fixed GitHub repositories are allowed');
    if (match[2] === '/actions/artifacts/7890/zip') return new Response(null,
      { status: 302, headers: { location: 'https://storage.example.invalid/archive?signed=not-for-logs' } });
    return Response.json(await route(match[1], match[2] + parsed.search));
  };
  const run = (mode = 'verify', transport = fetcher) => checkCredential(env,
    { event, checkoutSha: head, mode, fetcher: transport, emit: row => reports.push(row) });
  return { event, env, f, calls, reports, run, fetcher, check };
}

test('only the administrator-approved exact same-repository head and first label attempt can check the credential', () => {
  const f = setup(); assert.equal(approvedCredentialContext(f.event, f.env, head), head);
  const changes = [x => x.event.action = 'synchronize', x => x.event.pull_request.number = 2,
    x => x.event.pull_request.head.repo.full_name = 'attacker/fork', x => x.event.label.name = 'readpat-other',
    x => x.event.pull_request.labels = [], x => x.event.sender.id = 1,
    x => x.env.GITHUB_ACTOR_ID = '1', x => x.env.GITHUB_TRIGGERING_ACTOR = 'contributor',
    x => x.env.GITHUB_RUN_ATTEMPT = '2', x => x.env.GITHUB_EVENT_NAME = 'pull_request_target',
    x => x.env.GITHUB_REF = 'refs/heads/main', x => x.env.GITHUB_ACTIONS = 'false',
    x => x.env.GITHUB_WORKFLOW_REF = 'other/workflow', x => x.event.pull_request.head.sha = 'e'.repeat(40)];
  for (const mutate of changes) { const x = setup(); mutate(x);
    assert.throws(() => approvedCredentialContext(x.event, x.env, head), /CONTEXT_DENIED/); }
});

test('pre-secret approval uses only the job token and requires trusted successful safety CI', async () => {
  const f = setup(); delete f.env.AQGREEN_EVIDENCE_READ_TOKEN;
  await f.run('context');
  assert.equal(f.calls.length, 2);
  assert.ok(f.calls.every(c => c.url.startsWith(`https://api.github.com/repos/${executor}/`) &&
    c.options.headers.Authorization === 'Bearer own-job-canary'));
  for (const mutate of [x => x.check.conclusion = 'skipped', x => x.check.status = 'in_progress',
    x => x.check.app.id = 1, x => x.check.head_sha = 'f'.repeat(40)]) {
    const x = setup(); mutate(x); await assert.rejects(x.run('context'), /SAFETY_CI_REQUIRED/);
  }
});

test('full credential check authenticates both repositories, archive integrity and governance without provider calls or secret output', async () => {
  const f = setup(); await f.run();
  assert.equal(f.reports.at(-1).result, 'PASS');
  assert.ok(f.calls.some(c => c.url.endsWith('/user')));
  assert.ok(f.calls.some(c => c.url.includes('/check-runs/')));
  assert.ok(f.calls.some(c => c.url.includes('/contents/')));
  assert.ok(f.calls.some(c => c.url.includes('/commits/') && c.url.includes('/pulls')));
  assert.ok(f.calls.some(c => c.url.includes('/actions/artifacts/7890/zip')));
  for (const repo of [source, executor]) for (const route of ['/rules/branches/main',
    '/environments/production-release', '/actions/runs?per_page=1'])
    assert.ok(f.calls.some(c => c.url.startsWith(`https://api.github.com/repos/${repo}${route}`)));
  assert.ok(f.calls.filter(c => c.url.startsWith('https://api.github.com/')).every(c =>
    c.options.headers.Authorization === `Bearer ${token}`));
  const output = JSON.stringify(f.reports);
  for (const secret of [token, 'forbidden-render-canary', 'forbidden-vercel-canary', 'signed=not-for-logs'])
    assert.ok(!output.includes(secret));
  assert.equal(f.f.state.providerCalls, 0);
});

test('missing credentials and untrusted context deny before any network request', async () => {
  for (const mutate of [x => delete x.env.AQGREEN_EVIDENCE_READ_TOKEN, x => x.event.sender.id = 1]) {
    const f = setup(); mutate(f); await assert.rejects(f.run(), /TOKEN_REQUIRED|CONTEXT_DENIED/);
    assert.equal(f.calls.length, 0);
  }
});

test('evidence token owners must match an approved username and its own immutable numeric ID', async () => {
  for (const identity of [{ login: 'Xolani-M', id: 86495928 }, { login: 'aqualifestyleclub', id: 307076734 }]) {
    const f = setup(); await f.run('verify', (url, options) => url.endsWith('/user') ?
      Response.json(identity) : f.fetcher(url, options));
    assert.equal(f.reports.at(-1).result, 'PASS');
  }
  for (const identity of [{ login: 'aqualifestyleclub', id: 86495928 },
    { login: 'Xolani-M', id: 307076734 }, { login: 'aqualifestyleclub', id: 1 },
    { login: 'contributor', id: 307076734 }, { login: 'contributor', id: 1 },
    { login: 'aqualifestyleclub', id: '307076734' }, { id: 307076734 }, {}]) {
    const f = setup(); await assert.rejects(f.run('verify', (url, options) => url.endsWith('/user') ?
      Response.json(identity) : f.fetcher(url, options)), /IDENTITY_MISMATCH/);
    assert.ok(!f.reports.some(r => r.check === 'evidence-read-access' && r.result === 'PASS'));
    assert.ok(!f.calls.some(c => c.url.startsWith(`https://api.github.com/repos/${source}/`)));
  }
});

test('any required read failure stops immediately without retry or scope fallback', async () => {
  for (const failedPath of ['/user', '/check-runs/200', '/actions/artifacts/7890/zip', '/contents/',
    '/rulesets/25403847', '/environments/production-release', '/actions/runs?per_page=1']) {
    const f = setup(); let failed = false;
    await assert.rejects(f.run('verify', async (url, options) => {
      assert.equal(failed, false, 'no subsequent request after a failed read');
      if (url.includes(failedPath)) { failed = true; return new Response(null, { status: 403 }); }
      return f.fetcher(url, options);
    }));
    assert.equal(failed, true); assert.equal(f.f.state.providerCalls, 0);
    assert.ok(f.reports.some(r => r.httpStatus === 403));
  }
});

test('artifact substitution, identity substitution and revoked approval cannot produce PASS', async () => {
  for (const [mutate, expected] of [
    [async (url, options, f) => url.endsWith('/user') ? Response.json({ login: 'contributor', id: 1 }) : f.fetcher(url, options), /IDENTITY_MISMATCH/],
    [async (url, options, f) => url.startsWith('https://storage.') ? new Response('forged archive') : f.fetcher(url, options), /DIGEST_MISMATCH/],
    [async (url, options, f) => { if (url.endsWith('/pulls/1') && f.calls.some(c => c.url.endsWith('/user')))
      f.event.pull_request.labels = []; return f.fetcher(url, options); }, /APPROVAL_CHANGED/]
  ]) { const f = setup(); await assert.rejects(f.run('verify', (url, options) => mutate(url, options, f)), expected);
    assert.ok(!f.reports.some(r => r.check === 'evidence-read-access' && r.result === 'PASS')); }
});

test('dedicated workflow gates secret exposure on a trusted SHA-specific label, never ordinary safety CI', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/credential-check.yml', import.meta.url), 'utf8');
  assert.match(workflow, /types: \[labeled\]/);
  assert.match(workflow, /github\.event\.pull_request\.number == 1/);
  assert.match(workflow, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  assert.match(workflow, /github\.event\.label\.name == format\('readpat-\{0\}', github\.event\.pull_request\.head\.sha\)/);
  assert.match(workflow, /github\.run_attempt == 1/);
  assert.match(workflow, /github\.actor_id == '86495928'/); assert.match(workflow, /github\.actor_id == '307076734'/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.ok(workflow.indexOf('.mjs context') < workflow.indexOf('secrets.AQGREEN_EVIDENCE_READ_TOKEN'));
  assert.deepEqual([...workflow.matchAll(/secrets\.(\w+)/g)].map(m => m[1]), ['AQGREEN_EVIDENCE_READ_TOKEN']);
  assert.doesNotMatch(workflow, /pull_request_target|workflow_dispatch|environment:|write|npm ci/);
  assert.doesNotMatch(readFileSync(new URL('../../.github/workflows/test.yml', import.meta.url), 'utf8'), /secrets\./);
});
