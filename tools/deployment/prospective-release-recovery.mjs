import { createHash } from 'node:crypto';
import { runtimeSettings, validateReadiness } from './runtime-readiness.mjs';

export const prospectiveRecovery = Object.freeze({
  targetSha: '08580d837adb90e022a30ad11ba4fda332d138da',
  incompleteReleaseRunId: '42601295675',
  renderServiceId: 'srv-d9f0k8e1a83c73d8n1b0',
  vercelProjectId: 'prj_6qL1e43KhsWrRshY5GxdmGl3HGMz',
  baselineMaxAgeSeconds: 1800,
  owner: Object.freeze({ login: 'aqualifestyleclub', id: 307076734 })
});

const sha = /^[a-f0-9]{40}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const positiveId = value => typeof value === 'string' && /^[1-9]\d*$/.test(value);
const deny = code => { throw new Error(code); };
const canonical = value => value && typeof value === 'object' ?
  (Array.isArray(value) ? value.map(canonical) :
    Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))) : value;
export const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

export const prospectiveSettingKeys = Object.freeze([...Object.keys(runtimeSettings), 'App__AutomaticPayouts__Enabled']);
const heldSettings = Object.freeze({
  App__WeeklyCommissions__Enabled: 'false',
  App__EntryMonthlyObligations__Enabled: 'false',
  App__FinancialOperations__Enabled: 'false',
  App__BackgroundJobs__Enabled: 'false',
  App__AutomaticPayouts__Enabled: 'false',
  App__AQGreenV2__Commissioning__Enabled: 'false'
});
const activeRender = new Set(['created', 'queued', 'build_in_progress', 'pre_deploy_in_progress', 'update_in_progress']);
const activeVercel = new Set(['QUEUED', 'INITIALIZING', 'BUILDING']);

export function classifyPinnedIncompleteAttempt(run, attempt, production, deploymentStep) {
  if (String(run?.id) !== prospectiveRecovery.incompleteReleaseRunId ||
      run?.status !== 'completed' || run?.conclusion !== 'failure' ||
      !Number.isSafeInteger(attempt) || attempt < 1 ||
    production?.conclusion === 'success' || production?.status !== 'completed' ||
      !['Revalidate policy, provenance, providers and recovery before automatic deployment',
        'Revalidate authority, providers, source and recovery before deployment'].includes(deploymentStep))
    deny('PROSPECTIVE_HISTORICAL_RELEASE_STATE_CHANGED');
  return Object.freeze({ runId: prospectiveRecovery.incompleteReleaseRunId,
    outcome: 'incomplete', runAttempt: attempt, runConclusion: run.conclusion,
    productionConclusion: production.conclusion,
    deploymentStep,
    deploymentStepConclusion: production.steps?.find(step => step.name === deploymentStep)?.conclusion ?? null });
}

export function validateProspectiveBaseline(boundary, expectedSha, now = Date.now()) {
  const keys = ['contract', 'version', 'targetSha', 'ciRunId', 'ciRunAttempt', 'capturedAt', 'captureRunId', 'captureRunAttempt',
    'capturedByLogin', 'capturedById',
    'executorSha', 'runtimeReadiness', 'render', 'health', 'vercel', 'historicalReleaseRunId', 'digest'];
  if (!boundary || Object.keys(boundary).sort().join(',') !== keys.sort().join(',') ||
      boundary.contract !== 'aqua.prospective-release-baseline' || boundary.version !== 2 ||
      boundary.targetSha !== expectedSha || expectedSha !== prospectiveRecovery.targetSha ||
      !positiveId(boundary.ciRunId) || !Number.isSafeInteger(boundary.ciRunAttempt) || boundary.ciRunAttempt < 1 ||
      !sha.test(boundary.executorSha ?? '') || !positiveId(boundary.captureRunId) ||
      !Number.isSafeInteger(boundary.captureRunAttempt) || boundary.captureRunAttempt < 1 ||
      boundary.capturedByLogin !== prospectiveRecovery.owner.login || boundary.capturedById !== prospectiveRecovery.owner.id ||
      !Number.isFinite(Date.parse(boundary.capturedAt)) ||
      now - Date.parse(boundary.capturedAt) < 0 ||
      now - Date.parse(boundary.capturedAt) > prospectiveRecovery.baselineMaxAgeSeconds * 1000 ||
      boundary.historicalReleaseRunId !== prospectiveRecovery.incompleteReleaseRunId ||
      !boundary.runtimeReadiness ||
      !boundary.render || Object.keys(boundary.render).sort().join(',') !==
        ['serviceId', 'deploymentId', 'sourceSha', 'status', 'activeDeployments', 'settingsDigest'].sort().join(',') ||
      boundary.render.serviceId !== prospectiveRecovery.renderServiceId ||
      !/^dep-[a-z0-9]+$/.test(boundary.render.deploymentId ?? '') ||
      !sha.test(boundary.render.sourceSha ?? '') || boundary.render.status !== 'live' ||
      boundary.render.activeDeployments !== 0 || !digestPattern.test(boundary.render.settingsDigest ?? '') ||
      !boundary.health || Object.keys(boundary.health).sort().join(',') !==
        ['status', 'buildId', 'databaseStatus', 'redisStatus', 'dataProtectionKeyStoreStatus', 'paymentAvailability'].sort().join(',') ||
      boundary.health.status !== 'Healthy' || boundary.health.buildId !== boundary.render.sourceSha ||
      boundary.health.databaseStatus !== 'Healthy' || boundary.health.redisStatus !== 'Healthy' ||
      boundary.health.dataProtectionKeyStoreStatus !== 'Healthy' || boundary.health.paymentAvailability !== 'Held' ||
      !boundary.vercel || Object.keys(boundary.vercel).sort().join(',') !==
        ['projectId', 'deploymentId', 'sourceSha', 'state', 'activeDeployments'].sort().join(',') ||
      boundary.vercel.projectId !== prospectiveRecovery.vercelProjectId ||
      !/^dpl_[A-Za-z0-9]+$/.test(boundary.vercel.deploymentId ?? '') ||
      !sha.test(boundary.vercel.sourceSha ?? '') || boundary.vercel.state !== 'READY' ||
      boundary.vercel.activeDeployments !== 0 || !digestPattern.test(boundary.digest ?? ''))
    deny('PROSPECTIVE_BASELINE_UNVERIFIABLE');
  validateReadiness({ status: 200, body: boundary.runtimeReadiness }, expectedSha);
  if (boundary.runtimeReadiness.version !== 2 || !boundary.runtimeReadiness.d10Bindings)
    deny('PROSPECTIVE_D10_RUNTIME_BINDINGS_REQUIRED');
  const { digest: supplied, ...body } = boundary;
  if (digest(body) !== supplied) deny('PROSPECTIVE_BASELINE_DIGEST_MISMATCH');
  return Object.freeze(boundary);
}

export function validateProspectiveAuthorization(authorization, baseline, release, policy, now = Date.now()) {
  const keys = ['contract', 'version', 'targetSha', 'baselineRunId', 'baselineDigest',
    'releaseRunId', 'releaseRunAttempt', 'approvedByLogin', 'approvedById', 'approvedAt', 'digest'];
  if (!authorization || Object.keys(authorization).sort().join(',') !== keys.sort().join(',') ||
      authorization.contract !== 'aqua.prospective-release-authorization' || authorization.version !== 1 ||
      authorization.targetSha !== prospectiveRecovery.targetSha || authorization.targetSha !== release.sha ||
      authorization.baselineRunId !== baseline.captureRunId || authorization.baselineDigest !== baseline.digest ||
      authorization.releaseRunId !== release.releaseRunId || authorization.releaseRunAttempt !== release.releaseRunAttempt ||
      authorization.approvedByLogin !== prospectiveRecovery.owner.login || authorization.approvedById !== prospectiveRecovery.owner.id ||
      authorization.approvedAt !== release.actorCreatedAt || !Number.isFinite(Date.parse(authorization.approvedAt)) ||
      now - Date.parse(authorization.approvedAt) < 0 || now - Date.parse(authorization.approvedAt) > 3600_000 ||
      !policy.authorization.administrators.some(a => a.login === authorization.approvedByLogin && a.id === authorization.approvedById))
    deny('PROSPECTIVE_OWNER_AUTHORIZATION_REQUIRED');
  const { digest: supplied, ...body } = authorization;
  if (!digestPattern.test(supplied ?? '') || digest(body) !== supplied)
    deny('PROSPECTIVE_AUTHORIZATION_DIGEST_MISMATCH');
  return Object.freeze(authorization);
}

export function createProspectiveAuthorization(baseline, release, now = Date.now()) {
  const body = { contract: 'aqua.prospective-release-authorization', version: 1,
    targetSha: prospectiveRecovery.targetSha, baselineRunId: baseline.captureRunId,
    baselineDigest: baseline.digest, releaseRunId: String(release.id),
    releaseRunAttempt: release.run_attempt, approvedByLogin: release.actor.login,
    approvedById: release.actor.id, approvedAt: release.created_at };
  const authorization = { ...body, digest: digest(body) };
  validateProspectiveAuthorization(authorization, baseline, {
    sha: prospectiveRecovery.targetSha, releaseRunId: String(release.id),
    releaseRunAttempt: release.run_attempt, actorCreatedAt: release.created_at
  }, { authorization: { administrators: [prospectiveRecovery.owner] } }, now);
  return Object.freeze(authorization);
}

export async function captureProspectiveBaseline(api, candidate, run, options) {
  const { validateRender, validateVercel, validateHealth, deploymentHistory, now = Date.now() } = options;
  if (candidate.sha !== prospectiveRecovery.targetSha || run.actor?.login !== prospectiveRecovery.owner.login ||
      run.actor?.id !== prospectiveRecovery.owner.id || run.event !== 'workflow_dispatch' ||
      run.head_branch !== 'main' || run.status !== 'in_progress' || run.head_sha !== candidate.executorSha ||
      !run.actor || !Number.isSafeInteger(run.actor.id)) deny('PROSPECTIVE_BASELINE_CONTEXT_REQUIRED');
  const runtimeReadiness = await api.readiness(candidate.sha);
  validateReadiness(runtimeReadiness, candidate.sha);
  if (runtimeReadiness.body.version !== 2 || !runtimeReadiness.body.d10Bindings)
    deny('PROSPECTIVE_D10_RUNTIME_BINDINGS_REQUIRED');
  const settings = [];
  for (const key of prospectiveSettingKeys) {
    const result = await api.render(`/services/${prospectiveRecovery.renderServiceId}/env-vars/${key}`);
    if (result?.key !== key || typeof result.value !== 'string') deny('PROSPECTIVE_RUNTIME_SETTING_UNVERIFIED');
    settings.push({ key, value: result.value });
  }
  const settingsByKey = Object.fromEntries(settings.map(row => [row.key, row.value]));
  for (const [key, value] of Object.entries(heldSettings))
    if (settingsByKey[key] !== value) deny('PROSPECTIVE_FINANCIAL_FENCE_NOT_HELD');
  const service = await api.render('/services/srv-d9f0k8e1a83c73d8n1b0');
  validateRender(service, settings.filter(row => row.key !== 'App__AutomaticPayouts__Enabled')
    .map(envVar => ({ envVar })));
  const renderHistory = await deploymentHistory(api, 'render');
  if (renderHistory.some(row => activeRender.has(row.status))) deny('PROSPECTIVE_RENDER_OPERATION_PENDING');
  const live = renderHistory.filter(row => row.status === 'live');
  if (live.length !== 1 || !/^dep-[a-z0-9]+$/.test(live[0].id ?? '') ||
      !sha.test(live[0].commit?.id ?? '')) deny('PROSPECTIVE_RENDER_BASELINE_UNVERIFIABLE');
  const healthResponse = await api.health();
  validateHealth(healthResponse, live[0].commit.id);
  const health = healthResponse.body.result ?? healthResponse.body;
  if (health.paymentAvailability !== 'Held') deny('PROSPECTIVE_PAYMENT_FENCE_NOT_HELD');

  const project = await api.vercel('/v9/projects/prj_6qL1e43KhsWrRshY5GxdmGl3HGMz');
  validateVercel(project, options.repositoryId);
  const vercelHistory = await deploymentHistory(api, 'vercel');
  if (vercelHistory.some(row => activeVercel.has(row.state ?? row.readyState)))
    deny('PROSPECTIVE_VERCEL_OPERATION_PENDING');
  const productionId = project.targets?.production?.id;
  if (!/^dpl_[A-Za-z0-9]+$/.test(productionId ?? '')) deny('PROSPECTIVE_VERCEL_BASELINE_UNVERIFIABLE');
  const web = await api.vercel(`/v13/deployments/${productionId}`);
  if (web.id !== productionId || web.projectId !== project.id || web.target !== 'production' ||
      web.readyState !== 'READY' || web.aliasError || !sha.test(web.gitSource?.sha ?? ''))
    deny('PROSPECTIVE_VERCEL_BASELINE_UNVERIFIABLE');

  const body = { contract: 'aqua.prospective-release-baseline', version: 2, targetSha: candidate.sha,
    ciRunId: candidate.ciRunId, ciRunAttempt: candidate.ciRunAttempt,
    capturedAt: new Date(now).toISOString(), captureRunId: String(run.id), captureRunAttempt: run.run_attempt,
    capturedByLogin: run.actor.login, capturedById: run.actor.id,
    executorSha: candidate.executorSha,
    runtimeReadiness: runtimeReadiness.body,
    render: { serviceId: service.id, deploymentId: live[0].id, sourceSha: live[0].commit.id,
      status: live[0].status, activeDeployments: 0, settingsDigest: digest(settings) },
    health: { status: health.status, buildId: health.buildId, databaseStatus: health.databaseStatus,
      redisStatus: health.redisStatus, dataProtectionKeyStoreStatus: health.dataProtectionKeyStoreStatus,
      paymentAvailability: health.paymentAvailability },
    vercel: { projectId: web.projectId, deploymentId: web.id, sourceSha: web.gitSource.sha,
      state: web.readyState, activeDeployments: 0 },
    historicalReleaseRunId: prospectiveRecovery.incompleteReleaseRunId };
  return Object.freeze({ ...body, digest: digest(body) });
}
