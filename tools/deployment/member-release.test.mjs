import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { memberPolicy as pin, memberPolicyDigest, memberRuntimeSettings, memberContinuation, validateMemberContinuation,
  validateMemberIdentity, verifyMemberSource, verifyMemberAuthority, validateMemberReceipt, deployMemberRelease } from './member-release.mjs';
import { validateDispatchInputs, freezeCandidate, verifyCandidate, standingPolicy, targets, releaseKey,
  validateRender, validateVercel, validateHealth, deploymentHistory, waitFor, evidencePlan } from './release-control.mjs';
import { createGitHubAdmission, validateGitHubAdmission, sha256, inventoryDigest } from './github-evidence.mjs';
import { frontendFixtureArchive, runnerEnv, fixture as fullFixture } from './fixtures/provider.mjs';

const q = () => freezeCandidate({ repository: targets.repository, sha: pin.frontendSha,
  ciRunId: '123', ciRunAttempt: 1 }, runnerEnv(), standingPolicy, false, pin.mode);
const dispatch = { sha: pin.frontendSha, ci_run_id: '123', ci_run_attempt: '1', release_mode: pin.mode };
const now = () => Date.UTC(2026, 9, 29, 8);

test('member mode admits only the reviewed full source pair and fixed targets', () => {
  assert.equal(validateDispatchInputs(dispatch).releaseMode, pin.mode);
  assert.equal(validateDispatchInputs({ ...dispatch, release_mode: 'full' }).releaseMode, undefined);
  for (const changes of [{ sha: pin.receiverSha }, { sha: 'a'.repeat(40) }, { receiver_sha: pin.receiverSha },
    { release_mode: '' }, { release_mode: 'schema54' }, { release_mode: null }, { migration: '55' }])
    assert.throws(() => validateDispatchInputs({ ...dispatch, ...changes }));
  validateMemberIdentity(q());
  for (const changes of [{ sha: pin.receiverSha }, { memberRelease: 'a'.repeat(64) },
    { renderServiceId: 'srv-foreign' }, { vercelProjectId: 'prj_foreign' }, { vercelTeamId: 'team_foreign' }])
    assert.throws(() => validateMemberIdentity({ ...q(), ...changes }));
  assert.throws(() => verifyMemberSource('/not/a/repository', q()), /MEMBER_SOURCE_UNAVAILABLE/);
});

test('candidate, admission, release identity and audits cannot exchange full and member purposes', () => {
  const member = q(), full = { ...member }; delete full.memberRelease;
  const bytes = Buffer.from('inert archive'), candidate = { ...member, sourceSha256: sha256(bytes) };
  verifyCandidate(candidate, member, bytes, bytes);
  assert.throws(() => verifyCandidate(candidate, full, bytes, bytes), /CANDIDATE_PURPOSE_MISMATCH/);
  assert.throws(() => verifyCandidate({ ...candidate, memberRelease: undefined }, member, bytes, bytes), /CANDIDATE_PURPOSE_MISMATCH/);
  assert.notEqual(releaseKey(member), releaseKey(full));
  const evidence = { ...member, mode: 'github-evidence-v1', inventorySha256: inventoryDigest,
    completedAt: new Date(now() - 1000).toISOString() };
  const receipt = createGitHubAdmission(member, standingPolicy, evidence, now);
  validateGitHubAdmission(receipt, member, standingPolicy, evidence, now);
  assert.throws(() => validateGitHubAdmission(receipt, full, standingPolicy, evidence, now), /ADMISSION_RECEIPT_MISMATCH/);
  assert.throws(() => validateGitHubAdmission(createGitHubAdmission(full, standingPolicy, evidence, now), member,
    standingPolicy, evidence, now), /ADMISSION_RECEIPT_MISMATCH/);
});

function authorityFixture() {
  const head = 'f'.repeat(40), state = {
    env: { GITHUB_ACTOR: pin.operator.login, GITHUB_ACTOR_ID: String(pin.operator.id) },
    review: { user: pin.reviewer, commit_id: head, state: 'APPROVED', submitted_at: new Date(now()).toISOString() },
    comments: [{ user: pin.operator, created_at: new Date(now()).toISOString(), body: 'SCHEMA54_SOURCE_VERIFIED\n' + JSON.stringify({
      executorSha: q().executorSha, frontendSha: pin.frontendSha, receiverSha: pin.receiverSha,
      databaseResource: pin.databaseResource, databaseName: pin.databaseName, tenantId: 1,
      migrationCount: 54, migration55Absent: true, identityTlsReadOnlyVerified: true, observedAt: new Date(now()).toISOString()
    }) }], ci: 'success', job: 'success', prNumber: 12, currentReviews: [], acceptanceComments: []
  };
  const api = { executor: async path => {
    if (path.startsWith('/commits/')) return [{ number: state.prNumber, merge_commit_sha: q().executorSha,
      merged_at: new Date(now()).toISOString(), base: { ref: 'main', repo: { full_name: q().executorRepository } } }];
    if (path === '/pulls/12' && state.prNumber !== 12) return { number: 12, merged: true,
      merge_commit_sha: '051bf90f7ba037657c9e9d244a6e6ffc81b9c7f1',
      head: { sha: '0dbbf1d36e29d52d7f8c59f3efad06898389b3d5' },
      base: { ref: 'main', repo: { full_name: q().executorRepository } } };
    if (path === `/pulls/${state.prNumber}`) return { number: state.prNumber, merged: true,
      merge_commit_sha: q().executorSha, head: { sha: head } };
    if (path.startsWith('/compare/')) return state.diff;
    if (['/pulls/13/reviews?per_page=100', '/pulls/14/reviews?per_page=100'].includes(path)) return state.currentReviews;
    if (path === '/issues/12/comments?per_page=100' && state.prNumber !== 12) return state.acceptanceComments;
    if (path.includes('/reviews?')) return [state.review];
    if (path.includes('/comments?')) return state.comments;
    if (path.includes('/workflows/')) return { total_count: 1, workflow_runs: [{ id: 987, run_attempt: 1,
      head_sha: q().executorSha, head_branch: 'main', event: 'push', path: '.github/workflows/test.yml',
      name: 'Executor safety tests', status: 'completed', conclusion: state.ci }] };
    if (path.includes('/jobs?')) return { total_count: 1, jobs: [{ name: 'Executor safety tests', run_id: 987,
      run_attempt: 1, status: 'completed', conclusion: state.job }] };
    assert.fail('Unexpected authority route');
  } };
  return { state, api, head };
}
test('member authority requires exact revision human acceptance, named operator and main CI', async () => {
  const f = authorityFixture(); await verifyMemberAuthority(f.api, q(), f.state.env, now);
  for (const change of [s => s.review.user = { login: pin.reviewer.login, id: 1 },
    s => s.review.commit_id = 'e'.repeat(40), s => s.review.state = 'DISMISSED',
    s => s.review.state = 'CHANGES_REQUESTED', s => s.env.GITHUB_ACTOR_ID = '1',
    s => s.env.GITHUB_TRIGGERING_ACTOR = pin.reviewer.login, s => s.ci = 'failure', s => s.job = 'skipped']) {
    const f = authorityFixture(); change(f.state); await assert.rejects(verifyMemberAuthority(f.api, q(), f.state.env, now));
  }
  f.state.review.state = 'COMMENTED'; f.state.review.body = 'Not accepted';
  await assert.rejects(verifyMemberAuthority(f.api, q(), f.state.env, now));
  f.state.review.body = 'ACCEPTED'; await verifyMemberAuthority(f.api, q(), f.state.env, now);
  f.state.comments = [{ user: pin.reviewer, body: `REJECTED\n${f.head}`, updated_at: new Date(now() + 1000).toISOString() }];
  await assert.rejects(verifyMemberAuthority(f.api, q(), f.state.env, now));
});

test('recorded Review and Accepted review passes only with the authenticated reviewer, accepted state and exact SHA', async () => {
  const f = authorityFixture(); f.state.review.state = 'COMMENTED'; f.state.review.body = 'Review and Accepted\n';
  await verifyMemberAuthority(f.api, q(), f.state.env, now);
  for (const change of [s => s.review.commit_id = 'a'.repeat(40), s => s.review.user = pin.operator,
    s => s.review.user = { login: pin.reviewer.login, id: 1 }, s => s.review.state = 'DISMISSED',
    s => s.review.state = 'CHANGES_REQUESTED', s => s.review.body = 'Review and not Accepted',
    s => s.review.body = 'Review and Accepted\nPending approval', s => s.review.body = 'Review only']) {
    const g = authorityFixture(); g.state.review.state = 'COMMENTED'; g.state.review.body = 'Review and Accepted\n';
    change(g.state); await assert.rejects(verifyMemberAuthority(g.api, q(), g.state.env, now), /MEMBER_EXACT_EXECUTOR_ACCEPTANCE_REQUIRED/);
  }
});

function parserCorrectionFixture() {
  const f = authorityFixture(); f.state.prNumber = 13;
  f.state.review.state = 'COMMENTED'; f.state.review.body = 'Review and Accepted\n';
  f.state.review.commit_id = '0dbbf1d36e29d52d7f8c59f3efad06898389b3d5';
  f.state.diff = { status: 'ahead', base_commit: { sha: '051bf90f7ba037657c9e9d244a6e6ffc81b9c7f1' }, total_commits: 2,
    files: ['tools/deployment/member-release.mjs', 'tools/deployment/member-release.test.mjs',
      'docs/schema54-member-release.md'].map(filename => ({ filename, status: 'modified' })) };
  return f;
}

test('only the protected parser correction carries forward the original exact-source acceptance', async () => {
  const f = parserCorrectionFixture(); await verifyMemberAuthority(f.api, q(), f.state.env, now);
  for (const change of [s => s.prNumber = 14, s => s.diff.files[0].filename = 'tools/deployment/unattended-policy.json',
    s => s.diff.files.push({ filename: 'tools/deployment/member-release.json', status: 'modified' }),
    s => s.diff.total_commits = 3, s => s.diff.status = 'diverged',
    s => s.diff.base_commit.sha = 'a'.repeat(40), s => s.review.commit_id = 'a'.repeat(40),
    s => s.review.user = pin.operator, s => s.review.state = 'CHANGES_REQUESTED',
    s => s.currentReviews = [{ user: pin.reviewer, state: 'CHANGES_REQUESTED', commit_id: f.head }]]) {
    const g = parserCorrectionFixture(); change(g.state);
    await assert.rejects(verifyMemberAuthority(g.api, q(), g.state.env, now));
  }
});

test('only the pinned continuation amendment reuses acceptance without changing source-pair policy', async () => {
  const f = parserCorrectionFixture(); f.state.prNumber = 14;
  f.state.diff.base_commit.sha = memberContinuation.executorSha;
  f.state.diff.files.push({ filename: 'tools/deployment/release-control.mjs', status: 'modified' },
    { filename: 'tools/deployment/member-continuation.json', status: 'added' },
    { filename: 'tools/deployment/fixtures/member-interrupted-audit.zip', status: 'added' });
  await verifyMemberAuthority(f.api, q(), f.state.env, now);
  f.state.diff.files[0].filename = 'tools/deployment/member-release.json';
  await assert.rejects(verifyMemberAuthority(f.api, q(), f.state.env, now));
});

const originalArchive = readFileSync(new URL('./fixtures/member-interrupted-audit.zip', import.meta.url));
const originalRows = (() => {
  const dir = mkdtempSync(join(tmpdir(), 'aqua-recorded-member-audit-'));
  try {
    const file = join(dir, 'audit.zip'); writeFileSync(file, originalArchive);
    return execFileSync('unzip', ['-p', file, 'release-report.jsonl'], { encoding: 'utf8', maxBuffer: 1024 * 1024 })
      .trim().split('\n').map(JSON.parse);
  } finally { rmSync(dir, { recursive: true, force: true }); }
})();
const continuationDescriptor = { runId: memberContinuation.runId, runAttempt: 1,
  sha: memberContinuation.executorSha, artifactId: memberContinuation.artifactId };
const continuationProof = () => validateMemberContinuation(originalRows, continuationDescriptor);

test('recorded interrupted audit is exact, acknowledged, pre-Vercel and cannot be replaced', () => {
  assert.equal('sha256:' + sha256(originalArchive), memberContinuation.artifactDigest);
  assert.equal(continuationProof().renderDeployId, memberContinuation.renderDeployId);
  for (const mutate of [r => r.at(-1).code = 'UNEXPECTED_RELEASE_ERROR', r => r[0].sha = 'a'.repeat(40),
    r => r[2].renderDeployId = 'dep-foreign', r => r.push({ phase: 'member-vercel-requesting' })]) {
    const rows = structuredClone(originalRows); mutate(rows);
    assert.throws(() => validateMemberContinuation(rows, continuationDescriptor));
  }
  assert.throws(() => validateMemberContinuation(originalRows, { ...continuationDescriptor, artifactId: '1' }));
  assert.throws(() => validateMemberContinuation(originalRows, { ...continuationDescriptor, runAttempt: 2 }));
});

test('GitHub-only continuation plan authenticates the original artifact and never bypasses full-release history', async () => {
  const f = fullFixture(); f.state.candidate = q();
  const current = { id: 456, run_attempt: 1, run_number: 2, head_sha: q().executorSha, head_branch: 'main',
    event: 'workflow_dispatch', path: '.github/workflows/deploy.yml', name: 'Qualified production executor',
    status: 'in_progress', repository: { full_name: q().executorRepository }, head_repository: { full_name: q().executorRepository } };
  const prior = { ...current, id: Number(memberContinuation.runId), head_sha: memberContinuation.executorSha,
    run_number: 1, status: 'completed', conclusion: 'failure' };
  const artifact = { id: Number(memberContinuation.artifactId), name: `production-release-audit-${prior.id}-1`,
    digest: memberContinuation.artifactDigest, expired: false, size_in_bytes: originalArchive.length,
    workflow_run: { id: prior.id, head_sha: prior.head_sha, head_branch: 'main', repository_id: 987, head_repository_id: 987 } };
  const api = { ...f.api, artifact: async () => originalArchive, executor: async path => {
    if (path === '') return { id: 987 };
    if (path === '/actions/runs/456') return current;
    if (path.includes('/actions/workflows/deploy.yml/')) return { total_count: 2, workflow_runs: [prior, current] };
    if (path.includes(`/actions/runs/${prior.id}/attempts/1/jobs?`)) return { total_count: 3, jobs: [
      { name: 'Qualify immutable source candidate', conclusion: 'success' },
      { name: 'Verify approved GitHub evidence before provider access', conclusion: 'success' },
      { name: 'Unattended recovery release', conclusion: 'failure', steps: [] }
    ].map(x => ({ ...x, run_id: prior.id, run_attempt: 1, status: 'completed' })) };
    if (path.includes(`/actions/runs/${prior.id}/artifacts?`)) return { total_count: 1, artifacts: [artifact] };
    if (path === `/actions/artifacts/${artifact.id}`) return artifact;
    assert.fail('Unexpected continuation evidence route: ' + path);
  } };
  const plan = await evidencePlan(api, q(), standingPolicy);
  assert.equal(plan.memberContinuation.renderDeployId, memberContinuation.renderDeployId);
  assert.equal(f.state.providerCalls, 0); assert.equal(f.posts.length, 0);
  const full = { ...q() }; delete full.memberRelease;
  await assert.rejects(evidencePlan(api, full, standingPolicy), /UNVERIFIED_PRIOR_RELEASE_REQUIRES_RECONCILIATION/);
  artifact.digest = 'sha256:' + 'a'.repeat(64);
  await assert.rejects(evidencePlan(api, q(), standingPolicy), /MEMBER_CONTINUATION_ARTIFACT_CHANGED/);
});

test('schema readback must be fresh, operator-authenticated, exact-source and schema 54', async () => {
  for (const change of [f => f.state.comments = [], f => f.state.comments[0].user = pin.reviewer,
    f => f.state.comments[0].body = f.state.comments[0].body.replace('"migrationCount":54', '"migrationCount":55'),
    f => f.state.comments[0].body = f.state.comments[0].body.replace(q().executorSha, 'a'.repeat(40)),
    f => f.state.comments[0].body = f.state.comments[0].body.replace('"identityTlsReadOnlyVerified":true', '"identityTlsReadOnlyVerified":false')]) {
    const f = authorityFixture(); change(f);
    await assert.rejects(verifyMemberAuthority(f.api, q(), f.state.env, now), /MEMBER_CURRENT_SCHEMA54/);
  }
  const f = authorityFixture();
  await assert.rejects(verifyMemberAuthority(f.api, q(), f.state.env, () => now() + 3600001), /MEMBER_CURRENT_SCHEMA54/);
});

// Controlled provider substitutes only. The archive comment is deliberately
// relabelled for this orchestration test; it is NOT authentic source evidence.
// Production entry separately compares the whole archive to fetched Git bytes.
function fixture() {
  const original = frontendFixtureArchive();
  const archive = Buffer.from(original.archive);
  const offset = archive.indexOf(Buffer.from(original.sha)); assert.ok(offset >= 0);
  archive.write(pin.frontendSha, offset, 40, 'ascii');
  const s = { render: { id: pin.baselineRenderDeployId, status: 'live', commit: { id: pin.baselineRenderSha } },
    alias: pin.baselineVercelDeployId, posts: [], audit: [], uploads: 0, checks: 0, guardFails: false,
    renderFail: false, badHealth: false, probeFail: false, webFail: false, timeout: false,
    vars: Object.fromEntries(Object.entries(memberRuntimeSettings).map(([k, v]) => [k, v[0]])) };
  const service = { id: targets.render.id, name: targets.render.name, repo: `https://github.com/${targets.repository}`,
    branch: 'main', suspended: 'not_suspended', autoDeploy: 'no', autoDeployTrigger: 'off', rootDir: '',
    serviceDetails: { runtime: 'docker', plan: 'starter', buildPlan: 'starter', numInstances: 1, region: 'frankfurt',
      maintenanceMode: { enabled: false }, healthCheckPath: '/api/health', envSpecificDetails: {
        dockerContext: '.', dockerfilePath: './docker/api/Dockerfile', preDeployCommand: '', dockerCommand: '' } } };
  const project = () => ({ id: targets.vercel.id, name: targets.vercel.name, accountId: targets.vercel.teamId,
    rootDirectory: targets.vercel.rootDirectory, nodeVersion: '24.x', autoAssignCustomDomains: true,
    link: null, targets: { production: { id: s.alias } } });
  const api = {
    render: async (path, body) => {
      if (body) {
        assert.equal(path, `/services/${targets.render.id}/deploys`);
        s.posts.push({ provider: 'render', body });
        s.render = { id: 'dep-member', status: 'build_in_progress', commit: { id: body.commitId } };
        return s.render;
      }
      if (path.includes('/env-vars/')) { const key = path.split('/').at(-1); return { key, value: s.vars[key] }; }
      if (path.includes('/deploys?')) return [{ deploy: s.render }];
      if (path.endsWith('/deploys/dep-member')) {
        s.render.status = s.renderFail ? 'build_failed' : 'live'; return s.render;
      }
      if (path.endsWith('/deploys/' + memberContinuation.renderDeployId)) return s.render;
      assert.equal(path, `/services/${targets.render.id}`); return service;
    },
    vercel: async (path, body) => {
      if (body) {
        assert.equal(path, '/v13/deployments'); s.posts.push({ provider: 'vercel', body });
        s.web = { id: 'dpl_Member', projectId: targets.vercel.id, target: 'production', readyState: 'BUILDING',
          ...body }; return s.web;
      }
      if (path.startsWith('/v6/')) return { deployments: [] };
      if (path.includes('/domains/')) return { name: 'www.aqualifestyleclub.co.za', projectId: targets.vercel.id, verified: true };
      if (path.endsWith('/aliases')) return { aliases: [{ alias: 'www.aqualifestyleclub.co.za' }] };
      if (path.startsWith('/v10/')) return { envs: Object.entries({ NEXT_PUBLIC_ABP_API_URL: targets.vercel.publicApiUrl,
        NEXT_PUBLIC_DEFAULT_TENANT_NAME: targets.vercel.defaultTenantName }).map(([key, value]) => ({ key, value, type: 'plain', target: ['production'] })) };
      if (path.endsWith('/' + pin.baselineVercelDeployId)) return { id: pin.baselineVercelDeployId,
        projectId: targets.vercel.id, target: 'production', readyState: 'READY' };
      if (path.endsWith('/dpl_Member')) {
        s.web.readyState = s.webFail ? 'ERROR' : 'READY'; s.alias = s.web.id; return s.web;
      }
      assert.equal(path, `/v9/projects/${targets.vercel.id}`); return project();
    },
    health: async () => ({ status: s.badHealth ? 503 : 200, recovery: null, receiver: 'Schema54', body: {
      status: 'Healthy', environment: 'Production', databaseStatus: 'Healthy', redisStatus: 'Healthy',
      dataProtectionKeyStoreStatus: 'Healthy', buildId: s.render.commit.id, contractCapabilities: ['member-programme-journey-v1'] } }),
    memberProbe: async () => ({ capability: 200, unauthenticatedRead: 401, write: s.probeFail ? 200 : 503, invalidSignature: 403 }),
    uploadVercel: async () => { s.uploads++; }, web: async () => {}
  };
  const options = { targets, validateRender, validateVercel, validateHealth, deploymentHistory, waitFor, releaseKey,
    frontendArchive: archive, evidencePlan: { baseline: null, resume: null }, attempts: 3,
    pause: async () => {}, now: () => now() + (s.timeout ? 41 * 60 * 1000 : 0),
    guard: async () => { s.checks++; if (s.guardFails) throw Error('ADMISSION_CHANGED'); }, validateAdmission: () => {} };
  return { s, api, service, options, execute: (candidate = q()) => deployMemberRelease(api, candidate, row => s.audit.push(row), options) };
}

test('member release deploys only pinned receiver then pinned frontend; never claims member or provider verification', async () => {
  const f = fixture(); await f.execute();
  assert.deepEqual(f.s.posts.map(x => x.provider), ['render', 'vercel']);
  assert.deepEqual(f.s.posts[0].body, { commitId: pin.receiverSha, clearCache: 'do_not_clear' });
  assert.equal(f.s.posts[1].body.meta.aquaSourceSha, pin.frontendSha);
  assert.equal(f.s.posts[1].body.meta.aquaReceiverSha, pin.receiverSha);
  assert.equal(f.s.posts[1].body.meta.aquaMemberRelease, memberPolicyDigest);
  assert.ok(f.s.uploads > 0);
  const last = f.s.audit.at(-1);
  assert.equal(last.phase, 'member-deployed'); assert.equal(last.signedInMemberVerification, 'REQUIRED');
  assert.equal(last.genuineYocoVerification, 'NOT_ESTABLISHED');
  assert.ok(!f.s.audit.some(x => x.phase === 'verified'));
  assert.ok(f.s.audit.some(x => x.phase === 'member-handoff-sample'));
  const rows = f.s.audit.map(x => ({ ...x, ...q() }));
  const descriptor = { runId: q().releaseRunId, runAttempt: 1, sha: q().executorSha, artifactId: '12345' };
  assert.equal(validateMemberReceipt(rows, descriptor, targets).receiverSha, pin.receiverSha);
  for (const mutate of [r => r.at(-1).renderSha = pin.frontendSha, r => r[0].memberRelease = 'a'.repeat(64),
    r => r.splice(r.findIndex(x => x.phase === 'member-vercel-files-uploaded'), 1),
    r => r.at(-1).vercelDeployId = 'dpl_Foreign']) {
    const changed = structuredClone(rows); mutate(changed);
    assert.throws(() => validateMemberReceipt(changed, descriptor, targets));
  }
});

function resumedFixture() {
  const f = fixture(); f.options.evidencePlan.memberContinuation = continuationProof();
  f.s.render = { id: memberContinuation.renderDeployId, status: 'live', commit: { id: pin.receiverSha } };
  return f;
}

test('reconciled receiver issues only the accepted Vercel request and never redeploys Render', async () => {
  const f = resumedFixture(); await f.execute();
  assert.deepEqual(f.s.posts.map(x => x.provider), ['vercel']);
  assert.equal(f.s.posts[0].body.meta.aquaSourceSha, pin.frontendSha);
  assert.ok(f.s.audit.some(x => x.phase === 'member-render-reconciled'));
  assert.ok(!f.s.audit.some(x => x.phase === 'member-render-requesting'));
  const rows = f.s.audit.map(x => ({ ...x, ...q() }));
  assert.equal(validateMemberReceipt(rows, { runId: q().releaseRunId, runAttempt: 1, sha: q().executorSha }, targets).renderDeployId,
    memberContinuation.renderDeployId);
});

test('continuation refuses foreign deployment, wrong source, disabled fence or failed readiness without provider mutation', async () => {
  for (const mutate of [f => f.s.render.id = 'dep-foreign', f => f.s.render.commit.id = 'a'.repeat(40),
    f => f.s.badHealth = true, f => f.s.vars.App__YocoCutover__Enabled = 'false',
    f => f.options.evidencePlan.memberContinuation.artifactId = '1']) {
    const f = resumedFixture(); mutate(f); await assert.rejects(f.execute());
    assert.equal(f.s.posts.length, 0); assert.equal(f.s.uploads, 0);
  }
});

test('failed readiness after reconciliation records every actual/expected field before stopping frontend upload', async () => {
  const f = resumedFixture(), health = f.api.health; let calls = 0;
  f.api.health = async () => { const r = await health(); if (++calls > 1) r.body.buildId = 'a'.repeat(40); return r; };
  await assert.rejects(f.execute(), /API_REVISION_OR_RECOVERY_READINESS_FAILED/);
  const diagnostic = f.s.audit.find(x => x.phase === 'member-readiness');
  assert.deepEqual(diagnostic.failedFields, ['buildId']); assert.equal(diagnostic.actual.buildId, 'a'.repeat(40));
  assert.equal(diagnostic.expected.buildId, pin.receiverSha); assert.equal(Object.keys(diagnostic.actual).length, 8);
  assert.equal(f.s.posts.length, 0); assert.equal(f.s.uploads, 0);
});

for (const [label, mutate] of [
  ['write fence disabled', f => f.s.vars.App__YocoCutover__Enabled = 'false'],
  ['payouts enabled', f => f.s.vars.App__AutomaticPayouts__Enabled = 'true'],
  ['workers enabled', f => f.s.vars.App__BackgroundJobs__Enabled = 'true'],
  ['maintenance enabled', f => f.service.serviceDetails.maintenanceMode.enabled = true],
  ['service upgrade', f => f.service.serviceDetails.plan = 'pro'],
  ['foreign baseline', f => f.s.render.commit.id = 'a'.repeat(40)],
  ['foreign frontend', f => f.s.alias = 'dpl_Foreign'],
  ['admission revoked', f => f.s.guardFails = true],
  ['automatic rerun', f => f.options.receiptRows = []],
]) test(`${label} denies before any deployment or upload`, async () => {
  const f = fixture(); mutate(f); await assert.rejects(f.execute());
  assert.equal(f.s.posts.length, 0); assert.equal(f.s.uploads, 0);
});

test('Render failure, invalid signature acceptance, missing auth or broken write fence prevent frontend deployment', async () => {
  for (const mutate of [f => f.s.renderFail = true, f => f.s.probeFail = true,
    f => f.api.memberProbe = async () => ({ capability: 200, unauthenticatedRead: 200, write: 503, invalidSignature: 403 }),
    f => f.api.memberProbe = async () => ({ capability: 200, unauthenticatedRead: 401, write: 503, invalidSignature: 200 })]) {
    const f = fixture(); mutate(f); await assert.rejects(f.execute());
    assert.deepEqual(f.s.posts.map(x => x.provider), ['render']); assert.equal(f.s.uploads, 0);
    assert.ok(!f.s.audit.some(x => x.phase === 'member-deployed'));
  }
});

test('failed Vercel leaves actual receiver completion recorded and stops without success or rollback', async () => {
  const f = fixture(); f.s.webFail = true; await assert.rejects(f.execute());
  assert.deepEqual(f.s.posts.map(x => x.provider), ['render', 'vercel']);
  assert.ok(f.s.audit.some(x => x.phase === 'member-render-ready'));
  assert.ok(!f.s.audit.some(x => x.phase === 'member-deployed'));
});

test('lost provider response is never retried or followed by a frontend request', async () => {
  const f = fixture(), render = f.api.render;
  f.api.render = async (path, body) => { const result = await render(path, body); if (body) throw Error('AMBIGUOUS_PROVIDER_POST'); return result; };
  await assert.rejects(f.execute()); assert.equal(f.s.posts.length, 1); assert.equal(f.s.uploads, 0);
});

test('qualification-only, wrong receiver/frontend purpose and later attempts cannot enter production', async () => {
  for (const changes of [{ qualificationOnly: true }, { releaseRunAttempt: 2 }, { sha: pin.receiverSha },
    { memberRelease: undefined }]) {
    const f = fixture(); await assert.rejects(f.execute({ ...q(), ...changes }));
    assert.equal(f.s.posts.length, 0); assert.equal(f.s.uploads, 0);
  }
});

test('foreign deployments during Render, upload or alias handoff prevent a completed receipt', async () => {
  for (const stage of ['render', 'upload', 'alias']) {
    const f = fixture();
    if (stage === 'render') {
      const read = f.api.render;
      f.api.render = async (path, body) => { const result = await read(path, body);
        if (path.endsWith('/deploys/dep-member')) f.s.render.commit.id = 'a'.repeat(40); return result; };
    } else if (stage === 'upload') f.api.uploadVercel = async () => { f.s.alias = 'dpl_Foreign'; };
    else {
      const read = f.api.vercel;
      f.api.vercel = async (path, body) => { const result = await read(path, body);
        if (path.endsWith('/dpl_Member')) f.s.alias = 'dpl_Foreign'; return result; };
    }
    await assert.rejects(f.execute()); assert.ok(!f.s.audit.some(x => x.phase === 'member-deployed'));
    assert.equal(f.s.posts.filter(x => x.provider === 'render').length, 1);
    assert.equal(f.s.posts.filter(x => x.provider === 'vercel').length, stage === 'alias' ? 1 : 0);
  }
});

test('expiry or admission failure after Render prevents frontend upload', async () => {
  for (const timeout of [true, false]) {
    const f = fixture(), read = f.api.render;
    f.api.render = async (path, body) => { const result = await read(path, body);
      if (path.endsWith('/deploys/dep-member')) { if (timeout) f.s.timeout = true; else f.s.guardFails = true; }
      return result; };
    await assert.rejects(f.execute()); assert.equal(f.s.posts.length, 1); assert.equal(f.s.uploads, 0);
  }
});

test('new mode stays inside the existing protected workflow and exposes no full-release operation', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  assert.match(workflow, /group: production-release\s+cancel-in-progress: false/);
  assert.match(workflow, /environment: production-release/);
  assert.match(workflow, /schema54-member-reads-v1/);
  const source = readFileSync(new URL('./member-release.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /api\.(?:gh|executor)\([^\n]+,\s*\{|api\.(?:migrate|reset|retire|replay)|Database\.Migrate|execFileSync\('(?:psql|dotnet)'/);
  assert.equal(pin.migrationCount, 54);
});
