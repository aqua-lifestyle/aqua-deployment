import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { diagnoseRenderCommissionedState, selectedInterruptedStaging } from './verify-provider-credentials.mjs';
import { backendSuccessorPayloadKey, backendSuccessorPinKey } from './backend-successor-release.mjs';
import { normalRuntimeSettings } from './runtime-readiness.mjs';
import { targets, standingPolicy, policyDigest } from './release-control.mjs';
import { sha256 } from './github-evidence.mjs';
import { zipFixture } from './fixtures/provider.mjs';

const executorSha = 'e25fa6ec5d604e1f616aece4ddc9741429549bd3';
const liveSha = 'b8d86e5e60997483423b273d5f426c08b411f573';
const liveId = 'dep-dbru710n74is738ah8bg';
const receiptId = 'dep-dbrgkstbedkc73difujg';
// The pinned allowlist in the diagnostic accepts only this executor commit,
// failed release, baseline release and artifact pair.
const baselineSha = 'e42e5288502085368eb1c7c9017643f63f9d2b19';
const sourceSha = 'a'.repeat(40);
const repositoryId = 1423239668;
const baselineRunId = '43429695806';
const auditId = 14040001166;
const admissionId = '14401816374';
const policySha = policyDigest(standingPolicy);
const syntheticStageBytes = Buffer.from(JSON.stringify({ contractVersion: 'AQGreenD10BackendSuccessorV1',
  successorRevisionSha256: 'a'.repeat(40), schemaTransition: 'none' }));
const syntheticStagePin = sha256(syntheticStageBytes);
const historical = Object.freeze({
  currentConfigurationDigest: 'b89aa7a738f6b02eca7b90275c6d75c5443332d67675822e84112ce6904325ee',
  intendedConfigurationDigest: 'abeed0ec071ff8d300337c7da5f212e0479ad002203306d221e2ac1b937aebc3',
  requiredAssemblyDigest: 'cd7ae851d640b40a2761c3838282e7d367103bfedccd265f73c0c628d31f9a35',
  requiredRuntimeAssemblyDigest: '8865ebcd4a7762e70a730864ced879f19997dd3a3657cc1140b6bb0ca9a7c4d6'
});
const decisionFor = () => ({ contractVersion: 'AQGreenD10CutoverV2', decisionId: 'D10-REDACTED-FIXTURE',
  requiredSchemaDigest: '1'.repeat(64), requiredAssemblyDigest: historical.requiredAssemblyDigest,
  requiredRuntimeAssemblyDigest: historical.requiredRuntimeAssemblyDigest,
  requiredDatabaseIdentityDigest: '4'.repeat(64), requiredConfigurationDigest: historical.intendedConfigurationDigest });

function fixture({ mutate = () => {}, baselineAvailable = true, github, missingStagedKey } = {}) {
  const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REPOSITORY: targets.executor.repository, GITHUB_REPOSITORY_ID: '1423239668',
    GITHUB_REF: 'refs/heads/main', GITHUB_REF_PROTECTED: 'true', GITHUB_SHA: executorSha,
    GITHUB_WORKFLOW_SHA: executorSha,
    GITHUB_WORKFLOW_REF: `${targets.executor.repository}/.github/workflows/provider-credential-check.yml@refs/heads/main`,
    GITHUB_ACTOR: 'Xolani-M', GITHUB_ACTOR_ID: '86495928', GITHUB_TRIGGERING_ACTOR: 'Xolani-M',
    GITHUB_RUN_ID: '45000000000', GITHUB_RUN_ATTEMPT: '1',
    PROVIDER_CHECK_MODE: 'render-commissioned-state-diagnostic',
    RENDER_API_KEY: 'render-private-diagnostic-canary', GH_TOKEN: 'github-private-diagnostic-canary' };
  const decision = decisionFor();
  const decisionBytes = Buffer.from(JSON.stringify(decision));
  const values = { ...Object.fromEntries(Object.entries(normalRuntimeSettings).map(([key, allowed]) => [key, allowed[0]])),
    App__WeeklyCommissions__Enabled: 'true', App__FinancialOperations__Enabled: 'true',
    App__AQGreenV2__Commissioning__Enabled: 'true', Deployment__BuildId: liveSha,
    App__AQGreenV2__Commissioning__DecisionJsonBase64: decisionBytes.toString('base64'),
    App__AQGreenV2__Commissioning__DecisionSha256: createHash('sha256').update(decisionBytes).digest('hex'),
    [backendSuccessorPayloadKey]: syntheticStageBytes.toString('base64'),
    [backendSuccessorPinKey]: syntheticStagePin };
  const service = { id: targets.render.id, name: targets.render.name,
    repo: `https://github.com/${targets.repository}`, branch: 'main', suspended: 'not_suspended',
    autoDeployTrigger: 'off', autoDeploy: 'no', rootDir: '',
    serviceDetails: { runtime: 'docker', plan: 'starter', buildPlan: 'starter', numInstances: 1,
      region: 'frankfurt', maintenanceMode: { enabled: false }, disk: null,
      healthCheckPath: '/api/health', envSpecificDetails: { dockerContext: '.', dockerfilePath: './docker/api/Dockerfile',
        preDeployCommand: '', dockerCommand: '' } } };
  const deployment = { id: liveId, status: 'live', commit: { id: liveSha }, createdAt: '2026-11-21T10:00:00Z' };
  const health = { status: 200, recovery: null, receiver: 'Schema54', body: { result: {
    status: 'Healthy', buildId: liveSha, environment: 'Production', databaseStatus: 'Healthy',
    redisStatus: 'Healthy', dataProtectionKeyStoreStatus: 'Healthy', paymentAvailability: 'Available' } } };
  const calls = [], reports = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.method ?? 'GET', 'GET');
    assert.equal(options.body, undefined);
    const parsed = new URL(url);
    if (github && (parsed.origin === 'https://api.github.com' ||
      parsed.hostname.endsWith('.blob.core.windows.net')))
      return github(url, options, env);
    if (url === targets.render.healthUrl) {
      assert.equal(options.headers.Authorization, undefined);
      return Response.json(health.body, { status: health.status, headers: {
        ...(health.recovery === null ? {} : { 'x-aqua-recovery-suspended': health.recovery }),
        'x-aqua-yoco-receiver': health.receiver } });
    }
    assert.equal(parsed.origin, 'https://api.render.com');
    assert.equal(options.headers.Authorization, `Bearer ${env.RENDER_API_KEY}`);
    const renderPath = parsed.pathname.replace(/^\/v1/, '');
    if (renderPath === `/services/${targets.render.id}`) return Response.json(service);
    if (renderPath === `/services/${targets.render.id}/deploys`) return Response.json([{ deploy: deployment }]);
    const key = decodeURIComponent(renderPath.split('/').at(-1));
    if (key === missingStagedKey) return Response.json({}, { status: 404 });
    assert.ok(Object.hasOwn(values, key), `allowlisted setting ${key}`);
    return Response.json({ key, value: values[key] });
  };
  mutate({ env, values, service, deployment, health, decision });
  const proof = { renderDeployId: receiptId, renderSha: liveSha, origin: { d10RuntimeBindings: { ...historical } } };
  const baseline = { runId: '43429695806', runAttempt: 1, sha: executorSha };
  const loadBaseline = async () => {
    if (!baselineAvailable) throw Error('SELECTED_BASELINE_ARTIFACT_UNAVAILABLE');
    return { proof, baseline, selectedByReleaseRunId: 44245360791 };
  };
  const noStaging = async () => { throw Error('STAGING_EVIDENCE_NOT_IN_BASELINE_FIXTURE'); };
  const run = (load = loadBaseline) => diagnoseRenderCommissionedState(env, { checkoutSha: executorSha, fetcher, loadBaseline: load,
    loadStaging: noStaging,
    emit: row => reports.push(row) });
  // The real baseline loader: no injected selection, GitHub artifact readers only.
  const runReal = () => diagnoseRenderCommissionedState(env, { checkoutSha: executorSha, fetcher,
    loadStaging: noStaging,
    emit: row => reports.push(row) });
  const runStaging = (loadStaging = async () => ({ pin: syntheticStagePin, payloadBytes: syntheticStageBytes.length,
    artifactId: '14747883309', archiveSha256: 'f'.repeat(64), createdAt: '2026-11-22T09:08:19Z',
    baselineRenderDeployId: liveId })) => diagnoseRenderCommissionedState(env,
    { checkoutSha: executorSha, fetcher, loadBaseline, loadStaging, emit: row => reports.push(row) });
  return { env, values, service, deployment, health, decision, calls, reports, run, runReal, runStaging };
}

test('protected commissioned-state diagnostic compares only the two staged keys without emitting their values', async () => {
  const f = fixture();
  assert.equal(await f.runStaging(), true);
  const row = f.reports.at(-2);
  assert.equal(row.contract, 'aqua.successor-staging-read-diagnostic');
  assert.deepEqual([row.stagedPayload, row.stagedPin], ['MATCH', 'MATCH']);
  assert.equal(row.evidence.auditArtifactId, '14747883309');
  assert.equal(row.deploymentHistory.current.id, liveId);
  assert.deepEqual(row.deploymentHistory.postRunDeployments, []);
  const staged = f.calls.filter(call => [backendSuccessorPayloadKey, backendSuccessorPinKey]
    .some(key => call.url.endsWith('/env-vars/' + key)));
  assert.deepEqual(staged.map(call => call.url.split('/').at(-1)),
    [backendSuccessorPayloadKey, backendSuccessorPinKey]);
  assert.ok(f.calls.every(call => (call.options.method ?? 'GET') === 'GET' && call.options.body === undefined));
  for (const secret of [f.env.RENDER_API_KEY, f.env.GH_TOKEN, f.values[backendSuccessorPayloadKey],
    f.values[backendSuccessorPinKey]]) assert.ok(!JSON.stringify(f.reports).includes(secret));
});

test('staging diagnostic reports a provider-recorded post-run deployment without claiming its cause', async () => {
  const f = fixture({ mutate: ({ deployment }) => {
    deployment.id = 'dep-syntheticlater'; deployment.createdAt = '2026-11-22T09:09:00Z';
  } });
  assert.equal(await f.runStaging(), true);
  const history = f.reports.at(-2).deploymentHistory;
  assert.equal(history.current.id, 'dep-syntheticlater');
  assert.deepEqual(history.postRunDeployments, [{ id: 'dep-syntheticlater', status: 'live',
    commitSha: liveSha, createdAt: '2026-11-22T09:09:00.000Z' }]);
  const untrusted = fixture({ mutate: ({ deployment }) => { delete deployment.createdAt; } });
  assert.equal(await untrusted.runStaging(), true);
  assert.equal(untrusted.reports.at(-2).deploymentHistory.postRunDeployments, 'UNVERIFIED');
});

test('staging diagnostic cannot read any other secret-bearing Render key or file', async () => {
  const f = fixture(), before = f.calls.length;
  assert.equal(await f.runStaging(async api => {
    for (const route of [`/services/${targets.render.id}/env-vars/${backendSuccessorPayloadKey}Extra`,
      `/services/${targets.render.id}/env-vars/App__AQGreenV2__Commissioning__VerifiedAuthorityJsonBase64`,
      `/services/${targets.render.id}/secret-files/keyfile`])
      await assert.rejects(api.render(route), /SECRET_BEARING_RENDER_READ_FORBIDDEN/);
    return { pin: syntheticStagePin, payloadBytes: syntheticStageBytes.length,
      artifactId: '14747883309', archiveSha256: 'f'.repeat(64), createdAt: '2026-11-22T09:08:19Z',
      baselineRenderDeployId: liveId };
  }), true);
  assert.ok(f.calls.slice(before).every(call => !call.url.includes('Extra') &&
    !call.url.includes('VerifiedAuthority') && !call.url.includes('secret-files')));
});

test('staged value mismatch and null or unavailable evidence remain distinct without disclosing values', async () => {
  for (const [change, expected] of [
    [f => f.values[backendSuccessorPayloadKey] = Buffer.from('different synthetic payload').toString('base64'), ['MISMATCH','MATCH']],
    [f => f.values[backendSuccessorPinKey] = 'a'.repeat(64), ['MATCH','MISMATCH']],
    [f => f.values[backendSuccessorPinKey] = null, ['MATCH','UNVERIFIED']]
  ]) {
    const f = fixture(); change(f);
    assert.equal(await f.runStaging(), true);
    const row = f.reports.at(-2);
    assert.deepEqual([row.stagedPayload,row.stagedPin], expected);
    assert.ok(!JSON.stringify(row).includes(f.values[backendSuccessorPayloadKey]));
  }
  const absent = fixture();
  assert.equal(await absent.runStaging(async () => { throw Error('untrusted provider response'); }), true);
  assert.deepEqual([absent.reports.at(-2).stagedPayload,absent.reports.at(-2).stagedPin], ['UNVERIFIED','UNVERIFIED']);
  assert.ok(!absent.calls.some(call => call.url.includes('/env-vars/' + backendSuccessorPayloadKey) ||
    call.url.includes('/env-vars/' + backendSuccessorPinKey)));
  const inaccessible = fixture({ missingStagedKey: backendSuccessorPinKey });
  assert.equal(await inaccessible.runStaging(), true);
  assert.deepEqual([inaccessible.reports.at(-2).stagedPayload, inaccessible.reports.at(-2).stagedPin],
    ['MATCH', 'UNVERIFIED'], 'a 404 cannot prove absence rather than inaccessible or inherited configuration');
});

const downloadRejected = error => error.message === 'GITHUB_ARTIFACT_DOWNLOAD_UNAVAILABLE' &&
  error.artifactDownloadDiagnostic.stage === 'github_zip' &&
  error.artifactDownloadDiagnostic.category === 'DESTINATION_POLICY_REJECTED' &&
  error.artifactDownloadDiagnostic.artifactId === admissionId;

const injectedSelection = () => ({
  proof: { renderDeployId: receiptId, renderSha: liveSha, origin: { d10RuntimeBindings: { ...historical } } },
  baseline: { runId: baselineRunId, runAttempt: 1, sha: executorSha },
  selectedByReleaseRunId: 44245360791
});

const blobSha = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const inventoryBytes = readFileSync(new URL('./approved-security-tests.json', import.meta.url));
const policyBytes = readFileSync(new URL('./unattended-policy.json', import.meta.url));

// Authenticated GitHub API and signed storage fixture for the exact failed
// release and its historical baseline: two pinned artifacts, real digests and
// the working-tree policy/inventory bytes at the pinned executor commit.
function githubFixture({ zipFailure = false, admissionReleaseRunId = 44245360791, omitAdmissionReleaseRunId = false } = {}) {
  const receipt = { contract: 'aqua.github-evidence-admission',
    ...(omitAdmissionReleaseRunId ? {} : { releaseRunId: admissionReleaseRunId }),
    releaseRunAttempt: 1, executorRepository: targets.executor.repository, executorSha,
    qualificationOnly: false, combinedRelease: 'post-normal-backend-frontend-v1', policySha256: policySha };
  const plan = { policySha256: policySha,
    baseline: { runId: baselineRunId, runAttempt: 1, sha: baselineSha, artifactId: String(auditId) },
    baselinePolicyProof: { executorSha: baselineSha, policySha256: policySha } };
  const identity = { version: 4, repository: targets.repository, sha: sourceSha, ciRunId: baselineRunId,
    ciRunAttempt: 1, releaseRunId: baselineRunId, releaseRunAttempt: 1, policySha256: policySha,
    environment: targets.environment, profile: targets.profile, renderServiceId: targets.render.id,
    vercelProjectId: targets.vercel.id, vercelTeamId: targets.vercel.teamId,
    executorRepository: targets.executor.repository, executorSha: baselineSha };
  const bindings = { requiredAssemblyDigest: historical.requiredAssemblyDigest,
    requiredRuntimeAssemblyDigest: historical.requiredRuntimeAssemblyDigest,
    currentConfigurationDigest: historical.currentConfigurationDigest,
    intendedConfigurationDigest: historical.intendedConfigurationDigest, intendedEnvironmentId: 'production-release',
    intendedBuildId: sourceSha };
  const rows = [
    { ...identity, phase: 'provider-read', scope: 'readiness-bindings', d10RuntimeBindings: bindings },
    { ...identity, phase: 'verified', renderSha: sourceSha, vercelSha: sourceSha, renderDeployId: liveId,
      vercelDeployId: 'dpl_EwGB3apX3P5JnU5KfG3rLzn21Kgf', renderReleaseRunAttempt: 1,
      vercelReleaseRunAttempt: 1, d10RuntimeBindings: bindings }
  ];
  const admissionZip = zipFixture('admission-receipt.json', JSON.stringify(receipt),
    { 'evidence-plan.json': JSON.stringify(plan) });
  const auditZip = zipFixture('release-report.jsonl', rows.map(row => JSON.stringify(row)).join('\n'));
  const artifact = (id, name, bytes, runId, sha) => ({ id: Number(id), name, expired: false,
    size_in_bytes: bytes.length, digest: `sha256:${sha256(bytes)}`,
    workflow_run: { id: Number(runId), head_sha: sha, head_branch: 'main',
      repository_id: repositoryId, head_repository_id: repositoryId } });
  const admissionMeta = artifact(admissionId, 'verified-admission-44245360791-1', admissionZip, '44245360791', executorSha);
  const auditName = `production-release-audit-${baselineRunId}-1`;
  const auditMeta = artifact(auditId, auditName, auditZip, baselineRunId, baselineSha);
  const admissionDescriptor = { id: String(admissionId), name: admissionMeta.name, digest: admissionMeta.digest,
    runId: '44245360791', sha: executorSha, repositoryId };
  const auditDescriptor = { id: String(auditId), name: auditName, digest: auditMeta.digest,
    runId: baselineRunId, sha: baselineSha, repositoryId };
  const runRow = (id, sha, conclusion) => ({ id: Number(id), run_attempt: 1, head_sha: sha,
    event: 'workflow_dispatch', head_branch: 'main', path: '.github/workflows/deploy.yml',
    status: 'completed', conclusion, repository: { full_name: targets.executor.repository },
    head_repository: { full_name: targets.executor.repository } });
  const failedRun = runRow('44245360791', executorSha, 'failure');
  const baselineRun = runRow(baselineRunId, baselineSha, 'success');
  const contents = { 'approved-security-tests.json': inventoryBytes, 'unattended-policy.json': policyBytes };
  const handler = async (url, options, env) => {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith('.blob.core.windows.net')) {
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers?.Authorization, undefined);
      assert.ok(/\.zip$/.test(parsed.pathname));
      return new Response(parsed.pathname.includes(auditId) ? auditZip : admissionZip, { status: 200 });
    }
    assert.equal(parsed.origin, 'https://api.github.com');
    assert.equal(options.headers?.Authorization, `Bearer ${env.GH_TOKEN}`);
    const route = parsed.pathname.replace(/^\/repos\/aqua-lifestyle\/aqua-deployment/, '');
    if (route.endsWith('/zip')) {
      assert.equal(options.redirect, 'manual');
      if (zipFailure) throw new TypeError('zip transport unavailable');
      const id = route.match(/^\/actions\/artifacts\/(\d+)\/zip$/)?.[1];
      assert.ok(id);
      return new Response(null, { status: 302, headers: {
        location: `https://aquadeploymentdiag.blob.core.windows.net/artifacts/${id}.zip?sig=fixture` } });
    }
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers?.['X-GitHub-Api-Version'], '2022-11-28');
    if (route === '') return Response.json({ id: repositoryId, full_name: targets.executor.repository });
    if (route === '/actions/runs/44245360791') return Response.json(failedRun);
    if (route === `/actions/runs/${baselineRunId}`) return Response.json(baselineRun);
    if (route === '/actions/runs/44245360791/artifacts' || route === `/actions/runs/${baselineRunId}/artifacts`) {
      assert.equal(parsed.search, '?per_page=100');
      return Response.json({ total_count: 1,
        artifacts: [route.endsWith('/44245360791/artifacts') ? admissionMeta : auditMeta] });
    }
    if (route === `/actions/artifacts/${admissionId}`) return Response.json(admissionMeta);
    if (route === `/actions/artifacts/${auditId}`) return Response.json(auditMeta);
    const contentsMatch = route.match(/^\/contents\/tools\/deployment\/(approved-security-tests|unattended-policy)\.json$/);
    if (contentsMatch) {
      assert.equal(parsed.search, `?ref=${baselineSha}`);
      const bytes = contents[`${contentsMatch[1]}.json`];
      return Response.json({ type: 'file', path: `tools/deployment/${contentsMatch[1]}.json`, encoding: 'base64',
        size: bytes.length, content: bytes.toString('base64'), sha: blobSha(bytes) });
    }
    throw Error(`unexpected github route ${route}${parsed.search}`);
  };
  return { handler, admissionDescriptor, auditDescriptor, auditId, admissionId };
}

test('commissioned Normal baseline reports authenticated D10, provider, history, health and payment predicates without secrets', async () => {
  const f = fixture();
  assert.equal(await f.run(), true);
  const row = f.reports.at(-1);
  assert.equal(row.diagnosticStatus, 'COMPLETE', JSON.stringify({ row, calls: f.calls.map(c => c.url) }));
  assert.deepEqual(row.historicalD10Comparisons, {
    intendedConfigurationDigest: { result: 'PASS', expected: historical.intendedConfigurationDigest,
      observed: historical.intendedConfigurationDigest },
    requiredAssemblyDigest: { result: 'PASS', expected: historical.requiredAssemblyDigest,
      observed: historical.requiredAssemblyDigest },
    requiredRuntimeAssemblyDigest: { result: 'PASS', expected: historical.requiredRuntimeAssemblyDigest,
      observed: historical.requiredRuntimeAssemblyDigest }
  });
  assert.equal(row.deploymentIdentity.buildIdMatchesLiveCommit, 'PASS');
  assert.equal(row.deploymentIdentity.selectedReceiptOrReconciliation.result, 'PASS');
  assert.equal(row.backendHealth.http200, 'PASS');
  assert.equal(row.backendHealth.databaseHealthy, 'PASS');
  assert.equal(row.backendHealth.redisHealthy, 'PASS');
  assert.equal(row.backendHealth.keyStoreHealthy, 'PASS');
  assert.equal(row.backendHealth.recoveryClear, 'PASS');
  assert.equal(row.paymentAvailability.result, 'PASS');
  assert.ok(f.calls.every(call => (call.options.method ?? 'GET') === 'GET' && call.options.body === undefined));
  for (const secret of [f.env.RENDER_API_KEY, f.env.GH_TOKEN, f.values.App__AQGreenV2__Commissioning__DecisionJsonBase64,
    JSON.stringify(f.decision)]) assert.ok(!JSON.stringify(row).includes(secret));
});

test('commissioned-state diagnostic reports independent D10, build, service, normal-setting, history and health failures', async () => {
  const rewriteDecision = ({ values, decision }, field) => {
    decision[field] = 'f'.repeat(64);
    const bytes = Buffer.from(JSON.stringify(decision));
    values.App__AQGreenV2__Commissioning__DecisionJsonBase64 = bytes.toString('base64');
    values.App__AQGreenV2__Commissioning__DecisionSha256 = createHash('sha256').update(bytes).digest('hex');
  };
  const cases = [
    [({ values }) => { values.App__AQGreenV2__Commissioning__DecisionSha256 = '0'.repeat(64); },
      row => assert.equal(row.commissioningDecision.sha256Pin.result, 'FAIL', JSON.stringify(row))],
    [context => rewriteDecision(context, 'requiredConfigurationDigest'),
      row => assert.equal(row.historicalD10Comparisons.intendedConfigurationDigest.result, 'FAIL')],
    [context => rewriteDecision(context, 'requiredAssemblyDigest'),
      row => assert.equal(row.historicalD10Comparisons.requiredAssemblyDigest.result, 'FAIL')],
    [context => rewriteDecision(context, 'requiredRuntimeAssemblyDigest'),
      row => assert.equal(row.historicalD10Comparisons.requiredRuntimeAssemblyDigest.result, 'FAIL')],
    [({ values }) => { values.Deployment__BuildId = 'f'.repeat(40); },
      row => assert.equal(row.deploymentIdentity.buildIdMatchesLiveCommit, 'FAIL')],
    [({ values }) => { values.App__FinancialOperations__Enabled = 'false'; },
      row => assert.equal(row.normalRuntimeSettings.App__FinancialOperations__Enabled.result, 'FAIL')],
    [({ service }) => { service.serviceDetails.region = 'wrong'; },
      row => assert.equal(row.service.checks.region, 'FAIL')],
    [({ deployment }) => { deployment.status = 'created'; },
      row => assert.equal(row.deploymentHistory.noActiveDeployments, 'FAIL')],
    [({ health }) => { health.body.result.databaseStatus = 'Unhealthy'; },
      row => assert.equal(row.backendHealth.databaseHealthy, 'FAIL')],
    [({ health }) => { health.recovery = 'true'; },
      row => assert.equal(row.backendHealth.recoveryClear, 'FAIL')],
    [({ health }) => { health.body.result.paymentAvailability = 'Unavailable'; },
      row => assert.equal(row.paymentAvailability.result, 'FAIL')]
  ];
  for (const [mutate, verify] of cases) {
    const f = fixture({ mutate });
    assert.equal(await f.run(), true);
    verify(f.reports.at(-1));
  }
});

test('missing authenticated baseline evidence remains UNKNOWN and is not replaced with the decision digests', async () => {
  const f = fixture({ baselineAvailable: false });
  assert.equal(await f.run(), true);
  const row = f.reports.at(-1);
  assert.equal(row.baselineEvidence.result, 'UNKNOWN');
  assert.equal(row.historicalD10Comparisons.status, 'UNKNOWN');
  assert.equal(row.diagnosticStatus, 'COMPLETE_WITH_UNKNOWN');
});

test('artifact download diagnostics report only the pinned artifact, stage, HTTP status and safe category', async () => {
  const f = fixture();
  const error = Error('GITHUB_ARTIFACT_DOWNLOAD_UNAVAILABLE');
  error.artifactDownloadDiagnostic = { artifactId: '14401816374', stage: 'redirected_storage',
    category: 'HTTP_STATUS', httpStatus: 403 };
  const signedUrl = 'https://storage.invalid/archive.zip?sig=private';
  assert.equal(await f.run(async () => { throw Object.assign(error, { signedUrl }); }), true);
  const baseline = f.reports.at(-1).baselineEvidence;
  assert.equal(baseline.code, 'GITHUB_ARTIFACT_DOWNLOAD_UNAVAILABLE');
  assert.deepEqual(baseline.downloadFailure, { artifactId: '14401816374', stage: 'redirected_storage',
    category: 'HTTP_STATUS', httpStatus: 403 });
  assert.ok(!JSON.stringify(baseline).includes(signedUrl));
});

test('selected baseline downloads both pinned artifacts through the authorised readers and completes every predicate', async () => {
  const gh = githubFixture();
  const f = fixture({ github: gh.handler });
  f.deployment.commit.id = sourceSha;
  f.health.body.result.buildId = sourceSha;
  f.values.Deployment__BuildId = sourceSha;
  assert.equal(await f.runReal(), true);
  const row = f.reports.at(-1);
  const detail = JSON.stringify({ row, calls: f.calls.map(call => call.url) });
  assert.equal(row.diagnosticStatus, 'COMPLETE', detail);
  assert.equal(row.baselineEvidence.result, 'PASS', detail);
  assert.equal(row.baselineEvidence.runId, baselineRunId);
  assert.equal(row.baselineEvidence.executorSha, baselineSha);
  assert.equal(row.baselineEvidence.renderDeployId, liveId);
  assert.equal(row.baselineEvidence.renderSha, sourceSha);
  assert.deepEqual(row.historicalD10Comparisons, {
    intendedConfigurationDigest: { result: 'PASS', expected: historical.intendedConfigurationDigest,
      observed: historical.intendedConfigurationDigest },
    requiredAssemblyDigest: { result: 'PASS', expected: historical.requiredAssemblyDigest,
      observed: historical.requiredAssemblyDigest },
    requiredRuntimeAssemblyDigest: { result: 'PASS', expected: historical.requiredRuntimeAssemblyDigest,
      observed: historical.requiredRuntimeAssemblyDigest }
  });
  assert.equal(row.deploymentIdentity.selectedReceiptOrReconciliation.result, 'PASS');
  assert.deepEqual(row.currentFailingPredicates, [], detail);
  assert.equal(row.exactCurrentFailingPredicate, 'NOT_ESTABLISHED', detail);
  const zipCalls = f.calls.filter(call => call.url.endsWith('/zip'));
  assert.deepEqual(zipCalls.map(call => call.url), [
    `https://api.github.com/repos/aqua-lifestyle/aqua-deployment/actions/artifacts/${admissionId}/zip`,
    `https://api.github.com/repos/aqua-lifestyle/aqua-deployment/actions/artifacts/${auditId}/zip` ], detail);
  for (const call of zipCalls) {
    assert.equal(call.options.redirect, 'manual');
    assert.equal(call.options.headers.Authorization, `Bearer ${f.env.GH_TOKEN}`);
  }
  const storageCalls = f.calls.filter(call => new URL(call.url).hostname.endsWith('.blob.core.windows.net'));
  assert.equal(storageCalls.length, 2, detail);
  for (const call of storageCalls) {
    assert.equal(call.options.redirect, 'error');
    assert.equal(call.options.headers?.Authorization, undefined);
  }
  assert.ok(f.calls.every(call => (call.options.method ?? 'GET') === 'GET' && call.options.body === undefined));
  for (const secret of [f.env.RENDER_API_KEY, f.env.GH_TOKEN])
    assert.ok(!JSON.stringify(row).includes(secret));
});

test('the artifact download latch is held only inside an authorised baseline read and always resets', async () => {
  const gh = githubFixture();
  const f = fixture({ github: gh.handler });
  const load = async (api, readers) => {
    assert.equal(typeof readers?.readArtifactFiles, 'function');
    assert.equal(typeof readers?.readArtifact, 'function');
    // Held for the authorised read: the pinned admission artifact downloads.
    const files = await readers.readArtifactFiles(gh.admissionDescriptor,
      ['admission-receipt.json', 'evidence-plan.json']);
    const admission = JSON.parse(files['admission-receipt.json'].toString('utf8'));
    assert.equal(admission.contract, 'aqua.github-evidence-admission');
    const audit = await readers.readArtifact(gh.auditDescriptor, 'release-report.jsonl');
    assert.ok(audit.toString('utf8').includes('"phase":"verified"'));
    // Reset after success: the same download outside the authorised read is rejected.
    await assert.rejects(() => api.artifact('executor', admissionId), downloadRejected);
    // The pinned allowlist still rejects an unlisted artifact while the latch is held.
    await assert.rejects(() => readers.readArtifactFiles({ ...gh.admissionDescriptor, id: '99999999999' },
      ['release-report.jsonl']), error => error.message === 'PROVIDER_READ_FAILED');
    await assert.rejects(() => api.artifact('executor', admissionId), downloadRejected);
    // The allowlist rejects the unlisted artifact before any network request.
    assert.equal(f.calls.filter(call => call.url.includes('/artifacts/99999999999')).length, 0);
    return injectedSelection();
  };
  assert.equal(await f.run(load), true);
  const row = f.reports.at(-1);
  assert.equal(row.baselineEvidence.result, 'PASS');
  assert.equal(row.diagnosticStatus, 'COMPLETE');
});

test('a transport failure inside an authorised baseline read leaves the latch closed', async () => {
  const gh = githubFixture({ zipFailure: true });
  const f = fixture({ github: gh.handler });
  const load = async (api, readers) => {
    const failure = await readers.readArtifactFiles(gh.admissionDescriptor,
      ['admission-receipt.json', 'evidence-plan.json']).then(() => null, error => error);
    assert.ok(failure, 'authorised read must fail');
    assert.equal(failure.message, 'GITHUB_ARTIFACT_DOWNLOAD_UNAVAILABLE');
    assert.deepEqual(failure.artifactDownloadDiagnostic,
      { artifactId: admissionId, stage: 'github_zip', category: 'FETCH_TRANSPORT_ERROR' });
    // Reset after the error: the same download outside the authorised read is rejected.
    await assert.rejects(() => api.artifact('executor', admissionId), downloadRejected);
    throw failure;
  };
  assert.equal(await f.run(load), true);
  const row = f.reports.at(-1);
  assert.equal(row.baselineEvidence.result, 'UNKNOWN');
  assert.equal(row.baselineEvidence.code, 'GITHUB_ARTIFACT_DOWNLOAD_UNAVAILABLE');
  assert.deepEqual(row.baselineEvidence.downloadFailure,
    { artifactId: admissionId, stage: 'github_zip', category: 'FETCH_TRANSPORT_ERROR' });
  assert.equal(row.diagnosticStatus, 'COMPLETE_WITH_UNKNOWN');
});

test('a string admission releaseRunId matching the failed run is accepted', async () => {
  const gh = githubFixture({ admissionReleaseRunId: '44245360791' });
  const f = fixture({ github: gh.handler });
  f.deployment.commit.id = sourceSha;
  f.health.body.result.buildId = sourceSha;
  f.values.Deployment__BuildId = sourceSha;
  assert.equal(await f.runReal(), true);
  const row = f.reports.at(-1);
  assert.equal(row.diagnosticStatus, 'COMPLETE');
  assert.equal(row.baselineEvidence.result, 'PASS');
  assert.equal(row.deploymentIdentity.selectedReceiptOrReconciliation.result, 'PASS');
  assert.deepEqual(row.currentFailingPredicates, []);
});

test('a numeric admission releaseRunId matching the failed run is accepted', async () => {
  const gh = githubFixture({ admissionReleaseRunId: 44245360791 });
  const f = fixture({ github: gh.handler });
  f.deployment.commit.id = sourceSha;
  f.health.body.result.buildId = sourceSha;
  f.values.Deployment__BuildId = sourceSha;
  assert.equal(await f.runReal(), true);
  const row = f.reports.at(-1);
  assert.equal(row.diagnosticStatus, 'COMPLETE');
  assert.equal(row.baselineEvidence.result, 'PASS');
});

test('a genuinely different admission releaseRunId is rejected', async () => {
  const gh = githubFixture({ admissionReleaseRunId: '99999999999' });
  const f = fixture({ github: gh.handler });
  assert.equal(await f.runReal(), true);
  const row = f.reports.at(-1);
  assert.equal(row.baselineEvidence.result, 'UNKNOWN');
  assert.equal(row.baselineEvidence.code, 'FAILED_RELEASE_BASELINE_SELECTION_UNVERIFIED');
  assert.equal(row.diagnosticStatus, 'COMPLETE_WITH_UNKNOWN');
});

test('malformed admission releaseRunIds fail closed', async () => {
  for (const bad of ['abc', '', '0', '00123', 0, null, 1.5]) {
    const gh = githubFixture({ admissionReleaseRunId: bad });
    const f = fixture({ github: gh.handler });
    assert.equal(await f.runReal(), true, `run for ${JSON.stringify(bad)}`);
    const row = f.reports.at(-1);
    assert.equal(row.baselineEvidence.result, 'UNKNOWN', String(bad));
    assert.equal(row.baselineEvidence.code, 'FAILED_RELEASE_BASELINE_SELECTION_UNVERIFIED', String(bad));
  }
});

test('a missing admission releaseRunId fails closed', async () => {
  const gh = githubFixture({ omitAdmissionReleaseRunId: true });
  const f = fixture({ github: gh.handler });
  assert.equal(await f.runReal(), true);
  const row = f.reports.at(-1);
  assert.equal(row.baselineEvidence.result, 'UNKNOWN');
  assert.equal(row.baselineEvidence.code, 'FAILED_RELEASE_BASELINE_SELECTION_UNVERIFIED');
});

// The real selector is exercised with a disposable, digest-pinned GitHub ZIP;
// neither the historical audit bytes nor a provider value enters this fixture.
function interruptedStagingFixture({ changeRows = () => {}, changeRun = () => {}, changeArtifact = () => {} } = {}) {
  const runId = '45006063824', producerSha = 'd0cf6e0e424f3762756ed4c7beff83db7b9adeda', artifactId = 14747883309;
  const identity = { version: 4, repository: targets.repository, sha: '58b18b2f5a76769a660c2ae834bd6e0c02263ebf',
    ciRunId: '44236824305', ciRunAttempt: 2, releaseRunId: runId, releaseRunAttempt: 1,
    executorRepository: targets.executor.repository, executorSha: producerSha, policySha256: policySha,
    environment: targets.environment, profile: targets.profile, renderServiceId: targets.render.id,
    vercelProjectId: targets.vercel.id, vercelTeamId: targets.vercel.teamId,
    backendSuccessor: 'post-normal-backend-v1', combinedRelease: 'post-normal-backend-frontend-v1' };
  const rows = [
    { ...identity, phase: 'evidence-selected', authorizationId: 'a'.repeat(64),
      evidenceSha256: 'b'.repeat(64), inventorySha256: standingPolicy.authorization.inventorySha256,
      evidenceArtifactId: '14709678648' },
    { ...identity, phase: 'backend-baseline-selected', baselineRenderDeployId: liveId, baselineRenderSha: liveSha },
    { ...identity, phase: 'backend-decision-verified' },
    { ...identity, phase: 'backend-classified', schemaTransition: 'additive' },
    { ...identity, phase: 'backend-successor-staging', stagedSchemaTransition: 'none',
      payloadBytes: syntheticStageBytes.length, payloadPinSha256: syntheticStagePin },
    { ...identity, phase: 'failed', code: 'SECRET_BEARING_RENDER_READ_FORBIDDEN' }
  ];
  const intact = Buffer.from(rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  const intactArchive = zipFixture('release-report.jsonl', intact);
  changeRows(rows);
  const bytes = Buffer.from(rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  const archive = zipFixture('release-report.jsonl', bytes);
  const expected = { runId, executorSha: producerSha, sourceSha: identity.sha, ciRunId: identity.ciRunId,
    ciRunAttempt: 2, artifactId: String(artifactId), archiveSha256: sha256(intactArchive),
    reportSha256: sha256(intact), expectedPayloadSha256: syntheticStagePin,
    payloadBytes: syntheticStageBytes.length };
  const run = { id: Number(runId), run_number: 88, run_attempt: 1, head_sha: producerSha,
    status: 'completed', conclusion: 'failure', event: 'workflow_dispatch', head_branch: 'main',
    actor: { login: 'aqualifestyleclub', id: 307076734 },
    path: '.github/workflows/deploy.yml', repository: { full_name: targets.executor.repository },
    head_repository: { full_name: targets.executor.repository }, created_at: '2026-11-22T09:08:19Z' };
  changeRun(run);
  const jobs = ['Qualify immutable source candidate', 'Verify approved GitHub evidence before provider access',
    'Capture prospective provider baseline', 'Unattended recovery release'].map((name, i) => ({
    name, run_id: run.id, run_attempt: 1, status: 'completed',
    conclusion: i === 2 ? 'skipped' : i === 3 ? 'failure' : 'success',
    steps: i === 3 ? [{ name: 'Revalidate policy, provenance, providers and recovery before automatic deployment',
      conclusion: 'failure' }] : [] }));
  const metadata = { id: artifactId, name: `production-release-audit-${runId}-1`, expired: false,
    size_in_bytes: archive.length, digest: 'sha256:' + sha256(archive),
    workflow_run: { id: run.id, head_sha: producerSha, head_branch: 'main',
      repository_id: repositoryId, head_repository_id: repositoryId } };
  changeArtifact(metadata);
  const handler = async (url, options, env) => {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith('.blob.core.windows.net')) {
      assert.equal(options.headers?.Authorization, undefined);
      return new Response(archive, { status: 200 });
    }
    assert.equal(parsed.origin, 'https://api.github.com');
    assert.equal(options.headers.Authorization, `Bearer ${env.GH_TOKEN}`);
    const route = parsed.pathname.replace(/^\/repos\/aqua-lifestyle\/aqua-deployment/, '');
    if (route === `/actions/artifacts/${artifactId}/zip`)
      return new Response(null, { status: 302, headers: {
        location: `https://aquadeploymentdiag.blob.core.windows.net/artifacts/${artifactId}.zip?sig=fixture` } });
    if (route === `/actions/runs/${runId}`) return Response.json(run);
    if (route === `/actions/runs/${runId}/attempts/1/jobs`) return Response.json({ total_count: 4, jobs });
    if (route === '') return Response.json({ id: repositoryId, full_name: targets.executor.repository });
    if (route === `/actions/runs/${runId}/artifacts`) return Response.json({ total_count: 1, artifacts: [metadata] });
    if (route === `/actions/artifacts/${artifactId}`) return Response.json(metadata);
    throw Error('Unexpected GitHub route');
  };
  return { handler, expected };
}

test('fixed protected GET path authenticates original staging intent before reading either value', async () => {
  const github = interruptedStagingFixture(), f = fixture({ github: github.handler });
  assert.equal(await f.runStaging((api, reader) => selectedInterruptedStaging(api, reader, github.expected)), true);
  const report = f.reports.at(-2);
  assert.equal(report.evidence.status, 'MATCH');
  assert.deepEqual([report.stagedPayload, report.stagedPin], ['MATCH', 'MATCH']);
  assert.equal(report.deploymentHistory.current.id, liveId);
  assert.deepEqual(report.deploymentHistory.postRunDeployments, []);
  const artifactStorage = f.calls.filter(call => new URL(call.url).hostname.endsWith('.blob.core.windows.net'));
  assert.equal(artifactStorage.length, 1);
  assert.equal(artifactStorage[0].options.headers?.Authorization, undefined);
  assert.ok(f.calls.every(call => (call.options.method ?? 'GET') === 'GET' && call.options.body === undefined));
  for (const secret of [f.env.RENDER_API_KEY, f.env.GH_TOKEN, f.values[backendSuccessorPayloadKey],
    f.values[backendSuccessorPinKey]]) assert.ok(!JSON.stringify(f.reports).includes(secret));
});

test('foreign, changed or incomplete original audit cannot unlock the two staged-value reads', async () => {
  for (const options of [
    { changeRun: run => run.head_sha = 'f'.repeat(40) },
    { changeArtifact: metadata => metadata.expired = true },
    { changeRows: rows => rows[4].phase = 'backend-render-requesting' },
    { changeRows: rows => rows[4].payloadPinSha256 = 'f'.repeat(64) }
  ]) {
    const github = interruptedStagingFixture(options), f = fixture({ github: github.handler });
    assert.equal(await f.runStaging((api, reader) => selectedInterruptedStaging(api, reader, github.expected)), true);
    assert.equal(f.reports.at(-2).evidence.status, 'UNVERIFIED');
    assert.deepEqual([f.reports.at(-2).stagedPayload, f.reports.at(-2).stagedPin], ['UNVERIFIED', 'UNVERIFIED']);
    assert.ok(!f.calls.some(call => [backendSuccessorPayloadKey, backendSuccessorPinKey]
      .some(key => call.url.endsWith('/env-vars/' + key))));
  }
});
