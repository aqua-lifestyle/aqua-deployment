// Ordinary post-Normal backend successor releases. Authority is the existing
// protected GitHub approval chain (owner-approved protected-main merge into
// the qualified source, CI qualification and the executor's own admission).
// The successor input is staged through the existing Render environment
// delivery channel with a raw SHA-256 pin. Release assurance binds authenticated
// commissioning evidence, provider readbacks, qualified build artifacts and
// observed health; it does not claim direct attestation of loaded runtime
// configuration or assemblies. Database schema transitions run
// through the Render one-off job running the release's own migrator binary;
// a failure between job and restart fails closed and never claims a rollback.
import { execFileSync } from 'node:child_process';
import { objectDigest, sha256, validateArtifact, readGitHubArtifact } from './github-evidence.mjs';
import { normalRuntimeSettings } from './runtime-readiness.mjs';
import { deployCombinedFrontendPhase, verifyFrontendIncumbent } from './frontend-release.mjs';
import { validateFailedFrontendRecord } from './failed-frontend-release.mjs';

export const backendSuccessorMode = 'post-normal-backend-v1';
// Combined release mode: one dispatch that performs the full backend successor
// release first and, only after the backend is verified live on Render,
// continues with the frontend release of the same qualified revision on
// Vercel. A backend failure fails closed before any frontend mutation.
export const combinedMode = 'post-normal-backend-frontend-v1';
export const backendSuccessorPayloadKey = 'App__AQGreenV2__D10__BackendSuccessorJsonBase64';
export const backendSuccessorPinKey = 'App__AQGreenV2__D10__BackendSuccessorSha256';
export const backendSuccessorWriteKeys = Object.freeze([backendSuccessorPayloadKey, backendSuccessorPinKey]);
// Baseline decision evidence and the pinned build identity carried into the
// successor payload. Read back only the two values this executor itself stages;
// compare in memory without logging raw values. Other secret-bearing variables
// remain inaccessible through the fixed Render client.
export const backendSuccessorReadKeys = Object.freeze([
  ...backendSuccessorWriteKeys,
  'App__AQGreenV2__Commissioning__DecisionJsonBase64',
  'App__AQGreenV2__Commissioning__DecisionSha256', 'Deployment__BuildId']);

export class BackendSuccessorReleaseDenied extends Error {}
const check = (ok, code) => { if (!ok) throw new BackendSuccessorReleaseDenied(code); };
const decisionContract = 'AQGreenD10CutoverV2';
const successorContract = 'AQGreenD10BackendSuccessorV1';
const backendRoot = 'AqualLifeStyle/9.4.2/aspnet-core/';
const migrationsPath = `${backendRoot}src/AqualLifeStyle.EntityFrameworkCore/Migrations/`;
const migrationFilePattern = /^AqualLifeStyle\/9\.4\.2\/aspnet-core\/src\/AqualLifeStyle\.EntityFrameworkCore\/Migrations\/[A-Za-z0-9_]+(?:\.Designer)?\.cs$/;
const buildIdPattern = /^[A-Za-z0-9._:+/@-]{1,128}$/;
const deployIdPattern = /^dep-[a-z0-9]+$/;
const jobIdPattern = /^job-[0-9a-z]{20}$/;
const hashPattern = /^[a-f0-9]{64}$/;
const activeRender = new Set(['created', 'queued', 'build_in_progress', 'pre_deploy_in_progress', 'update_in_progress']);
const additiveStatements = new Set(['CreateTable', 'CreateIndex', 'AddColumn', 'AddForeignKey',
  'AddPrimaryKey', 'CreateSchema', 'EnsureSchema']);
const identityKeys = ['version', 'repository', 'sha', 'ciRunId', 'ciRunAttempt', 'releaseRunId',
  'releaseRunAttempt', 'policySha256', 'environment', 'profile', 'renderServiceId',
  'vercelProjectId', 'vercelTeamId', 'executorRepository', 'executorSha', 'backendSuccessor'];
const baselineSequence = ['evidence-selected', 'backend-baseline-selected', 'backend-decision-verified',
  'backend-classified', 'backend-successor-staging', 'backend-successor-staged', 'backend-render-requesting',
  'backend-render-requested', 'backend-render-ready', 'backend-deployed'];
const additiveSequence = [...baselineSequence.slice(0, 9), 'backend-schema-job-requesting',
  'backend-schema-job-created', 'backend-schema-job-succeeded', 'backend-successor-restart-staging',
  'backend-successor-restart-staged', 'backend-restart-requesting', 'backend-restart-requested',
  'backend-restart-ready', 'backend-deployed'];
const digestKeys = ['requiredSchemaDigest', 'requiredAssemblyDigest', 'requiredRuntimeAssemblyDigest',
  'requiredDatabaseIdentityDigest', 'requiredConfigurationDigest'];
const successorDigestKeys = ['successorSchemaSha256', 'successorAssemblySha256',
  'successorApplicationSha256', 'successorCoreSha256'];
const healthObservationKeys = ['status', 'buildId', 'environment', 'databaseStatus', 'redisStatus',
  'dataProtectionKeyStoreStatus', 'paymentAvailability'];
const nonzeroHash = value => hashPattern.test(value ?? '') && value !== '0'.repeat(64);

// Shared, side-effect-free forms of the commissioned-baseline predicates. The
// release asserts these in order; the protected GET diagnostic reports them
// individually. Keep the release failure code and comparisons in one place.
export function inspectCommissioningDecision(decisionBytes, decisionPin) {
  const byteLength = decisionBytes?.length;
  const lengthValid = Buffer.isBuffer(decisionBytes) && byteLength > 0 && byteLength <= 65536;
  const decisionSha256 = Buffer.isBuffer(decisionBytes) ? sha256(decisionBytes) : null;
  const pinMatches = lengthValid && decisionSha256 === decisionPin;
  let decision, jsonValid = false;
  if (lengthValid) {
    try { decision = JSON.parse(decisionBytes.toString('utf8')); jsonValid = true; } catch { /* redacted diagnostic result */ }
  }
  const objectValid = !!decision && typeof decision === 'object' && !Array.isArray(decision);
  const contractValid = objectValid && decision.contractVersion === decisionContract;
  const decisionIdValid = objectValid && typeof decision.decisionId === 'string' &&
    decision.decisionId.length > 0 && decision.decisionId.length <= 512;
  const digestFieldsValid = objectValid && digestKeys.every(key => nonzeroHash(decision[key]));
  const structureValid = objectValid && contractValid && decisionIdValid && digestFieldsValid;
  return { decision, byteLength, decisionSha256, pinMatches, lengthValid, jsonValid,
    objectValid, contractValid, decisionIdValid, digestFieldsValid, structureValid };
}

export function assertCommissioningDecision(inspection) {
  check(inspection.lengthValid, 'BACKEND_COMMISSIONED_STATE_CHANGED');
  check(inspection.pinMatches, 'BACKEND_COMMISSIONED_STATE_CHANGED');
  check(inspection.jsonValid, 'BACKEND_COMMISSIONED_STATE_CHANGED');
  check(inspection.structureValid, 'BACKEND_COMMISSIONED_STATE_CHANGED');
  return inspection.decision;
}

export function inspectCommissionedBuildIdentity(predecessorBuildId, baselineSha) {
  return { validSha: /^[a-f0-9]{40}$/.test(baselineSha ?? ''),
    buildMatches: predecessorBuildId === baselineSha,
    buildIdFormatValid: buildIdPattern.test(predecessorBuildId ?? '') };
}

export function assertCommissionedBuildIdentity(inspection) {
  check(inspection.validSha && inspection.buildMatches, 'BACKEND_COMMISSIONED_STATE_CHANGED');
}

export function inspectHistoricalCommissioningBindings(historicalBindings, decision) {
  const rows = [
    ['intendedConfigurationDigest', 'requiredConfigurationDigest'],
    ['requiredAssemblyDigest', 'requiredAssemblyDigest'],
    ['requiredRuntimeAssemblyDigest', 'requiredRuntimeAssemblyDigest']
  ].map(([baselineKey, decisionKey]) => {
    const expected = historicalBindings?.[baselineKey];
    const observed = decision?.[decisionKey];
    const known = typeof expected === 'string' && typeof observed === 'string';
    return { key: baselineKey, expected, observed, known, pass: known && expected === observed };
  });
  return { rows, pass: !!historicalBindings && rows.every(row => row.pass) };
}

export function assertHistoricalCommissioningBindings(inspection) {
  check(inspection.pass, 'BACKEND_COMMISSIONED_STATE_CHANGED');
}

export function inspectCommissionedHealth(health, baselineSha, validateHealth) {
  let healthPass = false;
  try { validateHealth(health, baselineSha); healthPass = true; } catch { /* use the release validator's exact predicate */ }
  const body = health?.body?.result ?? health?.body;
  const checks = {
    http200: health?.status === 200,
    statusHealthy: body?.status === 'Healthy',
    buildMatchesLiveCommit: body?.buildId === baselineSha,
    production: body?.environment === 'Production',
    databaseHealthy: body?.databaseStatus === 'Healthy',
    redisHealthy: body?.redisStatus === 'Healthy',
    keyStoreHealthy: body?.dataProtectionKeyStoreStatus === 'Healthy',
    recoveryClear: health?.recovery === null,
    paymentAvailable: body?.paymentAvailability === 'Available'
  };
  return { healthPass, checks, paymentPass: checks.paymentAvailable };
}

export function assertCommissionedHealth(inspection) {
  check(inspection.healthPass, 'BACKEND_COMMISSIONED_STATE_CHANGED');
  check(inspection.paymentPass, 'BACKEND_COMMISSIONED_STATE_CHANGED');
}

export function inspectCommissionedRenderService(service, validateRender) {
  let target = false;
  try { validateRender(service, [], false, {}); target = true; } catch { /* report as a fixed predicate */ }
  const d = service?.serviceDetails;
  const checks = {
    target,
    plan: d?.plan === 'starter', buildPlan: d?.buildPlan === 'starter', instances: d?.numInstances === 1,
    region: d?.region === 'frankfurt', maintenanceOff: d?.maintenanceMode?.enabled === false,
    noServiceDisk: !!service && !service.disk, noDetailDisk: !!d && !d.disk
  };
  return { checks, pass: Object.values(checks).every(Boolean) };
}

export function assertCommissionedRenderService(inspection) {
  check(inspection.pass, 'BACKEND_RENDER_DRIFT');
}

export function inspectCommissionedDeploymentHistory(deployments) {
  const live = deployments.filter(row => row.status === 'live');
  return { live, oneLive: live.length === 1,
    noActive: deployments.every(row => !activeRender.has(row.status)),
    pass: live.length === 1 && deployments.every(row => !activeRender.has(row.status)) };
}

export function assertCommissionedDeploymentHistory(inspection) {
  check(inspection.pass, 'BACKEND_RENDER_DRIFT');
}

export function inspectCommissionedDeploymentIdentity(liveDeployment, baselineProof, laterObservation) {
  const liveId = liveDeployment?.id;
  const liveSha = liveDeployment?.commit?.id;
  const original = liveId === baselineProof?.renderDeployId && liveSha === baselineProof?.renderSha;
  const reconciled = baselineProof?.renderSha === laterObservation?.renderSha &&
    liveId === laterObservation?.renderDeployId && liveSha === laterObservation?.renderSha;
  return { original, reconciled, pass: original || reconciled };
}

// The legacy protected endpoint describes the earlier Held operating mode.
// For a commissioned Normal release, record separately the evidence actually
// checked: provider configuration readbacks, commissioning/build provenance,
// and the application's health response. These are release assurance, not
// independent attestation of values loaded inside the running process.
const healthObservation = response => {
  const body = response.body.result ?? response.body;
  return Object.fromEntries(healthObservationKeys.map(key => [key, body[key]]));
};

const validateHealthObservation = (evidence, sha) => {
  check(evidence && typeof evidence === 'object' && !Array.isArray(evidence) &&
    Object.keys(evidence).sort().join() === [...healthObservationKeys].sort().join() &&
    evidence.status === 'Healthy' && evidence.buildId === sha && evidence.environment === 'Production' &&
    evidence.databaseStatus === 'Healthy' && evidence.redisStatus === 'Healthy' &&
    evidence.dataProtectionKeyStoreStatus === 'Healthy' && evidence.paymentAvailability === 'Available',
  'BACKEND_AUDIT_PROVIDER_IDENTITY_MISMATCH');
};

export function validateBackendSuccessorIdentity(q) {
  check(q && typeof q === 'object' && q.backendSuccessor === backendSuccessorMode &&
    (q.combinedRelease === undefined || q.combinedRelease === combinedMode) &&
    q.memberRelease === undefined && q.frontendRelease === undefined &&
    q.prospectiveMode === undefined && q.prospectiveRecovery === undefined,
  'BACKEND_RELEASE_IDENTITY_MISMATCH');
}

// Additive-only Up() scan of an added migration source file. A missing or
// nonstandard Up() must not become an automatic additive classification.
const additiveOnlyUp = content => {
  const up = [...content.matchAll(/\bprotected\s+override\s+void\s+Up\s*\(\s*MigrationBuilder\s+migrationBuilder\s*\)/g)];
  const down = [...content.matchAll(/\bprotected\s+override\s+void\s+Down\s*\(\s*MigrationBuilder\s+migrationBuilder\s*\)/g)];
  if (up.length !== 1 || down.length !== 1 || down[0].index <= up[0].index) return false;
  const body = content.slice(up[0].index + up[0][0].length, down[0].index);
  const calls = [...body.matchAll(/\bmigrationBuilder\s*\.\s*(\w+)(?:<[^()]+>)?\s*\(/g)].map(match => match[1]);
  return calls.length > 0 &&
    (body.match(/\bmigrationBuilder\s*\./g) ?? []).length === calls.length &&
    calls.every(name => additiveStatements.has(name));
};

const readMigrationSource = (sourceDir, sha, path) => {
  try {
    const content = execFileSync('git', ['-C', sourceDir, 'show', `${sha}:${path}`],
      { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    check(typeof content === 'string' && content.length > 0 && content.length <= 512 * 1024,
      'BACKEND_SCHEMA_DELTA_UNAUTHORIZED');
    return content;
  } catch (error) {
    if (error instanceof BackendSuccessorReleaseDenied) throw error;
    throw new BackendSuccessorReleaseDenied('BACKEND_SCHEMA_DELTA_UNAUTHORIZED');
  }
};

export function validateBackendSuccessorReceipt(rows, descriptor, targets) {
  check(Array.isArray(rows) && (rows.length === 10 || rows.length === 18) &&
    rows.map(row => row.phase).join() === (rows.length === 10 ? baselineSequence : additiveSequence).join(),
  'BACKEND_AUDIT_SEQUENCE_INVALID');
  const first = rows[0], baseline = rows[1], decision = rows[2], classified = rows[3],
    ready = rows[8], last = rows.at(-1);
  validateBackendSuccessorIdentity({ ...first, qualificationOnly: false });
  check(first.backendSuccessor === backendSuccessorMode && first.memberRelease === undefined &&
    first.frontendRelease === undefined && first.releaseRunAttempt === 1 &&
    first.releaseRunId === descriptor.runId && first.releaseRunAttempt === descriptor.runAttempt &&
    first.executorSha === descriptor.sha && rows.every(row =>
      identityKeys.every(key => row[key] === first[key])),
  'BACKEND_AUDIT_IDENTITY_MISMATCH');
  check(hashPattern.test(first.authorizationId ?? '') && hashPattern.test(first.evidenceSha256 ?? '') &&
    hashPattern.test(first.inventorySha256 ?? '') && /^\d+$/.test(String(first.evidenceArtifactId ?? '')),
  'BACKEND_AUDIT_IDENTITY_MISMATCH');
  check(deployIdPattern.test(baseline.baselineRenderDeployId ?? '') &&
    /^[a-f0-9]{40}$/.test(baseline.baselineRenderSha ?? '') &&
    baseline.baselineRenderSha === baseline.servingRenderSha &&
    baseline.baselineRenderSha === decision.baselineRenderSha &&
    decision.predecessorBuildId === baseline.baselineRenderSha &&
    baseline.servingRenderDeployId === baseline.baselineRenderDeployId &&
    baseline.paymentAvailability === 'Available' &&
    baseline.paymentAvailability === decision.paymentAvailability &&
    baseline.paymentAvailability === last.paymentAvailability,
  'BACKEND_AUDIT_PROVIDER_IDENTITY_MISMATCH');
  validateHealthObservation(baseline.healthObservation, baseline.baselineRenderSha);
  check(nonzeroHash(baseline.providerConfigurationSha256), 'BACKEND_AUDIT_PROVIDER_IDENTITY_MISMATCH');
  // A reconciled first-combined baseline must re-derive from the same
  // digest-pinned record that authenticated the live deployment at admission.
  if (baseline.baselineRenderProvenance !== undefined) {
    const observed = validateFailedFrontendRecord().observedBackend;
    const bindings = baseline.historicalD10Bindings;
    check(bindings && bindings.intendedConfigurationDigest === decision.requiredConfigurationDigest &&
      bindings.requiredAssemblyDigest === decision.requiredAssemblyDigest &&
      bindings.requiredRuntimeAssemblyDigest === decision.requiredRuntimeAssemblyDigest,
    'BACKEND_AUDIT_DECISION_MISMATCH');
    check(baseline.baselineRenderProvenance === 'FULL_RELEASE_RECEIPT' ||
      baseline.baselineRenderProvenance === 'RECONCILED_LATER_OBSERVATION' &&
        observed.renderDeployId === baseline.baselineRenderDeployId &&
        observed.renderSha === baseline.baselineRenderSha,
    'BACKEND_AUDIT_PROVIDER_IDENTITY_MISMATCH');
  }
  check(decision.decisionContract === decisionContract && decision.decisionSha256 === decision.decisionPin &&
    nonzeroHash(decision.decisionSha256) &&
    digestKeys.every(key => nonzeroHash(decision[key])) &&
    buildIdPattern.test(decision.predecessorBuildId ?? ''),
  'BACKEND_AUDIT_DECISION_MISMATCH');
  check(decision.baselineRenderSha === baseline.baselineRenderSha &&
    decision.predecessorBuildId === baseline.baselineRenderSha,
  'BACKEND_AUDIT_DECISION_MISMATCH');
  check(classified.schemaTransition === (rows.length === 18 ? 'additive' : 'none') &&
    (classified.schemaTransition === 'none' || classified.migrationFiles > 0) &&
    classified.backendFiles > 0 && Number.isInteger(classified.frontendFiles) &&
    classified.frontendFiles >= 0 && hashPattern.test(classified.sourceDeltaSha256 ?? '') &&
    /^[1-9]\d*$/.test(classified.integrityArtifactId ?? '') &&
    hashPattern.test(classified.integrityArtifactSha256 ?? '') &&
    classified.contract === 'aqua.backend-successor-integrity-v1' &&
    classified.repository === first.repository && classified.sha === first.sha &&
    classified.ciRunId === first.ciRunId && classified.ciRunAttempt === first.ciRunAttempt &&
    successorDigestKeys.every(key => nonzeroHash(classified[key])) &&
    (classified.schemaTransition === 'none' ?
      classified.successorSchemaSha256 === decision.requiredSchemaDigest :
      classified.successorSchemaSha256 !== decision.requiredSchemaDigest),
  'BACKEND_AUDIT_CLASSIFICATION_MISMATCH');
  const stagingRows = rows.filter(row => row.phase.endsWith('staging'));
  const stagedRows = rows.filter(row => row.phase.endsWith('staged'));
  check(stagingRows.length === stagedRows.length && [1, 2].includes(stagingRows.length) &&
    stagingRows.every((row, index) => hashPattern.test(row.payloadPinSha256 ?? '') &&
      row.stagedSchemaTransition === (index === 0 ? 'none' : 'additive') &&
      ['backend-successor-staging', 'backend-successor-restart-staging'].includes(row.phase)) &&
    stagedRows.every((row, index) => row.payloadPinSha256 === stagingRows[index].payloadPinSha256) &&
    stagingRows.at(-1).stagedSchemaTransition === classified.schemaTransition &&
    (stagingRows.length !== 2 || stagingRows[0].payloadPinSha256 !== stagingRows[1].payloadPinSha256),
  'BACKEND_AUDIT_STAGING_MISMATCH');
  // createAuditWriter caches each deploy id once recorded and propagates it to
  // later rows; every retained id must be either the first requested deploy or
  // the final live deploy, with the ready row bound to the candidate revision.
  const idRows = rows.filter(row => row.renderDeployId !== undefined);
  check(idRows.length >= 2 && idRows[0].phase === 'backend-render-requested' &&
    deployIdPattern.test(idRows[0].renderDeployId ?? '') &&
    idRows.every(row => deployIdPattern.test(row.renderDeployId ?? '') &&
      (row.renderDeployId === idRows[0].renderDeployId || row.renderDeployId === last.renderDeployId)) &&
    ready.renderDeployId === idRows[0].renderDeployId && ready.renderSha === first.sha &&
    (rows.length === 10 ? ready.renderDeployId === last.renderDeployId : true),
  'BACKEND_AUDIT_PROVIDER_IDENTITY_MISMATCH');
  if (rows.length === 18) {
    const jobCreated = rows[10], jobSucceeded = rows[11], restartReady = rows[16];
    check(jobIdPattern.test(jobCreated.jobId ?? '') && jobCreated.jobId === jobSucceeded.jobId &&
      deployIdPattern.test(rows[15].renderDeployId ?? '') &&
      deployIdPattern.test(restartReady.renderDeployId ?? '') && restartReady.renderSha === first.sha &&
      last.renderDeployId === restartReady.renderDeployId &&
      rows[4].payloadPinSha256 === rows[5].payloadPinSha256 &&
      rows[12].payloadPinSha256 === rows[13].payloadPinSha256,
    'BACKEND_AUDIT_PROVIDER_IDENTITY_MISMATCH');
  }
  const successorEvidence = last.successorEvidence;
  check(successorEvidence && typeof successorEvidence === 'object' && !Array.isArray(successorEvidence) &&
    Object.keys(successorEvidence).sort().join() === ['healthObservation', 'providerConfigurationSha256',
      'commissioningDecisionSha256', 'qualifiedBuildSha', 'integrityArtifactSha256',
      'successorAssemblyArtifactSha256'].sort().join() &&
    nonzeroHash(successorEvidence.providerConfigurationSha256) &&
    nonzeroHash(successorEvidence.commissioningDecisionSha256) &&
    nonzeroHash(successorEvidence.integrityArtifactSha256) &&
    nonzeroHash(successorEvidence.successorAssemblyArtifactSha256) &&
    successorEvidence.providerConfigurationSha256 === baseline.providerConfigurationSha256 &&
    successorEvidence.commissioningDecisionSha256 === decision.decisionSha256 &&
    successorEvidence.qualifiedBuildSha === first.sha &&
    successorEvidence.integrityArtifactSha256 === classified.integrityArtifactSha256 &&
    successorEvidence.successorAssemblyArtifactSha256 === classified.successorAssemblySha256 &&
    last.payloadPinSha256 === stagingRows.at(-1).payloadPinSha256,
  'BACKEND_AUDIT_PROVIDER_IDENTITY_MISMATCH');
  validateHealthObservation(successorEvidence.healthObservation, first.sha);
  return { ...descriptor, sha: first.sha, ciRunId: first.ciRunId, ciRunAttempt: first.ciRunAttempt,
    renderDeployId: last.renderDeployId, renderSha: last.renderSha,
    schemaTransition: classified.schemaTransition, backendSuccessor: first.backendSuccessor,
    payloadPinSha256: last.payloadPinSha256, receiptSha256: objectDigest(rows) };
}

export async function deployBackendSuccessorRelease(api, q, report, options) {
  validateBackendSuccessorIdentity(q);
  check(q.qualificationOnly === false && q.releaseRunAttempt === 1 && !options.receiptRows &&
    options.evidencePlan && !options.evidencePlan.resume &&
    (options.evidencePlan.backendReleases ?? []).every(row => row.sha !== q.sha) &&
    (options.evidencePlan.combinedReleases ?? []).every(row => row.sha !== q.sha) &&
    (q.combinedRelease === undefined ||
      (options.evidencePlan.frontendReleases ?? []).every(row => row.sha !== q.sha)),
  'BACKEND_RELEASE_NO_RESUME');
  const { targets, guard, validateRender, validateHealth, deploymentHistory, waitFor, releaseKey, policy } = options;
  const start = (options.now ?? Date.now)(), end = start + 40 * 60 * 1000;
  const clock = () => check((options.now ?? Date.now)() < end, 'BACKEND_EXECUTION_WINDOW_EXPIRED');
  const servicePath = `/services/${targets.render.id}`;
  const audit = row => report({ ...row, executionStartedAt: new Date(start).toISOString(),
    executionDeadline: new Date(end).toISOString() });
  await guard();
  // 1. Authenticated commissioned-Normal baseline (read-only throughout).
  clock();
  const service = await api.render(servicePath);
  assertCommissionedRenderService(inspectCommissionedRenderService(service, validateRender));
  const readEnvVar = async key => {
    const envVar = await api.render(`${servicePath}/env-vars/${key}`);
    check(envVar?.key === key && typeof envVar.value === 'string', 'BACKEND_RUNTIME_CONFIGURATION_CHANGED');
    return envVar.value;
  };
  const readNormalSettingsDigest = async () => {
    const values = {};
    for (const [key, allowed] of Object.entries(normalRuntimeSettings)) {
      const value = await readEnvVar(key);
      check(allowed.includes(value), 'BACKEND_RUNTIME_CONFIGURATION_CHANGED');
      values[key] = value;
    }
    return sha256(Buffer.from(JSON.stringify(values), 'utf8'));
  };
  const baselineProviderConfigurationSha256 = await readNormalSettingsDigest();
  const predecessorBuildId = await readEnvVar('Deployment__BuildId');
  check(buildIdPattern.test(predecessorBuildId), 'BACKEND_RUNTIME_CONFIGURATION_CHANGED');
  const decisionBytes = Buffer.from(
    await readEnvVar('App__AQGreenV2__Commissioning__DecisionJsonBase64'), 'base64');
  const decisionPin = await readEnvVar('App__AQGreenV2__Commissioning__DecisionSha256');
  const decisionInspection = inspectCommissioningDecision(decisionBytes, decisionPin);
  const decision = assertCommissioningDecision(decisionInspection);
  const deploys = await deploymentHistory(api, 'render');
  // A factual acknowledgement of the interrupted configuration write is not
  // permission to ignore a later provider operation. Before the first verified
  // successor, require the complete Render history to remain the diagnostic's
  // authenticated snapshot; a later successful successor has its own receipt.
  const interrupted = options.evidencePlan.historicalReconciliations?.filter(row => row.runId === '45006063824') ?? [];
  if (interrupted.length && !(options.evidencePlan.backendReleases?.length || options.evidencePlan.combinedReleases?.length)) {
    const projected = deploys.map(row => ({ id: row.id, status: row.status, commitSha: row.commit?.id }));
    check(interrupted.length === 1 && /^[a-f0-9]{64}$/.test(interrupted[0].renderHistorySha256 ?? '') &&
      new Set(projected.map(row => row.id)).size === projected.length && projected.every(row =>
        /^dep-[a-z0-9]+$/.test(row.id ?? '') && /^[a-f0-9]{40}$/.test(row.commitSha ?? '')) &&
      objectDigest(projected.sort((a, b) => a.id.localeCompare(b.id))) === interrupted[0].renderHistorySha256,
    'BACKEND_RENDER_DRIFT');
  }
  const historyInspection = inspectCommissionedDeploymentHistory(deploys);
  assertCommissionedDeploymentHistory(historyInspection);
  const live = historyInspection.live;
  const baselineSha = live[0].commit?.id;
  assertCommissionedBuildIdentity(inspectCommissionedBuildIdentity(predecessorBuildId, baselineSha));
  // For the first combined successor, the authenticated full-release receipt
  // identifies the commissioned Render deployment, not merely its commit. A
  // later verified successor has a different legitimate live deployment and
  // remains governed by its own receipt and the existing runtime fences.
  // The live deployment ID may only additionally be the exact deployment the
  // digest-pinned failed-run reconciliation observed, and only within the same
  // commissioned build: any other same-SHA deployment, a changed record or a
  // differing source revision still denies before any write.
  let renderBaselineProvenance;
  if (q.combinedRelease !== undefined && options.evidencePlan?.baseline &&
    !(options.evidencePlan.backendReleases?.length || options.evidencePlan.combinedReleases?.length)) {
    check(Array.isArray(options.baselineRows) && typeof options.validateBaselineReceipt === 'function',
      'BACKEND_RENDER_DRIFT');
    const proof = options.validateBaselineReceipt(options.baselineRows, options.evidencePlan.baseline, q,
      options.evidencePlan.baselinePolicyProof);
    const historicalBindings = proof.origin?.d10RuntimeBindings;
    assertHistoricalCommissioningBindings(inspectHistoricalCommissioningBindings(historicalBindings, decision));
    const observed = validateFailedFrontendRecord().observedBackend;
    const deploymentIdentity = inspectCommissionedDeploymentIdentity(live[0], proof, observed);
    check(deploymentIdentity.pass, 'BACKEND_RENDER_DRIFT');
    renderBaselineProvenance = deploymentIdentity.original ? 'FULL_RELEASE_RECEIPT' : 'RECONCILED_LATER_OBSERVATION';
  }
  const health = await api.health();
  const healthInspection = inspectCommissionedHealth(health, baselineSha, validateHealth);
  assertCommissionedHealth(healthInspection);
  const state = (health.body.result ?? health.body).paymentAvailability;
  const baselineHealthObservation = healthObservation(health);
  const compare = await api.gh(`/compare/${baselineSha}...${q.sha}`);
  const frontendPrefix = `${targets.vercel.rootDirectory}/`;
  const backendFiles = compare.files.filter(file => file.filename.startsWith(backendRoot));
  const frontendFiles = compare.files.filter(file => file.filename.startsWith(frontendPrefix));
  if (q.combinedRelease !== undefined)
    check(frontendFiles.length > 0, 'COMBINED_RELEASE_REQUIRES_FRONTEND_DELTA');
  check(compare.status === 'ahead' && compare.base_commit?.sha === baselineSha &&
    compare.merge_base_commit?.sha === baselineSha && Array.isArray(compare.files) &&
    compare.files.length > 0 && compare.files.length < 300 && backendFiles.length > 0 &&
    compare.files.every(file => ['added', 'modified', 'removed'].includes(file.status) &&
      typeof file.filename === 'string' && !file.filename.includes('..')),
    'BACKEND_SOURCE_DELTA_UNAUTHORIZED');
  // 2. Source classification: additive-only schema delta detection.
  const migrationFiles = compare.files.filter(file => file.filename.startsWith(migrationsPath));
  const sourceDir = options.env?.SOURCE_DIR;
  for (const file of migrationFiles) {
    check(migrationFilePattern.test(file.filename), 'BACKEND_SCHEMA_DELTA_UNAUTHORIZED');
    check(file.status === 'added' ||
      (file.status === 'modified' && file.filename.endsWith('DbContextModelSnapshot.cs') &&
        (file.previous_filename === undefined || file.previous_filename === file.filename)),
    'BACKEND_SCHEMA_DELTA_UNAUTHORIZED');
  }
  const addedMigrations = migrationFiles.filter(file => file.status === 'added');
  const addedPaths = new Set(addedMigrations.map(file => file.filename));
  check(addedMigrations.every(file => file.filename.endsWith('.Designer.cs') ?
    addedPaths.has(file.filename.replace(/\.Designer\.cs$/, '.cs')) :
    !file.filename.endsWith('DbContextModelSnapshot.cs')),
  'BACKEND_SCHEMA_DELTA_UNAUTHORIZED');
  const schemaTransition = addedMigrations.length > 0 ? 'additive' : 'none';
  if (schemaTransition === 'additive') {
    check(typeof sourceDir === 'string' && sourceDir.length > 0, 'BACKEND_SCHEMA_DELTA_UNAUTHORIZED');
    for (const file of addedMigrations) {
      const source = readMigrationSource(sourceDir, q.sha, file.filename);
      check(file.filename.endsWith('.Designer.cs') ?
        !/\bvoid\s+(?:Up|Down)\s*\(/.test(source) : additiveOnlyUp(source),
      'BACKEND_SCHEMA_DELTA_UNAUTHORIZED');
    }
  }
  const artifactName = `backend-successor-integrity-${q.sha}-${q.ciRunId}-${q.ciRunAttempt}`;
  const inventory = await api.gh(`/actions/runs/${q.ciRunId}/artifacts?per_page=100`);
  check(inventory?.total_count === inventory.artifacts?.length && inventory.total_count <= 100,
    'BACKEND_INTEGRITY_EVIDENCE_UNAVAILABLE');
  const matches = inventory.artifacts.filter(row => row.name === artifactName);
  check(matches.length === 1, 'BACKEND_INTEGRITY_EVIDENCE_UNAVAILABLE');
  const repository = await api.gh('');
  let descriptor, integrity;
  try {
    descriptor = validateArtifact(matches[0], q.ciRunId, q.sha, artifactName, repository.id);
    integrity = JSON.parse((await readGitHubArtifact(api, 'source', descriptor,
      'backend-successor-integrity.json')).toString('utf8'));
  } catch { throw new BackendSuccessorReleaseDenied('BACKEND_INTEGRITY_EVIDENCE_UNAVAILABLE'); }
  check(integrity && typeof integrity === 'object' && !Array.isArray(integrity) &&
    Object.keys(integrity).sort().join() === ['contract', 'repository', 'sha', 'ciRunId', 'ciRunAttempt',
      ...successorDigestKeys].sort().join() &&
    integrity.contract === 'aqua.backend-successor-integrity-v1' && integrity.repository === q.repository &&
    integrity.sha === q.sha && integrity.ciRunId === q.ciRunId && integrity.ciRunAttempt === q.ciRunAttempt &&
    successorDigestKeys.every(key => nonzeroHash(integrity[key])) &&
    (schemaTransition === 'none' ? integrity.successorSchemaSha256 === decision.requiredSchemaDigest :
      integrity.successorSchemaSha256 !== decision.requiredSchemaDigest),
  'BACKEND_INTEGRITY_EVIDENCE_MISMATCH');
  const sourceDeltaSha256 = sha256(Buffer.from(JSON.stringify({
    base: baselineSha, head: q.sha,
    files: compare.files.map(file => ({ filename: file.filename, status: file.status,
      additions: file.additions, deletions: file.deletions, changes: file.changes })) })));
  audit({ phase: 'backend-baseline-selected', baselineRenderDeployId: live[0].id,
    baselineRenderSha: baselineSha, servingRenderDeployId: live[0].id,
    servingRenderSha: baselineSha, paymentAvailability: state, healthObservation: baselineHealthObservation,
    providerConfigurationSha256: baselineProviderConfigurationSha256,
    ...(renderBaselineProvenance ? { historicalD10Bindings: options.baselineRows.at(-1).d10RuntimeBindings } : {}),
    ...(renderBaselineProvenance ? { baselineRenderProvenance: renderBaselineProvenance } : {}) });
  audit({ phase: 'backend-decision-verified', decisionSha256: sha256(decisionBytes),
    decisionPin, decisionContract, requiredConfigurationDigest: decision.requiredConfigurationDigest,
    requiredSchemaDigest: decision.requiredSchemaDigest, requiredAssemblyDigest: decision.requiredAssemblyDigest,
    requiredRuntimeAssemblyDigest: decision.requiredRuntimeAssemblyDigest,
    requiredDatabaseIdentityDigest: decision.requiredDatabaseIdentityDigest,
    predecessorBuildId, baselineRenderSha: baselineSha, paymentAvailability: state });
  audit({ phase: 'backend-classified', schemaTransition, backendFiles: backendFiles.length,
    frontendFiles: frontendFiles.length, migrationFiles: migrationFiles.length, sourceDeltaSha256,
    integrityArtifactId: descriptor.id, integrityArtifactSha256: descriptor.digest.slice(7), ...integrity });
  // Qualify the *current* Vercel incumbent, project, public inputs and alias
  // before staging either Render variable. The frontend phase repeats these
  // reads and requires the same incumbent after the backend transition.
  const incumbent = q.combinedRelease !== undefined ?
    await verifyFrontendIncumbent(api, q, options) : null;
  // 3. Stage the successor input through the existing environment channel.
  const buildPayload = transition => {
    const payload = { contractVersion: successorContract, predecessorDecisionSha256: sha256(decisionBytes),
      predecessorSchemaSha256: decision.requiredSchemaDigest,
      predecessorAssemblySha256: decision.requiredAssemblyDigest,
      predecessorRuntimeAssemblySha256: decision.requiredRuntimeAssemblyDigest,
      predecessorDatabaseIdentitySha256: decision.requiredDatabaseIdentityDigest,
      predecessorBuildId, successorRevisionSha256: q.sha,
      successorSchemaSha256: transition === 'additive' ? integrity.successorSchemaSha256 : decision.requiredSchemaDigest,
      successorAssemblySha256: integrity.successorAssemblySha256,
      successorApplicationSha256: integrity.successorApplicationSha256,
      successorCoreSha256: integrity.successorCoreSha256, schemaTransition: transition,
      releaseRunId: Number(q.releaseRunId), releaseRunAttempt: q.releaseRunAttempt,
      ciRunId: Number(q.ciRunId), ciRunAttempt: q.ciRunAttempt,
      executorSha256: sha256(Buffer.from(q.executorSha, 'utf8')) };
    const bytes = Buffer.from(JSON.stringify(payload), 'utf8');
    check(bytes.length > 0 && bytes.length <= 16384, 'BACKEND_STAGING_UNVERIFIED');
    return { bytes, pin: sha256(bytes) };
  };
  const stage = async (intentPhase, stagedPhase, transition) => {
    const payload = buildPayload(transition);
    options.validateAdmission();
    audit({ phase: intentPhase, payloadPinSha256: payload.pin, stagedSchemaTransition: transition,
      payloadBytes: payload.bytes.length });
    const encoded = payload.bytes.toString('base64');
    for (const [key, value] of [[backendSuccessorPayloadKey, encoded], [backendSuccessorPinKey, payload.pin]]) {
      await api.render(`${servicePath}/env-vars/${key}`, { value });
      const readback = await api.render(`${servicePath}/env-vars/${key}`);
      check(readback?.key === key && readback.value === value, 'BACKEND_STAGING_UNVERIFIED');
    }
    audit({ phase: stagedPhase, payloadPinSha256: payload.pin });
    return payload;
  };
  // The runtime is booted once on the unchanged schema ('none') so the Render
  // one-off job can run the candidate's own migrator binary from a healthy
  // release; the additive restart then flips the accepted transition.
  const initialStage = await stage('backend-successor-staging', 'backend-successor-staged', 'none');
  let finalPin = initialStage.pin;
  // 4. Deploy the qualified candidate revision.
  await guard();
  clock();
  options.validateAdmission();
  audit({ phase: 'backend-render-requesting' });
  const requested = await api.render(`${servicePath}/deploys`,
    { commitId: q.sha, clearCache: 'do_not_clear' });
  check(deployIdPattern.test(requested?.id ?? ''), 'BACKEND_RENDER_DEPLOYMENT_ID_UNAVAILABLE');
  audit({ phase: 'backend-render-requested', renderDeployId: requested.id });
  const first = await waitFor(async () => api.render(`${servicePath}/deploys/${requested.id}`),
    row => row.status, 'live', activeRender, options);
  check(first.id === requested.id && first.commit?.id === q.sha, 'BACKEND_DEPLOYMENT_UNVERIFIABLE');
  audit({ phase: 'backend-render-ready', renderDeployId: requested.id, renderSha: q.sha });
  let finalDeployId = requested.id;
  if (schemaTransition === 'additive') {
    // 5. Schema transition: one-off job running the release's own migrator.
    await guard();
    clock();
    options.validateAdmission();
    audit({ phase: 'backend-schema-job-requesting', startCommand: 'dotnet migrator/AqualLifeStyle.Migrator.dll' });
    const job = await api.render(`${servicePath}/jobs`,
      { startCommand: 'dotnet migrator/AqualLifeStyle.Migrator.dll' });
    check(jobIdPattern.test(job?.id ?? ''), 'BACKEND_SCHEMA_JOB_UNAVAILABLE');
    audit({ phase: 'backend-schema-job-created', jobId: job.id });
    const finished = await waitFor(async () => api.render(`${servicePath}/jobs/${job.id}`),
      row => row.status, 'succeeded', new Set(['pending', 'running']), options);
    check(finished.id === job.id, 'BACKEND_SCHEMA_JOB_UNAVAILABLE');
    audit({ phase: 'backend-schema-job-succeeded', jobId: job.id });
    // 6. Restart the same build on the additive input. Between job success and
    // this restart the runtime fails closed on D10 population requests; this
    // window is bounded and never claimed to roll back the applied schema.
    const finalStage = await stage('backend-successor-restart-staging', 'backend-successor-restart-staged', 'additive');
    finalPin = finalStage.pin;
    await guard();
    clock();
    options.validateAdmission();
    audit({ phase: 'backend-restart-requesting' });
    const restart = await api.render(`${servicePath}/deploys`, { deployMode: 'deploy_only' });
    check(deployIdPattern.test(restart?.id ?? ''), 'BACKEND_RENDER_DEPLOYMENT_ID_UNAVAILABLE');
    audit({ phase: 'backend-restart-requested', renderDeployId: restart.id });
    const ready = await waitFor(async () => api.render(`${servicePath}/deploys/${restart.id}`),
      row => row.status, 'live', activeRender, options);
    check(ready.id === restart.id, 'BACKEND_DEPLOYMENT_UNVERIFIABLE');
    audit({ phase: 'backend-restart-ready', renderDeployId: restart.id, renderSha: q.sha });
    finalDeployId = restart.id;
  }
  // 7. Final verified successor state.
  clock();
  const endHistory = await deploymentHistory(api, 'render');
  const endLive = endHistory.filter(row => row.status === 'live');
  check(endHistory.every(row => !activeRender.has(row.status)) && endLive.length === 1 &&
    endLive[0].id === finalDeployId && endLive[0].commit?.id === q.sha &&
    endHistory.filter(row => row.commit?.id === q.sha).length === (schemaTransition === 'additive' ? 2 : 1),
  'BACKEND_DEPLOYMENT_UNVERIFIABLE');
  const endHealth = await api.health();
  try { validateHealth(endHealth, q.sha); }
  catch { throw new BackendSuccessorReleaseDenied('BACKEND_DEPLOYMENT_UNVERIFIABLE'); }
  check((endHealth.body.result ?? endHealth.body).paymentAvailability === state,
    'BACKEND_DEPLOYMENT_UNVERIFIABLE');
  const endHealthObservation = healthObservation(endHealth);
  let finalProviderConfigurationSha256;
  try { finalProviderConfigurationSha256 = await readNormalSettingsDigest(); }
  catch { throw new BackendSuccessorReleaseDenied('BACKEND_DEPLOYMENT_UNVERIFIABLE'); }
  check(finalProviderConfigurationSha256 === baselineProviderConfigurationSha256,
    'BACKEND_DEPLOYMENT_UNVERIFIABLE');
  const successorEvidence = { healthObservation: endHealthObservation,
    providerConfigurationSha256: finalProviderConfigurationSha256,
    commissioningDecisionSha256: sha256(decisionBytes), qualifiedBuildSha: q.sha,
    integrityArtifactSha256: descriptor.digest.slice(7),
    successorAssemblyArtifactSha256: integrity.successorAssemblySha256 };
  check(await api.web() === 200, 'WEB_READINESS_FAILED');
  const proxy = await api.webHealth(q.sha, state);
  check(proxy?.status === 'Healthy' && proxy.buildId === q.sha && proxy.paymentAvailability === state,
    'BACKEND_DEPLOYMENT_UNVERIFIABLE');
  audit({ phase: 'backend-deployed', renderDeployId: finalDeployId, renderSha: q.sha,
    paymentAvailability: state, successorEvidence, payloadPinSha256: finalPin,
    releaseIdentity: releaseKey(q), schemaTransition });
  // Combined releases continue with the frontend phase of the same qualified
  // revision only after the backend release is fully verified above. Every
  // failure in the frontend phase fails closed on the already-released backend.
  if (q.combinedRelease !== undefined)
    await deployCombinedFrontendPhase(api, q, report, options, {
      baselineRenderDeployId: live[0].id, baselineRenderSha: baselineSha,
      baselineVercelDeployId: incumbent.vercelDeployId,
      renderDeployId: finalDeployId, renderSha: q.sha, paymentAvailability: state,
      frontendFiles: frontendFiles.length, backendFiles: backendFiles.length, sourceDeltaSha256 });
}

// Combined audit receipt: the 10- or 18-row backend successor sequence is
// validated by the ordinary backend receipt logic, then the seven-row frontend
// suffix is bound to that backend result. The frontend phase never re-runs the
// backend comparison; it inherits the backend classification.
export function validateCombinedReceipt(rows, descriptor, targets) {
  check(Array.isArray(rows) && (rows.length === 17 || rows.length === 25) &&
    rows.map(row => row.phase).join() ===
      [...(rows.length === 17 ? baselineSequence : additiveSequence),
        'frontend-baseline-selected', 'frontend-classified',
        'frontend-vercel-files-requesting', 'frontend-vercel-files-uploaded',
        'frontend-vercel-requesting', 'frontend-vercel-requested', 'frontend-deployed'].join(),
    'COMBINED_AUDIT_SEQUENCE_INVALID');
  const backendLen = rows.length - 7;
  const backendReceipt = validateBackendSuccessorReceipt(rows.slice(0, backendLen), descriptor, targets);
  const first = rows[0], classified = rows[3], baseline = rows[backendLen],
    deployed = rows.at(-1);
  check(first.combinedRelease === combinedMode &&
    rows.every(row => row.combinedRelease === first.combinedRelease &&
      row.backendSuccessor === first.backendSuccessor),
    'COMBINED_AUDIT_IDENTITY_MISMATCH');
  check(rows[backendLen - 1].phase === 'backend-deployed' &&
    rows[backendLen - 1].renderSha === first.sha &&
    rows[backendLen - 1].renderDeployId === backendReceipt.renderDeployId &&
    hashPattern.test(rows[backendLen - 1].releaseIdentity ?? ''),
    'COMBINED_AUDIT_PROVIDER_IDENTITY_MISMATCH');
  check(/^dpl_[A-Za-z0-9]+$/.test(baseline.baselineVercelDeployId ?? '') &&
    baseline.baselineRenderSha === rows[1].baselineRenderSha &&
    baseline.baselineRenderDeployId === rows[1].baselineRenderDeployId &&
    baseline.baselineRenderSha !== first.sha && baseline.servingRenderSha === first.sha &&
    baseline.servingRenderDeployId === backendReceipt.renderDeployId &&
    baseline.paymentAvailability === 'Available' &&
    baseline.paymentAvailability === rows[1].paymentAvailability &&
    baseline.paymentAvailability === deployed.paymentAvailability &&
    ['GIT_SOURCE', 'UNVERIFIED_LEGACY', 'RECONCILED_FRONTEND_EFFECT', 'PRIOR_RELEASE_RECEIPT']
      .includes(baseline.baselineVercelSourceProvenance),
    'COMBINED_AUDIT_PROVIDER_IDENTITY_MISMATCH');
  const frontendClassified = rows[backendLen + 1];
  check(frontendClassified.phase === 'frontend-classified' &&
    frontendClassified.frontendFiles === rows[3].frontendFiles &&
    frontendClassified.backendFiles === rows[3].backendFiles &&
    frontendClassified.sourceDeltaSha256 === rows[3].sourceDeltaSha256,
    'COMBINED_AUDIT_CLASSIFICATION_MISMATCH');
  const vercelDeployId = rows[backendLen + 5].vercelDeployId;
  check(typeof vercelDeployId === 'string' && /^dpl_[A-Za-z0-9]+$/.test(vercelDeployId) &&
    rows[backendLen + 6].vercelDeployId === vercelDeployId &&
    rows[backendLen + 6].renderSha === first.sha &&
    rows[backendLen + 6].webSha256 === first.sha && rows[backendLen + 6].webStatus === 200,
    'COMBINED_AUDIT_PROVIDER_IDENTITY_MISMATCH');
  check(deployed.phase === 'frontend-deployed' && deployed.renderSha === first.sha &&
    deployed.vercelSha === first.sha && deployed.webSha256 === first.sha &&
    deployed.paymentAvailability === baseline.paymentAvailability,
    'COMBINED_AUDIT_PROVIDER_IDENTITY_MISMATCH');
  return { ...backendReceipt, sha: first.sha, ciRunId: first.ciRunId, ciRunAttempt: first.ciRunAttempt,
    renderDeployId: backendReceipt.renderDeployId, renderSha: first.sha,
    vercelDeployId, combinedRelease: first.combinedRelease, backendSuccessor: first.backendSuccessor,
    payloadPinSha256: backendReceipt.payloadPinSha256, receiptSha256: objectDigest(rows) };
}
