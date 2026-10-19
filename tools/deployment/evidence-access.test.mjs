import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { clients, targets, validateInfrastructure } from './release-control.mjs';
import { approvedBypassReadback, approvedReadbacks } from './governance-readback.mjs';
import { fixture } from './fixtures/provider.mjs';

test('GitHub evidence uses only the explicit read credential, with fixed repositories and GET operations', async () => {
  const calls = [];
  const api = clients({ GH_TOKEN: 'job-token', AQGREEN_EVIDENCE_READ_TOKEN: 'read-canary' }, async (url, options) => {
    calls.push({ url, options }); return Response.json({});
  });
  await api.gh('/actions/runs/123'); await api.executor('/actions/runs/456');
  assert.deepEqual(calls.map(x => x.url), [
    `https://api.github.com/repos/${targets.repository}/actions/runs/123`,
    `https://api.github.com/repos/${targets.executor.repository}/actions/runs/456`]);
  assert.ok(calls.every(x => x.options.method === 'GET' && x.options.headers.Authorization === 'Bearer read-canary'));
  assert.throws(() => api.gh('/actions/runs', {}), /GITHUB_EVIDENCE_WRITE_FORBIDDEN/);
  assert.throws(() => api.executor('/actions/runs', {}), /GITHUB_EVIDENCE_WRITE_FORBIDDEN/);
  assert.equal(calls.length, 2);
});

test('missing read credential never falls back to job/provider credentials or anonymous access', async () => {
  let calls = 0;
  const api = clients({ GH_TOKEN: 'job-token', RENDER_API_KEY: 'render', VERCEL_TOKEN: 'vercel' },
    async () => { calls++; throw Error('must not fetch'); });
  assert.throws(() => api.gh('/actions/runs/123'), /GITHUB_EVIDENCE_READ_CREDENTIAL_REQUIRED/);
  assert.throws(() => api.executor('/actions/runs/456'), /GITHUB_EVIDENCE_READ_CREDENTIAL_REQUIRED/);
  await assert.rejects(api.artifact('source', '7890'), /GITHUB_EVIDENCE_READ_CREDENTIAL_REQUIRED/);
  assert.equal(calls, 0);
});

test('read authentication rejection fails closed and does not retry with another identity', async () => {
  for (const status of [401, 403, 404, 503]) {
    let calls = 0;
    const api = clients({ AQGREEN_EVIDENCE_READ_TOKEN: 'read-canary', GH_TOKEN: 'job-token' },
      async () => { calls++; return new Response(null, { status }); });
    await assert.rejects(api.gh('/actions/runs/123'), /READ_REJECTED/);
    await assert.rejects(api.artifact('source', '7890'), /DOWNLOAD_UNAVAILABLE/);
    assert.equal(calls, 2);
  }
});

test('hidden bypass metadata requires the exact administrator readback and live revision', () => {
  const record = structuredClone(approvedReadbacks.rulesets[0]);
  const live = structuredClone(record.ruleset); delete live.bypass_actors;
  assert.deepEqual(approvedBypassReadback(live, record.repository).bypass_actors, []);
  assert.throws(() => approvedBypassReadback(live, record.repository, { ...approvedReadbacks, rulesets: [] }), /READBACK_REQUIRED/);
  assert.throws(() => approvedBypassReadback(live, 'attacker/repo'), /READBACK_REQUIRED/);
  for (const mutate of [r => r.id++, r => r.name += ' changed', r => r.enforcement = 'disabled',
    r => r.source = 'attacker/repo', r => r.updated_at = '2026-10-19T12:00:00Z',
    r => delete r.updated_at, r => r.rules.pop(), r => r.conditions.ref_name.include.push('refs/heads/other')]) {
    const changed = structuredClone(live); mutate(changed);
    assert.throws(() => approvedBypassReadback(changed, record.repository), /READBACK_REQUIRED|READBACK_CHANGED/);
  }
  for (const mutate of [r => r.ruleset.bypass_actors.push({ actor_type: 'RepositoryRole', actor_id: 5 }),
    r => delete r.ruleset.bypass_actors, r => r.observedAt = 'invalid']) {
    const altered = structuredClone(record); mutate(altered);
    assert.throws(() => approvedBypassReadback(live, record.repository,
      { ...approvedReadbacks, rulesets: [altered] }), /READBACK_REQUIRED/);
  }
  assert.throws(() => approvedBypassReadback(live, record.repository,
    { ...approvedReadbacks, rulesets: [record, record] }), /READBACK_REQUIRED/);
  // Explicit live metadata always wins, including malformed or nonempty values.
  for (const value of [null, 'hidden', [{ actor_type: 'RepositoryRole', actor_id: 5 }]])
    assert.equal(approvedBypassReadback({ ...live, bypass_actors: value }, record.repository).bypass_actors, value);
});

test('both hidden rulesets pass only with approved source-bound readbacks, before any provider operation', async () => {
  const f = fixture(), app = structuredClone(approvedReadbacks.rulesets[0]);
  const executor = { repository: targets.executor.repository, observedAt: app.observedAt,
    ruleset: { ...structuredClone(app.ruleset), id: 99, name: 'Fixture executor history',
      source: targets.executor.repository, rules: [{ type: 'deletion' }, { type: 'non_fast_forward' }] } };
  const approvals = { ...approvedReadbacks, rulesets: [app, executor] };
  f.state.ruleset = structuredClone(app.ruleset); delete f.state.ruleset.bypass_actors;
  const read = f.api.executor;
  f.api.executor = async route => {
    if (route === '/rulesets/99') { const live = structuredClone(executor.ruleset); delete live.bypass_actors; return live; }
    return read(route);
  };
  await validateInfrastructure(f.api, f.state.candidate, f.state.policy, approvals);
  await assert.rejects(validateInfrastructure(f.api, f.state.candidate, f.state.policy,
    { ...approvals, rulesets: [app] }), /READBACK_REQUIRED/);
  for (const value of [null, [{ actor_type: 'RepositoryRole', actor_id: 5 }]]) {
    f.state.ruleset.bypass_actors = value;
    await assert.rejects(validateInfrastructure(f.api, f.state.candidate, f.state.policy, approvals), /CUSTODY_UNVERIFIABLE|BYPASS_FORBIDDEN/);
  }
  assert.equal(f.state.providerCalls, 0);
});

test('administrator merge approval precedes use of any governance readback', async () => {
  const f = fixture(), read = f.api.executor;
  let governanceReads = 0;
  f.api.gh = async () => { governanceReads++; throw Error('must not read governance'); };
  f.api.executor = async route => {
    const row = await read(route);
    if (route === '/pulls/1') row.merged_by = { id: 1, login: 'contributor' };
    return row;
  };
  await assert.rejects(validateInfrastructure(f.api, f.state.candidate), /ADMINISTRATOR_APPROVAL_REQUIRED/);
  assert.equal(governanceReads, 0); assert.equal(f.state.providerCalls, 0);
});

test('read secret is scoped to fixed executor steps and never added to untrusted PR test execution', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  assert.equal([...workflow.matchAll(/AQGREEN_EVIDENCE_READ_TOKEN: \$\{\{ secrets\.AQGREEN_EVIDENCE_READ_TOKEN \}\}/g)].length, 3);
  assert.doesNotMatch(workflow, /GH_TOKEN:|secrets\.(?!AQGREEN_EVIDENCE_READ_TOKEN|RENDER_API_KEY|VERCEL_TOKEN)/);
  const beforeProduction = workflow.split('\n  production:\n')[0];
  assert.doesNotMatch(beforeProduction, /secrets\.(RENDER_API_KEY|VERCEL_TOKEN)|environment:/);
  assert.doesNotMatch(readFileSync(new URL('../../.github/workflows/test.yml', import.meta.url), 'utf8'), /secrets\./);
});
