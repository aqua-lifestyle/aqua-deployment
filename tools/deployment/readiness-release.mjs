// Exact reviewed successor of the partial backend. Historical facts are retained;
// this is neither a generic descendant exception nor evidence of current state.
import { readFileSync } from 'node:fs';
import { objectDigest, sha256 } from './github-evidence.mjs';

export const readinessCandidateSha = '2488682e7f36828c380b2f962f29b9f9b4cb6384';
export const readinessRecordDigest = 'da6502bd20c0df2c4ea1a151b995e5ea997ae58b3cf424c7cec0cb12c1785919';
export class ReadinessReleaseDenied extends Error {}
const check = (ok, code) => { if (!ok) throw new ReadinessReleaseDenied(code); };
export function readinessRelease(bytes = readFileSync(new URL('../../governance/readiness-release-20261104.json', import.meta.url))) {
  check(Buffer.isBuffer(bytes) && sha256(bytes) === readinessRecordDigest, 'READINESS_RELEASE_RECORD_CHANGED');
  return JSON.parse(bytes);
}
export function validateReadinessCandidate(q) {
  const r = readinessRelease();
  check(q.sha === r.candidateSha && q.ciRunId === r.ciRunId && q.ciRunAttempt === r.ciRunAttempt &&
    q.memberRelease === undefined && q.policySha256 === r.policySha256 &&
    q.repository === 'aqua-lifestyle/aqua-lifestyle' && q.executorRepository === 'aqua-lifestyle/aqua-deployment' &&
    q.environment === 'production-release' && q.profile === 'normal-integrated' &&
    q.renderServiceId === 'srv-d9f0k8e1a83c73d8n1b0' && q.vercelProjectId === 'prj_6qL1e43KhsWrRshY5GxdmGl3HGMz' &&
    q.vercelTeamId === 'team_Hc3BWfhTLfwLzwbgbtaasBUY', 'READINESS_RELEASE_EXACT_SCOPE_REQUIRED');
  return r;
}
export function readinessStartingBackend(q, originalProof) {
  const r = validateReadinessCandidate(q);
  check(objectDigest(originalProof) === r.originalPartialProofSha256, 'READINESS_RELEASE_ORIGINAL_PARTIAL_REQUIRED');
  return { ...r.startingBackend, recoveryBaseline: originalProof.baseline,
    candidateSha: r.candidateSha, bindingSha256: readinessRecordDigest };
}
export function validateReadinessStartingBackend(proof, q) {
  const r = validateReadinessCandidate(q);
  check(proof && proof.bindingSha256 === readinessRecordDigest && proof.candidateSha === q.sha &&
    Object.entries(r.startingBackend).every(([k,v]) => proof[k] === v) &&
    proof.recoveryBaseline?.firstReleaseRecoveryEvidenceSha256 === r.recoveryReadbackSha256,
  'READINESS_RELEASE_STARTING_BACKEND_CHANGED');
  return r;
}
export function validateReadinessStartingAudit(row) {
  const r = validateReadinessCandidate(row);
  check(row.startingBackendBindingSha256 === readinessRecordDigest &&
    row.startingRenderDeployId === r.startingBackend.renderDeployId && row.startingRenderSha === r.startingBackend.renderSha,
  'READINESS_RELEASE_STARTING_BACKEND_CHANGED');
}

export function validateReadinessFailureContext(run, attempt, production, q) {
  const r = validateReadinessCandidate(q), p = r.readinessFailure;
  check(String(run.id) === p.runId && run.run_number === p.runNumber && run.run_attempt === 1 && attempt === 1 &&
    run.head_sha === p.executorSha && run.status === 'completed' && run.conclusion === 'failure' &&
    run.actor?.login === 'Xolani-M' && run.actor?.id === 86495928 &&
    run.repository?.full_name === q.executorRepository && run.head_repository?.full_name === q.executorRepository &&
    run.event === 'workflow_dispatch' && run.head_branch === 'main' && run.path === '.github/workflows/deploy.yml' &&
    run.name === 'Qualified production executor' && production.id === p.productionJobId &&
    production.run_id === run.id && production.run_attempt === 1 && production.status === 'completed' &&
    production.conclusion === 'failure' && production.name === 'Unattended recovery release' &&
    production.steps?.filter(s => s.name === 'Revalidate policy, provenance, providers and recovery before automatic deployment' && s.conclusion === 'failure').length === 1,
  'READINESS_FAILURE_EXECUTION_CHANGED');
  return p;
}
export function validateReadinessFailureArtifact(pin, descriptor, metadata) {
  const p = readinessRelease().readinessFailure;
  check(objectDigest(pin) === objectDigest(p) && descriptor.runId === p.runId && descriptor.runAttempt === 1 &&
    descriptor.sha === p.executorSha && descriptor.artifactId === p.artifactId && String(metadata.id) === p.artifactId &&
    metadata.digest === 'sha256:' + p.archiveSha256 && metadata.workflow_run?.repository_id === 1423239668 &&
    metadata.workflow_run?.head_repository_id === 1423239668, 'READINESS_FAILURE_ARTIFACT_CHANGED');
}
export function validateReadinessFailureAudit(rows, descriptor, pin) {
  const r = readinessRelease(), p = r.readinessFailure;
  check(objectDigest(pin) === objectDigest(p) && descriptor.runId === p.runId && descriptor.runAttempt === 1 &&
    descriptor.sha === p.executorSha && descriptor.artifactId === p.artifactId && rows.length === p.rowCount &&
    objectDigest(rows) === p.rowsSha256 && rows.every(row => row.sha === r.previousCandidateSha &&
      row.releaseRunId === p.runId && row.releaseRunAttempt === 1 && row.executorSha === p.executorSha &&
      row.renderDeployId === r.startingBackend.renderDeployId && row.renderOriginRunId === r.startingBackend.originalRunId &&
      row.vercelDeployId === undefined && objectDigest(row.renderReconciliation) === r.originalPartialProofSha256) &&
    rows.filter(row => row.phase === 'render-reconciled').length === 1 &&
    !rows.some(row => ['render-requesting','render-requested','verified'].includes(row.phase) || row.phase.startsWith('vercel-')) &&
    rows.at(-1).phase === 'failed' && rows.at(-1).code === p.terminalFailureCode,
  'READINESS_FAILURE_AUDIT_CHANGED');
  return { runId: p.runId, runAttempt: 1, originalConclusion: 'failure', terminalFailureCode: p.terminalFailureCode,
    artifactId: p.artifactId, archiveSha256: p.archiveSha256, rowsSha256: p.rowsSha256,
    successfulFullReleasePredecessor: false, deploymentAuthority: false, bindingSha256: readinessRecordDigest };
}
