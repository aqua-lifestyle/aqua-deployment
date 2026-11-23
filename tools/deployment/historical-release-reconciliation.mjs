// Owner-authorized factual recognition of exact FAILED attempts only. This is not
// a successful release receipt, retry continuation, or provider-operation permit.
import { readFileSync } from 'node:fs';
import { objectDigest, sha256 } from './github-evidence.mjs';
import { memberContinuation, memberPolicy, memberPolicyDigest, validateMemberContinuation } from './member-release.mjs';
import { validateFrontendProof } from './vercel-source.mjs';
import { readinessCandidateSha, validateReadinessCandidate, validateReadinessFailureContext,
  validateReadinessFailureArtifact, validateReadinessFailureAudit } from './readiness-release.mjs';

export class HistoricalReconciliationDenied extends Error {}
const check = (ok, detail) => { if (!ok) throw new HistoricalReconciliationDenied(
  'UNVERIFIED_PRIOR_RELEASE_REQUIRES_RECONCILIATION:' + detail); };
const pins = Object.freeze({
  'historical-release-reconciliation-authority-20261102.json': 'b0a6deca7ca8ea3f141bf2f322aff22283e8fc216aff6a81f9c5c35877ce89a0',
  'historical-release-reconciliation-20261102.json': 'c7ab76a2c02f4f95964f9a4353574fe4d8691f34e6e224934f96cc2543f66aa9',
  'native-held-baseline-observation-20261102.json': '66f61838301ee86e8f2dd2fe11b545a40585d6ae0722d69c63193559b28152ec',
  'held-frontend-source-evidence-20261029.json': '7195d016e7f881c37a1a25a7a9352aa485083e344061ad8beb4a873b7d960b7c'
});
const failedRenderDigest = 'da3ab4875cc0c608c675f8588565318d2cf922e4056f4e93c867154c90f8b5f6';
export const reconciledTargetFailureRunId = '43397240173';
const targetFailureDigest = '6ccba9e307bc303f47ddd7d555c1f64681249bb733c9536636fc33a57a755972';
export const interruptedSuccessorRunId = '45006063824';
const interruptedSuccessorDigest = '9fda395ac84957fba80d3e6256bff95321b56b2bff2082bd3d5d18df1590dc33';
const authenticatedSuccessorDiagnostics = new WeakSet();

export function validateInterruptedSuccessorRecord(bytes = readFileSync(
  new URL('../../governance/backend-successor-staging-reconciliation-45006063824.json', import.meta.url))) {
  check(Buffer.isBuffer(bytes) && sha256(bytes) === interruptedSuccessorDigest, 'INTERRUPTED_SUCCESSOR_RECORD_CHANGED');
  const r = JSON.parse(bytes), o = r.originalRun, s = r.source, a = r.originalAudit, d = r.diagnostic, scope = r.scope;
  check(r.contract === 'aqua.exact-failed-backend-successor-staging-reconciliation' && r.version === 1 &&
    o.id === interruptedSuccessorRunId && o.number === 88 && o.attempt === 1 &&
    o.executorSha === 'd0cf6e0e424f3762756ed4c7beff83db7b9adeda' &&
    o.actor?.login === 'aqualifestyleclub' && o.actor.id === 307076734 &&
    o.productionJobId === '137158208723' && o.policySha256 === 'e95602526973af088b512801f084616f31187ebe5acb20584ff3df0ba6e4020e' &&
    o.conclusion === 'failure' && o.productionConclusion === 'failure' &&
    o.terminalCode === 'SECRET_BEARING_RENDER_READ_FORBIDDEN' &&
    s.repository === 'aqua-lifestyle/aqua-lifestyle' && s.sha === '58b18b2f5a76769a660c2ae834bd6e0c02263ebf' &&
    s.ciRunId === '44236824305' && s.ciRunAttempt === 2 && s.backendSuccessor === 'post-normal-backend-v1' &&
    s.combinedRelease === 'post-normal-backend-frontend-v1' &&
    a.artifactId === '14747883309' && a.archiveSha256 === 'f86468c27c7850d88a9f1a968281b03a1f0924a93e5360342c38e71c46b71b5e' &&
    a.reportSha256 === 'cd969c98b7e4738c2b060370f273f2ea8bb7293aeb801de967f0d2c6614d52fd' &&
    a.rowsSha256 === 'a7740c4dda0c484b15e4e807ea8776359e7aaf3c0a379987be6d2fd1fc349fe2' &&
    objectDigest(a.phases) === objectDigest(['evidence-selected','backend-baseline-selected','backend-decision-verified',
      'backend-classified','backend-successor-staging','failed']) &&
    a.payloadPinSha256 === 'c577c8fd72c6a78cc981e469acb53030bd70550b98ec7b6e32fdba826368ade8' &&
    a.payloadBytes === 1238 && a.schemaTransition === 'additive' && a.stagedSchemaTransition === 'none' &&
    a.baselineRenderDeployId === 'dep-dbru710n74is738ah8bg' &&
    a.baselineRenderSha === 'b8d86e5e60997483423b273d5f426c08b411f573' &&
    d.runId === '45050378040' && d.attempt === 1 && d.jobId === '137293951125' &&
    d.executorSha === '4e8a63ab4731530d29ed68a9d9c913dfbb3a01c4' &&
    d.jobLogSha256 === '7e70b2e4b890a19ad81877e376f9603b43b81444d064a3a1691203171425d6c6' &&
    d.stagingRowSha256 === '59ba345533e83e59a33cbadb33ce250a0ba2f08dd9ee9767f9cd8a1414039247' &&
    d.commissionedRowSha256 === '5a065d1830e94c6567b91a1d986094e517eee12ada825f2e779b790528823bb9' &&
    d.stagingObservedAt === '2026-11-22T17:36:34.065Z' && d.commissionedObservedAt === '2026-11-22T17:36:34.066Z' &&
    d.payload === 'MATCH' && d.pin === 'UNVERIFIED' && d.deploymentHistoryCount === 133 &&
    d.renderHistorySha256 === '99893f3502ad2057b4e8a72a73e55f28ca300cc9388d5af934764040fe7d08df' &&
    Array.isArray(d.postRunDeployments) && d.postRunDeployments.length === 0 &&
    d.liveRenderDeployId === a.baselineRenderDeployId && d.liveRenderSha === a.baselineRenderSha &&
    scope.outcome === 'ACKNOWLEDGED_PARTIAL_RENDER_CONFIGURATION_WRITE' &&
    scope.environment === 'production-release' && scope.profile === 'normal-integrated' &&
    scope.renderServiceId === 'srv-d9f0k8e1a83c73d8n1b0' &&
    scope.vercelProjectId === 'prj_6qL1e43KhsWrRshY5GxdmGl3HGMz' &&
    scope.vercelTeamId === 'team_Hc3BWfhTLfwLzwbgbtaasBUY' &&
    scope.originalFailurePreserved === true && scope.pinValueEstablished === false &&
    scope.noRecordedPostRunDeployment === true && scope.configurationTriggeredRestartAbsenceEstablished === false &&
    scope.databaseWriteAbsenceEstablishedByHealth === false &&
    ['successfulReleasePredecessor','automaticResumeAuthorized','replayAuthorized','providerDeploymentAuthorized',
      'migrationAuthorized','financialActivationAuthorized'].every(key => scope[key] === false) &&
    scope.providerHistoryMustRemainUnchangedBeforeStaging === true &&
    scope.newReleaseRequiresFreshAdmissionAndLiveChecks === true,
  'INTERRUPTED_SUCCESSOR_RECORD_INVALID');
  return r;
}

// GitHub's retained, bounded job log is the original diagnostic report. No
// provider credential, raw Render value or log text leaves this read-only path.
export async function authenticateInterruptedSuccessorDiagnostic(api, r = validateInterruptedSuccessorRecord()) {
  const d = r.diagnostic;
  const run = await api.executor(`/actions/runs/${d.runId}`);
  const jobs = await api.executor(`/actions/runs/${d.runId}/attempts/1/jobs?per_page=100`);
  const job = jobs?.jobs?.[0];
  check(run?.id === Number(d.runId) && run.run_attempt === 1 && run.run_number === 18 &&
    run.head_sha === d.executorSha && run.status === 'completed' && run.conclusion === 'success' &&
    run.event === 'workflow_dispatch' && run.head_branch === 'main' &&
    run.path === '.github/workflows/provider-credential-check.yml' &&
    run.repository?.full_name === 'aqua-lifestyle/aqua-deployment' &&
    run.head_repository?.full_name === 'aqua-lifestyle/aqua-deployment' &&
    run.actor?.login === 'Xolani-M' && run.actor?.id === 86495928 &&
    jobs?.total_count === 1 && jobs.jobs.length === 1 && job?.id === Number(d.jobId) &&
    job.run_id === run.id && job.run_attempt === 1 && job.status === 'completed' && job.conclusion === 'success' &&
    job.steps?.filter(step => step.name === 'Validate trusted main context without provider credentials' &&
      step.conclusion === 'success').length === 1 &&
    job.steps.filter(step => step.name === 'Diagnose commissioned baseline with fixed GET-only evidence' &&
      step.conclusion === 'success').length === 1 &&
    ['Verify fixed provider identities and GET permissions only','Diagnose allowlisted Render environment reads only',
      'Inspect fixed Render baseline with GET only'].every(name => job.steps.filter(step =>
        step.name === name && step.conclusion === 'skipped').length === 1),
  'INTERRUPTED_SUCCESSOR_DIAGNOSTIC_EXECUTION_CHANGED');
  check(typeof api.diagnosticJobLog === 'function', 'INTERRUPTED_SUCCESSOR_DIAGNOSTIC_LOG_UNAVAILABLE');
  const log = await api.diagnosticJobLog(d.jobId);
  check(Buffer.isBuffer(log) && log.length > 0 && log.length <= 256 * 1024 &&
    sha256(log) === d.jobLogSha256, 'INTERRUPTED_SUCCESSOR_DIAGNOSTIC_LOG_CHANGED');
  const selected = [];
  for (const line of log.toString('utf8').split('\n')) {
    const start = line.indexOf('{');
    if (start < 0) continue;
    try {
      const row = JSON.parse(line.slice(start));
      if (row?.check === 'trusted-main-context' ||
        ['aqua.successor-staging-read-diagnostic','aqua.commissioned-state-read-diagnostic'].includes(row?.contract))
        selected.push(row);
    } catch { /* The whole-log digest still authenticates non-JSON runner lines. */ }
  }
  const [context, stage, commissioned] = selected;
  const healthKeys = ['http200','statusHealthy','buildMatchesLiveCommit','production','databaseHealthy',
    'redisHealthy','keyStoreHealthy','recoveryClear','paymentAvailable'];
  const history = commissioned?.deploymentHistory?.deployments;
  const identifiedHistory = Array.isArray(history) && history.length === d.deploymentHistoryCount &&
    new Set(history.map(row => row.id)).size === history.length && history.every(row =>
      /^dep-[a-z0-9]+$/.test(row?.id ?? '') && /^[a-f0-9]{40}$/.test(row?.commitSha ?? '') &&
      typeof row?.status === 'string');
  check(selected.length === 3 && context?.check === 'trusted-main-context' && context.result === 'PASS' &&
    stage?.contract === 'aqua.successor-staging-read-diagnostic' && objectDigest(stage) === d.stagingRowSha256 &&
    stage.runId === d.runId && stage.runAttempt === 1 && stage.executorSha === d.executorSha &&
    stage.failedReleaseRunId === r.originalRun.id && stage.observedAt === d.stagingObservedAt &&
    stage.evidence?.status === 'MATCH' && stage.evidence.auditArtifactId === r.originalAudit.artifactId &&
    stage.evidence.archiveSha256 === r.originalAudit.archiveSha256 &&
    stage.stagedPayload === 'MATCH' && stage.stagedPin === 'UNVERIFIED' &&
    stage.deploymentHistory?.status === 'MATCH' &&
    stage.deploymentHistory.current?.id === r.originalAudit.baselineRenderDeployId &&
    stage.deploymentHistory.current.status === 'live' &&
    stage.deploymentHistory.current.commitSha === r.originalAudit.baselineRenderSha &&
    Array.isArray(stage.deploymentHistory.postRunDeployments) &&
    stage.deploymentHistory.postRunDeployments.length === 0 &&
    commissioned?.contract === 'aqua.commissioned-state-read-diagnostic' &&
    objectDigest(commissioned) === d.commissionedRowSha256 && commissioned.runId === d.runId &&
    commissioned.executorSha === d.executorSha && commissioned.observedAt === d.commissionedObservedAt &&
    commissioned.diagnosticStatus === 'COMPLETE' && commissioned.service?.result === 'PASS' &&
    commissioned.baselineEvidence?.result === 'PASS' &&
    Object.keys(commissioned.normalRuntimeSettings ?? {}).length === 15 &&
    Object.values(commissioned.normalRuntimeSettings).every(row => row.result === 'PASS') &&
    commissioned.deploymentHistory?.observedCount === d.deploymentHistoryCount &&
    identifiedHistory && objectDigest([...history].sort((a, b) => a.id.localeCompare(b.id))) === d.renderHistorySha256 &&
    commissioned.deploymentHistory.oneLive === 'PASS' &&
    commissioned.deploymentHistory.noActiveDeployments === 'PASS' &&
    commissioned.deploymentHistory.liveDeployment?.id === d.liveRenderDeployId &&
    commissioned.deploymentHistory.liveDeployment.commitSha === d.liveRenderSha &&
    commissioned.commissioningDecision?.sha256Pin?.result === 'PASS' &&
    ['intendedConfigurationDigest','requiredAssemblyDigest','requiredRuntimeAssemblyDigest'].every(key =>
      commissioned.historicalD10Comparisons?.[key]?.result === 'PASS') &&
    healthKeys.every(key => commissioned.backendHealth?.[key] === 'PASS') &&
    commissioned.paymentAvailability?.result === 'PASS' &&
    Array.isArray(commissioned.currentFailingPredicates) && commissioned.currentFailingPredicates.length === 0 &&
    commissioned.exactCurrentFailingPredicate === 'NOT_ESTABLISHED' &&
    Number.isFinite(Date.parse(run.created_at)) && Number.isFinite(Date.parse(run.updated_at)) &&
    Date.parse(run.created_at) <= Date.parse(d.stagingObservedAt) &&
    Date.parse(d.stagingObservedAt) <= Date.parse(d.commissionedObservedAt) &&
    Date.parse(d.commissionedObservedAt) <= Date.parse(run.updated_at),
  'INTERRUPTED_SUCCESSOR_DIAGNOSTIC_EVIDENCE_CHANGED');
  const unchanged = await api.executor(`/actions/runs/${d.runId}`);
  check(unchanged.id === run.id && unchanged.run_attempt === run.run_attempt &&
    unchanged.head_sha === run.head_sha && unchanged.updated_at === run.updated_at &&
    unchanged.conclusion === 'success', 'INTERRUPTED_SUCCESSOR_DIAGNOSTIC_CHANGED');
  const proof = Object.freeze({ runId: d.runId, jobId: d.jobId, executorSha: d.executorSha,
    jobLogSha256: d.jobLogSha256, stagingRowSha256: d.stagingRowSha256,
    commissionedRowSha256: d.commissionedRowSha256, payload: 'MATCH', pin: 'UNVERIFIED',
    liveRenderDeployId: d.liveRenderDeployId, liveRenderSha: d.liveRenderSha,
    renderHistorySha256: d.renderHistorySha256,
    observedAt: d.stagingObservedAt });
  authenticatedSuccessorDiagnostics.add(proof);
  return proof;
}

export function validateTargetFailureRecord(bytes = readFileSync(
  new URL('../../governance/render-failure-reconciliation-43397240173.json', import.meta.url))) {
  check(Buffer.isBuffer(bytes) && sha256(bytes) === targetFailureDigest, 'TARGET_FAILURE_RECORD_CHANGED');
  const r = JSON.parse(bytes);
  check(r.contract === 'aqua.exact-acknowledged-render-failure-reconciliation' && r.version === 1 &&
    r.run.runId === reconciledTargetFailureRunId && r.run.attempt === 1 && r.run.originalConclusion === 'failure' &&
    r.renderOperation.sourceSha === r.originalIdentity.sha && r.renderOperation.state === 'update_failed' &&
    r.renderOperation.originalPostHttpStatus === null && r.vercelEffect === 'NO_MUTATION_INITIATED_BY_THIS_ATTEMPT' &&
    r.databaseWriteAbsence === 'NOT_ESTABLISHED_BY_DEPLOYMENT_FAILURE_OR_HEALTH' &&
    ['originalFailureRewritten', 'mutationFree', 'successfulFullReleasePredecessor',
      'retryOrContinuationAuthority', 'deploymentAuthority'].every(key => r[key] === false),
  'TARGET_FAILURE_RECORD_INVALID');
  return r;
}

function validateTargetFailureCandidate(q, targets) {
  const r = validateTargetFailureRecord(), i = r.originalIdentity, b = q.prospectiveRecovery?.boundary;
  check(q.qualificationOnly === false && q.memberRelease === undefined && q.prospectiveMode === 'authorize' &&
    q.releaseRunAttempt === 1 && q.releaseRunId !== r.run.runId && q.executorSha !== r.run.executorSha &&
    ['repository', 'sha', 'policySha256', 'environment', 'profile', 'executorRepository',
      'renderServiceId', 'vercelProjectId', 'vercelTeamId'].every(key => q[key] === i[key]) &&
    targets.repository === i.repository && targets.executor?.repository === i.executorRepository &&
    targets.render.id === i.renderServiceId && targets.vercel.id === i.vercelProjectId &&
    targets.vercel.teamId === i.vercelTeamId && b?.targetSha === q.sha &&
    b.render?.deploymentId === r.baseline.renderDeployId && b.render.sourceSha === r.baseline.renderSha &&
    b.vercel?.deploymentId === r.baseline.vercelDeployId, 'TARGET_FAILURE_CANDIDATE_OR_BASELINE_CHANGED');
  return r;
}

function targetFailureProof(r) {
  return { runId: r.run.runId, runAttempt: 1, executorSha: r.run.executorSha,
    artifactId: r.run.artifactId, archiveSha256: r.run.archiveSha256, rowsSha256: r.run.rowsSha256,
    originalConclusion: 'failure', terminalFailureCode: r.run.terminalFailureCode,
    outcome: 'ACKNOWLEDGED_TERMINAL_RENDER_FAILURE_NO_VERCEL_REQUEST',
    renderDeployId: r.renderOperation.deployId, sourceSha: r.renderOperation.sourceSha,
    terminalState: r.renderOperation.state, baseline: r.baseline, reconciliationSha256: targetFailureDigest,
    mutationFree: false, successfulFullReleasePredecessor: false,
    retryOrContinuationAuthority: false, replayAuthority: false, deploymentAuthority: false };
}

function validateTargetFailureContext(run, attempt, production, candidate, targets) {
  const r = validateTargetFailureCandidate(candidate, targets), p = r.run, i = r.originalIdentity;
  check(String(run.id) === p.runId && run.run_number === p.runNumber && run.run_attempt === 1 && attempt === 1 &&
    run.head_sha === p.executorSha && run.status === 'completed' && run.conclusion === 'failure' &&
    run.actor?.login === p.actor.login && run.actor?.id === p.actor.id &&
    run.repository?.full_name === i.executorRepository && run.head_repository?.full_name === i.executorRepository &&
    run.head_branch === 'main' && run.event === 'workflow_dispatch' && run.path === '.github/workflows/deploy.yml' &&
    run.name === 'Qualified production executor' && production.name === 'Unattended recovery release' &&
    production.run_id === run.id && production.run_attempt === 1 && production.status === 'completed' &&
    production.conclusion === 'failure' && production.steps?.filter(step => step.conclusion === 'failure').length === 1 &&
    production.steps.find(step => step.conclusion === 'failure').name ===
      'Revalidate policy, provenance, providers and recovery before automatic deployment', 'TARGET_FAILURE_EXECUTION_CHANGED');
  return p;
}

function validateTargetFailureArtifact(pin, descriptor, metadata) {
  const r = validateTargetFailureRecord(), p = r.run;
  check(objectDigest(pin) === objectDigest(p) && descriptor.runId === p.runId && descriptor.runAttempt === 1 &&
    descriptor.sha === p.executorSha && descriptor.artifactId === p.artifactId && String(metadata.id) === p.artifactId &&
    metadata.name === `production-release-audit-${p.runId}-1` && metadata.expired === false &&
    metadata.digest === 'sha256:' + p.archiveSha256 && metadata.workflow_run?.id === Number(p.runId) &&
    metadata.workflow_run.head_sha === p.executorSha && metadata.workflow_run.repository_id === 1423239668 &&
    metadata.workflow_run.head_repository_id === 1423239668, 'TARGET_FAILURE_ORIGINAL_ARTIFACT_REQUIRED');
}

function validateTargetFailureAudit(rows, descriptor, pin, targets) {
  const r = validateTargetFailureRecord(), p = r.run;
  check(objectDigest(pin) === objectDigest(p) && descriptor.runId === p.runId && descriptor.runAttempt === 1 &&
    descriptor.sha === p.executorSha && descriptor.artifactId === p.artifactId &&
    Array.isArray(rows) && rows.length === p.rowCount && objectDigest(rows) === p.rowsSha256 &&
    targets.render.id === r.originalIdentity.renderServiceId && targets.vercel.id === r.originalIdentity.vercelProjectId,
  'TARGET_FAILURE_ORIGINAL_AUDIT_REQUIRED');
  const expected = { ...r.originalIdentity, releaseRunId: p.runId, releaseRunAttempt: 1, executorSha: p.executorSha };
  const phases = name => rows.filter(row => row.phase === name);
  check(rows.every(row => Object.entries(expected).every(([key, value]) => row[key] === value)) &&
    phases('render-requesting').length === 1 && phases('render-requested').length === 1 &&
    phases('render-requested')[0].renderDeployId === r.renderOperation.deployId &&
    rows.findIndex(row => row.phase === 'render-requesting') < rows.findIndex(row => row.phase === 'render-requested') &&
    rows.at(-1).phase === 'failed' && rows.at(-1).code === p.terminalFailureCode && phases('failed').length === 1 &&
    !rows.some(row => row.phase === 'verified' || row.phase === 'render-ready' || row.phase.startsWith('vercel-')),
  'TARGET_FAILURE_EFFECT_CHANGED');
  return targetFailureProof(r);
}

// Only an authenticated historical proof can select this exception. It never
// supplies prior.renderDeployId or permits reusing/retrying the failed operation.
export function selectTargetFailure(reconciliations, candidate, targets) {
  const matches = (reconciliations ?? []).filter(row => row.runId === reconciledTargetFailureRunId);
  if (!matches.length) return null;
  const r = validateTargetFailureCandidate(candidate, targets);
  check(matches.length === 1 && objectDigest(matches[0]) === objectDigest(targetFailureProof(r)),
    'TARGET_FAILURE_PROOF_CHANGED');
  return matches[0];
}
// Only the renewed recovery-evidence policy for the already accepted candidate.
// Original reconciliation/audit policy hashes remain immutable historical facts.
const renewedRecoveryPolicy = Object.freeze({
  candidateSha: '1b748dfdaf3b63fb9dcc42f781ab79d5c39ca503',
  originalSha256: '1347eae6196a051311e773ae9c10b86c4491505ec4a5e4f2be055e8fdbf8adca',
  sha256: '717b071718a7032c49055673092c1aa62114055c3d5ab22a8708ef5ca509f840'
});
const matchesReconciledPolicy = (candidate, original) => candidate.policySha256 === original ||
  original === renewedRecoveryPolicy.originalSha256 && candidate.sha === renewedRecoveryPolicy.candidateSha &&
    candidate.policySha256 === renewedRecoveryPolicy.sha256 ||
  original === renewedRecoveryPolicy.originalSha256 && candidate.sha === readinessCandidateSha &&
    validateReadinessCandidate(candidate).previousCandidateSha === renewedRecoveryPolicy.candidateSha;

export function validateFailedRenderReconciliation(bytes = readFileSync(
  new URL('../../governance/render-failure-reconciliation-20261103.json', import.meta.url))) {
  check(Buffer.isBuffer(bytes) && sha256(bytes) === failedRenderDigest, 'FAILED_RENDER_RECORD_CHANGED');
  const record = JSON.parse(bytes);
  check(record.contract === 'aqua.exact-failed-render-operation-reconciliation' && record.version === 1 &&
    record.run.runId === '41527223264' && record.run.attempt === 1 && record.run.originalConclusion === 'failure' &&
    record.renderOperation.effect === 'REQUEST_ACKNOWLEDGED_AND_FAILURE_REPORTED' &&
    record.renderOperation.statuses.at(-1).state === 'failure' &&
    record.vercelOperation.effect === 'NO_MUTATION_INITIATED_BY_THIS_ATTEMPT' &&
    record.limitations.databaseWriteAbsence === 'NOT_ESTABLISHED_BY_DEPLOYMENT_FAILURE_OR_HEALTH' &&
    ['originalFailureRewritten', 'successfulReleasePredecessor', 'retryOrContinuationAuthority', 'deploymentAuthority']
      .every(key => record[key] === false), 'FAILED_RENDER_RECONCILIATION_REQUIRED');
  const prior = validateReconciliationRecords(), baseline = record.baselineRecordedBeforeAttempt;
  check(baseline.retainedObservationSha256 === pins['native-held-baseline-observation-20261102.json'] &&
    ['renderDeployId', 'renderSha', 'vercelDeployId', 'vercelSha'].every(key => baseline[key] === prior.heldPair[key]) &&
    record.postFailurePublicObservation.buildId === baseline.renderSha &&
    record.postFailurePublicObservation.apiHttpStatus === 200 && record.postFailurePublicObservation.apiStatus === 'Healthy' &&
    record.renderOperation.appId === 14658 && record.renderOperation.appSlug === 'render' &&
    record.renderOperation.statuses.every(status => status.exactRenderDeployLinked === true),
  'FAILED_RENDER_PROVIDER_EVIDENCE_REQUIRED');
  return record;
}

function validateFailedRenderContext(run, attempt, production, candidate, targets) {
  const record = validateFailedRenderReconciliation(), pin = record.run, identity = record.originalIdentity;
  check(String(run.id) === pin.runId && run.run_attempt === pin.attempt && attempt === pin.attempt &&
    run.run_number === pin.runNumber && run.head_sha === pin.executorSha && run.status === 'completed' &&
    run.conclusion === 'failure' && run.actor?.login === 'Xolani-M' && run.actor?.id === 86495928 &&
    run.repository?.full_name === identity.executorRepository && run.head_repository?.full_name === identity.executorRepository &&
    run.head_branch === 'main' && run.event === 'workflow_dispatch' && run.path === '.github/workflows/deploy.yml' &&
    run.name === 'Qualified production executor' && production.run_id === run.id && production.run_attempt === attempt &&
    production.status === 'completed' && production.conclusion === 'failure' && production.name === 'Unattended recovery release' &&
    production.steps?.filter(step => step.name === 'Revalidate policy, provenance, providers and recovery before automatic deployment' &&
      step.conclusion === 'failure').length === 1, 'FAILED_RENDER_EXECUTION_CHANGED');
  check(candidate.memberRelease === undefined && (candidate.sha === record.acceptedCandidateSha ||
    candidate.sha === readinessCandidateSha && validateReadinessCandidate(candidate).previousCandidateSha === record.acceptedCandidateSha) &&
    matchesReconciledPolicy(candidate, record.policySha256) && candidate.executorRepository === identity.executorRepository &&
    candidate.repository === identity.repository && candidate.environment === identity.environment && candidate.profile === identity.profile &&
    candidate.renderServiceId === identity.renderServiceId && candidate.vercelProjectId === identity.vercelProjectId &&
    candidate.vercelTeamId === identity.vercelTeamId && targets.repository === identity.repository &&
    targets.executor?.repository === identity.executorRepository && targets.render.id === identity.renderServiceId &&
    targets.vercel.id === identity.vercelProjectId && targets.vercel.teamId === identity.vercelTeamId &&
    targets.vercel.productionUrl === 'https://www.aqualifestyleclub.co.za' &&
    targets.vercel.rootDirectory === 'AqualLifeStyle/9.4.2/aqua-frontend',
  'FAILED_RENDER_CANDIDATE_OR_TARGETS_CHANGED');
  return pin;
}

function validateFailedRenderArtifact(pin, descriptor, metadata) {
  const record = validateFailedRenderReconciliation();
  check(objectDigest(pin) === objectDigest(record.run) && descriptor.runId === pin.runId &&
    descriptor.runAttempt === pin.attempt && descriptor.sha === pin.executorSha && descriptor.artifactId === pin.artifactId &&
    String(metadata.id) === pin.artifactId && metadata.digest === 'sha256:' + pin.archiveSha256 &&
    metadata.workflow_run?.repository_id === 1423239668 && metadata.workflow_run?.head_repository_id === 1423239668,
  'FAILED_RENDER_ORIGINAL_ARTIFACT_REQUIRED');
}

function validateFailedRenderAudit(rows, descriptor, pin, targets) {
  const record = validateFailedRenderReconciliation(), identity = record.originalIdentity, baseline = record.baselineRecordedBeforeAttempt;
  check(objectDigest(pin) === objectDigest(record.run) && descriptor.runId === pin.runId && descriptor.runAttempt === pin.attempt &&
    descriptor.sha === pin.executorSha && descriptor.artifactId === pin.artifactId && Array.isArray(rows) &&
    rows.length === pin.rowCount && objectDigest(rows) === pin.rowsSha256 && targets.render.id === identity.renderServiceId &&
    targets.vercel.id === identity.vercelProjectId && targets.vercel.teamId === identity.vercelTeamId,
  'FAILED_RENDER_ORIGINAL_AUDIT_REQUIRED');
  const expected = { ...identity, releaseRunId: pin.runId, releaseRunAttempt: pin.attempt,
    executorSha: pin.executorSha, policySha256: record.policySha256 };
  const phases = name => rows.filter(row => row.phase === name);
  check(rows.every(row => Object.entries(expected).every(([key, value]) => row[key] === value) && row.memberRelease === undefined &&
    row.vercelDeployId === undefined && (row.renderDeployId === undefined || row.renderDeployId === record.renderOperation.deployId) &&
    (row.baselineRenderDeployId === undefined || row.baselineRenderDeployId === baseline.renderDeployId) &&
    (row.baselineVercelDeployId === undefined || row.baselineVercelDeployId === baseline.vercelDeployId)) &&
    rows[0].phase === 'evidence-selected' && rows.at(-1).phase === 'failed' && rows.at(-1).code === pin.terminalFailureCode &&
    phases('failed').length === 1 && phases('render-requesting').length === 1 && phases('render-requested').length === 1 &&
    phases('render-requested')[0].renderDeployId === record.renderOperation.deployId &&
    rows.findIndex(row => row.phase === 'render-requesting') < rows.findIndex(row => row.phase === 'render-requested') &&
    phases('render-ready').length === 0 && phases('verified').length === 0 && !rows.some(row => row.phase.startsWith('vercel-')),
  'FAILED_RENDER_EFFECT_OR_FAILURE_CHANGED');
  return Object.freeze({ runId: pin.runId, runAttempt: pin.attempt, executorSha: pin.executorSha,
    artifactId: pin.artifactId, archiveSha256: pin.archiveSha256, rowsSha256: pin.rowsSha256,
    originalConclusion: 'failure', terminalFailureCode: pin.terminalFailureCode,
    outcome: 'ACKNOWLEDGED_RENDER_FAILURE_NO_VERCEL_REQUEST', renderDeployId: record.renderOperation.deployId,
    reconciliationSha256: failedRenderDigest, successfulFullReleasePredecessor: false,
    replayAuthority: false, deploymentAuthority: false });
}

// Fixed reviewed local records, never URLs, dispatch fields or candidate content.
// Historical resolution does not refresh an observation's original timestamp.
export function validateReconciliationRecords(bytes = Object.fromEntries(Object.keys(pins).map(name =>
  [name, readFileSync(new URL('../../governance/' + name, import.meta.url))]))) {
  const records = Object.entries(pins).map(([name, digest]) => {
    check(Buffer.isBuffer(bytes[name]) && sha256(bytes[name]) === digest, 'IMMUTABLE_RECORD_CHANGED');
    return JSON.parse(bytes[name]);
  });
  const [authority, record, observed, frontend] = records;
  check(authority.businessDecisionStatus === 'CONFIRMED' &&
    authority.decision.smallestExecutorOwnedRecognitionAmendmentAuthorized === true &&
    authority.decision.generalFailedDeploymentExceptionAuthorized === false &&
    authority.decision.successfulFullReleasePredecessorStatusGranted === false &&
    authority.decision.replayOrDeploymentAuthorityGranted === false &&
    objectDigest(authority.decision.exactRunAttemptsOnly) === objectDigest(record.runs.map(r =>
      ({ runId: r.runId, attempt: r.attempt }))) &&
    record.contract === 'aqua.exact-historical-release-reconciliation' && record.version === 1 &&
    record.runs.length === 2 && record.runs.every(r => r.attempt === 1 && r.historicalRunConclusion === 'failure' &&
      Array.isArray(r.unresolvedEffects) && r.unresolvedEffects.length === 0) &&
    Array.isArray(record.unresolvedMaterialProviderEffectsIdentified) && record.unresolvedMaterialProviderEffectsIdentified.length === 0 &&
    ['originalFailuresRewritten', 'successfulFullReleasePredecessor', 'replayAuthority', 'deploymentAuthority']
      .every(k => record[k] === false), 'EXACT_OWNER_AUTHORITY_REQUIRED');
  const p = record.heldPair, o = record.retainedObservation, f = record.retainedFrontendQualification, v = observed.verification;
  check(observed.protectedObservationSha256 === o.protectedRecordSha256 && observed.observedAt === o.observedAt &&
    observed.producer.runId === o.runId && observed.producer.runAttempt === o.attempt && observed.producer.executorSha === o.executorSha &&
    observed.producer.result === 'success' && observed.producer.actor === 'Xolani-M' && observed.producer.actorId === 86495928 &&
    observed.producer.workflow === 'provider-credential-check.yml' && observed.producer.mode === 'native-recovery-readback' &&
    objectDigest(observed.baseline) === objectDigest(p) && v.allAuthenticatedGetChecksSucceeded === true &&
    v.exactRenderRevisionLiveAndHealthy === true && v.exactVercelDeploymentReady === true &&
    v.projectTeamRootAndAuthoritativeDomainMappingVerifiedBeforeAndAfter === true && v.operationalHoldsVerified === true &&
    frontend.qualificationResult === 'PASS' && frontend.protectedQualificationRecordSha256 === f.protectedRecordSha256 &&
    frontend.observedAt === f.observedAt && frontend.deploymentId === p.vercelDeployId && frontend.sourceSha === p.vercelSha &&
    frontend.renderReceiverSha === p.renderSha && frontend.sourceProofSha256 === f.sourceProofSha256 &&
    frontend.originalAuditArtifactId === record.runs[1].artifactId && frontend.originalAuditArchiveSha256 === record.runs[1].archiveSha256 &&
    frontend.producingExecutorSha === record.runs[1].executorSha &&
    observed.frontendSource.qualificationRecordSha256 === f.protectedRecordSha256 &&
    observed.frontendSource.sourceProofSha256 === f.sourceProofSha256, 'QUALIFIED_PROVIDER_OBSERVATIONS_REQUIRED');
  return record;
}

export function isReconciledHistoricalRun(runId) {
  return ['40850715880', '40883686654', '41527223264', '41822854444', '41868204651',
    reconciledTargetFailureRunId, interruptedSuccessorRunId].includes(String(runId));
}

export function validateHistoricalContext(run, attempt, production, candidate, targets) {
  if (String(run.id) === interruptedSuccessorRunId) {
    const r = validateInterruptedSuccessorRecord(), o = r.originalRun, s = r.source;
    check(run.id === Number(o.id) && run.run_number === o.number && run.run_attempt === o.attempt && attempt === o.attempt &&
      run.head_sha === o.executorSha && run.status === 'completed' && run.conclusion === o.conclusion &&
      run.actor?.login === o.actor.login && run.actor?.id === o.actor.id &&
      run.repository?.full_name === 'aqua-lifestyle/aqua-deployment' &&
      run.head_repository?.full_name === 'aqua-lifestyle/aqua-deployment' &&
      run.head_branch === 'main' && run.event === 'workflow_dispatch' &&
      run.path === '.github/workflows/deploy.yml' && run.name === 'Qualified production executor' &&
      production.id === Number(o.productionJobId) && production.run_id === run.id &&
      production.run_attempt === attempt && production.status === 'completed' &&
      production.conclusion === o.productionConclusion && production.name === 'Unattended recovery release' &&
      production.steps?.filter(step => step.conclusion === 'failure').length === 1 &&
      production.steps.filter(step => step.name ===
        'Revalidate policy, provenance, providers and recovery before automatic deployment' &&
        step.conclusion === 'failure').length === 1,
    'INTERRUPTED_SUCCESSOR_EXECUTION_CHANGED');
    check(candidate.qualificationOnly === false && candidate.memberRelease === undefined &&
      candidate.frontendRelease === undefined && candidate.backendSuccessor === s.backendSuccessor &&
      candidate.combinedRelease === s.combinedRelease && candidate.sha === s.sha &&
      candidate.repository === s.repository && candidate.releaseRunAttempt === 1 &&
      candidate.releaseRunId !== o.id && candidate.executorSha !== o.executorSha &&
      candidate.policySha256 === o.policySha256 &&
      candidate.environment === r.scope.environment && candidate.profile === r.scope.profile &&
      candidate.renderServiceId === r.scope.renderServiceId &&
      candidate.vercelProjectId === r.scope.vercelProjectId && candidate.vercelTeamId === r.scope.vercelTeamId &&
      candidate.executorRepository === 'aqua-lifestyle/aqua-deployment' &&
      targets.repository === s.repository && targets.executor?.repository === candidate.executorRepository &&
      targets.render.id === r.scope.renderServiceId && targets.vercel.id === r.scope.vercelProjectId &&
      targets.vercel.teamId === r.scope.vercelTeamId,
    'INTERRUPTED_SUCCESSOR_CANDIDATE_OR_TARGET_CHANGED');
    return o;
  }
  if (String(run.id) === reconciledTargetFailureRunId) return validateTargetFailureContext(run, attempt, production, candidate, targets);
  if (['41822854444','41868204651'].includes(String(run.id))) return validateReadinessFailureContext(run, attempt, production, candidate);
  if (String(run.id) === '41527223264') return validateFailedRenderContext(run, attempt, production, candidate, targets);
  const record = validateReconciliationRecords(), p = record.heldPair;
  const pin = record.runs.find(r => r.runId === String(run.id));
  check(pin && run.run_attempt === pin.attempt && attempt === pin.attempt && run.run_number === pin.runNumber &&
    run.head_sha === pin.executorSha && run.status === 'completed' && run.conclusion === 'failure' &&
    run.actor?.login === 'Xolani-M' && run.actor?.id === 86495928 &&
    run.repository?.full_name === 'aqua-lifestyle/aqua-deployment' && run.head_repository?.full_name === 'aqua-lifestyle/aqua-deployment' &&
    run.head_branch === 'main' && run.event === 'workflow_dispatch' && run.path === '.github/workflows/deploy.yml' &&
    run.name === 'Qualified production executor' && production.run_id === run.id && production.run_attempt === attempt &&
    production.status === 'completed' && production.conclusion === 'failure' && production.name === 'Unattended recovery release' &&
    production.steps?.filter(s => s.name === 'Revalidate policy, provenance, providers and recovery before automatic deployment' &&
      s.conclusion === 'failure').length === 1, 'FAILED_RUN_OR_EXECUTION_CHANGED');
  const carried = validateFailedRenderReconciliation();
  const acceptedSource = candidate.sha === record.candidateSha ||
    candidate.sha === readinessCandidateSha && validateReadinessCandidate(candidate).previousCandidateSha === carried.acceptedCandidateSha &&
      carried.carryForwardExactHistoricalRuns.includes(String(run.id)) ||
    candidate.sha === carried.acceptedCandidateSha && matchesReconciledPolicy(candidate, carried.policySha256) &&
      carried.carryForwardExactHistoricalRuns.includes(String(run.id));
  check(candidate.memberRelease === undefined && acceptedSource && matchesReconciledPolicy(candidate, record.policySha256) &&
    candidate.executorRepository === 'aqua-lifestyle/aqua-deployment' && candidate.environment === record.originalIdentity.environment &&
    candidate.profile === record.originalIdentity.profile &&
    candidate.renderServiceId === p.renderServiceId && candidate.vercelProjectId === p.vercelProjectId && candidate.vercelTeamId === p.vercelTeamId &&
    targets.repository === record.originalIdentity.repository && targets.executor?.repository === candidate.executorRepository &&
    targets.render.id === p.renderServiceId && targets.vercel.id === p.vercelProjectId && targets.vercel.teamId === p.vercelTeamId &&
    targets.vercel.productionUrl === 'https://' + p.productionDomain && targets.vercel.rootDirectory === p.rootDirectory,
  'EXACT_CANDIDATE_AND_TARGETS_REQUIRED');
  return pin;
}

export function validateHistoricalArtifact(pin, descriptor, metadata) {
  if (pin.id === interruptedSuccessorRunId) {
    const r = validateInterruptedSuccessorRecord(), o = r.originalRun, a = r.originalAudit;
    check(objectDigest(pin) === objectDigest(o) && descriptor.runId === o.id &&
      descriptor.runAttempt === o.attempt && descriptor.sha === o.executorSha && descriptor.artifactId === a.artifactId &&
      String(metadata?.id) === a.artifactId && metadata.name === `production-release-audit-${o.id}-1` &&
      metadata.expired === false && metadata.digest === 'sha256:' + a.archiveSha256 &&
      metadata.workflow_run?.id === Number(o.id) && metadata.workflow_run.head_sha === o.executorSha &&
      metadata.workflow_run.head_branch === 'main' && metadata.workflow_run.repository_id === 1423239668 &&
      metadata.workflow_run.head_repository_id === 1423239668,
    'INTERRUPTED_SUCCESSOR_ARTIFACT_CHANGED');
    return;
  }
  if (pin.runId === reconciledTargetFailureRunId) return validateTargetFailureArtifact(pin, descriptor, metadata);
  if (['41822854444','41868204651'].includes(pin.runId)) return validateReadinessFailureArtifact(pin, descriptor, metadata);
  if (pin.runId === '41527223264') return validateFailedRenderArtifact(pin, descriptor, metadata);
  const record = validateReconciliationRecords();
  check(objectDigest(pin) === objectDigest(record.runs.find(r => r.runId === pin.runId)) &&
    descriptor.runId === pin.runId && descriptor.runAttempt === pin.attempt && descriptor.sha === pin.executorSha &&
    descriptor.artifactId === pin.artifactId && String(metadata.id) === pin.artifactId &&
    metadata.digest === 'sha256:' + pin.archiveSha256 && metadata.workflow_run?.repository_id === record.executorRepositoryId &&
    metadata.workflow_run?.head_repository_id === record.executorRepositoryId, 'ORIGINAL_ARTIFACT_REQUIRED');
}

// Injectable only for synthetic contract tests. The released history path always
// calls this with the whole-file-pinned record, never candidate-supplied data.
export function validateInterruptedSuccessorAudit(rows, descriptor, pin, targets, diagnosticProof,
  r = validateInterruptedSuccessorRecord()) {
  const o = r.originalRun, a = r.originalAudit, s = r.source;
  const expected = { version: 4, repository: s.repository, sha: s.sha, ciRunId: s.ciRunId,
    ciRunAttempt: s.ciRunAttempt, releaseRunId: o.id, releaseRunAttempt: o.attempt,
    executorRepository: 'aqua-lifestyle/aqua-deployment', executorSha: o.executorSha,
    policySha256: o.policySha256, environment: r.scope.environment, profile: r.scope.profile,
    renderServiceId: r.scope.renderServiceId, vercelProjectId: r.scope.vercelProjectId,
    vercelTeamId: r.scope.vercelTeamId, backendSuccessor: s.backendSuccessor,
    combinedRelease: s.combinedRelease };
  const approvedDiagnostic = { runId: r.diagnostic.runId, jobId: r.diagnostic.jobId,
    executorSha: r.diagnostic.executorSha, jobLogSha256: r.diagnostic.jobLogSha256,
    stagingRowSha256: r.diagnostic.stagingRowSha256,
    commissionedRowSha256: r.diagnostic.commissionedRowSha256, payload: 'MATCH', pin: 'UNVERIFIED',
    liveRenderDeployId: r.diagnostic.liveRenderDeployId, liveRenderSha: r.diagnostic.liveRenderSha,
    renderHistorySha256: r.diagnostic.renderHistorySha256,
    observedAt: r.diagnostic.stagingObservedAt };
  check(objectDigest(pin) === objectDigest(o) && descriptor.runId === o.id &&
    descriptor.runAttempt === o.attempt && descriptor.sha === o.executorSha &&
    descriptor.artifactId === a.artifactId && Array.isArray(rows) &&
    rows.length === a.phases.length && objectDigest(rows) === a.rowsSha256 &&
    rows.every((row, index) => row.phase === a.phases[index] &&
      Object.entries(expected).every(([key, value]) => row[key] === value) &&
      row.renderDeployId === undefined && row.vercelDeployId === undefined && row.jobId === undefined) &&
    rows[1].baselineRenderDeployId === a.baselineRenderDeployId &&
    rows[1].baselineRenderSha === a.baselineRenderSha && rows[3].schemaTransition === a.schemaTransition &&
    rows[4].stagedSchemaTransition === a.stagedSchemaTransition &&
    rows[4].payloadPinSha256 === a.payloadPinSha256 && rows[4].payloadBytes === a.payloadBytes &&
    rows.at(-1).code === o.terminalCode &&
    targets.render.id === r.scope.renderServiceId && targets.vercel.id === r.scope.vercelProjectId &&
    targets.vercel.teamId === r.scope.vercelTeamId &&
    authenticatedSuccessorDiagnostics.has(diagnosticProof) &&
    objectDigest(diagnosticProof) === objectDigest(approvedDiagnostic),
  'INTERRUPTED_SUCCESSOR_EFFECT_UNVERIFIABLE');
  return Object.freeze({ runId: o.id, runAttempt: o.attempt, executorSha: o.executorSha,
    artifactId: a.artifactId, archiveSha256: a.archiveSha256, rowsSha256: a.rowsSha256,
    originalConclusion: 'failure', terminalFailureCode: o.terminalCode, outcome: r.scope.outcome,
    payload: 'MATCH', pin: 'UNVERIFIED', baselineRenderDeployId: a.baselineRenderDeployId,
    diagnosticRunId: r.diagnostic.runId, diagnosticLogSha256: r.diagnostic.jobLogSha256,
    renderHistorySha256: r.diagnostic.renderHistorySha256,
    noRecordedPostRunDeployment: true, configurationTriggeredRestartAbsenceEstablished: false,
    databaseWriteAbsenceEstablishedByHealth: false,
    reconciliationSha256: interruptedSuccessorDigest, successfulFullReleasePredecessor: false,
    automaticResumeAuthorized: false, replayAuthority: false, deploymentAuthority: false,
    migrationAuthority: false, financialAuthority: false });
}

export function validateHistoricalAudit(rows, descriptor, pin, targets, diagnosticProof) {
  if (pin.id === interruptedSuccessorRunId)
    return validateInterruptedSuccessorAudit(rows, descriptor, pin, targets, diagnosticProof);
  if (pin.runId === reconciledTargetFailureRunId) return validateTargetFailureAudit(rows, descriptor, pin, targets);
  if (['41822854444','41868204651'].includes(pin.runId)) return validateReadinessFailureAudit(rows, descriptor, pin);
  if (pin.runId === '41527223264') return validateFailedRenderAudit(rows, descriptor, pin, targets);
  const record = validateReconciliationRecords(), p = record.heldPair;
  check(objectDigest(pin) === objectDigest(record.runs.find(r => r.runId === pin.runId)) &&
    descriptor.runId === pin.runId && descriptor.runAttempt === pin.attempt && descriptor.sha === pin.executorSha &&
    descriptor.artifactId === pin.artifactId && Array.isArray(rows) && rows.length > 0 && rows.length <= 500 &&
    objectDigest(rows) === pin.rowsSha256, 'ORIGINAL_AUDIT_CHANGED');
  const identity = { ...record.originalIdentity, releaseRunId: pin.runId, releaseRunAttempt: pin.attempt,
    executorSha: pin.executorSha, renderServiceId: p.renderServiceId, vercelProjectId: p.vercelProjectId, vercelTeamId: p.vercelTeamId };
  // The final historical failure row omitted receiverSha; every supplied value
  // must still match, and the original immutable whole-audit digest is mandatory.
  check(rows.every(r => Object.entries(identity).every(([key, value]) =>
    key === 'receiverSha' && r[key] === undefined || r[key] === value)) &&
    rows[0].receiverSha === p.renderSha && rows.at(-1).phase === 'failed' && rows.at(-1).code === pin.terminalFailureCode &&
    rows.filter(r => r.phase === 'failed').length === 1 &&
    rows.every(r => (r.renderDeployId === undefined || r.renderDeployId === p.renderDeployId) &&
      (r.vercelDeployId === undefined || r.vercelDeployId === p.vercelDeployId)), 'AUDIT_IDENTITY_OR_FAILURE_CHANGED');
  if (pin.runId === '40850715880') {
    validateMemberContinuation(rows, descriptor);
    check(rows.filter(r => r.phase === 'member-render-requesting').length === 1 &&
      rows.filter(r => r.phase === 'member-render-requested').length === 1 &&
      !rows.some(r => r.phase.startsWith('member-vercel')), 'RENDER_EFFECT_NOT_RESOLVED');
  } else {
    const phase = name => rows.filter(r => r.phase === name);
    check(phase('member-render-requesting').length === 0 && phase('member-render-requested').length === 0 &&
      phase('member-render-reconciled').length === 1 &&
      objectDigest(phase('member-render-reconciled')[0].continuation) === objectDigest({ ...memberContinuation,
        receiverSha: memberPolicy.receiverSha, frontendSha: memberPolicy.frontendSha }) &&
      ['member-vercel-files-requesting', 'member-vercel-files-uploaded', 'member-vercel-requesting', 'member-vercel-requested']
        .every(name => phase(name).length === 1) && phase('member-vercel-requested')[0].vercelDeployId === p.vercelDeployId,
    'FRONTEND_EFFECT_NOT_RESOLVED');
    const proof = phase('member-vercel-files-requesting')[0].vercelSourceProof;
    validateFrontendProof(proof, p.vercelSha, targets.vercel);
    check(record.originalIdentity.memberRelease === memberPolicyDigest && objectDigest(proof) === record.retainedFrontendQualification.sourceProofSha256 &&
      rows.every(r => r.vercelSourceProof === undefined || objectDigest(r.vercelSourceProof) === objectDigest(proof)), 'FRONTEND_SOURCE_CHANGED');
  }
  return Object.freeze({ runId: pin.runId, runAttempt: pin.attempt, executorSha: pin.executorSha,
    artifactId: pin.artifactId, archiveSha256: pin.archiveSha256, rowsSha256: pin.rowsSha256,
    originalConclusion: 'failure', terminalFailureCode: pin.terminalFailureCode, outcome: pin.outcome,
    reconciliationSha256: pins['historical-release-reconciliation-20261102.json'],
    authoritySha256: pins['historical-release-reconciliation-authority-20261102.json'],
    observationSha256: record.retainedObservation.sha256, frontendQualificationSha256: record.retainedFrontendQualification.sha256,
    successfulFullReleasePredecessor: false, replayAuthority: false, deploymentAuthority: false });
}
