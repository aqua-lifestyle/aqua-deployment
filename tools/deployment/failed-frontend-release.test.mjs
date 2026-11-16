import './fixtures/historical-policy-epoch.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFailedFrontendRecord, validateFailedFrontendContext,
  validateFailedFrontendAudit, observeFailedFrontendEffect, failedFrontendRecordDigest } from './failed-frontend-release.mjs';
import { objectDigest, sha256 } from './github-evidence.mjs';
import { prepareFrontend, approvedPublicInputs } from './vercel-source.mjs';
import { normalRuntimeSettings } from './runtime-readiness.mjs';
import { frontendReleaseMode, frontendSuccessorCandidateSha } from './aqgreen-frontend-source-successor.mjs';
import { targets, standingPolicy, freezeCandidate, createAuditWriter, releaseKey,
  validateRender, validateVercel, validateHealth, deploymentHistory } from './release-control.mjs';
import { runnerEnv, frontendFixtureArchive } from './fixtures/provider.mjs';

const backend = 'b8d86e5e60997483423b273d5f426c08b411f573';
const originalExecutor = '085808bd918309592d372388889fda80401a1b46';
const candidate = () => freezeCandidate({ repository: targets.repository, sha: frontendSuccessorCandidateSha,
  ciRunId: '43597833117', ciRunAttempt: 1 }, { ...runnerEnv(),
  GITHUB_RUN_ID: '43630374712', GITHUB_SHA: originalExecutor, GITHUB_WORKFLOW_SHA: originalExecutor },
standingPolicy, false, frontendReleaseMode);

test('the separate record pins the actual failed run and grants no success or mutation authority', () => {
  const bytes = readFileSync(new URL('../../governance/aqgreen-frontend-failed-release-43630374712.json', import.meta.url));
  assert.equal(sha256(bytes), failedFrontendRecordDigest);
  const record = validateFailedFrontendRecord(bytes);
  assert.equal(record.originalExecution.conclusion, 'failure');
  assert.equal(record.originalAudit.terminalFailureCode, 'VERCEL_EFFECTIVE_BUILD_INPUTS_UNVERIFIABLE');
  assert.equal(record.scope.successfulReleaseReceiptCreated, false);
  assert.equal(record.scope.newVercelDeploymentAuthorized, false);
  const altered = Buffer.from(bytes); altered[altered.indexOf(Buffer.from('READY'))] ^= 1;
  assert.throws(() => validateFailedFrontendRecord(altered), /RECORD_CHANGED/);
});

test('only the exact failed executor job is eligible for non-success history recognition', () => {
  const r = validateFailedFrontendRecord();
  const run = { id: Number(r.originalExecution.runId), run_number: 82, run_attempt: 1,
    head_sha: r.originalExecution.executorSha, actor: r.originalExecution.actor,
    status: 'completed', conclusion: 'failure' };
  const production = { id: Number(r.originalExecution.productionJobId), name: 'Unattended recovery release',
    conclusion: 'failure', steps: [{ name: r.originalExecution.failedStep, conclusion: 'failure' }] };
  const differentSource = { ...candidate(), sha: 'a'.repeat(40) };
  assert.equal(validateFailedFrontendContext(run, run, 1, production, differentSource, targets).originalExecution.runId,
    r.originalExecution.runId);
  for (const change of [x => { x.candidate.sha = r.qualifiedSource.sha; },
    x => { x.run.head_sha = 'a'.repeat(40); }, x => { x.production.conclusion = 'success'; },
    x => { x.run.run_attempt = 2; }, x => { x.candidate.memberRelease = 'other'; }]) {
    const value = { run: structuredClone(run), production: structuredClone(production), candidate: { ...differentSource } };
    change(value);
    assert.throws(() => validateFailedFrontendContext(value.run, value.run, 1,
      value.production, value.candidate, targets), /NOT_RECONCILABLE/);
  }
});

function fixture() {
  const q = candidate(), source = frontendFixtureArchive(), archive = Buffer.from(source.archive);
  const offset = archive.indexOf(Buffer.from(source.sha)); assert.ok(offset >= 0);
  archive.write(q.sha, offset, 40, 'ascii');
  const proof = prepareFrontend(archive, q.sha, targets.vercel, approvedPublicInputs(targets.vercel)).proof;
  const rows = [], audit = createAuditWriter(q, row => rows.push(row));
  audit({ phase: 'evidence-selected', authorizationId: 'a'.repeat(64), evidenceSha256: 'b'.repeat(64),
    inventorySha256: 'c'.repeat(64), evidenceArtifactId: '123', schemaFirstEvidenceSha256: 'd'.repeat(64) });
  audit({ phase: 'frontend-baseline-selected', baselineRenderDeployId: 'dep-old', baselineRenderSha: backend,
    baselineVercelDeployId: 'dpl_Legacy', servingRenderDeployId: 'dep-live', servingRenderSha: backend,
    paymentAvailability: 'Available' });
  audit({ phase: 'frontend-classified', frontendOnly: true });
  audit({ phase: 'frontend-vercel-files-requesting', vercelSourceProof: proof });
  audit({ phase: 'frontend-vercel-files-uploaded' });
  audit({ phase: 'frontend-vercel-requesting' });
  audit({ phase: 'frontend-vercel-requested', vercelDeployId: 'dpl_New' });
  audit({ phase: 'failed', code: 'VERCEL_EFFECTIVE_BUILD_INPUTS_UNVERIFIABLE' });
  const descriptor = { runId: q.releaseRunId, runAttempt: 1, sha: q.executorSha, artifactId: '123' };
  const compiled = () => `schema.parse({NEXT_PUBLIC_ABP_API_URL:${JSON.stringify(targets.vercel.publicApiUrl)},NEXT_PUBLIC_DEFAULT_TENANT_NAME:${JSON.stringify(state.compiledTenant)},NEXT_PUBLIC_MONITORING_ENDPOINT:undefined})`;
  const state = { alias: 'dpl_New', renderSha: backend, renderId: 'dep-live',
    compiledTenant: 'Default', changeAfterFirst: false, reads: 0, posts: 0 };
  const asset = { path: '/_next/static/chunks/public-env.js', sha256: sha256(Buffer.from(compiled())),
    bytes: Buffer.byteLength(compiled()) };
  const pin = structuredClone(validateFailedFrontendRecord());
  pin.originalAudit.artifactId = descriptor.artifactId;
  pin.originalAudit.rowsSha256 = objectDigest(rows);
  pin.qualifiedSource.sourceManifestSha256 = proof.manifestSha256;
  pin.qualifiedSource.fileSourceProofSha256 = objectDigest(proof);
  pin.qualifiedSource.releaseIdentity = releaseKey(q);
  pin.observedVercel.deploymentId = 'dpl_New';
  pin.observedVercel.originalBaselineDeploymentId = 'dpl_Legacy';
  pin.observedVercel.compiledAssets = [asset];
  pin.observedBackend.renderDeployId = 'dep-live';
  const service = { id: targets.render.id, name: targets.render.name,
    repo: `https://github.com/${targets.repository}`, branch: 'main', suspended: 'not_suspended',
    autoDeploy: 'no', autoDeployTrigger: 'off', rootDir: '', serviceDetails: {
      runtime: 'docker', healthCheckPath: '/api/health', plan: 'starter', buildPlan: 'starter',
      numInstances: 1, region: 'frankfurt', maintenanceMode: { enabled: false },
      envSpecificDetails: { dockerContext: '.', dockerfilePath: './docker/api/Dockerfile',
        preDeployCommand: '', dockerCommand: '' } } };
  const project = () => ({ id: targets.vercel.id, accountId: targets.vercel.teamId,
    name: targets.vercel.name, rootDirectory: targets.vercel.rootDirectory,
    nodeVersion: '24.x', autoAssignCustomDomains: true, link: null,
    targets: { production: { id: state.alias } } });
  const meta = { aquaCiRunId: q.ciRunId, aquaCiRunAttempt: String(q.ciRunAttempt),
    aquaSourceSha: q.sha, aquaReleaseIdentity: releaseKey(q),
    aquaFrontendRelease: q.frontendRelease, aquaFileSourceSha256: objectDigest(proof) };
  const web = () => ({ id: 'dpl_New', projectId: targets.vercel.id, target: 'production',
    readyState: 'READY', gitSource: null, meta,
    env: Object.keys(proof.publicBuildInputs), build: { env: Object.keys(proof.publicBuildInputs) },
    projectSettings: { buildCommand: 'npm run build', installCommand: 'npm ci' } });
  const api = {
    vercel: async (path, body) => {
      assert.equal(body, undefined, 'reconciliation cannot issue Vercel writes');
      if (path.includes('/v6/deployments?')) return { deployments: [{ uid: 'dpl_New', state: 'READY', meta }] };
      if (path.endsWith('/aliases')) return { aliases: [{ alias: 'www.aqualifestyleclub.co.za' }] };
      if (path.includes('/domains/')) return { name: 'www.aqualifestyleclub.co.za',
        projectId: targets.vercel.id, verified: true };
      if (path.endsWith('/dpl_New')) return web();
      assert.equal(path, `/v9/projects/${targets.vercel.id}`); return project();
    },
    render: async (path, body) => {
      assert.equal(body, undefined, 'reconciliation cannot issue Render writes');
      if (path.includes('/env-vars/')) {
        const key = path.split('/').at(-1);
        return { key, value: normalRuntimeSettings[key][0] };
      }
      if (path.includes('/deploys?')) return [{ deploy: {
        id: state.renderId, status: 'live', commit: { id: state.renderSha } } }];
      assert.equal(path, `/services/${targets.render.id}`); return service;
    },
    health: async () => ({ status: 200, recovery: null, body: { status: 'Healthy',
      buildId: state.renderSha, environment: 'Production', databaseStatus: 'Healthy',
      redisStatus: 'Healthy', dataProtectionKeyStoreStatus: 'Healthy', paymentAvailability: 'Available' } }),
    web: async () => 200,
    webHealth: async () => ({ status: 'Healthy', buildId: state.renderSha, paymentAvailability: 'Available' })
  };
  const options = { targets, validateRender, validateVercel, validateHealth, deploymentHistory, releaseKey,
    publicFetch: async url => {
      const path = new URL(url);
      assert.equal(path.origin, targets.vercel.productionUrl);
      if (path.pathname === '/login') { state.reads++; return new Response('<script src="/_next/static/chunks/public-env.js"></script>'); }
      assert.equal(path.pathname, asset.path);
      const value = state.changeAfterFirst && state.reads > 1 ? 'Other' : state.compiledTenant;
      return new Response(`schema.parse({NEXT_PUBLIC_ABP_API_URL:${JSON.stringify(targets.vercel.publicApiUrl)},NEXT_PUBLIC_DEFAULT_TENANT_NAME:${JSON.stringify(value)},NEXT_PUBLIC_MONITORING_ENDPOINT:undefined})`);
    } };
  return { rows, descriptor, pin, state, api, options,
    read: () => observeFailedFrontendEffect(api, rows, descriptor, pin, options) };
}

test('original failed audit is recognized as effect, never promoted to verified release', () => {
  const f = fixture();
  const result = validateFailedFrontendAudit(f.rows, f.descriptor, targets, f.pin);
  assert.equal(result.originalConclusion, 'failure');
  assert.equal(result.successfulFullReleasePredecessor, false);
  assert.equal(result.automaticResumeAuthorized, false);
  for (const change of [rows => { rows.at(-1).phase = 'frontend-deployed'; },
    rows => { rows.at(-1).code = 'verified'; },
    rows => { rows[6].vercelDeployId = 'dpl_Foreign'; },
    rows => { rows[3].vercelSourceProof.publicBuildInputs.NEXT_PUBLIC_DEFAULT_TENANT_NAME = 'Other'; }]) {
    const rows = structuredClone(f.rows); change(rows);
    assert.throws(() => validateFailedFrontendAudit(rows, f.descriptor, targets, f.pin));
  }
});

test('read-only reconciliation rechecks alias-bound compiled values and unchanged Normal backend', async () => {
  const f = fixture();
  const result = await f.read();
  assert.equal(result.outcome, 'existing-provider-effect-observed');
  assert.equal(result.originalRunStillFailed, true);
  assert.equal(result.successfulReleaseReceiptCreated, false);
  assert.equal(f.state.reads, 2);
  for (const change of [x => { x.state.alias = 'dpl_Foreign'; },
    x => { x.state.renderSha = 'a'.repeat(40); },
    x => { x.state.compiledTenant = 'Other'; },
    x => { x.state.changeAfterFirst = true; },
    x => { x.pin.observedVercel.compiledAssets[0].sha256 = 'a'.repeat(64); }]) {
    const rejected = fixture(); change(rejected);
    await assert.rejects(rejected.read());
  }
});
