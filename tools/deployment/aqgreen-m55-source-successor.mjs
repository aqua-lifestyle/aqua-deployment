// One append-only, source-bound successor for the completed M55 Clean Start chain.
// The original operation, manifest, evidence, readback, and migration pins remain
// authoritative; this record chains five exact source bindings for the
// application/CI pair below, advancing only the subsequently reviewed D10 file.
import { readFileSync } from 'node:fs';
import { objectDigest, sha256 } from './github-evidence.mjs';
import { unusedExpiryCandidateSha, unusedExpiryRecordDigest, validateUnusedExpiryCandidate } from './unused-expiry-release.mjs';
import { firstAccountRecordDigest } from './first-account-release.mjs';
import { postResetRecordDigest } from './post-reset-live-release.mjs';
import { ReadinessReleaseDenied } from './readiness-release.mjs';

const recordUrl = new URL('../../governance/aqgreen-m55-source-successor-20261113.json', import.meta.url);
const manifestUrl = new URL('./commission-schema-source.json', import.meta.url);
const targetsUrl = new URL('./targets.json', import.meta.url);
const m55CarryUrl = new URL('../../governance/completed-m55-candidate-carry-forward-20261103.json', import.meta.url);
const priorBindingRecordUrls = new Map([
  [postResetRecordDigest, new URL('../../governance/post-reset-live-release-20261106.json', import.meta.url)],
  [firstAccountRecordDigest, new URL('../../governance/first-account-release-20261105.json', import.meta.url)],
  [unusedExpiryRecordDigest, new URL('../../governance/unused-expiry-release-20261108.json', import.meta.url)]
]);
const targets = JSON.parse(readFileSync(targetsUrl, 'utf8'));
export const weeklyReadinessFixCandidateSha = 'b8d86e5e60997483423b273d5f426c08b411f573';
export const weeklyReadinessFixRecordDigest = '79d94ccc21c380bc96b848f3df84deb31f506dc2db3b6b2d5bec353d8c7fd184';
export const weeklyReadinessCiRefreshDigest = '4332006fc8d9fd9506dd2c745d9d21979b0e1faf12488cf6ff3cd91872fe85f3';

const check = (ok, code) => { if (!ok) throw new ReadinessReleaseDenied(code); };
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) &&
  Object.keys(v).sort().join() === [...keys].sort().join();
const hex = (value, size) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${size}}$`).test(value);

// One reviewed CI-only refresh of the same immutable source. The original
// successor and M55 records remain historical; runtime CI/age checks still read
// GitHub and never borrow this record's completion time to renew evidence.
export function validateWeeklyReadinessCiRefresh(bytes = readFileSync(
  new URL('../../governance/aqgreen-ci-refresh-43191377577-3.json', import.meta.url))) {
  check(Buffer.isBuffer(bytes) && sha256(bytes) === weeklyReadinessCiRefreshDigest,
    'AQGREEN_CI_REFRESH_RECORD_CHANGED');
  const r = JSON.parse(bytes), ci = r.ci, control = r.workflowControl;
  check(r.contract === 'aqua.exact-source-ci-refresh' && r.version === 1 &&
    r.applicationSha === weeklyReadinessFixCandidateSha &&
    r.sourceSuccessorRecordPath === 'governance/aqgreen-m55-source-successor-20261113.json' &&
    r.sourceSuccessorRecordSha256 === weeklyReadinessFixRecordDigest &&
    sha256(readFileSync(recordUrl)) === r.sourceSuccessorRecordSha256 &&
    r.previousCi.runId === '43191377577' && r.previousCi.runAttempt === 2 &&
    ci.repository === targets.repository && ci.runId === '43191377577' && ci.runAttempt === 3 &&
    ci.sourceSha === r.applicationSha && ci.event === 'push' && ci.branch === 'main' &&
    ci.workflowPath === '.github/workflows/ci.yml' && ci.workflowName === 'Continuous integration' &&
    ci.status === 'completed' && ci.conclusion === 'success' && ci.mandatoryJobCount === 17 &&
    control.originalState === 'active' && control.restoredState === 'active' && control.ciState === 'active' &&
    control.fullRerunRequests === 1 &&
    control.applicationReleaseRunIdsSha256Before === control.applicationReleaseRunIdsSha256After &&
    control.executorRunIdsSha256Before === control.executorRunIdsSha256After &&
    r.scope.kind === 'exact-ci-attempt-only' && Object.entries(r.scope).every(([key, value]) => key === 'kind' || value === false),
  'AQGREEN_CI_REFRESH_SCOPE_REQUIRED');
  return r;
}
const sourcePaths = [
  'AqualLifeStyle/9.4.2/aspnet-core/src/AqualLifeStyle.Application/ProgrammeParticipations/AQGreenCleanStartRootAppService.cs',
  'AqualLifeStyle/9.4.2/aspnet-core/src/AqualLifeStyle.Application/ProgrammeParticipations/AQGreenD10ProductionSelectors.cs',
  'AqualLifeStyle/9.4.2/aspnet-core/src/AqualLifeStyle.Core/Domain/AQGreen/AQGreenD10Commissioning.cs',
  'AqualLifeStyle/9.4.2/aspnet-core/src/AqualLifeStyle.Web.Host/Startup/ApplicationRecoveryMiddleware.cs',
  'AqualLifeStyle/9.4.2/aspnet-core/src/AqualLifeStyle.Web.Host/Startup/AQGreenD10OperatorEvidenceSource.cs'
];
const reviewPath = sourcePaths[2];
const targetSources = new Map([
  [sourcePaths[0], '5b2e7372a465c81068da6da008101d706a37cf2d63b872ef3a7c62a460c8c09b'],
  [sourcePaths[1], 'db65d546eb220a2f355150676ec713ee28bb8cb9f30d3712bb4e134e8486c152'],
  [sourcePaths[2], '1ee77672731a4f427a3003008cf6c75422e8a6915e01441816a896d56fca98a8'],
  [sourcePaths[3], '3c57877be5bec0a4e9368ce6cc79771e338fa7e1116beab2fc9b215f79b764b3'],
  [sourcePaths[4], 'cc4d39599c2d6587e66c0ba1d88f6073694a7bc20dd26afeda5a45d365000c7e']
]);
const priorBindingRecords = new Map([
  [sourcePaths[0], '3e1c64fc3cf7eb165f06ce1d1eb6ae137a9e36fa971531889e7a9c442c3b1857'],
  [sourcePaths[1], unusedExpiryRecordDigest],
  [sourcePaths[2], unusedExpiryRecordDigest],
  [sourcePaths[3], '8034825088571991480d6563749268ab477828d23a85c63c34508def1dae6b56'],
  [sourcePaths[4], '3e1c64fc3cf7eb165f06ce1d1eb6ae137a9e36fa971531889e7a9c442c3b1857']
]);
const expectedReview = Object.freeze({
  repository: 'aqua-lifestyle/aqua-lifestyle', pullRequest: 129, reviewEventId: 5829338879,
  reviewer: { login: 'aqualifestyleclub', id: 307076734 }, githubReviewState: 'COMMENTED',
  reviewBody: 'Reviewed and Accepted', reviewedCommitSha: '8fde889db71f20a44569a02911dbd956f27aa7cb',
  submittedAt: '2026-11-09T16:48:40Z', reviewedPath: reviewPath,
  reviewedPathSha256: '1ee77672731a4f427a3003008cf6c75422e8a6915e01441816a896d56fca98a8',
  acceptanceInterpretation: 'Owner-accepted comment under explicit owner direction; GitHub\'s recorded state remains COMMENTED and is not relabeled APPROVED'
});
const stable = value => JSON.stringify(value);

function priorBindingContains(recordDigest, path, expectedSha) {
  const url = priorBindingRecordUrls.get(recordDigest);
  if (!url) return false;
  const bytes = readFileSync(url);
  if (sha256(bytes) !== recordDigest) return false;
  const record = JSON.parse(bytes);
  const matches = (Array.isArray(record.sourceOverrides) ? record.sourceOverrides : [])
    .filter(row => row?.path === path).map(row => row.candidateSha256);
  if (record.guardPath === path) matches.push(record.candidateGuardSha256);
  return matches.length === 1 && matches[0] === expectedSha;
}

export function validAqGreenOwnerAcceptance(value, bindings) {
  const reviewer = value?.reviewer;
  const binding = Array.isArray(bindings) ? bindings.find(row => row.path === reviewPath) : undefined;
  return exact(value, Object.keys(expectedReview)) &&
    Object.keys(expectedReview).every(key => key === 'reviewer' ?
      exact(reviewer, ['login', 'id']) && reviewer.login === expectedReview.reviewer.login &&
        reviewer.id === expectedReview.reviewer.id : value[key] === expectedReview[key]) &&
    binding?.candidateSha256 === expectedReview.reviewedPathSha256;
}

function predecessorCandidate(q) {
  const previousBytes = readFileSync(new URL('../../governance/unused-expiry-release-20261108.json', import.meta.url));
  check(sha256(previousBytes) === unusedExpiryRecordDigest, 'UNUSED_EXPIRY_RELEASE_RECORD_CHANGED');
  const previous = JSON.parse(previousBytes);
  check(previous.candidateSha === unusedExpiryCandidateSha, 'AQGREEN_SOURCE_SUCCESSOR_PREDECESSOR_CHANGED');
  return validateUnusedExpiryCandidate({ ...q, sha: previous.candidateSha,
    ciRunId: previous.ciRunId, ciRunAttempt: previous.ciRunAttempt,
    qualificationOnly: false, memberRelease: undefined });
}

export function validateWeeklyReadinessFixCandidate(q, bytes = readFileSync(recordUrl)) {
  check(Buffer.isBuffer(bytes) && sha256(bytes) === weeklyReadinessFixRecordDigest,
    'AQGREEN_SOURCE_SUCCESSOR_RECORD_CHANGED');
  const r = JSON.parse(bytes);
  const application = r.application;
  const ciRefresh = q?.ciRunId === application.ciRunId && q?.ciRunAttempt === application.ciRunAttempt ?
    null : validateWeeklyReadinessCiRefresh();
  check(exact(r, ['contract', 'version', 'application', 'previousBinding', 'policySha256',
    'sourceManifestSha256', 'sourceComparison', 'm55HistoricalBinding', 'sourceBindings',
    'ownerAcceptance', 'scope']) &&
    r.contract === 'aqua.completed-m55-exact-source-successor' && r.version === 1 &&
    exact(application, ['repository', 'pullRequest', 'reviewedHead', 'mergeCommit', 'ciRunId',
      'ciRunAttempt', 'ciEvent', 'ciConclusion', 'mandatoryJobCount']) &&
    application.repository === 'aqua-lifestyle/aqua-lifestyle' && application.pullRequest === 130 &&
    application.reviewedHead === 'c29a0b3250968b194a362a711f91de421d1a53ba' &&
    application.mergeCommit === weeklyReadinessFixCandidateSha && application.ciRunId === '43191377577' &&
    application.ciRunAttempt === 2 && application.ciEvent === 'push/main' &&
    application.ciConclusion === 'success' && application.mandatoryJobCount === 17 &&
    q?.sha === weeklyReadinessFixCandidateSha && q.sha === application.mergeCommit &&
    q.ciRunId === (ciRefresh?.ci.runId ?? application.ciRunId) &&
    q.ciRunAttempt === (ciRefresh?.ci.runAttempt ?? application.ciRunAttempt) &&
    q.policySha256 === r.policySha256 && typeof q.qualificationOnly === 'boolean' && q.memberRelease === undefined &&
    q.repository === application.repository && q.executorRepository === targets.executor.repository &&
    q.environment === targets.environment && q.profile === targets.profile &&
    q.renderServiceId === targets.render.id && q.vercelProjectId === targets.vercel.id &&
    q.vercelTeamId === targets.vercel.teamId,
  'AQGREEN_SOURCE_SUCCESSOR_EXACT_SCOPE_REQUIRED');

  const selected = predecessorCandidate(q);
  const carry = selected.completedCarry;
  const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'));
  const m55Bytes = readFileSync(m55CarryUrl);
  const m55 = JSON.parse(m55Bytes);
  check(exact(r.previousBinding, ['candidateSha', 'recordPath', 'recordSha256']) &&
    r.previousBinding.candidateSha === selected.candidateSha &&
    r.previousBinding.recordPath === 'governance/unused-expiry-release-20261108.json' &&
    r.previousBinding.recordSha256 === unusedExpiryRecordDigest &&
    sha256(m55Bytes) === r.m55HistoricalBinding?.carryForwardRecordSha256 &&
    objectDigest(manifest) === r.sourceManifestSha256 &&
    r.sourceManifestSha256 === carry.sourceManifestSha256 &&
    r.policySha256 === selected.policySha256 &&
    r.previousBinding?.candidateSha === selected.candidateSha &&
    r.previousBinding?.recordSha256 === unusedExpiryRecordDigest,
  'AQGREEN_SOURCE_SUCCESSOR_CHAIN_REQUIRED');

  const historical = r.m55HistoricalBinding;
  check(exact(historical, ['carryForwardRecordPath', 'carryForwardRecordSha256', 'operationSourceSha',
    'completedEvidenceSha256', 'reviewedMigrationSha256', 'historicalMiddlewarePath',
    'historicalMiddlewareOperationSourceSha256', 'historicalMiddlewareCandidateSha256',
    'originalOperationEvidenceModified', 'historicalObservationTimesRefreshed',
    'databaseOperationAuthorized', 'financialActivationAuthorized', 'productionDeploymentAuthorized']) &&
    historical.carryForwardRecordPath === 'governance/completed-m55-candidate-carry-forward-20261103.json' &&
    historical.operationSourceSha === m55.operationSourceSha &&
    historical.completedEvidenceSha256 === m55.completedEvidenceSha256 &&
    historical.reviewedMigrationSha256 === m55.reviewedSqlSha256 &&
    historical.historicalMiddlewarePath === m55.guardOverride.path &&
    historical.historicalMiddlewareOperationSourceSha256 === m55.guardOverride.operationSourceSha256 &&
    historical.historicalMiddlewareCandidateSha256 === m55.guardOverride.candidateSha256 &&
    ['originalOperationEvidenceModified', 'historicalObservationTimesRefreshed', 'databaseOperationAuthorized',
      'financialActivationAuthorized', 'productionDeploymentAuthorized'].every(key =>
      historical[key] === m55[key]), 'AQGREEN_SOURCE_SUCCESSOR_M55_HISTORY_CHANGED');

  const bindings = r.sourceBindings;
  check(Array.isArray(bindings) && bindings.length === sourcePaths.length &&
    bindings.every((row, index) => row?.path === sourcePaths[index]),
  'AQGREEN_SOURCE_SUCCESSOR_BINDING_SET_REQUIRED');
  const manifestPins = new Map(manifest.cleanStartSources.map(pin => [pin.path, pin.sha256]));
  const acceptedSource = path => carry.sourceOverrides.find(row => row.path === path)?.candidateSha256 ??
    (carry.guardOverride.path === path ? carry.guardOverride.candidateSha256 : undefined);
  for (const row of bindings) {
    const expectedKeys = ['path', 'manifestSha256', 'previousCandidateSha256', 'candidateSha256',
      'priorBindingRecordSha256', ...(row.path === reviewPath ? ['applicationPullRequest'] : []),
      ...(row.path === carry.guardOverride.path ? ['historicalM55CandidateSha256'] : [])];
    check(exact(row, expectedKeys) && hex(row.manifestSha256, 64) &&
      row.manifestSha256 === manifestPins.get(row.path) &&
      hex(row.previousCandidateSha256, 64) && row.previousCandidateSha256 === acceptedSource(row.path) &&
      row.priorBindingRecordSha256 === priorBindingRecords.get(row.path) &&
      priorBindingContains(row.priorBindingRecordSha256, row.path, row.previousCandidateSha256) &&
      row.candidateSha256 === targetSources.get(row.path), 'AQGREEN_SOURCE_SUCCESSOR_BINDING_MISMATCH');
    if (row.path === reviewPath)
      check(row.applicationPullRequest === expectedReview.pullRequest,
        'AQGREEN_SOURCE_SUCCESSOR_REVIEW_PROVENANCE_REQUIRED');
    if (row.path !== reviewPath)
      check(row.candidateSha256 === row.previousCandidateSha256,
        'AQGREEN_SOURCE_SUCCESSOR_UNREVIEWED_CHANGE');
    else check(row.candidateSha256 === expectedReview.reviewedPathSha256,
      'AQGREEN_SOURCE_SUCCESSOR_UNREVIEWED_CHANGE');
  }
  const middleware = bindings.find(row => row.path === carry.guardOverride.path);
  check(middleware && middleware.historicalM55CandidateSha256 === m55.guardOverride.candidateSha256 &&
    middleware.historicalM55CandidateSha256 === historical.historicalMiddlewareCandidateSha256 &&
    middleware.candidateSha256 === carry.guardOverride.candidateSha256,
  'AQGREEN_SOURCE_SUCCESSOR_M55_GUARD_CHAIN_CHANGED');
  check(validAqGreenOwnerAcceptance(r.ownerAcceptance, bindings),
    'AQGREEN_SOURCE_SUCCESSOR_REVIEW_PROVENANCE_REQUIRED');

  const comparison = r.sourceComparison;
  check(exact(comparison, ['baseCandidateSha', 'previouslyServingSha', 'targetSha',
    'guardPathsChangedSincePreviousBinding', 'guardPathsUnchangedSincePreviousBinding', 'basis']) &&
    comparison.baseCandidateSha === selected.candidateSha &&
    comparison.targetSha === q.sha && comparison.previouslyServingSha === '08580d837adb90e022a30ad11ba4fda332d138da' &&
    stable(comparison.guardPathsChangedSincePreviousBinding) === stable([reviewPath]) &&
    stable(comparison.guardPathsUnchangedSincePreviousBinding) === stable(sourcePaths.filter(path => path !== reviewPath)) &&
    comparison.basis === 'Authenticated Git object comparison plus SHA-256 of exact commit contents; this is a five-guard-path comparison, not a claim that the complete application diff contains only one file',
  'AQGREEN_SOURCE_SUCCESSOR_COMPARISON_SCOPE_REQUIRED');

  const scope = r.scope;
  check(exact(scope, ['kind', 'migration55Rerun', 'historicalEvidenceRewritten', 'providerMutationAuthorized',
    'financialActivationAuthorized', 'productionDeploymentAuthorized', 'automaticPayoutsEnabled']) &&
    scope.kind === 'code-only-held-deployment' &&
    ['migration55Rerun', 'historicalEvidenceRewritten', 'providerMutationAuthorized',
      'financialActivationAuthorized', 'productionDeploymentAuthorized', 'automaticPayoutsEnabled']
      .every(key => scope[key] === false), 'AQGREEN_SOURCE_SUCCESSOR_SCOPE_CHANGED');

  const updatedSources = carry.sourceOverrides.map(row => ({ ...row,
    candidateSha256: bindings.find(binding => binding.path === row.path)?.candidateSha256 ?? row.candidateSha256 }));
  const updatedGuard = { ...carry.guardOverride,
    candidateSha256: bindings.find(binding => binding.path === carry.guardOverride.path)?.candidateSha256 ??
      carry.guardOverride.candidateSha256 };
  return { ...r, ...(ciRefresh ? { ciRefresh } : {}), completedCarry: { ...carry, candidateSha: q.sha,
    sourceOverrides: updatedSources, guardOverride: updatedGuard } };
}
