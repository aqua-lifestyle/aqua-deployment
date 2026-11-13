import { createHash } from 'node:crypto';
import { runtimeSettings, cleanStartRuntimeSettings, validateReadiness } from './runtime-readiness.mjs';

export const prospectiveRecovery = Object.freeze({
  targetSha: 'b8d86e5e60997483423b273d5f426c08b411f573',
  currentBaselineSha: '08580d837adb90e022a30ad11ba4fda332d138da',
  incompleteReleaseRunId: '42601295675',
  historicalAttemptExecutorSha: '9012d1cdede699e007e2ebe8c2205ab2bdcba5be',
  historicalApplicationSha: 'e03087ffd0e4f6edd03c62030f3ce17a93280448',
  historicalCiRunId: '42459634517',
  historicalCiRunAttempt: 2,
  historicalRenderDeploymentId: 'dep-dboq2mrbc2fs73csnv1g',
  historicalReleaseControllerSha256: '4e6dc28d19572134f43610d1f05ebf124581e87241491041ea80adc9dca9b967',
  historicalMutationStep: 'Revalidate policy, provenance, providers and recovery before automatic deployment',
  renderServiceId: 'srv-d9f0k8e1a83c73d8n1b0',
  vercelProjectId: 'prj_6qL1e43KhsWrRshY5GxdmGl3HGMz',
  baselineMaxAgeSeconds: 1800,
  owner: Object.freeze({ login: 'aqualifestyleclub', id: 307076734 })
});

const sha = /^[a-f0-9]{40}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const positiveId = value => typeof value === 'string' && /^[1-9]\d*$/.test(value);
export const prospectiveBaselinePhases = Object.freeze([
  'workflow-inputs', 'ci-qualification', 'candidate-freeze', 'checkout-identity',
  'candidate-validation', 'github-evidence', 'infrastructure-validation', 'candidate-provenance',
  'release-context', 'repository-read', 'historical-release', 'render-settings', 'render-service',
  'render-deployment-history', 'api-health', 'vercel-project', 'vercel-deployment-history',
  'vercel-production-deployment', 'frontend-compatibility', 'runtime-readiness', 'baseline-artifact', 'baseline-validation'
]);
const prospectiveBaselineFailureCodes = new Set([
  'PROSPECTIVE_AUTHORIZATION_DIGEST_MISMATCH', 'PROSPECTIVE_BASELINE_CONTEXT_REQUIRED',
  'PROSPECTIVE_BASELINE_DIGEST_MISMATCH', 'PROSPECTIVE_BASELINE_UNVERIFIABLE',
  'PROSPECTIVE_D10_RUNTIME_BINDINGS_REQUIRED', 'PROSPECTIVE_D10_RUNTIME_EVIDENCE_DIGEST_MISMATCH',
  'PROSPECTIVE_D10_RUNTIME_EVIDENCE_UNVERIFIABLE', 'PROSPECTIVE_FINANCIAL_FENCE_NOT_HELD',
  'PROSPECTIVE_HISTORICAL_RELEASE_STATE_CHANGED', 'PROSPECTIVE_OWNER_AUTHORIZATION_REQUIRED',
  'PROSPECTIVE_HISTORICAL_PROVIDER_OUTCOME_UNVERIFIABLE', 'PROSPECTIVE_FRONTEND_SOURCE_COMPARISON_UNVERIFIABLE',
  'PROSPECTIVE_PAYMENT_FENCE_NOT_HELD', 'PROSPECTIVE_RENDER_BASELINE_UNVERIFIABLE',
  'PROSPECTIVE_RENDER_OPERATION_PENDING', 'PROSPECTIVE_RUNTIME_SETTING_UNVERIFIED',
  'PROSPECTIVE_RUNTIME_READINESS_UNVERIFIED', 'PROSPECTIVE_VERCEL_BASELINE_UNVERIFIABLE',
  'PROSPECTIVE_VERCEL_OPERATION_PENDING'
]);
export class ProspectiveBaselineDenied extends Error {
  constructor(code, phase = 'baseline-validation') {
    if (!prospectiveBaselineFailureCodes.has(code) || !prospectiveBaselinePhases.includes(phase))
      throw new Error('PROSPECTIVE_BASELINE_DIAGNOSTIC_INVALID');
    super(code);
    this.name = 'ProspectiveBaselineDenied';
    this.code = code;
    this.phase = phase;
  }
}
const deny = (code, phase = 'baseline-validation') => { throw new ProspectiveBaselineDenied(code, phase); };
const canonical = value => value && typeof value === 'object' ?
  (Array.isArray(value) ? value.map(canonical) :
    Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))) : value;
export const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

export function createD10RuntimeEvidence(runtimeReadiness, candidate, run, now = Date.now()) {
  const runtimeSha = runtimeReadiness?.body?.buildId;
  try { validateReadiness(runtimeReadiness, runtimeSha); }
  catch { deny('PROSPECTIVE_RUNTIME_READINESS_UNVERIFIED', 'runtime-readiness'); }
  if (candidate.sha !== prospectiveRecovery.targetSha || !sha.test(runtimeSha ?? '') || runtimeReadiness.body.version !== 2 ||
      !runtimeReadiness.body.d10Bindings || !positiveId(candidate.ciRunId) ||
      !Number.isSafeInteger(candidate.ciRunAttempt) || candidate.ciRunAttempt < 1 ||
      !positiveId(String(run?.id)) || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1 ||
      run.head_sha !== candidate.executorSha || run.actor?.login !== prospectiveRecovery.owner.login ||
      run.actor?.id !== prospectiveRecovery.owner.id || !Number.isFinite(now))
    deny('PROSPECTIVE_D10_RUNTIME_BINDINGS_REQUIRED', 'runtime-readiness');
  const body = { contract: 'aqua.d10-runtime-readiness-evidence', version: 1,
    applicationSha: candidate.sha, runtimeSha, applicationCiRunId: candidate.ciRunId,
    applicationCiRunAttempt: candidate.ciRunAttempt, captureRunId: String(run.id),
    captureRunAttempt: run.run_attempt, executorSha: candidate.executorSha,
    capturedByLogin: run.actor.login, capturedById: run.actor.id,
    capturedAt: new Date(now).toISOString(), runtimeReadiness: runtimeReadiness.body };
  return Object.freeze({ ...body, digest: digest(body) });
}

export function validateD10RuntimeEvidence(evidence, expected, now = Date.now()) {
  const keys = ['contract', 'version', 'applicationSha', 'runtimeSha', 'applicationCiRunId', 'applicationCiRunAttempt',
    'captureRunId', 'captureRunAttempt', 'executorSha', 'capturedByLogin', 'capturedById',
    'capturedAt', 'runtimeReadiness', 'digest'];
  if (!evidence || Object.keys(evidence).sort().join(',') !== keys.sort().join(',') ||
      evidence.contract !== 'aqua.d10-runtime-readiness-evidence' || evidence.version !== 1 ||
      evidence.applicationSha !== expected?.applicationSha || evidence.applicationSha !== prospectiveRecovery.targetSha ||
      evidence.runtimeSha !== expected?.runtimeSha || !sha.test(evidence.runtimeSha ?? '') ||
      evidence.applicationCiRunId !== expected?.applicationCiRunId || !positiveId(evidence.applicationCiRunId) ||
      evidence.applicationCiRunAttempt !== expected?.applicationCiRunAttempt ||
      !Number.isSafeInteger(evidence.applicationCiRunAttempt) || evidence.applicationCiRunAttempt < 1 ||
      evidence.captureRunId !== expected?.captureRunId || !positiveId(evidence.captureRunId) ||
      evidence.captureRunAttempt !== expected?.captureRunAttempt ||
      !Number.isSafeInteger(evidence.captureRunAttempt) || evidence.captureRunAttempt < 1 ||
      evidence.executorSha !== expected?.executorSha || !sha.test(evidence.executorSha ?? '') ||
      evidence.capturedByLogin !== prospectiveRecovery.owner.login || evidence.capturedById !== prospectiveRecovery.owner.id ||
      !Number.isFinite(Date.parse(evidence.capturedAt)) || !Number.isFinite(now) ||
      Date.parse(evidence.capturedAt) > now + 30_000 ||
      !evidence.runtimeReadiness || !digestPattern.test(evidence.digest ?? ''))
    deny('PROSPECTIVE_D10_RUNTIME_EVIDENCE_UNVERIFIABLE', 'baseline-validation');
  try { validateReadiness({ status: 200, body: evidence.runtimeReadiness }, evidence.runtimeSha); }
  catch { deny('PROSPECTIVE_D10_RUNTIME_EVIDENCE_UNVERIFIABLE', 'baseline-validation'); }
  if (evidence.runtimeReadiness.version !== 2 || !evidence.runtimeReadiness.d10Bindings)
    deny('PROSPECTIVE_D10_RUNTIME_EVIDENCE_UNVERIFIABLE', 'baseline-validation');
  const { digest: supplied, ...body } = evidence;
  if (digest(body) !== supplied) deny('PROSPECTIVE_D10_RUNTIME_EVIDENCE_DIGEST_MISMATCH', 'baseline-validation');
  return Object.freeze(evidence);
}

export const prospectiveSettingKeys = Object.freeze([...Object.keys(cleanStartRuntimeSettings), 'App__AutomaticPayouts__Enabled']);
const heldSettings = Object.freeze({
  App__WeeklyCommissions__Enabled: 'false',
  App__EntryMonthlyObligations__Enabled: 'false',
  App__FinancialOperations__Enabled: 'false',
  App__BackgroundJobs__Enabled: 'false',
  App__AutomaticPayouts__Enabled: 'false',
  App__AQGreenV2__Commissioning__Enabled: 'false',
  App__AQGreenV2__Commissioning__AdmissionMode: 'CLEAN_START'
});
const activeRender = new Set(['created', 'queued', 'build_in_progress', 'pre_deploy_in_progress', 'update_in_progress']);
const activeVercel = new Set(['QUEUED', 'INITIALIZING', 'BUILDING']);

export function classifyPinnedIncompleteAttempt(run, attempt, production, deploymentStep, incidentEvidence, now = Date.now()) {
  validatePinnedHistoricalIncidentEvidence(incidentEvidence, now);
  if (String(run?.id) !== prospectiveRecovery.incompleteReleaseRunId ||
      run?.head_sha !== prospectiveRecovery.historicalAttemptExecutorSha || attempt !== 1 ||
      run?.status !== 'completed' || run?.conclusion !== 'failure' ||
      !Number.isSafeInteger(attempt) || attempt < 1 ||
      production?.conclusion !== 'failure' || production?.status !== 'completed' ||
      deploymentStep !== prospectiveRecovery.historicalMutationStep ||
      incidentEvidence.providerEvidence.status !== 'deactivated' ||
      incidentEvidence.providerEvidence.renderDeploymentId !== prospectiveRecovery.historicalRenderDeploymentId)
    deny('PROSPECTIVE_HISTORICAL_RELEASE_STATE_CHANGED');
  return Object.freeze({ runId: prospectiveRecovery.incompleteReleaseRunId,
    outcome: 'incomplete', runAttempt: attempt, runConclusion: run.conclusion,
    productionConclusion: production.conclusion,
    executorSha: run.head_sha, deploymentStep,
    deploymentStepConclusion: production.steps?.find(step => step.name === deploymentStep)?.conclusion ?? null,
    auditArtifacts: 'unavailable', producerAuditDigest: null });
}

export function selectPinnedHistoricalRenderDeployment(renderHistory) {
  const matches = renderHistory.filter(row => row.id === prospectiveRecovery.historicalRenderDeploymentId);
  if (matches.length !== 1 || matches[0].commit?.id !== prospectiveRecovery.historicalApplicationSha)
    deny('PROSPECTIVE_HISTORICAL_PROVIDER_OUTCOME_UNVERIFIABLE', 'historical-release');
  return matches[0];
}

const sortedDigest = value => digest(value);
const frontendRoot = 'AqualLifeStyle/9.4.2/aqua-frontend/';

export function validateProspectiveFrontendComparison(compare, fromSha, targetSha) {
  const files = compare?.files;
  if (!compare || !['ahead', 'identical'].includes(compare.status) ||
      compare.base_commit?.sha !== fromSha ||
      !Number.isSafeInteger(compare.ahead_by) || !Number.isSafeInteger(compare.behind_by) ||
      compare.behind_by !== 0 || !Number.isSafeInteger(compare.total_commits) ||
      compare.total_commits < 0 || compare.total_commits > 250 || !Array.isArray(files) || files.length >= 300 ||
      !Array.isArray(compare.commits) || compare.commits.length !== compare.total_commits ||
      compare.ahead_by !== compare.total_commits ||
      (compare.total_commits === 0 ? compare.status !== 'identical' || fromSha !== targetSha :
        compare.status !== 'ahead' || compare.commits.at(-1)?.sha !== targetSha || files.length === 0))
    deny('PROSPECTIVE_FRONTEND_SOURCE_COMPARISON_UNVERIFIABLE', 'frontend-compatibility');
  const changed = files.map(file => ({ path: file.filename, previousPath: file.previous_filename ?? null, status: file.status,
    additions: file.additions, deletions: file.deletions, changes: file.changes }));
  if (changed.some(file => typeof file.path !== 'string' || !file.path ||
      !['added','removed','modified','renamed','copied','changed','unchanged'].includes(file.status) ||
      (file.status === 'renamed' ? typeof file.previousPath !== 'string' || !file.previousPath : file.previousPath !== null) ||
      ![file.additions, file.deletions, file.changes].every(Number.isSafeInteger) ||
      [file.additions, file.deletions, file.changes].some(value => value < 0)))
    deny('PROSPECTIVE_FRONTEND_SOURCE_COMPARISON_UNVERIFIABLE', 'frontend-compatibility');
  return Object.freeze({ fromSha, targetSha, totalCommits: compare.total_commits,
    changedFileCount: changed.length, changedFilesSha256: sortedDigest(changed),
    frontendChanged: changed.some(file => file.path.startsWith(frontendRoot) ||
      (file.previousPath?.startsWith(frontendRoot) ?? false)) });
}

async function readHistoricalIncident(api, renderHistory, vercelHistory, now) {
  const id = prospectiveRecovery.incompleteReleaseRunId;
  const run = await api.executor(`/actions/runs/${id}`);
  if (String(run?.id) !== id || run.run_attempt !== 3 || run.status !== 'completed' || run.conclusion !== 'failure' ||
      run.event !== 'workflow_dispatch' || run.head_branch !== 'main' || run.path !== '.github/workflows/deploy.yml' ||
      run.name !== 'Qualified production executor' || run.head_sha !== prospectiveRecovery.historicalAttemptExecutorSha ||
      run.repository?.full_name !== 'aqua-lifestyle/aqua-deployment' ||
      run.head_repository?.full_name !== 'aqua-lifestyle/aqua-deployment')
    deny('PROSPECTIVE_HISTORICAL_RELEASE_STATE_CHANGED', 'historical-release');
  const controllerSource = await api.executor(`/contents/tools/deployment/release-control.mjs?ref=${run.head_sha}`);
  let controllerBytes;
  try { controllerBytes = Buffer.from(controllerSource.content, 'base64'); } catch { controllerBytes = Buffer.alloc(0); }
  const controllerDigest = createHash('sha256').update(controllerBytes).digest('hex');
  if (controllerSource.path !== 'tools/deployment/release-control.mjs' || controllerSource.encoding !== 'base64' ||
      controllerSource.type !== 'file' || controllerBytes.length !== controllerSource.size ||
      controllerDigest !== prospectiveRecovery.historicalReleaseControllerSha256)
    deny('PROSPECTIVE_HISTORICAL_RELEASE_STATE_CHANGED', 'historical-release');
  const attempts = [];
  for (let attempt = 1; attempt <= run.run_attempt; attempt++) {
    const past = attempt === run.run_attempt ? run : await api.executor(`/actions/runs/${id}/attempts/${attempt}`);
    const page = await api.executor(`/actions/runs/${id}/attempts/${attempt}/jobs?per_page=100`);
    const jobs = page?.jobs;
    if (past.run_attempt !== attempt || past.status !== 'completed' || past.head_sha !== run.head_sha ||
        page.total_count !== 3 || !Array.isArray(jobs) || jobs.length !== 3 ||
        jobs.some(job => job.run_id !== Number(id) || job.run_attempt !== attempt || job.status !== 'completed'))
      deny('PROSPECTIVE_HISTORICAL_RELEASE_STATE_CHANGED', 'historical-release');
    const candidate = jobs.find(job => job.name === 'Qualify immutable source candidate');
    const admission = jobs.find(job => job.name === 'Verify approved GitHub evidence before provider access');
    const production = jobs.find(job => job.name === 'Unattended recovery release');
    if (!candidate || !admission || !production || candidate.conclusion !== 'success')
      deny('PROSPECTIVE_HISTORICAL_RELEASE_STATE_CHANGED', 'historical-release');
    if (attempt < 3) {
      if (past.conclusion !== 'failure' || admission.conclusion !== 'success' || production.conclusion !== 'failure' ||
          production.steps?.filter(step => step.conclusion === 'failure').length !== 1 ||
          production.steps?.find(step => step.conclusion === 'failure')?.name !== prospectiveRecovery.historicalMutationStep)
        deny('PROSPECTIVE_HISTORICAL_RELEASE_STATE_CHANGED', 'historical-release');
    } else if (past.conclusion !== 'failure' || admission.conclusion !== 'failure' || production.conclusion !== 'skipped') {
      deny('PROSPECTIVE_HISTORICAL_RELEASE_STATE_CHANGED', 'historical-release');
    }
    attempts.push({ runAttempt: attempt, runConclusion: past.conclusion,
      candidateConclusion: candidate.conclusion, admissionConclusion: admission.conclusion,
      productionConclusion: production.conclusion,
      failedStep: attempt < 3 ? prospectiveRecovery.historicalMutationStep : null });
  }
  const artifacts = await api.executor(`/actions/runs/${id}/artifacts?per_page=100`);
  const missingAuditNames = [1,2].every(attempt => !artifacts?.artifacts?.some(item =>
    item.name === `production-release-audit-${id}-${attempt}`));
  if (!Array.isArray(artifacts?.artifacts) || artifacts.total_count !== artifacts.artifacts.length || !missingAuditNames)
    deny('PROSPECTIVE_HISTORICAL_RELEASE_STATE_CHANGED', 'historical-release');
  const matchingRender = selectPinnedHistoricalRenderDeployment(renderHistory);
  const render = await api.render(`/services/${prospectiveRecovery.renderServiceId}/deploys/${prospectiveRecovery.historicalRenderDeploymentId}`);
  const renderCreatedAt = Date.parse(render?.createdAt ?? render?.created_at);
  const attemptOne = await api.executor(`/actions/runs/${id}/attempts/1`);
  const attemptOneCreatedAt = Date.parse(attemptOne?.created_at);
  const attemptOneUpdatedAt = Date.parse(attemptOne?.updated_at);
  if (matchingRender.status !== 'deactivated' || render.id !== prospectiveRecovery.historicalRenderDeploymentId ||
      render.commit?.id !== prospectiveRecovery.historicalApplicationSha || render.status !== 'deactivated' ||
      !Number.isFinite(renderCreatedAt) || !Number.isFinite(attemptOneCreatedAt) ||
      !Number.isFinite(attemptOneUpdatedAt) || attemptOneUpdatedAt < attemptOneCreatedAt ||
      renderCreatedAt < attemptOneCreatedAt || renderCreatedAt > attemptOneUpdatedAt)
    deny('PROSPECTIVE_HISTORICAL_PROVIDER_OUTCOME_UNVERIFIABLE', 'historical-release');
  const matchingVercel = vercelHistory.filter(row => row.meta?.aquaCiRunId === prospectiveRecovery.historicalCiRunId ||
    row.meta?.aquaSourceSha === prospectiveRecovery.historicalApplicationSha);
  if (matchingVercel.length) deny('PROSPECTIVE_HISTORICAL_PROVIDER_OUTCOME_UNVERIFIABLE', 'historical-release');
  const body = { contract: 'aqua.pinned-incomplete-release-incident', version: 1,
    runId: id, executorSha: run.head_sha, originalOutcome: 'failure', attempts,
    auditArtifacts: { attempt1: 'unavailable', attempt2: 'unavailable', producerAuditDigest: null },
    controllerSourceSha256: controllerDigest,
    providerEvidence: { renderServiceId: prospectiveRecovery.renderServiceId,
      renderDeploymentId: render.id, sourceSha: render.commit.id, status: render.status,
      createdAt: render.createdAt ?? render.created_at,
      vercelProjectId: prospectiveRecovery.vercelProjectId,
      matchingVercelDeployments: 0, checkedCiRunId: prospectiveRecovery.historicalCiRunId,
      checkedSourceSha: prospectiveRecovery.historicalApplicationSha },
    observedAt: new Date(now).toISOString() };
  return Object.freeze({ ...body, digest: digest(body) });
}

export function validatePinnedHistoricalIncidentEvidence(evidence, now = Date.now()) {
  const keys = ['contract','version','runId','executorSha','originalOutcome','attempts','auditArtifacts',
    'controllerSourceSha256','providerEvidence','observedAt','digest'];
  if (!evidence || Object.keys(evidence).sort().join(',') !== keys.sort().join(',') ||
      evidence.contract !== 'aqua.pinned-incomplete-release-incident' || evidence.version !== 1 ||
      evidence.runId !== prospectiveRecovery.incompleteReleaseRunId ||
      evidence.executorSha !== prospectiveRecovery.historicalAttemptExecutorSha || evidence.originalOutcome !== 'failure' ||
      !Array.isArray(evidence.attempts) || evidence.attempts.length !== 3 ||
      evidence.attempts.some((row, index) => row.runAttempt !== index + 1 ||
        Object.keys(row).sort().join(',') !== ['runAttempt','runConclusion','candidateConclusion','admissionConclusion',
          'productionConclusion','failedStep'].sort().join(',') || row.runConclusion !== 'failure' ||
        row.candidateConclusion !== 'success' ||
        (index < 2 ? row.admissionConclusion !== 'success' || row.productionConclusion !== 'failure' ||
          row.failedStep !== prospectiveRecovery.historicalMutationStep : row.admissionConclusion !== 'failure' ||
          row.productionConclusion !== 'skipped' || row.failedStep !== null)) ||
      evidence.auditArtifacts?.attempt1 !== 'unavailable' || evidence.auditArtifacts?.attempt2 !== 'unavailable' ||
      evidence.auditArtifacts?.producerAuditDigest !== null ||
      evidence.controllerSourceSha256 !== prospectiveRecovery.historicalReleaseControllerSha256 ||
      evidence.providerEvidence?.renderServiceId !== prospectiveRecovery.renderServiceId ||
      evidence.providerEvidence?.renderDeploymentId !== prospectiveRecovery.historicalRenderDeploymentId ||
      evidence.providerEvidence?.sourceSha !== prospectiveRecovery.historicalApplicationSha ||
      evidence.providerEvidence?.status !== 'deactivated' || evidence.providerEvidence?.matchingVercelDeployments !== 0 ||
      evidence.providerEvidence?.vercelProjectId !== prospectiveRecovery.vercelProjectId ||
      evidence.providerEvidence?.checkedCiRunId !== prospectiveRecovery.historicalCiRunId ||
      evidence.providerEvidence?.checkedSourceSha !== prospectiveRecovery.historicalApplicationSha ||
      !Number.isFinite(Date.parse(evidence.providerEvidence?.createdAt)) ||
      !Number.isFinite(Date.parse(evidence.observedAt)) || Date.parse(evidence.observedAt) > now + 30_000 ||
      Date.parse(evidence.providerEvidence.createdAt) > Date.parse(evidence.observedAt) ||
      !digestPattern.test(evidence.digest ?? '')) deny('PROSPECTIVE_HISTORICAL_RELEASE_STATE_CHANGED');
  const { digest: supplied, ...body } = evidence;
  if (digest(body) !== supplied) deny('PROSPECTIVE_BASELINE_DIGEST_MISMATCH');
  return Object.freeze(evidence);
}

export function validateProspectiveBaseline(boundary, expectedSha, now = Date.now()) {
  const keys = ['contract', 'version', 'targetSha', 'ciRunId', 'ciRunAttempt', 'capturedAt', 'captureRunId', 'captureRunAttempt',
    'capturedByLogin', 'capturedById',
    'executorSha', 'runtimeReadiness', 'render', 'health', 'vercel', 'frontend', 'historicalIncident', 'digest'];
  if (!boundary || Object.keys(boundary).sort().join(',') !== keys.sort().join(',') ||
      boundary.contract !== 'aqua.prospective-release-baseline' || boundary.version !== 3 ||
      boundary.targetSha !== expectedSha || expectedSha !== prospectiveRecovery.targetSha ||
      !positiveId(boundary.ciRunId) || !Number.isSafeInteger(boundary.ciRunAttempt) || boundary.ciRunAttempt < 1 ||
      !sha.test(boundary.executorSha ?? '') || !positiveId(boundary.captureRunId) ||
      !Number.isSafeInteger(boundary.captureRunAttempt) || boundary.captureRunAttempt < 1 ||
      boundary.capturedByLogin !== prospectiveRecovery.owner.login || boundary.capturedById !== prospectiveRecovery.owner.id ||
      !Number.isFinite(Date.parse(boundary.capturedAt)) ||
      now - Date.parse(boundary.capturedAt) < 0 ||
      now - Date.parse(boundary.capturedAt) > prospectiveRecovery.baselineMaxAgeSeconds * 1000 ||
      !boundary.runtimeReadiness ||
      !boundary.render || Object.keys(boundary.render).sort().join(',') !==
        ['serviceId', 'deploymentId', 'sourceSha', 'status', 'activeDeployments', 'settingsDigest'].sort().join(',') ||
      boundary.render.serviceId !== prospectiveRecovery.renderServiceId ||
      !/^dep-[a-z0-9]+$/.test(boundary.render.deploymentId ?? '') ||
      boundary.render.sourceSha !== prospectiveRecovery.currentBaselineSha || boundary.render.sourceSha === expectedSha ||
      boundary.render.status !== 'live' ||
      boundary.render.activeDeployments !== 0 || !digestPattern.test(boundary.render.settingsDigest ?? '') ||
      !boundary.health || Object.keys(boundary.health).sort().join(',') !==
        ['status', 'buildId', 'databaseStatus', 'redisStatus', 'dataProtectionKeyStoreStatus', 'paymentAvailability'].sort().join(',') ||
      boundary.health.status !== 'Healthy' || boundary.health.buildId !== boundary.render.sourceSha ||
      boundary.health.databaseStatus !== 'Healthy' || boundary.health.redisStatus !== 'Healthy' ||
      boundary.health.dataProtectionKeyStoreStatus !== 'Healthy' || boundary.health.paymentAvailability !== 'Held' ||
      !boundary.vercel || Object.keys(boundary.vercel).sort().join(',') !==
        ['projectId', 'deploymentId', 'sourceSha', 'sourceProvenance', 'state', 'activeDeployments'].sort().join(',') ||
      boundary.vercel.projectId !== prospectiveRecovery.vercelProjectId ||
      !/^dpl_[A-Za-z0-9]+$/.test(boundary.vercel.deploymentId ?? '') ||
      (boundary.vercel.sourceProvenance === 'GIT_SOURCE' ? !sha.test(boundary.vercel.sourceSha ?? '') :
        boundary.vercel.sourceProvenance !== 'UNVERIFIED_LEGACY' || boundary.vercel.sourceSha !== null) ||
      boundary.vercel.state !== 'READY' || boundary.vercel.activeDeployments !== 0 ||
      !boundary.frontend || Object.keys(boundary.frontend).sort().join(',') !==
        ['contract','version','comparisonBaseSha','targetSha','totalCommits','changedFileCount','changedFilesSha256',
          'frontendChanged','reuseBaseline','productionAliasVerified','customDomainVerified','publicSiteStatus',
          'backendHealth','sourceProvenance'].sort().join(',') ||
      boundary.frontend.contract !== 'aqua.prospective-frontend-baseline' || boundary.frontend.version !== 1 ||
      boundary.frontend.targetSha !== expectedSha || !sha.test(boundary.frontend.comparisonBaseSha ?? '') ||
      !Number.isSafeInteger(boundary.frontend.totalCommits) || boundary.frontend.totalCommits < 0 ||
      boundary.frontend.totalCommits > 250 || !Number.isSafeInteger(boundary.frontend.changedFileCount) ||
      boundary.frontend.changedFileCount < 0 || boundary.frontend.changedFileCount >= 300 ||
      !digestPattern.test(boundary.frontend.changedFilesSha256 ?? '') ||
      typeof boundary.frontend.frontendChanged !== 'boolean' ||
      boundary.frontend.reuseBaseline !== !boundary.frontend.frontendChanged ||
      boundary.frontend.productionAliasVerified !== true || boundary.frontend.customDomainVerified !== true ||
      boundary.frontend.publicSiteStatus !== 200 ||
      boundary.frontend.sourceProvenance !== boundary.vercel.sourceProvenance ||
      !boundary.frontend.backendHealth || boundary.frontend.backendHealth.status !== 'Healthy' ||
      boundary.frontend.backendHealth.buildId !== boundary.render.sourceSha ||
      boundary.frontend.backendHealth.databaseStatus !== 'Healthy' ||
      boundary.frontend.backendHealth.redisStatus !== 'Healthy' ||
      boundary.frontend.backendHealth.dataProtectionKeyStoreStatus !== 'Healthy' ||
      boundary.frontend.backendHealth.paymentAvailability !== 'Held' ||
      !boundary.historicalIncident || !digestPattern.test(boundary.digest ?? ''))
    deny('PROSPECTIVE_BASELINE_UNVERIFIABLE');
  try { validateReadiness({ status: 200, body: boundary.runtimeReadiness }, boundary.render.sourceSha); }
  catch { deny('PROSPECTIVE_RUNTIME_READINESS_UNVERIFIED', 'baseline-validation'); }
  if (boundary.runtimeReadiness.version !== 2 || !boundary.runtimeReadiness.d10Bindings)
    deny('PROSPECTIVE_D10_RUNTIME_BINDINGS_REQUIRED', 'baseline-validation');
  validatePinnedHistoricalIncidentEvidence(boundary.historicalIncident, now);
  if (boundary.frontend.comparisonBaseSha !== (boundary.vercel.sourceSha ?? boundary.render.sourceSha))
    deny('PROSPECTIVE_BASELINE_UNVERIFIABLE');
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
  const { validateRender, validateVercel, validateHealth, deploymentHistory, now = Date.now(),
    onPhase = () => {}, onD10RuntimeEvidence = () => {},
    readHistoricalIncident: readIncident = readHistoricalIncident } = options;
  let phase = 'release-context';
  const setPhase = next => {
    if (!prospectiveBaselinePhases.includes(next)) throw new Error('PROSPECTIVE_BASELINE_DIAGNOSTIC_INVALID');
    phase = next;
    onPhase(next);
  };
  const reject = code => deny(code, phase);
  setPhase(phase);
  if (candidate.sha !== prospectiveRecovery.targetSha || run.actor?.login !== prospectiveRecovery.owner.login ||
      run.actor?.id !== prospectiveRecovery.owner.id || run.event !== 'workflow_dispatch' ||
      run.head_branch !== 'main' || run.status !== 'in_progress' || run.head_sha !== candidate.executorSha ||
      !run.actor || !Number.isSafeInteger(run.actor.id)) reject('PROSPECTIVE_BASELINE_CONTEXT_REQUIRED');
  const settings = [];
  setPhase('render-settings');
  for (const key of prospectiveSettingKeys) {
    const result = await api.render(`/services/${prospectiveRecovery.renderServiceId}/env-vars/${key}`);
    if (result?.key !== key || typeof result.value !== 'string') reject('PROSPECTIVE_RUNTIME_SETTING_UNVERIFIED');
    settings.push({ key, value: result.value });
  }
  const settingsByKey = Object.fromEntries(settings.map(row => [row.key, row.value]));
  for (const [key, value] of Object.entries(heldSettings))
    if (settingsByKey[key] !== value) reject('PROSPECTIVE_FINANCIAL_FENCE_NOT_HELD');
  setPhase('render-service');
  const service = await api.render('/services/srv-d9f0k8e1a83c73d8n1b0');
  validateRender(service, settings.filter(row => row.key !== 'App__AutomaticPayouts__Enabled')
    .map(envVar => ({ envVar })), true);
  setPhase('render-deployment-history');
  const renderHistory = await deploymentHistory(api, 'render');
  if (renderHistory.some(row => activeRender.has(row.status))) reject('PROSPECTIVE_RENDER_OPERATION_PENDING');
  const live = renderHistory.filter(row => row.status === 'live');
  if (live.length !== 1 || !/^dep-[a-z0-9]+$/.test(live[0].id ?? '') ||
      !sha.test(live[0].commit?.id ?? '')) reject('PROSPECTIVE_RENDER_BASELINE_UNVERIFIABLE');
  setPhase('api-health');
  const healthResponse = await api.health();
  validateHealth(healthResponse, live[0].commit.id);
  const health = healthResponse.body.result ?? healthResponse.body;
  if (health.paymentAvailability !== 'Held') reject('PROSPECTIVE_PAYMENT_FENCE_NOT_HELD');

  setPhase('vercel-project');
  const project = await api.vercel('/v9/projects/prj_6qL1e43KhsWrRshY5GxdmGl3HGMz');
  validateVercel(project, options.repositoryId);
  setPhase('vercel-deployment-history');
  const vercelHistory = await deploymentHistory(api, 'vercel');
  if (vercelHistory.some(row => activeVercel.has(row.state ?? row.readyState)))
    reject('PROSPECTIVE_VERCEL_OPERATION_PENDING');
  const productionId = project.targets?.production?.id;
  if (!/^dpl_[A-Za-z0-9]+$/.test(productionId ?? '')) reject('PROSPECTIVE_VERCEL_BASELINE_UNVERIFIABLE');
  setPhase('vercel-production-deployment');
  const web = await api.vercel(`/v13/deployments/${productionId}`);
  if (web.id !== productionId || web.projectId !== project.id || web.target !== 'production' ||
      web.readyState !== 'READY' || web.aliasError ||
      (web.gitSource?.sha !== undefined && web.gitSource?.sha !== null && !sha.test(web.gitSource.sha)))
    reject('PROSPECTIVE_VERCEL_BASELINE_UNVERIFIABLE');

  setPhase('frontend-compatibility');
  const host = new URL(options.vercelTarget.productionUrl).hostname;
  const aliases = await api.vercel(`/v2/deployments/${productionId}/aliases`);
  const matchingAliases = Array.isArray(aliases?.aliases) ? aliases.aliases.filter(row => row.alias === host) : [];
  if (matchingAliases.length !== 1 || matchingAliases[0].redirect ||
      (matchingAliases[0].deploymentId !== undefined && matchingAliases[0].deploymentId !== productionId) ||
      (matchingAliases[0].projectId !== undefined && matchingAliases[0].projectId !== project.id))
    reject('PROSPECTIVE_VERCEL_BASELINE_UNVERIFIABLE');
  const domain = await api.vercel(`/v9/projects/${project.id}/domains/${host}`);
  if (domain.name !== host || domain.projectId !== project.id || domain.verified !== true)
    reject('PROSPECTIVE_VERCEL_BASELINE_UNVERIFIABLE');
  const publicSite = await api.web();
  const backendHealth = await api.webHealth(live[0].commit.id);
  if (publicSite !== 200 || !backendHealth || backendHealth.status !== 'Healthy' ||
      backendHealth.buildId !== live[0].commit.id || backendHealth.databaseStatus !== 'Healthy' ||
      backendHealth.redisStatus !== 'Healthy' || backendHealth.dataProtectionKeyStoreStatus !== 'Healthy' ||
      backendHealth.paymentAvailability !== 'Held') reject('PROSPECTIVE_VERCEL_BASELINE_UNVERIFIABLE');
  const comparisonBaseSha = web.gitSource?.sha ?? live[0].commit.id;
  const comparison = await api.gh(`/compare/${comparisonBaseSha}...${candidate.sha}`);
  const frontend = validateProspectiveFrontendComparison(comparison, comparisonBaseSha, candidate.sha);
  setPhase('historical-release');
  const historicalIncident = await readIncident(api, renderHistory, vercelHistory, now);
  validatePinnedHistoricalIncidentEvidence(historicalIncident, now);

  setPhase('runtime-readiness');
  const runtimeReadiness = await api.readiness(live[0].commit.id);
  try { validateReadiness(runtimeReadiness, live[0].commit.id); }
  catch { reject('PROSPECTIVE_RUNTIME_READINESS_UNVERIFIED'); }
  if (runtimeReadiness.body.version !== 2 || !runtimeReadiness.body.d10Bindings)
    reject('PROSPECTIVE_D10_RUNTIME_BINDINGS_REQUIRED');
  const d10RuntimeEvidence = createD10RuntimeEvidence(runtimeReadiness, candidate, run, now);
  onD10RuntimeEvidence(d10RuntimeEvidence);

  setPhase('baseline-artifact');
  const body = { contract: 'aqua.prospective-release-baseline', version: 3, targetSha: candidate.sha,
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
    vercel: { projectId: web.projectId, deploymentId: web.id, sourceSha: web.gitSource?.sha ?? null,
      sourceProvenance: web.gitSource?.sha ? 'GIT_SOURCE' : 'UNVERIFIED_LEGACY',
      state: web.readyState, activeDeployments: 0 },
    frontend: { contract: 'aqua.prospective-frontend-baseline', version: 1,
      comparisonBaseSha: frontend.fromSha, targetSha: frontend.targetSha,
      totalCommits: frontend.totalCommits, changedFileCount: frontend.changedFileCount,
      changedFilesSha256: frontend.changedFilesSha256, frontendChanged: frontend.frontendChanged,
      reuseBaseline: !frontend.frontendChanged, productionAliasVerified: true,
      customDomainVerified: true, publicSiteStatus: publicSite,
      backendHealth, sourceProvenance: web.gitSource?.sha ? 'GIT_SOURCE' : 'UNVERIFIED_LEGACY' },
    historicalIncident };
  return Object.freeze({ ...body, digest: digest(body) });
}
