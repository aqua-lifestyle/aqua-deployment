// Append-only successor to the completed M55 source chain. This advances only
// the Vercel frontend; the commissioned backend and all five guard pins remain.
import { readFileSync } from 'node:fs';
import { objectDigest, sha256 } from './github-evidence.mjs';
import { weeklyReadinessFixCandidateSha, weeklyReadinessFixRecordDigest,
  validateWeeklyReadinessFixCandidate } from './aqgreen-m55-source-successor.mjs';
import { ReadinessReleaseDenied } from './readiness-release.mjs';

const recordUrl = new URL('../../governance/aqgreen-frontend-source-successor-20261114.json', import.meta.url);
const previousUrl = new URL('../../governance/aqgreen-m55-source-successor-20261113.json', import.meta.url);
const manifestUrl = new URL('./commission-schema-source.json', import.meta.url);
const targets = JSON.parse(readFileSync(new URL('./targets.json', import.meta.url)));
export const frontendSuccessorCandidateSha = 'fb4d7e509db2f5c8de68df44ea978995a5c455fb';
export const frontendReleaseRecordDigest = '6b2d9aaeaf30adab12b16f1b0b4d4e9a073987ca195fac8df7ddb7ce006732b7';
export const frontendReleaseMode = 'post-normal-frontend-v1';
export class FrontendSuccessorDenied extends ReadinessReleaseDenied {}
const check = (ok, code) => { if (!ok) throw new FrontendSuccessorDenied(code); };
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) &&
  Object.keys(v).sort().join() === [...keys].sort().join();
const same = (a, b) => objectDigest(a) === objectDigest(b);
const sourcePaths = [
  'AqualLifeStyle/9.4.2/aspnet-core/src/AqualLifeStyle.Application/ProgrammeParticipations/AQGreenCleanStartRootAppService.cs',
  'AqualLifeStyle/9.4.2/aspnet-core/src/AqualLifeStyle.Application/ProgrammeParticipations/AQGreenD10ProductionSelectors.cs',
  'AqualLifeStyle/9.4.2/aspnet-core/src/AqualLifeStyle.Core/Domain/AQGreen/AQGreenD10Commissioning.cs',
  'AqualLifeStyle/9.4.2/aspnet-core/src/AqualLifeStyle.Web.Host/Startup/ApplicationRecoveryMiddleware.cs',
  'AqualLifeStyle/9.4.2/aspnet-core/src/AqualLifeStyle.Web.Host/Startup/AQGreenD10OperatorEvidenceSource.cs'
];

export function validateFrontendSuccessorIdentity(q) {
  check(q?.frontendRelease === frontendReleaseRecordDigest && q.sha === frontendSuccessorCandidateSha &&
    q.ciRunId === '43597833117' && q.ciRunAttempt === 1 && typeof q.qualificationOnly === 'boolean' &&
    q.memberRelease === undefined && q.policySha256 ===
      '717b071718a7032c49055673092c1aa62114055c3d5ab22a8708ef5ca509f840' &&
    q.repository === targets.repository && q.executorRepository === targets.executor.repository &&
    q.environment === targets.environment && q.profile === targets.profile &&
    q.renderServiceId === targets.render.id && q.vercelProjectId === targets.vercel.id &&
    q.vercelTeamId === targets.vercel.teamId, 'AQGREEN_FRONTEND_SUCCESSOR_EXACT_SCOPE_REQUIRED');
}

export function validateAqGreenFrontendSuccessor(q, bytes = readFileSync(recordUrl)) {
  check(Buffer.isBuffer(bytes) && sha256(bytes) === frontendReleaseRecordDigest,
    'AQGREEN_FRONTEND_SUCCESSOR_RECORD_CHANGED');
  validateFrontendSuccessorIdentity(q);
  const r = JSON.parse(bytes), a = r.application;
  check(exact(r, ['contract', 'version', 'application', 'previousBinding', 'policySha256',
    'sourceManifestSha256', 'sourceComparison', 'm55HistoricalBinding', 'sourceBindings',
    'ownerAcceptance', 'scope']) && r.contract === 'aqua.completed-m55-frontend-only-source-successor' &&
    r.version === 1 && exact(a, ['repository', 'pullRequest', 'reviewedHead', 'mergeCommit',
      'ciRunId', 'ciRunAttempt', 'ciEvent', 'ciConclusion', 'mandatoryJobCount']) &&
    a.repository === q.repository && a.pullRequest === 131 &&
    a.reviewedHead === 'a1c8eecbbf30f56ce47e87674012f69de5f47eb7' &&
    a.mergeCommit === q.sha && a.ciRunId === q.ciRunId && a.ciRunAttempt === q.ciRunAttempt &&
    a.ciEvent === 'push/main' && a.ciConclusion === 'success' && a.mandatoryJobCount === 17 &&
    r.policySha256 === q.policySha256, 'AQGREEN_FRONTEND_SUCCESSOR_EXACT_SCOPE_REQUIRED');
  const previousBytes = readFileSync(previousUrl), previous = JSON.parse(previousBytes);
  check(sha256(previousBytes) === weeklyReadinessFixRecordDigest &&
    exact(r.previousBinding, ['candidateSha', 'recordPath', 'recordSha256']) &&
    r.previousBinding.candidateSha === weeklyReadinessFixCandidateSha &&
    r.previousBinding.recordPath === 'governance/aqgreen-m55-source-successor-20261113.json' &&
    r.previousBinding.recordSha256 === weeklyReadinessFixRecordDigest &&
    same(r.m55HistoricalBinding, previous.m55HistoricalBinding) &&
    r.sourceManifestSha256 === previous.sourceManifestSha256 &&
    r.sourceManifestSha256 === objectDigest(JSON.parse(readFileSync(manifestUrl, 'utf8'))),
  'AQGREEN_FRONTEND_SUCCESSOR_CHAIN_REQUIRED');
  const predecessor = validateWeeklyReadinessFixCandidate({ ...q, sha: weeklyReadinessFixCandidateSha,
    ciRunId: previous.application.ciRunId, ciRunAttempt: previous.application.ciRunAttempt,
    qualificationOnly: false, memberRelease: undefined, frontendRelease: undefined });
  const carry = predecessor.completedCarry;
  check(carry.candidateSha === weeklyReadinessFixCandidateSha &&
    Array.isArray(r.sourceBindings) && r.sourceBindings.length === sourcePaths.length &&
    same(r.sourceComparison, { baseCandidateSha: weeklyReadinessFixCandidateSha,
      previouslyServingSha: weeklyReadinessFixCandidateSha, targetSha: q.sha,
      guardPathsChangedSincePreviousBinding: [], guardPathsUnchangedSincePreviousBinding: sourcePaths,
      basis: 'Authenticated Git object comparison plus SHA-256 of exact commit contents; the five guard-path files are byte-identical to the previous binding and the full diff contains only frontend assets, application tests and documentation' }),
  'AQGREEN_FRONTEND_SUCCESSOR_COMPARISON_SCOPE_REQUIRED');
  const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'));
  const pins = new Map(manifest.cleanStartSources.map(row => [row.path, row.sha256]));
  for (let i = 0; i < sourcePaths.length; i++) {
    const path = sourcePaths[i], row = r.sourceBindings[i], prev = previous.sourceBindings[i];
    const accepted = carry.sourceOverrides.find(x => x.path === path)?.candidateSha256 ??
      (carry.guardOverride.path === path ? carry.guardOverride.candidateSha256 : undefined);
    check(row?.path === path && prev?.path === path &&
      exact(row, ['path', 'manifestSha256', 'previousCandidateSha256', 'candidateSha256',
        'priorBindingRecordSha256', ...(path === carry.guardOverride.path ? ['historicalM55CandidateSha256'] : [])]) &&
      row.manifestSha256 === pins.get(path) && row.manifestSha256 === prev.manifestSha256 &&
      row.previousCandidateSha256 === accepted && row.previousCandidateSha256 === prev.candidateSha256 &&
      row.candidateSha256 === row.previousCandidateSha256 &&
      row.priorBindingRecordSha256 === weeklyReadinessFixRecordDigest &&
      (path !== carry.guardOverride.path ||
        row.historicalM55CandidateSha256 === prev.historicalM55CandidateSha256),
    'AQGREEN_FRONTEND_SUCCESSOR_GUARD_CHANGED');
  }
  const owner = r.ownerAcceptance;
  check(exact(owner, ['repository', 'pullRequest', 'mergedBy', 'mergedAt', 'reviewedHead',
    'mergeCommit', 'acceptanceInterpretation']) && owner.repository === a.repository &&
    owner.pullRequest === a.pullRequest && owner.reviewedHead === a.reviewedHead &&
    owner.mergeCommit === q.sha && owner.mergedAt === '2026-11-14T13:03:30Z' &&
    exact(owner.mergedBy, ['login', 'id']) && owner.mergedBy.login === 'aqualifestyleclub' &&
    owner.mergedBy.id === 307076734 && owner.acceptanceInterpretation ===
      'Owner-accepted protected merge of the exact reviewed head; no guard path changed so no separate guard-path review is required',
  'AQGREEN_FRONTEND_SUCCESSOR_OWNER_ACCEPTANCE_REQUIRED');
  const scope = r.scope;
  check(exact(scope, ['kind', 'backendSourceChanged', 'renderMutationAuthorized',
    'vercelDeploymentAuthorized', 'migration55Rerun', 'historicalEvidenceRewritten',
    'financialActivationAuthorized', 'automaticPayoutsEnabled']) &&
    scope.kind === 'vercel-files-frontend-only' && scope.vercelDeploymentAuthorized === true &&
    Object.entries(scope).every(([key, value]) => ['kind', 'vercelDeploymentAuthorized'].includes(key) || value === false),
  'AQGREEN_FRONTEND_SUCCESSOR_SCOPE_CHANGED');
  return { ...r, completedCarry: { ...carry, candidateSha: q.sha } };
}
