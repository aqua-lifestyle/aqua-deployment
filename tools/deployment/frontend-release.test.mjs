import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { frontendReleaseMode, frontendReleaseRecordDigest, frontendSuccessorCandidateSha,
  validateAqGreenFrontendSuccessor } from './aqgreen-frontend-source-successor.mjs';
import { deployFrontendRelease, validateFrontendReceipt } from './frontend-release.mjs';
import { freezeCandidate, validateDispatchInputs, verifyCandidate, createAuditWriter, releaseKey,
  standingPolicy, targets, validateRender, validateVercel, validateHealth,
  deploymentHistory, waitFor } from './release-control.mjs';
import { normalRuntimeSettings, cleanStartRuntimeSettings } from './runtime-readiness.mjs';
import { schemaSource, approvedSchemaReadback, verifySchemaFirst } from './commission-schema-first.mjs';
import { createGitHubAdmission, validateGitHubAdmission, inventoryDigest, sha256 } from './github-evidence.mjs';
import { frontendFixtureArchive, runnerEnv, fixture as fullFixture } from './fixtures/provider.mjs';

const backend = 'b8d86e5e60997483423b273d5f426c08b411f573';
const now = () => Date.UTC(2026, 10, 14, 14);
const q = () => freezeCandidate({ repository: targets.repository, sha: frontendSuccessorCandidateSha,
  ciRunId: '43597833117', ciRunAttempt: 1 }, runnerEnv(), standingPolicy, false, frontendReleaseMode);

test('frontend successor chains unchanged M55 guard files, exact merged main and fixed purpose', () => {
  const selected = validateAqGreenFrontendSuccessor(q());
  assert.equal(selected.completedCarry.candidateSha, frontendSuccessorCandidateSha);
  assert.ok(selected.sourceBindings.every(x => x.candidateSha256 === x.previousCandidateSha256 &&
    x.priorBindingRecordSha256 === selected.previousBinding.recordSha256));
  const bytes = readFileSync(new URL('../../governance/aqgreen-frontend-source-successor-20261114.json', import.meta.url));
  const edit = Buffer.from(bytes); edit[edit.indexOf(Buffer.from('vercel-files-frontend-only'))] ^= 1;
  assert.throws(() => validateAqGreenFrontendSuccessor(q(), edit), /RECORD_CHANGED/);
  for (const change of [x => x.sha = backend, x => x.ciRunAttempt = 2,
    x => x.frontendRelease = '0'.repeat(64), x => x.memberRelease = '0'.repeat(64),
    x => x.renderServiceId = 'srv-foreign']) {
    const altered = { ...q() }; change(altered);
    assert.throws(() => validateAqGreenFrontendSuccessor(altered), /EXACT_SCOPE_REQUIRED/);
  }
});

test('frontend successor passes the completed M55 source/readback gate without new migration', async () => {
  const carry = validateAqGreenFrontendSuccessor(q()).completedCarry;
  const pins = [...schemaSource.migrationFiles, ...schemaSource.holdSources, ...schemaSource.cleanStartSources];
  const read = async path => carry.sourceOverrides.find(row => row.path === path)?.candidateSha256 ??
    (path === carry.guardOverride.path ? carry.guardOverride.candidateSha256 :
      pins.find(row => row.path === path)?.sha256);
  const compareBase = standingPolicy.firstReleaseRecovery.baseline.renderSha;
  const api = { gh: async route => {
    if (route === `/compare/${compareBase}...${q().sha}`)
      return { status: 'ahead', files: schemaSource.migrationFiles.map(row =>
        ({ filename: row.path, status: row.status })) };
    if (route === `/compare/${carry.operationSourceSha}...${q().sha}`)
      return { status: 'ahead', files: [] };
    throw Error('Unexpected comparison');
  } };
  const proof = await verifySchemaFirst(api, q(), standingPolicy, read, approvedSchemaReadback, true);
  assert.equal(proof.initialSourceSha, carry.operationSourceSha);
  assert.equal(proof.schemaEvidenceKind, 'COMPLETED_ADDITIVE_MIGRATION55_V1');
  await assert.rejects(verifySchemaFirst(api, q(), standingPolicy,
    async path => path === carry.guardOverride.path ? '0'.repeat(64) : read(path),
    approvedSchemaReadback, true), /SCHEMA_OR_PAYOUT_GUARD_SOURCE_CHANGED/);
});

test('dispatch, candidate, admission receipt and release identity cannot exchange frontend and full purpose', () => {
  const dispatch = { sha: frontendSuccessorCandidateSha, ci_run_id: '43597833117',
    ci_run_attempt: '1', release_mode: frontendReleaseMode };
  assert.equal(validateDispatchInputs(dispatch).releaseMode, frontendReleaseMode);
  for (const change of [{ sha: backend }, { release_mode: 'other' },
    { prospective_mode: 'authorize' }, { recovery_baseline_run_id: '1' }])
    assert.throws(() => validateDispatchInputs({ ...dispatch, ...change }));
  assert.equal(q().frontendRelease, frontendReleaseRecordDigest);
  const qualification = freezeCandidate({ repository: targets.repository, sha: frontendSuccessorCandidateSha,
    ciRunId: '43597833117', ciRunAttempt: 1 }, runnerEnv(), standingPolicy, true, frontendReleaseMode);
  assert.equal(qualification.qualificationOnly, true);
  assert.equal(validateAqGreenFrontendSuccessor(qualification).completedCarry.candidateSha, frontendSuccessorCandidateSha);
  const full = { ...q() }; delete full.frontendRelease;
  assert.notEqual(releaseKey(q()), releaseKey(full));
  const bytes = Buffer.from('inert archive');
  verifyCandidate({ ...q(), sourceSha256: sha256(bytes) }, q(), bytes, bytes);
  assert.throws(() => verifyCandidate({ ...q(), sourceSha256: sha256(bytes) }, full, bytes, bytes),
    /CANDIDATE_PURPOSE_MISMATCH/);
  const evidence = { ...q(), mode: 'github-evidence-v1', inventorySha256: inventoryDigest,
    completedAt: new Date(now() - 1000).toISOString() };
  const receipt = createGitHubAdmission(q(), standingPolicy, evidence, now);
  validateGitHubAdmission(receipt, q(), standingPolicy, evidence, now);
  assert.equal(receipt.frontendRelease, frontendReleaseRecordDigest);
  assert.throws(() => validateGitHubAdmission(receipt, full, standingPolicy, evidence, now),
    /ADMISSION_RECEIPT_MISMATCH/);
});

test('full backend release refuses Normal or unknown availability before a Render request', async () => {
  for (const paymentAvailability of ['Available', undefined]) {
    const f = fullFixture(), read = f.api.health;
    f.api.health = async () => {
      const response = await read(); response.body.result.paymentAvailability = paymentAvailability;
      return response;
    };
    await assert.rejects(f.execute(), /POST_NORMAL_BACKEND_RELEASE_REQUIRES_SEPARATE_AUTHORIZATION/);
    assert.equal(f.posts.some(row => row.provider === 'render'), false);
  }
});

test('Normal settings preserve commissioning and financial holds', () => {
  assert.deepEqual(normalRuntimeSettings.App__WeeklyCommissions__Enabled, ['true']);
  assert.deepEqual(normalRuntimeSettings.App__FinancialOperations__Enabled, ['true']);
  assert.deepEqual(normalRuntimeSettings.App__AQGreenV2__Commissioning__Enabled, ['true']);
  assert.deepEqual(normalRuntimeSettings.App__YocoCutover__Enabled, ['true']);
  assert.deepEqual(normalRuntimeSettings.Yoco__Mode, ['live']);
  assert.deepEqual(normalRuntimeSettings.App__AutomaticPayouts__Enabled, ['false']);
  assert.deepEqual(normalRuntimeSettings.App__BackgroundJobs__Enabled, ['false']);
  assert.deepEqual(normalRuntimeSettings.App__EntryMonthlyObligations__Enabled, ['false']);
});

// The archive comment is relabelled only for this controlled orchestration
// fixture. The production entry authenticates the entire Git archive separately.
function fixture(state = 'Available', { namesOnly = false } = {}) {
  const source = frontendFixtureArchive(), archive = Buffer.from(source.archive);
  const offset = archive.indexOf(Buffer.from(source.sha)); assert.ok(offset >= 0);
  archive.write(frontendSuccessorCandidateSha, offset, 40, 'ascii');
  const s = { availability: state, alias: 'dpl_Legacy', servingId: 'dep-commissioned',
    uploads: 0, posts: [], audit: [], deployed: null, flipOnUpload: false, failedVercel: false,
    compiledTenant: 'Default', changeCompiledOnFinalRead: false, compiledReadbacks: 0,
    vars: Object.fromEntries(Object.entries(state === 'Available' ? normalRuntimeSettings :
      cleanStartRuntimeSettings).map(([key, value]) => [key, value[0]])) };
  s.vars.App__AutomaticPayouts__Enabled = 'false';
  const service = { id: targets.render.id, name: targets.render.name,
    repo: `https://github.com/${targets.repository}`, branch: 'main', suspended: 'not_suspended',
    autoDeploy: 'no', autoDeployTrigger: 'off', rootDir: '',
    serviceDetails: { runtime: 'docker', plan: 'starter', buildPlan: 'starter', numInstances: 1,
      region: 'frankfurt', maintenanceMode: { enabled: false }, healthCheckPath: '/api/health',
      envSpecificDetails: { dockerContext: '.', dockerfilePath: './docker/api/Dockerfile',
        preDeployCommand: '', dockerCommand: '' } } };
  const project = () => ({ id: targets.vercel.id, name: targets.vercel.name, accountId: targets.vercel.teamId,
    rootDirectory: targets.vercel.rootDirectory, nodeVersion: '24.x', autoAssignCustomDomains: true,
    link: null, targets: { production: { id: s.alias } } });
  const inputRows = () => Object.entries({ NEXT_PUBLIC_ABP_API_URL: targets.vercel.publicApiUrl,
    NEXT_PUBLIC_DEFAULT_TENANT_NAME: targets.vercel.defaultTenantName }).map(([key, value]) =>
    ({ key, value: namesOnly ? undefined : value, type: namesOnly ? 'encrypted' : 'plain', target: ['production'] }));
  const api = {
    gh: async route => {
      assert.equal(route, `/compare/${backend}...${frontendSuccessorCandidateSha}`);
      return { status: 'ahead', base_commit: { sha: backend }, merge_base_commit: { sha: backend },
        files: [{ filename: targets.vercel.rootDirectory + '/app/page.tsx', status: 'modified' },
          { filename: 'AqualLifeStyle/9.4.2/aspnet-core/test/AqualLifeStyle.Tests/Example.cs', status: 'modified' }] };
    },
    render: async (path, body) => {
      assert.equal(body, undefined, 'Render POST must never occur');
      if (path.includes('/env-vars/')) { const key = path.split('/').at(-1); return { key, value: s.vars[key] }; }
      if (path.includes('/deploys?')) return [{ deploy: { id: s.servingId, status: 'live', commit: { id: backend } } }];
      assert.equal(path, `/services/${targets.render.id}`); return service;
    },
    vercel: async (path, body) => {
      if (body) {
        assert.equal(path, '/v13/deployments'); s.posts.push(body);
        s.deployed = { ...body, id: 'dpl_New', projectId: targets.vercel.id,
          target: 'production', readyState: 'BUILDING',
          ...(namesOnly ? { env: Object.keys(body.env), build: { env: Object.keys(body.build.env) } } : {}) };
        return s.deployed;
      }
      if (path.startsWith('/v6/')) return { deployments: s.deployed ? [
        { uid: 'dpl_New', state: s.deployed.readyState, meta: s.deployed.meta }] : [] };
      if (path.startsWith('/v10/')) return { envs: inputRows() };
      if (path.includes('/domains/')) return { name: 'www.aqualifestyleclub.co.za',
        projectId: targets.vercel.id, verified: true };
      if (path.endsWith('/aliases')) return { aliases: [{ alias: 'www.aqualifestyleclub.co.za' }] };
      if (path.endsWith('/dpl_Legacy')) return { id: 'dpl_Legacy', projectId: targets.vercel.id,
        target: 'production', readyState: 'READY' };
      if (path.endsWith('/dpl_New')) {
        s.deployed.readyState = s.failedVercel ? 'ERROR' : 'READY';
        if (!s.failedVercel) s.alias = 'dpl_New';
        return s.deployed;
      }
      assert.equal(path, `/v9/projects/${targets.vercel.id}`); return project();
    },
    health: async () => ({ status: 200, recovery: null, body: { status: 'Healthy',
      buildId: backend, environment: 'Production', databaseStatus: 'Healthy', redisStatus: 'Healthy',
      dataProtectionKeyStoreStatus: 'Healthy', paymentAvailability: s.availability } }),
    uploadVercel: async () => { s.uploads++; if (s.flipOnUpload) s.availability = 'Held'; },
    web: async () => 200,
    webHealth: async (sha, expected) => {
      assert.equal(sha, backend); assert.equal(expected, state);
      return { status: 'Healthy', buildId: backend, paymentAvailability: s.availability };
    }
  };
  const options = { targets, policy: standingPolicy, validateRender, validateVercel, validateHealth,
    validateBaselineReceipt: () => ({ renderDeployId: 'dep-historical', renderSha: backend,
      vercelDeployId: 'dpl_Legacy', vercelSourceProvenance: 'UNVERIFIED_LEGACY', origin: { sha: backend } }),
    deploymentHistory, waitFor, releaseKey, frontendArchive: archive,
    evidencePlan: { baseline: { runId: '123' }, resume: null }, baselineRows: [{}],
    now, attempts: 2, pause: async () => {}, guard: async () => {}, validateAdmission: () => {},
    publicFetch: async url => {
      const path = new URL(url);
      assert.equal(path.origin, targets.vercel.productionUrl);
      if (path.pathname === '/login') {
        s.compiledReadbacks++;
        return new Response('<script src="/_next/static/chunks/public-env.js"></script>');
      }
      assert.equal(path.pathname, '/_next/static/chunks/public-env.js');
      const tenant = s.changeCompiledOnFinalRead && s.compiledReadbacks > 1 ? 'Other' : s.compiledTenant;
      return new Response(`schema.parse({NEXT_PUBLIC_ABP_API_URL:${JSON.stringify(targets.vercel.publicApiUrl)},NEXT_PUBLIC_DEFAULT_TENANT_NAME:${JSON.stringify(tenant)},NEXT_PUBLIC_MONITORING_ENDPOINT:undefined})`);
    } };
  const report = createAuditWriter(q(), row => s.audit.push(row));
  report({ phase: 'evidence-selected', authorizationId: 'a'.repeat(64), evidenceSha256: 'b'.repeat(64),
    inventorySha256: 'c'.repeat(64), schemaFirstEvidenceSha256: 'd'.repeat(64), evidenceArtifactId: '123' });
  return { s, api, options, execute: () => deployFrontendRelease(api, q(), report, options) };
}

test('Normal frontend release uploads only Vercel files; binds commissioned same-SHA redeployment in receipt', async () => {
  const f = fixture(); await f.execute();
  assert.equal(f.s.posts.length, 1);
  assert.equal(f.s.posts[0].meta.aquaFrontendRelease, frontendReleaseRecordDigest);
  assert.ok(f.s.uploads > 0);
  assert.equal(f.s.audit.at(-1).phase, 'frontend-deployed');
  assert.equal(f.s.audit.at(-1).renderDeployId, 'dep-commissioned');
  assert.equal(f.s.audit[1].baselineRenderDeployId, 'dep-historical');
  const descriptor = { runId: q().releaseRunId, runAttempt: 1, sha: q().executorSha };
  const receipt = validateFrontendReceipt(f.s.audit, descriptor, targets);
  assert.equal(receipt.sha, frontendSuccessorCandidateSha);
  assert.equal(receipt.renderSha, backend);
  for (const mutate of [rows => rows[1].baselineRenderSha = frontendSuccessorCandidateSha,
    rows => rows[0].frontendRelease = '0'.repeat(64),
    rows => rows[3].vercelSourceProof.sourceSha = backend,
    rows => rows.splice(4, 1)]) {
    const rows = structuredClone(f.s.audit); mutate(rows);
    assert.throws(() => validateFrontendReceipt(rows, descriptor, targets));
  }
});

test('names-only Vercel metadata is accepted only with observed alias-bound compiled public inputs', async () => {
  const f = fixture('Available', { namesOnly: true });
  await f.execute();
  assert.equal(f.s.posts.length, 1);
  assert.equal(f.s.compiledReadbacks, 2, 'final deployment must independently recheck compiled values');
  assert.equal(f.s.audit.at(-1).phase, 'frontend-deployed');
  assert.deepEqual(f.s.deployed.build.env, ['NEXT_PUBLIC_ABP_API_URL', 'NEXT_PUBLIC_DEFAULT_TENANT_NAME']);
  for (const change of [x => x.s.compiledTenant = 'Other',
    x => x.s.changeCompiledOnFinalRead = true]) {
    const rejected = fixture('Available', { namesOnly: true }); change(rejected);
    await assert.rejects(rejected.execute(), /VERCEL_EFFECTIVE_BUILD_INPUTS_UNVERIFIABLE/);
    assert.equal(rejected.s.posts.length, 1);
    assert.equal(rejected.s.audit.at(-1).phase, 'frontend-vercel-requested');
    assert.ok(!rejected.s.audit.some(row => row.phase === 'frontend-deployed'));
  }
  const missing = fixture('Available', { namesOnly: true });
  missing.options.publicFetch = async url => new Response(new URL(url).pathname === '/login' ?
    '<script src="/_next/static/chunks/public-env.js"></script>' : 'no compiled public inputs');
  await assert.rejects(missing.execute(), /VERCEL_COMPILED_PUBLIC_VALUES_MISSING_OR_CONFLICTING/);
  assert.equal(missing.s.audit.at(-1).phase, 'frontend-vercel-requested');
  const conflict = fixture('Available', { namesOnly: true }), read = conflict.api.vercel;
  conflict.api.vercel = async (path, body) => {
    const value = await read(path, body);
    return path.endsWith('/dpl_New') ? { ...value,
      env: { NEXT_PUBLIC_ABP_API_URL: 'https://foreign.example.invalid', NEXT_PUBLIC_DEFAULT_TENANT_NAME: 'Default' } } : value;
  };
  await assert.rejects(conflict.execute(), /VERCEL_EFFECTIVE_BUILD_INPUTS_UNVERIFIABLE/);
  assert.equal(conflict.s.audit.at(-1).phase, 'frontend-vercel-requested');
});

test('Held and Normal are distinct fenced states; backend scope, drift and Vercel failures deny', async () => {
  const held = fixture('Held'); await held.execute();
  assert.equal(held.s.audit.at(-1).paymentAvailability, 'Held');
  for (const change of [f => f.s.vars.App__AutomaticPayouts__Enabled = 'true',
    f => f.s.vars.App__AQGreenV2__Commissioning__Enabled = 'false',
    f => f.s.vars.App__YocoCutover__Enabled = 'false',
    f => f.s.vars.Yoco__Mode = 'test',
    f => f.s.alias = 'dpl_Foreign']) {
    const f = fixture(); change(f); await assert.rejects(f.execute());
    assert.equal(f.s.posts.length, 0); assert.equal(f.s.uploads, 0);
  }
  const backendChange = fixture();
  backendChange.api.gh = async () => ({ status: 'ahead', base_commit: { sha: backend },
    merge_base_commit: { sha: backend }, files: [{ filename: 'docker/api/Dockerfile', status: 'modified' }] });
  await assert.rejects(backendChange.execute(), /FRONTEND_ONLY_RELEASE_REQUIRES_SEPARATE_BACKEND_AUTHORIZATION/);
  assert.equal(backendChange.s.uploads, 0);
  const flip = fixture(); flip.s.flipOnUpload = true;
  await assert.rejects(flip.execute(), /FRONTEND_BACKEND_STATE_CHANGED/);
  assert.equal(flip.s.posts.length, 0);
  const drift = fixture();
  drift.api.uploadVercel = async () => { drift.s.uploads++; drift.s.servingId = 'dep-foreign'; };
  await assert.rejects(drift.execute(), /FRONTEND_RENDER_DRIFT/);
  assert.equal(drift.s.posts.length, 0);
  const failure = fixture(); failure.s.failedVercel = true;
  await assert.rejects(failure.execute(), /PROVIDER_DEPLOYMENT_FAILED_INSPECT_RELEASE_REPORT/);
  assert.equal(failure.s.posts.length, 1);
  assert.equal(failure.s.audit.some(row => row.phase === 'frontend-deployed'), false);
});
