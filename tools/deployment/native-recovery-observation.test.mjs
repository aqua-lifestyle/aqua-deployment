import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { observeNativeRecoveryBaseline } from './verify-provider-credentials.mjs';
import { memberRuntimeSettings } from './member-release.mjs';
import { targets } from './release-control.mjs';
import { validateFailedRenderReconciliation } from './historical-release-reconciliation.mjs';
const pins = JSON.parse(readFileSync(new URL('./native-recovery-source.json', import.meta.url)));
const p = pins.heldPair, sha = 'a'.repeat(40), canary = 'private-response-and-secret';
const reconciled = validateFailedRenderReconciliation();
const held = () => ({ id: p.renderDeployId, status: 'live', commit: { id: p.renderSha }, createdAt: '2026-10-29T09:35:00Z' });
const failed = () => ({ id: reconciled.renderOperation.deployId, status: 'update_failed',
  commit: { id: reconciled.originalIdentity.sha, message: canary }, createdAt: '2026-11-02T21:21:49Z' });
function fixture() {
  const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: targets.executor.repository,
    GITHUB_REPOSITORY_ID: '1423239668', GITHUB_REF: 'refs/heads/main', GITHUB_REF_PROTECTED: 'true', GITHUB_SHA: sha,
    GITHUB_WORKFLOW_SHA: sha, GITHUB_WORKFLOW_REF: `${targets.executor.repository}/.github/workflows/provider-credential-check.yml@refs/heads/main`,
    GITHUB_ACTOR: 'Xolani-M', GITHUB_ACTOR_ID: '86495928', GITHUB_TRIGGERING_ACTOR: 'Xolani-M',
    GITHUB_RUN_ID: '900', GITHUB_RUN_ATTEMPT: '1', RENDER_API_KEY: 'render-' + canary, VERCEL_TOKEN: 'vercel-' + canary };
  const bodies = new Map(), render = path => 'https://api.render.com/v1' + path,
    vercel = path => 'https://api.vercel.com' + path + (path.includes('?') ? '&' : '?') + `teamId=${p.vercelTeamId}`;
  bodies.set(render(`/services/${p.renderServiceId}`), { id: p.renderServiceId, name: targets.render.name, type: 'web_service',
    repo: 'https://github.com/' + targets.repository, branch: 'main', suspended: 'not_suspended', autoDeploy: 'no', autoDeployTrigger: 'off', rootDir: '',
    serviceDetails: { runtime: 'docker', plan: 'starter', numInstances: 1, maintenanceMode: { enabled: false }, healthCheckPath: '/api/health',
      envSpecificDetails: { dockerContext: '.', dockerfilePath: './docker/api/Dockerfile', preDeployCommand: '', dockerCommand: '' } }, secret: canary });
  for (const [key, values] of Object.entries(memberRuntimeSettings)) bodies.set(render(`/services/${p.renderServiceId}/env-vars/${key}`), { key, value: values[0] });
  bodies.set(render(`/disks?serviceId=${p.renderServiceId}&limit=100`), []);
  bodies.set(render(`/services/${p.renderServiceId}/deploys?limit=100`), [{ deploy: held() }]);
  bodies.set(render(`/services/${p.renderServiceId}/deploys/${p.renderDeployId}`), { id: p.renderDeployId, status: 'live', commit: { id: p.renderSha } });
  bodies.set(vercel(`/v9/projects/${p.vercelProjectId}`), { id: p.vercelProjectId, accountId: p.vercelTeamId, rootDirectory: p.rootDirectory,
    targets: { production: { id: p.vercelDeployId } } });
  bodies.set(vercel(`/v13/deployments/${p.vercelDeployId}`), { id: p.vercelDeployId, projectId: p.vercelProjectId, target: 'production', readyState: 'READY', meta: { secret: canary } });
  bodies.set(vercel(`/v2/deployments/${p.vercelDeployId}/aliases`), { aliases: [{ alias: p.productionDomain, projectId: p.vercelProjectId }] });
  bodies.set(vercel(`/v9/projects/${p.vercelProjectId}/domains/${p.productionDomain}`), { name: p.productionDomain, projectId: p.vercelProjectId, verified: true });
  bodies.set(targets.render.healthUrl, { result: { status: 'Healthy', buildId: p.renderSha, environment: 'Production', databaseStatus: 'Healthy' } });
  const calls = [], output = [];
  const fetcher = async (url, options) => {
    calls.push(url); assert(bodies.has(url)); assert.equal(options.method ?? 'GET', 'GET');
    assert.equal(options.body, undefined); assert.equal(options.redirect, 'error');
    assert.equal(options.headers?.Authorization, url === targets.render.healthUrl ? undefined :
      'Bearer ' + (url.startsWith('https://api.render.com') ? env.RENDER_API_KEY : env.VERCEL_TOKEN));
    return Response.json(bodies.get(url), { headers: url === targets.render.healthUrl ? { 'x-aqua-yoco-receiver': 'Schema54' } : {} });
  };
  return { env, bodies, calls, output, render, vercel, fetcher,
    run: custom => observeNativeRecoveryBaseline(env, { checkoutSha: sha, fetcher: custom ?? fetcher, emit: x => output.push(x) }) };
}
test('protected native recovery observation verifies the exact current pair with GET-only reads and explicit source provenance', async () => {
  const f = fixture(); assert.equal(await f.run(), true);
  const r = f.output.at(-1); assert.equal(r.status, 'VERIFIED');
  assert.equal(r.baseline.renderSha, p.renderSha); assert.equal(r.baseline.vercelDeployId, p.vercelDeployId);
  assert.equal(r.frontendSource.provenance, 'EXISTING_AUTHENTICATED_MEMBER_QUALIFICATION');
  assert.equal(r.applicability.cachedArtifactEligibility, 'NOT_VERIFIED');
  assert.equal(r.applicability.recoveryRehearsalPerformed, false);
  assert(!JSON.stringify(f.output).includes(canary));
});
test('native observation rejects untrusted context, missing run provenance and credentials before any request', async () => {
  const bad = fixture(); bad.env.GITHUB_REF = 'refs/heads/feature'; await assert.rejects(bad.run()); assert.equal(bad.calls.length, 0);
  for (const key of ['GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'RENDER_API_KEY', 'VERCEL_TOKEN']) {
    const f = fixture(); delete f.env[key]; assert.equal(await f.run(), false); assert.equal(f.calls.length, 0);
  }
});
test('native observation denies source, target, health, disk, domain and operational-hold drift without substituting expected values', async () => {
  const edits = [
    f => f.bodies.get(f.render(`/services/${p.renderServiceId}`)).serviceDetails.plan = 'another-plan',
    f => f.bodies.get(f.render(`/services/${p.renderServiceId}/deploys?limit=100`))[0].deploy.status = 'update_in_progress',
    f => f.bodies.get(f.render(`/services/${p.renderServiceId}/deploys/${p.renderDeployId}`)).commit.id = 'b'.repeat(40),
    f => f.bodies.set(f.render(`/disks?serviceId=${p.renderServiceId}&limit=100`), [{ disk: { serviceId: p.renderServiceId } }]),
    f => f.bodies.get(f.vercel(`/v9/projects/${p.vercelProjectId}`)).targets.production.id = 'dpl_Other',
    f => f.bodies.get(f.vercel(`/v13/deployments/${p.vercelDeployId}`)).readyState = 'ERROR',
    f => f.bodies.get(f.vercel(`/v2/deployments/${p.vercelDeployId}/aliases`)).aliases = [],
    f => f.bodies.get(f.vercel(`/v9/projects/${p.vercelProjectId}/domains/${p.productionDomain}`)).verified = false,
    f => f.bodies.get(targets.render.healthUrl).result.buildId = 'c'.repeat(40),
    f => f.bodies.get(f.render(`/services/${p.renderServiceId}/env-vars/App__AutomaticPayouts__Enabled`)).value = 'true'
  ];
  for (const edit of edits) { const f = fixture(); edit(f); assert.equal(await f.run(), false); assert.equal(f.output.at(-1).status, 'UNVERIFIED'); }
});
test('native observation fails closed on permission, redirect, malformed and secret-bearing responses with no retry', async () => {
  for (const status of [401, 403, 404, 429, 500, 302]) {
    const f = fixture(); assert.equal(await f.run(async url => { f.calls.push(url); return new Response(canary, { status }); }), false);
    assert.equal(f.calls.length, 1); assert(!JSON.stringify(f.output).includes(canary));
  }
  const f = fixture(); assert.equal(await f.run(async () => Response.json(null)), false);
  assert.equal(f.output.at(-1).status, 'UNVERIFIED');
});
test('native observation rechecks aliases/project and refuses drift during its bounded observation', async () => {
  const f = fixture(); let n = 0;
  assert.equal(await f.run(async (url, options) => {
    if (url === f.vercel(`/v9/projects/${p.vercelProjectId}`) && ++n === 2)
      return Response.json({ id: p.vercelProjectId, accountId: p.vercelTeamId, rootDirectory: p.rootDirectory, targets: { production: { id: 'dpl_Drift' } } });
    return f.fetcher(url, options);
  }), false);
  assert.equal(f.output.at(-1).status, 'UNVERIFIED');
});

test('a later exact reconciled terminal Render failure does not replace the independently verified live baseline', async () => {
  for (const status of ['build_failed', 'pre_deploy_failed', 'update_failed', 'canceled']) {
    const f = fixture(), attempt = { ...failed(), status };
    // Do not depend on list order when identifying live versus later attempts.
    f.bodies.set(f.render(`/services/${p.renderServiceId}/deploys?limit=100`), [{ deploy: attempt }, { deploy: held() }]);
    assert.equal(await f.run(), true);
    const result = f.output.at(-1); assert.equal(result.status, 'VERIFIED');
    assert.deepEqual(result.renderDeploymentState, { live: { id: p.renderDeployId, status: 'live', revision: p.renderSha },
      accountedLaterAttempts: [{ id: attempt.id, status, revision: attempt.commit.id }] });
    assert.equal(result.baseline.renderDeployId, p.renderDeployId);
    assert.ok(!JSON.stringify(f.output).includes(canary));
  }
});

test('foreign/unknown/in-progress later operations and changed outcomes are never ignored as reconciled failures', async () => {
  for (const change of [d => d.id = 'dep-foreign', d => d.commit.id = 'b'.repeat(40),
    d => d.status = 'queued', d => d.status = 'update_in_progress', d => d.status = 'live',
    d => d.status = 'deactivated', d => d.status = canary]) {
    const f = fixture(), attempt = failed(); change(attempt);
    f.bodies.set(f.render(`/services/${p.renderServiceId}/deploys?limit=100`), [{ deploy: attempt }, { deploy: held() }]);
    assert.equal(await f.run(), false); assert.equal(f.output.at(-1).status, 'UNVERIFIED');
    assert.ok(!f.calls.some(url => url.startsWith('https://api.vercel.com')));
    assert.ok(!JSON.stringify(f.output).includes(canary));
  }
});

test('actual live identity/revision differences are safely reported and stop before Vercel without substituting the baseline', async () => {
  for (const change of [d => d.id = 'dep-other', d => d.commit.id = 'b'.repeat(40)]) {
    const f = fixture(), live = held(); change(live);
    f.bodies.set(f.render(`/services/${p.renderServiceId}/deploys?limit=100`), [{ deploy: failed() }, { deploy: live }]);
    assert.equal(await f.run(), false);
    assert.deepEqual(f.output.find(row => row.liveDeployments)?.liveDeployments,
      [{ id: live.id, status: 'live', revision: live.commit.id }]);
    assert.equal(f.output.at(-1).reason, 'NATIVE_RENDER_BASELINE_CHANGED');
    assert.ok(!f.calls.some(url => url.startsWith('https://api.vercel.com')));
  }
});

test('missing/duplicate live records, duplicate IDs and unavailable chronology fail closed', async () => {
  for (const list of [[], [{ deploy: { ...held(), status: 'deactivated' } }],
    [{ deploy: held() }, { deploy: { ...held(), id: 'dep-other' } }],
    [{ deploy: held() }, { deploy: held() }], [{ deploy: { ...held(), createdAt: undefined } }],
    [{ deploy: { ...held(), createdAt: '0' } }], [{ deploy: { ...held(), createdAt: '2080-01-01T00:00:00Z' } }]]) {
    const f = fixture(); f.bodies.set(f.render(`/services/${p.renderServiceId}/deploys?limit=100`), list);
    assert.equal(await f.run(), false); assert.equal(f.output.at(-1).status, 'UNVERIFIED');
  }
});

test('history pagination and final recheck preserve later-operation accounting without dropping unknown attempts', async () => {
  const f = fixture(), page = [{ deploy: failed() }, { deploy: held() }, ...Array.from({ length: 98 }, (_, i) =>
    ({ deploy: { ...held(), id: 'dep-old' + i, status: 'deactivated', createdAt: '2026-01-01T00:00:00Z' } }))];
  page.at(-1).cursor = 'next';
  f.bodies.set(f.render(`/services/${p.renderServiceId}/deploys?limit=100`), page);
  f.bodies.set(f.render(`/services/${p.renderServiceId}/deploys?limit=100&cursor=next`), []);
  assert.equal(await f.run(), true);
  assert.equal(f.calls.filter(url => url.endsWith('cursor=next')).length, 2);
  const drift = fixture(); let reads = 0;
  assert.equal(await drift.run(async (url, options) => {
    if (url === drift.render(`/services/${p.renderServiceId}/deploys?limit=100`) && ++reads === 2)
      return Response.json([{ deploy: held() }, { deploy: { ...failed(), id: 'dep-unexpected' } }]);
    return drift.fetcher(url, options);
  }), false);
  assert.equal(drift.output.at(-1).reason, 'NATIVE_RENDER_OPERATION_UNACCOUNTED');
  const changedId = fixture(); let heldReads = 0;
  assert.equal(await changedId.run(async (url, options) => {
    if (url === changedId.render(`/services/${p.renderServiceId}/deploys/${p.renderDeployId}`) && ++heldReads === 2)
      return Response.json({ ...held(), id: 'dep-other' });
    return changedId.fetcher(url, options);
  }), false);
  assert.equal(changedId.output.at(-1).reason, 'NATIVE_RENDER_CHANGED_DURING_OBSERVATION');
});
