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
  return ['40850715880', '40883686654', '41527223264', '41822854444', '41868204651'].includes(String(runId));
}

export function validateHistoricalContext(run, attempt, production, candidate, targets) {
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
  if (['41822854444','41868204651'].includes(pin.runId)) return validateReadinessFailureArtifact(pin, descriptor, metadata);
  if (pin.runId === '41527223264') return validateFailedRenderArtifact(pin, descriptor, metadata);
  const record = validateReconciliationRecords();
  check(objectDigest(pin) === objectDigest(record.runs.find(r => r.runId === pin.runId)) &&
    descriptor.runId === pin.runId && descriptor.runAttempt === pin.attempt && descriptor.sha === pin.executorSha &&
    descriptor.artifactId === pin.artifactId && String(metadata.id) === pin.artifactId &&
    metadata.digest === 'sha256:' + pin.archiveSha256 && metadata.workflow_run?.repository_id === record.executorRepositoryId &&
    metadata.workflow_run?.head_repository_id === record.executorRepositoryId, 'ORIGINAL_ARTIFACT_REQUIRED');
}

export function validateHistoricalAudit(rows, descriptor, pin, targets) {
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
