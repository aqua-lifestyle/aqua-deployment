import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { clients, qualify, validateRun, targets } from './release-control.mjs';
import { authenticatePreMutationProducer } from './release-prior-run-classification.mjs';
import { sha256 } from './github-evidence.mjs';
import { run, jobs, source, previous, fixture } from './fixtures/provider.mjs';

function actionsFixture() {
  const state = { run: run(), jobs: jobs(), main: source }, calls = [];
  const api = { gh: async route => {
    calls.push(route);
    assert.ok(!route.includes('check-runs'), 'source qualification must not invoke the unsupported Checks API');
    if (route === '/actions/runs/123') return structuredClone(state.run);
    if (route === '/actions/runs/123/attempts/1/jobs?per_page=100')
      return { total_count: state.jobs.length, jobs: structuredClone(state.jobs) };
    if (route === '/git/ref/heads/main') return { object: { sha: state.main } };
    assert.fail('unexpected source read');
  } };
  return { state, calls, api };
}

test('protected CI qualification authenticates exact Actions run/attempt/jobs without a second Checks API authority', async () => {
  const f = actionsFixture(), q = await qualify(f.api, 123);
  assert.equal(q.sha, source); assert.equal(q.ciRunAttempt, 1);
  assert.deepEqual(f.calls, ['/actions/runs/123', '/actions/runs/123/attempts/1/jobs?per_page=100',
    '/git/ref/heads/main', '/actions/runs/123']);
});

test('Actions authority still denies foreign source/workflow, failed or replaced CI, missing jobs and forged job/check identities', async () => {
  for (const change of [f => f.state.run.head_sha = previous, f => f.state.run.path = '.github/workflows/other.yml',
    f => f.state.run.event = 'pull_request', f => f.state.run.head_branch = 'feature',
    f => f.state.run.repository.full_name = 'foreign/repository',
    f => f.state.run.head_repository.full_name = 'foreign/repository', f => f.state.run.conclusion = 'failure',
    f => f.state.jobs.pop(), f => f.state.jobs[0].conclusion = 'skipped', f => f.state.jobs[0].run_attempt = 2,
    f => f.state.jobs[0].run_id = 999, f => f.state.jobs[0].name = 'renamed',
    f => f.state.jobs[0].id = f.state.jobs[1].id, f => delete f.state.jobs[0].id,
    f => f.state.jobs[0].check_run_url = f.state.jobs[1].check_run_url,
    f => f.state.jobs[0].check_run_url = 'https://attacker.invalid/check-runs/1']) {
    const f = actionsFixture(); change(f); await assert.rejects(qualify(f.api, 123));
  }
  const f = actionsFixture(), read = f.api.gh; let runReads = 0;
  f.api.gh = async route => {
    const value = await read(route);
    if (route === '/actions/runs/123' && ++runReads === 2) value.run_attempt = 2;
    return value;
  };
  await assert.rejects(qualify(f.api, 123), /CI_QUALIFICATION_CHANGED/);
  assert.throws(() => validateRun(run(), jobs().map(j => ({ ...j, id: 0 })), source), /CI_INVENTORY_NOT_QUALIFIED/);
});

test('full guarded flow keeps security evidence, protected App-bound governance and provider ordering without source Checks reads', async () => {
  const f = fixture(), read = f.api.gh;
  f.api.gh = route => {
    assert.ok(!route.includes('check-runs'), 'only authenticated Actions evidence is selected');
    return read(route);
  };
  await f.execute();
  assert.deepEqual(f.posts.map(p => p.provider), ['render', 'vercel']);
  assert.equal(f.reports.at(-1).phase, 'verified');
});

test('executor artifacts use only the native job token; neither credential follows a storage redirect', async () => {
  for (const owner of ['source', 'executor']) {
    const calls = [], api = clients({ GH_TOKEN: 'job-canary', AQGREEN_EVIDENCE_READ_TOKEN: 'source-canary' },
      async (url, options) => { calls.push({ url, options }); return calls.length === 1 ?
        new Response(null, { status: 302, headers: { location: 'https://storage.example.invalid/archive' } }) :
        new Response('inert archive'); });
    assert.equal((await api.artifact(owner, '123')).toString(), 'inert archive');
    assert.ok(calls[0].url.startsWith(`https://api.github.com/repos/${owner === 'source' ? targets.repository : targets.executor.repository}/`));
    assert.equal(calls[0].options.headers.Authorization, owner === 'source' ? 'Bearer source-canary' : 'Bearer job-canary');
    assert.equal(calls[1].options.headers, undefined);
  }
});

test('failed GitHub reads identify only fixed repository/family/status without raw endpoints, bodies or token fallback', async () => {
  for (const owner of ['source', 'executor']) for (const status of [401, 403, 404, 503]) {
    const reports = [], calls = [], api = clients({ GH_TOKEN: 'job-private-canary', AQGREEN_EVIDENCE_READ_TOKEN: 'source-private-canary' },
      async (url, options) => { calls.push({ url, options }); return new Response('private-response-canary', { status }); },
      row => reports.push(row));
    await assert.rejects(api[owner === 'source' ? 'gh' : 'executor']('/actions/runs/123?private-endpoint-canary'), /PROVIDER_READ_REJECTED/);
    assert.equal(calls.length, 1);
    assert.deepEqual(reports, [{ phase: 'github-read-rejected', repository: owner === 'source' ? targets.repository : targets.executor.repository,
      operation: 'actions', httpStatus: status }]);
    assert.doesNotMatch(JSON.stringify(reports), /canary|Authorization/);
  }
  const reports = [], api = clients({ GH_TOKEN: 'job-canary' }, async () => { throw Error('private-response-canary'); }, r => reports.push(r));
  await assert.rejects(api.executor('/environments/production-release'), /PROVIDER_READ_FAILED/);
  assert.deepEqual(reports, [{ phase: 'github-read-failed', repository: targets.executor.repository,
    operation: 'environments', classification: 'TRANSPORT_UNAVAILABLE' }]);
});

test('native executor credential is wired only to the three existing controller steps, with unchanged provider exclusion', () => {
  const yaml = readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  const steps = yaml.split(/\n      - /).filter(s => s.includes('GH_TOKEN:'));
  assert.equal(steps.length, 3);
  for (const step of steps) {
    assert.match(step, /GH_TOKEN: \$\{\{ github.token \}\}/);
    assert.match(step, /node tools\/deployment\/release-control.mjs (candidate|admit|deploy)/);
  }
  assert.doesNotMatch(yaml.split('\n  production:\n')[0], /secrets\.(RENDER_API_KEY|VERCEL_TOKEN)|environment:/);
  assert.match(yaml, /needs\.candidate\.outputs\.qualification_only == 'false'/);
});

test('reviewed pre-routing workflow fingerprints remain recognized without relaxing mutation reconciliation', async () => {
  const workflow = readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8')
    .replace(/^          GH_TOKEN: \$\{\{ github.token \}\}\n/gm, '');
  assert.equal(sha256(Buffer.from(workflow)), '018d52b64d1acbeabef5d60704fbc200d4fd0036632489a228559c68f4610f8d');
  const controller = readFileSync(new URL('./release-control.mjs', import.meta.url));
  const sha = 'a'.repeat(40);
  const proof = await authenticatePreMutationProducer(async route => {
    const path = route.split('/contents/')[1].split('?')[0], bytes = path.endsWith('.yml') ? Buffer.from(workflow) : controller;
    return { type: 'file', path, encoding: 'base64', size: bytes.length, content: bytes.toString('base64') };
  }, sha);
  assert.equal(proof.workflowSha256, sha256(Buffer.from(workflow)));
  assert.equal(proof.executorSha, sha);
});
