// One reviewed historical exception. No caller-selected record, missing-artifact
// fallback, observation refresh, successful predecessor or provider-write permit.
import { readFileSync } from 'node:fs';
import { objectDigest, sha256 } from './github-evidence.mjs';
import { HistoricalReconciliationDenied } from './historical-release-reconciliation.mjs';

export const partialReleaseRunId = '41798557430';
export const partialReconciliationSha256 = 'ff401ecaf71e29c009768a1aaba14c1cf167cd270b2784932feb7f75b8eac9cb';
const check = (ok, detail) => { if (!ok) throw new HistoricalReconciliationDenied(
  'UNVERIFIED_PRIOR_RELEASE_REQUIRES_RECONCILIATION:' + detail); };

export function partialReleaseRecord(bytes = readFileSync(
  new URL('../../governance/partial-release-41798557430.json', import.meta.url))) {
  check(Buffer.isBuffer(bytes) && sha256(bytes) === partialReconciliationSha256, 'PARTIAL_RECORD_CHANGED');
  const record = JSON.parse(bytes), a = record.retainedAudit;
  // Lossless canonical representation, not fabricated original JSONL/ZIP bytes.
  const rows = a.events.map((event, i) => ({ ...a.common,
    ...(i + 1 >= a.baselineStartsAtRow ? a.baseline : {}),
    ...(i + 1 >= a.renderStartsAtRow ? a.render : {}), ...event }));
  check(rows.length === record.originalArtifact.rowCount && objectDigest(rows) === record.originalArtifact.rowsSha256,
    'PARTIAL_RETAINED_AUDIT_CHANGED');
  return record;
}

export function partialRenderProof() {
  const r = partialReleaseRecord();
  return { runId: r.run.runId, runAttempt: 1, executorSha: r.run.executorSha,
    renderDeployId: r.renderOperation.deployId, sourceSha: r.renderOperation.sha,
    reconciliationSha256: partialReconciliationSha256,
    originalConclusion: 'failure', originalFailures: r.run.attempts.map(a => ({
      runAttempt: a.attempt, code: a.terminalFailureCode })),
    originalArtifactId: r.originalArtifact.id, archiveSha256: r.originalArtifact.archiveSha256,
    rowsSha256: r.originalArtifact.rowsSha256, limitations: r.limitations,
    baseline: r.retainedAudit.baseline, successfulFullReleasePredecessor: false,
    deploymentAuthority: false };
}

function validateCandidate(candidate, targets) {
  const c = partialReleaseRecord().retainedAudit.common;
  check(candidate.memberRelease === undefined && candidate.version === c.version &&
    ['repository', 'sha', 'ciRunId', 'ciRunAttempt', 'policySha256', 'environment', 'profile',
      'executorRepository', 'renderServiceId', 'vercelProjectId', 'vercelTeamId'].every(k => candidate[k] === c[k]) &&
    targets.repository === c.repository && targets.executor?.repository === c.executorRepository &&
    targets.render.id === c.renderServiceId && targets.vercel.id === c.vercelProjectId &&
    targets.vercel.teamId === c.vercelTeamId && targets.vercel.productionUrl === 'https://www.aqualifestyleclub.co.za' &&
    targets.vercel.rootDirectory === 'AqualLifeStyle/9.4.2/aqua-frontend', 'PARTIAL_CANDIDATE_OR_TARGETS_CHANGED');
}

export function validatePartialRenderOrigin(row, targets) {
  validateCandidate(row, targets);
  const proof = partialRenderProof();
  check(row.renderReconciliation && objectDigest(row.renderReconciliation) === objectDigest(proof) &&
    row.renderDeployId === proof.renderDeployId && row.renderReleaseRunAttempt === 1 &&
    row.renderOriginRunId === proof.runId && row.renderOriginExecutorSha === proof.executorSha &&
    row.releaseRunId !== proof.runId && row.executorSha !== proof.executorSha,
  'PARTIAL_RENDER_ORIGIN_CHANGED');
}

export function partialRenderReuse(proof, candidate, targets) {
  check(candidate.releaseRunAttempt === 1, 'PARTIAL_NEW_EXECUTION_REQUIRED');
  const prior = { renderDeployId: proof.renderDeployId, renderReleaseRunAttempt: 1,
    renderOriginRunId: proof.runId, renderOriginExecutorSha: proof.executorSha, renderReconciliation: proof };
  validatePartialRenderOrigin({ ...candidate, ...prior }, targets);
  return prior;
}

// GitHub-only admission reauthenticates both exact attempts with the existing
// executor job token (Actions/Checks read). Historical Render App snapshots and
// upload-log excerpts are reviewed record evidence, not freshly fetched ZIPs or
// source-PAT Deployments reads. Current Render state is checked by deploy().
export async function reconcilePartialRelease(api, run, originalAttempt, production, candidate, targets) {
  const r = partialReleaseRecord(), p = r.run;
  validateCandidate(candidate, targets);
  partialRenderReuse(partialRenderProof(), candidate, targets);
  check(String(run.id) === p.runId && run.run_number === p.runNumber && run.run_attempt === p.latestAttempt &&
    run.head_sha === p.executorSha && run.status === 'completed' && run.conclusion === 'failure' &&
    run.actor?.login === p.actor.login && run.actor?.id === p.actor.id && run.head_branch === 'main' &&
    run.event === 'workflow_dispatch' && run.path === '.github/workflows/deploy.yml' &&
    run.name === 'Qualified production executor' && run.repository?.id === p.executorRepositoryId &&
    run.head_repository?.id === p.executorRepositoryId &&
    run.repository.full_name === candidate.executorRepository && run.head_repository.full_name === candidate.executorRepository &&
    originalAttempt.id === run.id && originalAttempt.run_attempt === 1 &&
    originalAttempt.head_sha === run.head_sha && originalAttempt.run_number === run.run_number &&
    originalAttempt.actor?.login === p.actor.login && originalAttempt.actor?.id === p.actor.id &&
    originalAttempt.status === 'completed' && originalAttempt.conclusion === 'failure', 'PARTIAL_RUN_CHANGED');
  check(production.id === p.attempts[0].jobs[2].id && production.run_id === run.id &&
    production.run_attempt === 1 && production.status === 'completed' && production.conclusion === 'failure' &&
    production.steps?.filter(s => s.name === 'Revalidate policy, provenance, providers and recovery before automatic deployment' &&
      s.conclusion === 'failure').length === 1, 'PARTIAL_PRODUCTION_CHANGED');
  for (const pin of p.attempts) {
    const page = await api.executor(`/actions/runs/${p.runId}/attempts/${pin.attempt}/jobs?per_page=100`);
    check(page.total_count === 3 && page.jobs?.length === 3 && pin.jobs.every(expected =>
      page.jobs.filter(job => job.id === expected.id && job.name === expected.name &&
        job.conclusion === expected.conclusion && job.status === 'completed' &&
        job.run_id === run.id && job.run_attempt === pin.attempt).length === 1), 'PARTIAL_ATTEMPT_EXECUTION_CHANGED');
    const annotations = await api.executor(`/check-runs/${pin.failureCheckRunId}/annotations?per_page=100`);
    // A full page could conceal further failures. Informational notices do not
    // change the required failure set; unknown severities are not informational.
    check(Array.isArray(annotations) && annotations.length < 100 && annotations.every(a => a &&
      ['notice', 'warning', 'failure'].includes(a.annotation_level) && typeof a.message === 'string'),
    'PARTIAL_ORIGINAL_FAILURE_CHANGED');
    const failures = annotations.filter(a => a.annotation_level === 'failure');
    check(failures.length === 2 &&
      failures.filter(a => a.message === 'Process completed with exit code 1.').length === 1 &&
      failures.filter(a =>
        a.message === `${pin.terminalFailureCode}. See the safe-release runbook; do not resume or retry provider requests blindly.`).length === 1,
    'PARTIAL_ORIGINAL_FAILURE_CHANGED');
  }
  const current = await api.executor(`/actions/runs/${p.runId}`);
  check(current.id === run.id && current.run_attempt === p.latestAttempt && current.head_sha === p.executorSha &&
    current.status === 'completed' && current.conclusion === 'failure', 'PARTIAL_RUN_CHANGED_DURING_READ');
  return partialRenderProof();
}
