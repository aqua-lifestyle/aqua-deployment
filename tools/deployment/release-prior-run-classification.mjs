// General owner-authorized classification of prior FAILED release runs.
// Recognizes a prior run only when authenticated, complete execution evidence
// proves that no mutation-capable provider stage was ever entered or initiated.
// Uncertain or attempted writes still require reconciliation. Recognition is
// factual: it is never a successful release, retry continuation, replay
// permit, deployment authority or provider-effect reconciliation.
import { readFileSync } from 'node:fs';
import { objectDigest, sha256 } from './github-evidence.mjs';

export class PriorRunNotRecognized extends Error {}
const check = (ok, code) => { if (!ok) throw new PriorRunNotRecognized('PRIOR_RUN_NOT_RECOGNIZED:' + code); };

const authorityPin =
  'ef9e8877e5078576bd694841a9bfb3a011337a86c2ce6054857aa7dbcd694423';

export function validateRecognitionAuthority(bytes = readFileSync(
  new URL('../../governance/general-pre-mutation-release-history-authority-20261102.json', import.meta.url))) {
  check(Buffer.isBuffer(bytes) && sha256(bytes) === authorityPin, 'IMMUTABLE_AUTHORITY_CHANGED');
  const authority = JSON.parse(bytes.toString('utf8'));
  check(authority.contract === 'aqua.general-pre-mutation-release-history-authorization' && authority.version === 1 &&
    authority.businessDecisionStatus === 'CONFIRMED' &&
    authority.decision?.generalAuthenticatedPreMutationRecognitionAuthorized === true &&
    authority.decision?.onlyCompleteAuthenticatedNoMutationEvidenceRecognizes === true &&
    authority.decision?.uncertainOrConfirmedMutationsRequireReconciliation === true &&
    authority.decision?.historicalRunRecognitionPreserved === true &&
    authority.decision?.memberContinuationRouteUnchanged === true &&
    authority.decision?.noFailedRunPromotedToSuccessfulRelease === true &&
    authority.decision?.successfulFullReleasePredecessorStatusGranted === false &&
    authority.decision?.replayAuthorityGranted === false &&
    authority.decision?.deploymentAuthorityGranted === false &&
    authority.decision?.productionDeploymentAuthorizedByThisDecision === false &&
    authority.decision?.automaticDbRollbackAuthorized === false,
  'GENERAL_RECOGNITION_AUTHORITY_INVALID');
  return authority;
}

const targets = JSON.parse(readFileSync(new URL('./targets.json', import.meta.url)));
const execution = targets.executor ?? { repository: targets.repository };
const shaPattern = /^[a-f0-9]{40}$/;
const positiveId = value => typeof value === 'string' && /^[1-9]\d*$/.test(value);
const positiveAttempt = value => Number.isSafeInteger(value) && value > 0;

// Recognition relies on the producer's write-ahead mutation rows, not merely
// their absence. Authenticate the controller and workflow bytes at the exact
// producing revision. These are code fingerprints, never run-ID exceptions.
const workflowDigests = new Set([
  sha256(readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url))),
  // Preserve the reviewed pre-routing producer; only credential-step env changes.
  '018d52b64d1acbeabef5d60704fbc200d4fd0036632489a228559c68f4610f8d',
  '01d3e74bbdcee105c159a321c52d1016d4e7c0157ab8d873f280bb6b52f5b92e',
  // Actual reviewed producer of the retained November-2 read-only failure audits.
  '394069c4fd0c480d59e8c70e98d9de674fc8f43e8792b58ad43abd433279aea8'
]);
const controllerDigests = new Set([
  sha256(readFileSync(new URL('./release-control.mjs', import.meta.url))),
  // Reviewed one-time D10 binding producer; write-ahead ordering is unchanged.
  '74310922b4bf0d698590abbf6395f01aec0f1692abcb41935151ba45a1344f0e',
  // Reviewed PR125 binding producer; provider write-ahead ordering is unchanged.
  '2a14c6608f071ce074d4f6b1b971cc9cd8ff57d196058d3189eb737f3acb34bb',
  // Reviewed PR124 producer: native bindings added, write-ahead ordering retained.
  'cdc5b121a5ec017c1b485f225086a2bab23c15ebd604a0bbeb6b145d3209dd3a',
  // Reviewed completed root-unbound producer; original write-ahead ordering retained.
  '31bc2f2bf56f591e86b7a0ff53c349b22bacbda3e531efa6340080e33f7d5bd9',
  // Reviewed 0ab4b71 producer of the baseline-drift stop; POST write-ahead order is unchanged.
  'faf99ea1fec489f19811bb0b8786ba6d1709880657baeccc1e7f121b96bdbc3d',
  // Reviewed 11f8fd0 producer retains the same write-ahead mutation ordering.
  '7e174fe8c165f869156cdc2759717bc72ca116264bd1a5da6d7b7a3693cd6ecf',
  // Reviewed protected-Actions producer before administrative-read removal.
  '3aecfe84b31c417276f198fbd00f6ce3df6436faa54f818c040b637da4d161c9',
  // Reviewed pre-instrumentation controller, with the same write-ahead invariant.
  'e4b76c1a5ca22d047675e5f1d7964bd20f9c413d3bc540cd29f7406834c585ab'
]);

export async function authenticatePreMutationProducer(read, executorSha) {
  check(shaPattern.test(executorSha), 'PRIOR_PRODUCER_REVISION_UNVERIFIABLE');
  const digests = [];
  for (const path of ['.github/workflows/deploy.yml', 'tools/deployment/release-control.mjs']) {
    const file = await read(`/contents/${path}?ref=${executorSha}`);
    check(file?.type === 'file' && file.path === path && file.encoding === 'base64' &&
      Number.isSafeInteger(file.size) && file.size > 0 && file.size < 256 * 1024 &&
      typeof file.content === 'string', 'PRIOR_PRODUCER_SOURCE_UNVERIFIABLE');
    const bytes = Buffer.from(file.content, 'base64');
    check(bytes.length === file.size, 'PRIOR_PRODUCER_SOURCE_INCOMPLETE');
    digests.push(sha256(bytes));
  }
  check(workflowDigests.has(digests[0]) && controllerDigests.has(digests[1]),
    'PRIOR_PRODUCER_WRITE_AHEAD_CONTRACT_UNSUPPORTED');
  return { executorSha, workflowSha256: digests[0], controllerSha256: digests[1] };
}

// Provider POST initiation and effect rows (writer order proves each preceding
// mutating call). Any presence in a prior failed run denies automatic
// recognition: attempted, acknowledged or unknown outcomes must be reconciled.
export const mutationCapablePhases = Object.freeze(new Set([
  'render-requesting', 'render-requested', 'render-ready',
  'vercel-files-requesting', 'vercel-files-uploaded', 'vercel-requesting', 'vercel-requested',
  'member-readiness', 'member-baseline-selected', 'member-render-reconciled',
  'member-render-requesting', 'member-render-requested', 'member-handoff-sample',
  'member-render-ready', 'member-vercel-files-requesting', 'member-vercel-files-uploaded',
  'member-vercel-requesting', 'member-vercel-requested', 'member-deployed']));

const knownPhases = Object.freeze(new Set([
  'evidence-selected', 'baseline-selected', 'admitted', 'verified', 'failed', 'provider-read',
  ...mutationCapablePhases]));

// Terminal codes reachable only after a mutation-capable call was initiated, or
// whose outcome is ambiguous by definition. Their mere occurrence requires
// reconciliation even when no mutation phase row was retained.
export const reconciliationForbiddenCodes = Object.freeze(new Set([
  'AMBIGUOUS_PROVIDER_POST_INSPECT_BEFORE_RETRY', 'INVALID_PROVIDER_RESPONSE',
  'RENDER_DEPLOYMENT_ID_UNAVAILABLE', 'VERCEL_DEPLOYMENT_ID_UNAVAILABLE',
  'PROVIDER_POST_REJECTED_INSPECT_BEFORE_RETRY', 'PROVIDER_TIMEOUT_RECONCILE_BEFORE_RETRY',
  'PROVIDER_DEPLOYMENT_FAILED_INSPECT_RELEASE_REPORT', 'UNEXPECTED_RELEASE_ERROR']));

// Unknown terminal categories are not evidence of a read-only stop. Extend this
// reviewed vocabulary explicitly when another failure category is established.
const preMutationFailureCodes = new Set(['PROVIDER_READ_REJECTED', 'PROTECTED_RUNTIME_READINESS_FAILED', 'RENDER_BASELINE_DRIFT']);

export const providerReadScopes = Object.freeze(new Set([
  'github-repository', 'github-compare', 'render-service', 'render-env', 'render-deploy-history',
  'render-deploy', 'vercel-project', 'vercel-env', 'vercel-deploy-history', 'vercel-deployment',
  'vercel-aliases', 'health', 'readiness', 'readiness-bindings', 'web-readiness']));

export const productionDeployStep = productionName =>
  productionName === 'Authorized recovery release' ?
    'Revalidate authority, providers, source and recovery before deployment' :
    'Revalidate policy, provenance, providers and recovery before automatic deployment';

export function validatePriorRunRow(row) {
  check(row && typeof row === 'object' && !Array.isArray(row) &&
    row.version === 4 && row.repository === targets.repository && shaPattern.test(row.sha) &&
    positiveId(row.ciRunId) && positiveAttempt(row.ciRunAttempt) &&
    positiveId(row.releaseRunId) && positiveAttempt(row.releaseRunAttempt) &&
    /^[a-f0-9]{64}$/.test(row.policySha256) &&
    row.environment === targets.environment && row.profile === targets.profile &&
    row.renderServiceId === targets.render.id && row.vercelProjectId === targets.vercel.id &&
    row.vercelTeamId === targets.vercel.teamId &&
    (!execution.repository || row.executorRepository === execution.repository) && shaPattern.test(row.executorSha ?? '') &&
    typeof row.phase === 'string', 'PRIOR_RUN_ROW_IDENTITY_UNVERIFIABLE');
  return row;
}

function validatePriorAuditRows(rows, run, attempt, descriptor) {
  check(Array.isArray(rows) && rows.length >= 2 && rows.length <= 500, 'PRIOR_AUDIT_INCOMPLETE');
  const baseline = rows[0];
  for (const row of rows) {
    validatePriorRunRow(row);
    check(row.releaseRunId === String(run.id) && row.releaseRunAttempt === attempt &&
      row.executorSha === run.headSha, 'PRIOR_RUN_IDENTITY_BINDING_FAILED');
    // Every retained row must describe the same exact execution identity.
    check(['repository', 'sha', 'ciRunId', 'ciRunAttempt', 'policySha256', 'environment', 'profile',
      'renderServiceId', 'vercelProjectId', 'vercelTeamId', 'executorRepository', 'executorSha',
      'releaseRunId', 'releaseRunAttempt'].every(key => row[key] === baseline[key]),
    'PRIOR_AUDIT_IDENTITY_CHANGED');
    check(knownPhases.has(row.phase), 'PRIOR_AUDIT_PHASE_UNRECOGNIZED');
    if (row.phase === 'provider-read') check(providerReadScopes.has(row.scope), 'PRIOR_AUDIT_READ_SCOPE_UNRECOGNIZED');
  }
  check(baseline.phase === 'evidence-selected', 'PRIOR_AUDIT_PROVENANCE_UNVERIFIABLE');
  check(['authorizationId', 'evidenceSha256', 'inventorySha256'].every(key =>
    /^[a-f0-9]{64}$/.test(baseline[key])) && positiveId(baseline.evidenceArtifactId),
  'PRIOR_AUDIT_PROVENANCE_UNVERIFIABLE');
  check(rows.every(row => row.memberRelease === undefined), 'PRIOR_MEMBER_ROUTE_REQUIRES_RECONCILIATION');
  check(!rows.some(row => row.phase === 'verified'), 'PRIOR_AUDIT_CONTRADICTS_FAILED_RUN');
  check(!rows.some(row => mutationCapablePhases.has(row.phase)), 'PRIOR_MUTATION_PHASE_REQUIRES_RECONCILIATION');
  check(!rows.some(row => row.renderDeployId !== undefined || row.vercelDeployId !== undefined),
    'PRIOR_DEPLOYMENT_ID_REQUIRES_RECONCILIATION');
  const failed = rows.filter(row => row.phase === 'failed');
  check(failed.length === 1 && rows.at(-1) === failed[0] && typeof failed[0].code === 'string' &&
    preMutationFailureCodes.has(failed[0].code) && !reconciliationForbiddenCodes.has(failed[0].code),
  'PRIOR_AUDIT_TERMINAL_OUTCOME_UNRECOGNIZABLE');
  return { auditArtifactId: descriptor.artifactId, rowsSha256: objectDigest(rows),
    terminalFailureCode: failed[0].code };
}

export function classifyPriorFailedRun({ run, attempt, production, audit } = {}) {
  validateRecognitionAuthority();
  check(run && typeof run === 'object' && positiveId(String(run.id)) &&
    positiveAttempt(run.runNumber) && positiveAttempt(run.runAttempt) && shaPattern.test(run.headSha) &&
    run.status === 'completed' && run.conclusion === 'failure' &&
    run.repository === execution.repository && run.headRepository === execution.repository,
  'PRIOR_RUN_IDENTITY_UNVERIFIABLE');
  check(production && typeof production === 'object' &&
    ['Unattended recovery release', 'Authorized recovery release'].includes(production.name),
  'PRIOR_PRODUCTION_JOB_UNVERIFIABLE');
  check(positiveAttempt(attempt) && attempt <= run.runAttempt, 'PRIOR_ATTEMPT_OUT_OF_RANGE');
  const base = { runId: String(run.id), runNumber: run.runNumber, runAttempt: attempt };
  const deployStep = productionDeployStep(production.name);
  if (production.conclusion === 'skipped')
    return { ...base, basis: 'production-never-executed', productionConclusion: 'skipped' };
  check(production.conclusion === 'failure', 'PRIOR_PRODUCTION_CONCLUSION_UNRECOGNIZED');
  const deploySteps = Array.isArray(production.steps) ? production.steps.filter(step => step?.name === deployStep) : [];
  if (Array.isArray(deploySteps) && deploySteps.length === 1 && deploySteps[0].conclusion === 'skipped')
    return { ...base, basis: 'deploy-step-never-entered', productionConclusion: 'failure' };
  check(deploySteps.length === 1 && deploySteps[0].conclusion === 'failure',
    'PRIOR_PRODUCTION_STEP_UNVERIFIABLE');
  check(audit && typeof audit === 'object' && audit.descriptor && Array.isArray(audit.rows),
    'PRIOR_AUDIT_AUTHENTICATED_EVIDENCE_REQUIRED');
  check(audit.producer?.executorSha === run.headSha && workflowDigests.has(audit.producer.workflowSha256) &&
    controllerDigests.has(audit.producer.controllerSha256), 'PRIOR_PRODUCER_WRITE_AHEAD_CONTRACT_UNSUPPORTED');
  check(audit.descriptor.runId === String(run.id) && audit.descriptor.runAttempt === attempt &&
    audit.descriptor.sha === run.headSha, 'PRIOR_AUDIT_DESCRIPTOR_BINDING_FAILED');
  const captured = validatePriorAuditRows(audit.rows, run, attempt, audit.descriptor);
  check(captured.terminalFailureCode === audit.rows.at(-1).code, 'PRIOR_AUDIT_TERMINAL_ROW_CHANGED');
  return { ...base, basis: 'audit-verified-never-mutated', productionConclusion: 'failure',
    producer: audit.producer, ...captured };
}
