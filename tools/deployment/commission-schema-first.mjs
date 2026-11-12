import { readFileSync } from 'node:fs';
import { objectDigest, sha256 } from './github-evidence.mjs';
import { readinessCandidateSha, validateReadinessCandidate } from './readiness-release.mjs';
import { pr121CandidateSha, validatePr121Candidate } from './pr121-release.mjs';
import { firstAccountCandidateSha, validateFirstAccountCandidate } from './first-account-release.mjs';
import { rootUnboundCandidateSha, validateRootUnboundCandidate } from './root-unbound-release.mjs';
import { postResetCandidateSha, validatePostResetCandidate } from './post-reset-live-release.mjs';
import { minimumLiveCandidateSha, validateMinimumLiveCandidate } from './minimum-live-release.mjs';
import { d10OneTimeCandidateSha, validateD10OneTimeCandidate } from './d10-one-time-release.mjs';
import { verifiedHoldCandidateSha, validateVerifiedHoldCandidate } from './verified-hold-release.mjs';
import { unusedExpiryCandidateSha, validateUnusedExpiryCandidate } from './unused-expiry-release.mjs';

// Executor-owned pins from the frozen, CI-qualified application. No candidate
// manifest, dispatch input or migration command can extend this exception.
export const schemaSource = JSON.parse(readFileSync(new URL('./commission-schema-source.json', import.meta.url)));
export const approvedSchemaReadback = JSON.parse(readFileSync(
  new URL('../../governance/commission-schema-readback.json', import.meta.url)));
const completedMigration55 = JSON.parse(readFileSync(new URL('./completed-migration55-evidence.json', import.meta.url)));
const fixedTargets = JSON.parse(readFileSync(new URL('./targets.json', import.meta.url)));
const completedAuthorityBytes = readFileSync(new URL('../../governance/completed-m55-amendment-authority-20261102.json', import.meta.url));
const completedOperationBytes = readFileSync(new URL('../../governance/aqgreen-clean-start-actual-20261102.json', import.meta.url));
const carryCandidateSha = '1b748dfdaf3b63fb9dcc42f781ab79d5c39ca503';
// Exact application successor that only repairs weekly-worker DI registration.
// It retains the completed Migration 55 carry-forward; the usual pinned-source
// and zero-new-migration checks below remain mandatory for this SHA.
const weeklyReadinessFixCandidateSha = 'b8d86e5e60997483423b273d5f426c08b411f573';
const carryRecordSha256 = '086721f085a7ac99396481aae80c2bb4416a648938b33e338de7722ec0ac2f60';
export const completedMigration55PolicyKind = 'commission-invalidation-clean-start-completed-m55-v1';
export const isCleanStartSchemaKind = kind =>
  ['commission-invalidation-clean-start-v1', completedMigration55PolicyKind].includes(kind);
export class SchemaFirstDenied extends Error {}
const check = (ok, code) => { if (!ok) throw new SchemaFirstDenied(code); };
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) &&
  Object.keys(v).sort().join() === [...keys].sort().join();
const digest = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const sha = v => typeof v === 'string' && /^[a-f0-9]{40}$/.test(v);
const reference = v => typeof v === 'string' &&
  /^https:\/\/github\.com\/aqua-lifestyle\/aqua-deployment\/blob\/[a-f0-9]{40}\/governance\/[A-Za-z0-9_./-]+$/.test(v) &&
  !v.split('/').includes('..');
const utc = v => typeof v === 'string' && /Z$/.test(v) && Number.isFinite(Date.parse(v));

export function validSchemaPolicy(p) {
  return exact(p, ['kind', 'sourceManifestSha256', 'evidenceSha256']) &&
    ['commission-invalidation-schema-first-v1', 'commission-invalidation-clean-start-v1', completedMigration55PolicyKind].includes(p.kind) &&
    p.sourceManifestSha256 === objectDigest(schemaSource) && digest(p.evidenceSha256);
}

export function validateMigrationDelta(compare, schemaEnabled = false, requireAdditive = false) {
  check(compare && ['ahead', 'identical'].includes(compare.status) && Array.isArray(compare.files) &&
    compare.files.length < 300 && (compare.status !== 'identical' || compare.files.length === 0) &&
    compare.files.every(f => f && typeof f.filename === 'string'),
  'SCHEMA_COMPARISON_UNVERIFIABLE');
  const changed = compare.files.filter(f => /\/Migrations\//i.test(f.filename ?? '') ||
    /\/Migrations\//i.test(f.previous_filename ?? ''));
  if (!schemaEnabled) {
    check(changed.length === 0, 'SCHEMA_CHANGE_REQUIRES_SEPARATE_AUTHORIZATION');
    return;
  }
  if (!changed.length && !requireAdditive) return;
  check(changed.length === schemaSource.migrationFiles.length &&
    schemaSource.migrationFiles.every(pin => changed.filter(f => f.filename === pin.path &&
      f.status === pin.status && !f.previous_filename).length === 1), 'SCHEMA_MIGRATION_NOT_APPROVED');
}

export function validateCompletedCandidateCarryForward(bytes = readFileSync(
  new URL('../../governance/completed-m55-candidate-carry-forward-20261103.json', import.meta.url))) {
  check(Buffer.isBuffer(bytes) && sha256(bytes) === carryRecordSha256, 'COMPLETED_M55_CARRY_FORWARD_CHANGED');
  const c = JSON.parse(bytes), p = completedMigration55;
  const guard = schemaSource.cleanStartSources.find(pin => pin.path.endsWith('/ApplicationRecoveryMiddleware.cs'));
  check(c.contract === 'aqua.completed-m55-exact-candidate-carry-forward' && c.version === 1 &&
    c.candidateSha === carryCandidateSha && c.operationSourceSha === p.candidateSha &&
    c.completedEvidenceSha256 === objectDigest(p) && c.sourceManifestSha256 === p.sourceManifestSha256 &&
    c.policyScopeSha256 === p.policyScopeSha256 && c.targetsSha256 === p.targetsSha256 &&
    c.databaseIdentitySha256 === p.databaseIdentitySha256 && c.tenantId === p.tenantId && c.migrationId === p.migrationId &&
    c.migrationDefinitionSha256 === p.migrationDefinitionSha256 && c.reviewedSqlSha256 === p.reviewedSqlSha256 &&
    guard && c.guardOverride.path === guard.path && c.guardOverride.operationSourceSha256 === guard.sha256 &&
    digest(c.guardOverride.candidateSha256) &&
    sha256(completedAuthorityBytes) === p.ownerAuthorizationSha256 && sha256(completedOperationBytes) === p.operationEvidenceSha256 &&
    ['originalOperationEvidenceModified', 'historicalObservationTimesRefreshed', 'databaseOperationAuthorized',
      'financialActivationAuthorized', 'productionDeploymentAuthorized'].every(key => c[key] === false),
  'COMPLETED_M55_CARRY_FORWARD_SCOPE_REQUIRED');
  return c;
}

function validateCompletedMigration55Scope(q, policy) {
  const p = completedMigration55;
  let compatibility = null;
  if (q?.sha !== p.candidateSha) {
    if (q?.sha === readinessCandidateSha || q?.sha === pr121CandidateSha || q?.sha === firstAccountCandidateSha || q?.sha === rootUnboundCandidateSha || q?.sha === postResetCandidateSha || q?.sha === minimumLiveCandidateSha || q?.sha === d10OneTimeCandidateSha || q?.sha === verifiedHoldCandidateSha || q?.sha === unusedExpiryCandidateSha) {
      compatibility = (q.sha === unusedExpiryCandidateSha ? validateUnusedExpiryCandidate(q) :
        q.sha === verifiedHoldCandidateSha ? validateVerifiedHoldCandidate(q) :
        q.sha === d10OneTimeCandidateSha ? validateD10OneTimeCandidate(q) :
        q.sha === minimumLiveCandidateSha ? validateMinimumLiveCandidate(q) :
        q.sha === postResetCandidateSha ? validatePostResetCandidate(q) :
        q.sha === rootUnboundCandidateSha ? validateRootUnboundCandidate(q) :
        q.sha === firstAccountCandidateSha ? validateFirstAccountCandidate(q) :
        q.sha === pr121CandidateSha ? validatePr121Candidate(q) : validateReadinessCandidate(q)).completedCarry;
      const original = validateCompletedCandidateCarryForward();
      check(['operationSourceSha','completedEvidenceSha256','sourceManifestSha256','policyScopeSha256','targetsSha256',
        'databaseIdentitySha256','tenantId','migrationId','migrationDefinitionSha256','reviewedSqlSha256',
        'originalOperationEvidenceModified','historicalObservationTimesRefreshed','databaseOperationAuthorized',
        'financialActivationAuthorized','productionDeploymentAuthorized'].every(k => compatibility[k] === original[k]) &&
        compatibility.guardOverride.path === original.guardOverride.path &&
        compatibility.guardOverride.operationSourceSha256 === original.guardOverride.operationSourceSha256,
      'COMPLETED_M55_CARRY_FORWARD_SCOPE_REQUIRED');
    } else {
      check(q?.sha === carryCandidateSha || q?.sha === weeklyReadinessFixCandidateSha,
        'COMPLETED_M55_EXACT_SCOPE_REQUIRED');
      compatibility = validateCompletedCandidateCarryForward();
    }
  }
  check(objectDigest(policy.scope) === p.policyScopeSha256 &&
    objectDigest(fixedTargets) === p.targetsSha256 && objectDigest(schemaSource) === p.sourceManifestSha256 &&
    schemaSource.sourceSha === p.candidateSha && schemaSource.migrationId === p.migrationId &&
    schemaSource.migrationFiles[0]?.sha256 === p.migrationDefinitionSha256 &&
    schemaSource.cleanStartSources?.some(x => x.path.endsWith('/migration-55.reviewed.sql') && x.sha256 === p.reviewedSqlSha256),
  'COMPLETED_M55_EXACT_SCOPE_REQUIRED');
  return compatibility;
}

function validateCompletedMigration55Evidence(r, q, policy) {
  validateCompletedMigration55Scope(q, policy);
  const p = completedMigration55, e = r.alternativeEvidence, o = r.observation;
  check(exact(e, ['kind', 'historicalEvidenceDisposition', 'bundleSha256', 'ownerAuthorizationSha256',
    'ownerAuthorizationReference', 'operationEvidenceSha256', 'operationEvidenceReference']) &&
    e.kind === p.kind && e.historicalEvidenceDisposition === p.historicalEvidenceDisposition &&
    e.bundleSha256 === objectDigest(p) && e.ownerAuthorizationSha256 === p.ownerAuthorizationSha256 &&
    e.ownerAuthorizationReference === p.ownerAuthorizationReference && reference(e.ownerAuthorizationReference) &&
    e.operationEvidenceSha256 === p.operationEvidenceSha256 && e.operationEvidenceReference === p.operationEvidenceReference &&
    reference(e.operationEvidenceReference), 'COMPLETED_M55_PINNED_EVIDENCE_REQUIRED');
  const authority = JSON.parse(completedAuthorityBytes), operation = JSON.parse(completedOperationBytes);
  const d = authority.ownerDecision, s = authority.scope, b = authority.immutableExistingEvidence;
  check(sha256(completedAuthorityBytes) === p.ownerAuthorizationSha256 && sha256(completedOperationBytes) === p.operationEvidenceSha256 &&
    authority.businessDecisionStatus === 'CONFIRMED' && d.reducedHistoricalBaselineAssuranceExplicitlyAccepted === true &&
    d.historicalEvidenceDisposition === p.historicalEvidenceDisposition && d.historicalFingerprintsObservedReconstructedOrVerified === false &&
    d.minimumVersionedExecutorOwnedAmendmentAuthorized === true && d.onlyHistoricalPreDdlFingerprintPredicatesMayBeReplaced === true &&
    s.applicationSha === p.candidateSha && s.nativeDatabaseIdentitySha256 === p.databaseIdentitySha256 && s.tenantId === p.tenantId &&
    s.migrationId === p.migrationId && s.reviewedSqlSha256 === p.reviewedSqlSha256 &&
    s.renderServiceId === fixedTargets.render.id && s.vercelProjectId === fixedTargets.vercel.id && s.vercelTeamId === fixedTargets.vercel.teamId &&
    ['retirementConservationSha256', 'retirementAuthoritySha256', 'conservationAcceptanceSha256', 'migrationAuthoritySha256',
      'migrationVerificationSha256', 'cleanupSha256', 'beforeHistorySha256', 'afterHistorySha256'].every(k => b[k] === p[k]) &&
    b.operationRecordReference === p.operationEvidenceReference && operation.applicationSha === p.candidateSha &&
    operation.retirement.actualConservationDigest === p.retirementConservationSha256 && operation.retirement.ownerAuthorizationDigest === p.retirementAuthoritySha256 &&
    operation.retirement.actualConservationChecksPassed === 22 && operation.conservationAcceptance.recordDigest === p.conservationAcceptanceSha256 &&
    operation.migration.actualResultDigest === p.migrationVerificationSha256 && operation.migration.authorizationDigest === p.migrationAuthoritySha256 &&
    operation.migration.reviewedSqlDigest === p.reviewedSqlSha256 && operation.migration.migrationId === p.migrationId &&
    operation.migration.beforeCount === 54 && operation.migration.afterCount === 55 && operation.migration.existingHistoryUnchanged === true &&
    operation.migration.beforeHistoryDigest === p.beforeHistorySha256 && operation.migration.afterHistoryDigest === p.afterHistorySha256 &&
    operation.migration.actualVerificationChecksPassed === 21 && operation.migration.sourceFinancialParticipationAndAuditFingerprintsConserved === true &&
    operation.controlsAndRecovery.cleanupDigest === p.cleanupSha256 && operation.controlsAndRecovery.temporaryAccessRemovedOriginalAllowlistRestored === true &&
    operation.controlsAndRecovery.criticalProviderSettingsUnchanged === true && operation.unresolvedReadbackEvidence.schemaDigest === null &&
    operation.unresolvedReadbackEvidence.beforeSchemaDigest === null, 'COMPLETED_M55_AUTHORITY_OR_BUNDLE_INVALID');
  // The entire existing observation is pinned, not merely well-formed digests.
  // Missing historical fingerprints remain explicitly unavailable, never backfilled.
  check(objectDigest(o) === p.observationSha256 && o.candidateSha === p.candidateSha &&
    o.databaseIdentitySha256 === p.databaseIdentitySha256 && o.tenantId === p.tenantId &&
    o.cleanStart?.paymentAdmissionMode === 'OWNER_ATTESTED_TEST_ONLY_V1' &&
    o.cleanStart.schemaDigest === null && o.application?.beforeSchemaDigest === null &&
    o.cleanStart.ownerAuthorizationDigest === p.retirementAuthoritySha256 &&
    o.cleanStart.independentAcceptanceDigest === p.conservationAcceptanceSha256 &&
    o.application.beforeHistoryDigest === p.beforeHistorySha256 && o.application.afterHistoryDigest === p.afterHistorySha256,
  'COMPLETED_M55_OBSERVATION_CHANGED');
}

export function validateSchemaReadback(r, q, policy, hasBaseline, now = Date.now) {
  const clean = isCleanStartSchemaKind(policy.schemaFirst?.kind);
  const completed = policy.schemaFirst?.kind === completedMigration55PolicyKind;
  const ownerAttested = clean && r?.observation?.cleanStart?.paymentAdmissionMode === 'OWNER_ATTESTED_TEST_ONLY_V1';
  check(validSchemaPolicy(policy.schemaFirst), 'SCHEMA_POLICY_INVALID');
  check(r && objectDigest(r) === policy.schemaFirst.evidenceSha256, 'SCHEMA_EVIDENCE_CHANGED');
  check(exact(r, ['contract', 'version', 'status', 'observation', ...(completed ? ['alternativeEvidence'] : [])]) &&
    r.contract === 'aqua.commission-schema-first-readback' && r.version === (completed ? 4 : clean ? ownerAttested ? 3 : 2 : 1) && r.status === 'VERIFIED',
  'SCHEMA_EVIDENCE_REQUIRED');
  const o = r.observation;
  const compatibility = completed ? validateCompletedMigration55Scope(q, policy) : null;
  check(exact(o, ['candidateSha', 'observedAt', 'observer', 'databaseIdentitySha256', 'tenantId',
    clean ? 'cleanStart' : 'b6', 'authorization', 'application', 'controls', 'recovery']) && sha(o.candidateSha) &&
    (hasBaseline || o.candidateSha === q.sha || compatibility?.operationSourceSha === o.candidateSha) && digest(o.databaseIdentitySha256) &&
    Number.isSafeInteger(o.tenantId) && o.tenantId > 0, 'SCHEMA_SCOPE_MISMATCH');
  check(exact(o.observer, ['login', 'id']) && policy.authorization.administrators.some(
    a => a.login === o.observer.login && a.id === o.observer.id), 'SCHEMA_OBSERVER_UNAPPROVED');
  if (completed) validateCompletedMigration55Evidence(r, q, policy);
  if (clean) validateCleanStart(o.cleanStart, o, policy, completed);
  else check(exact(o.b6, ['status', 'databaseIdentitySha256', 'tenantId', 'migrationCount',
    'schemaDigest', 'acquisitionDigest', 'acceptedAt', 'evidenceReference']) &&
    o.b6.status === 'ACQUISITION_ACCEPTED' && o.b6.databaseIdentitySha256 === o.databaseIdentitySha256 &&
    o.b6.tenantId === o.tenantId && o.b6.migrationCount === 54 && digest(o.b6.schemaDigest) &&
    digest(o.b6.acquisitionDigest) && reference(o.b6.evidenceReference), 'B6_PRE_DDL_ACQUISITION_REQUIRED');
  check(exact(o.authorization, ['status', 'migrationId', 'sourceSha', 'migrationSha256', 'authorizedBy', 'authorizedAt', 'evidenceReference']) &&
    o.authorization.status === 'AUTHORIZED' && o.authorization.migrationId === schemaSource.migrationId &&
    o.authorization.sourceSha === o.candidateSha &&
    o.authorization.migrationSha256 === schemaSource.migrationFiles[0].sha256 &&
    exact(o.authorization.authorizedBy, ['login', 'id']) && policy.authorization.administrators.some(
      a => a.login === o.authorization.authorizedBy.login && a.id === o.authorization.authorizedBy.id) &&
    reference(o.authorization.evidenceReference),
  'EXACT_MIGRATION_AUTHORIZATION_REQUIRED');
  const population = clean ? o.cleanStart : o.b6;
  const a = o.application;
  check(exact(a, ['migrationId', 'appliedAt', 'beforeCount', 'afterCount', 'beforeSchemaDigest',
    'beforeHistoryDigest', 'afterHistoryDigest', 'existingHistoryUnchanged', 'appendOnlyGuardsVerified',
    'evidenceReference']) && a.migrationId === schemaSource.migrationId && a.beforeCount === 54 &&
    a.afterCount === 55 && a.beforeSchemaDigest === population.schemaDigest &&
    digest(a.beforeHistoryDigest) && digest(a.afterHistoryDigest) && a.beforeHistoryDigest !== a.afterHistoryDigest &&
    a.existingHistoryUnchanged === true &&
    a.appendOnlyGuardsVerified === true && reference(a.evidenceReference), 'APPLIED_ADDITIVE_SCHEMA_REQUIRED');
  const time = now();
  check([o.observedAt, population.acceptedAt, o.authorization.authorizedAt, a.appliedAt].every(utc) &&
    Date.parse(population.acceptedAt) <= Date.parse(o.authorization.authorizedAt) &&
    Date.parse(o.authorization.authorizedAt) < Date.parse(a.appliedAt) &&
    Date.parse(a.appliedAt) <= Date.parse(o.observedAt) && Number.isFinite(time) &&
    Date.parse(o.observedAt) <= time,
  completed ? 'COMPLETED_M55_CHRONOLOGY_INVALID' : clean ? 'CLEAN_START_MIGRATION_ORDER_INVALID' :
    'B6_AUTHORIZATION_DDL_ORDER_OR_FRESHNESS_INVALID');
  // The exact completed operation is immutable history, not a current B6 readback
  // or a fresh production-state observation. Never re-date it to renew eligibility.
  // Current CI, live holds/readiness and first-release recovery retain their gates.
  if (!completed) check(hasBaseline || Date.parse(o.observedAt) >= time - policy.authorization.maxCiAgeSeconds * 1000,
    clean ? 'CLEAN_START_SCHEMA_EVIDENCE_EXPIRED' : 'B6_AUTHORIZATION_DDL_ORDER_OR_FRESHNESS_INVALID');
  check(exact(o.controls, ['financialOperationsHeld', 'v2CommissioningHeld', 'workersHeld',
    'startupMigrationsDisabled', 'evidenceReference']) && o.controls.financialOperationsHeld === true &&
    o.controls.v2CommissioningHeld === true && o.controls.workersHeld === true &&
    o.controls.startupMigrationsDisabled === true && reference(o.controls.evidenceReference),
  'SCHEMA_RELEASE_FENCES_REQUIRED');
  check(exact(o.recovery, ['mode', 'sourceSha', 'sourceAvailable', 'schemaPreserved', 'invalidationsPreserved',
    'payoutGuardsPreserved', 'legacyFinancialRollbackAllowed', 'evidenceReference']) &&
    o.recovery.mode === 'forward-only-hold-aware' && o.recovery.sourceSha === o.candidateSha &&
    o.recovery.sourceAvailable === true && o.recovery.schemaPreserved === true &&
    o.recovery.invalidationsPreserved === true && o.recovery.payoutGuardsPreserved === true &&
    o.recovery.legacyFinancialRollbackAllowed === false && reference(o.recovery.evidenceReference),
  'HOLD_PRESERVING_FORWARD_RECOVERY_REQUIRED');
  return { evidenceSha256: objectDigest(r), migrationId: schemaSource.migrationId,
    initialSourceSha: o.candidateSha, recoveryMode: o.recovery.mode, ...(completed ? {
      schemaEvidenceKind: completedMigration55.kind,
      historicalEvidenceDisposition: completedMigration55.historicalEvidenceDisposition } : {}) };
}

function validateCleanStart(c, o, policy, completed) {
  const ownerAttested = c?.paymentAdmissionMode === 'OWNER_ATTESTED_TEST_ONLY_V1';
  const classificationFields = ownerAttested ? ['paymentAdmissionMode','ownerTestOnlyAttestationDigest',
    'ownerAttestsNoGenuineMemberships','providerModeVerification','paymentEvidenceConserved',
    'paymentEvidenceDigest','resetPaymentEvidenceDigest','tenantFinancialRecordsDigest','resetTenantFinancialRecordsDigest',
    'auditHistoryPreserved','historicalCommissionInputsHeld'] : ['genuineMembershipCount','realFinancialExposureCount'];
  check(exact(c, ['mode','status','databaseIdentitySha256','tenantId','migrationCount','schemaDigest',
    'classificationDigest','preflightDigest','resetSqlDigest','resetReceiptDigest','ownerAuthorizationDigest',
    'independentAcceptanceDigest','independenceRecordDigest','resetAt','acceptedAt','evidenceReference',
    'operator','reviewer','independenceVerified','protectedRecordsPreserved',
    'unclassifiedCount','activeHistoricalCount','automaticPayoutsDisabled',
    'recoveryEvidenceDigest','noAdditionalChargeConfirmed',...classificationFields]) && c.mode === 'CLEAN_START' && c.status === 'RESET_ACCEPTED' &&
    c.tenantId === 1 && c.tenantId === o.tenantId && c.databaseIdentitySha256 === o.databaseIdentitySha256 &&
    c.migrationCount === 54 && c.protectedRecordsPreserved === true && c.automaticPayoutsDisabled === true &&
    c.noAdditionalChargeConfirmed === true && c.independenceVerified === true &&
    ['unclassifiedCount','activeHistoricalCount'].every(k => c[k] === 0) &&
    [...(completed ? [] : ['schemaDigest']),'classificationDigest','preflightDigest','resetSqlDigest','resetReceiptDigest','ownerAuthorizationDigest',
      'independentAcceptanceDigest','independenceRecordDigest','recoveryEvidenceDigest'].every(k => digest(c[k])) &&
    exact(c.operator,['login','id']) && c.operator.login === 'Xolani-M' && c.operator.id === 86495928 &&
    exact(c.reviewer,['login','id']) && c.reviewer.login === 'aqualifestyleclub' && c.reviewer.id === 307076734 &&
    policy.authorization.administrators.some(a => a.login === c.operator.login && a.id === c.operator.id) &&
    reference(c.evidenceReference) && utc(c.resetAt) && utc(c.acceptedAt) &&
    Date.parse(c.resetAt) <= Date.parse(c.acceptedAt), 'CLEAN_START_CLASSIFICATION_RESET_AND_INDEPENDENT_ACCEPTANCE_REQUIRED');
  // Account identities select the approved principals. Actual human independence
  // must additionally be verified in the protected record bound above.
  if (ownerAttested) {
    check(c.ownerAttestsNoGenuineMemberships === true && c.providerModeVerification === 'NOT_INDEPENDENTLY_VERIFIED' &&
      c.auditHistoryPreserved === true && c.historicalCommissionInputsHeld === true &&
      c.paymentEvidenceConserved === true &&
      ['ownerTestOnlyAttestationDigest','paymentEvidenceDigest','resetPaymentEvidenceDigest',
        'tenantFinancialRecordsDigest','resetTenantFinancialRecordsDigest'].every(k => digest(c[k]) && c[k] !== '0'.repeat(64)) &&
      c.paymentEvidenceDigest === c.resetPaymentEvidenceDigest && c.tenantFinancialRecordsDigest === c.resetTenantFinancialRecordsDigest,
    'CLEAN_START_OWNER_ATTESTATION_AND_PAYMENT_PRESERVATION_REQUIRED');
  } else check(c.genuineMembershipCount === 0 && c.realFinancialExposureCount === 0,
    'CLEAN_START_VERIFIED_ZERO_EXPOSURE_REQUIRED');
  check(schemaSource.cleanStartSources?.some(p => p.path.endsWith('/reset.sql') && p.sha256 === c.resetSqlDigest),
    'CLEAN_START_RESET_SQL_NOT_PINNED');
}

export async function verifySchemaFirst(api, q, policy, readSource, readback = approvedSchemaReadback,
  hasBaseline = false, now = Date.now) {
  if (policy.version !== 7) return null; // Explicit historical policy, never an evidence fallback.
  check(validSchemaPolicy(policy.schemaFirst), 'SCHEMA_POLICY_INVALID');
  const clean = isCleanStartSchemaKind(policy.schemaFirst.kind);
  const compatibility = policy.schemaFirst.kind === completedMigration55PolicyKind ? validateCompletedMigration55Scope(q, policy) : null;
  check(!clean || schemaSource.cleanStartSources?.length > 0, 'CLEAN_START_SOURCES_NOT_PINNED');
  for (const pin of [...schemaSource.migrationFiles, ...schemaSource.holdSources,
    ...(clean ? schemaSource.cleanStartSources : [])])
    check(await readSource(pin.path) === (compatibility?.sourceOverrides?.find(p => p.path === pin.path)?.candidateSha256 ??
      (compatibility?.guardOverride.path === pin.path ? compatibility.guardOverride.candidateSha256 : pin.sha256)),
    'SCHEMA_OR_PAYOUT_GUARD_SOURCE_CHANGED');
  // The legacy-to-candidate diff must contain exactly the three pinned schema
  // files, including on later code-only releases. No further DDL is authorized.
  validateMigrationDelta(await api.gh(`/compare/${policy.firstReleaseRecovery.baseline.renderSha}...${q.sha}`), true, true);
  if (compatibility) {
    const ancestry = await api.gh(`/compare/${compatibility.operationSourceSha}...${q.sha}`);
    check(ancestry && ancestry.status === 'ahead', 'COMPLETED_M55_CANDIDATE_ANCESTRY_REQUIRED');
    validateMigrationDelta(ancestry, false);
  }
  if (q.qualificationOnly) return null; // Purpose-bound receipts cannot deploy.
  const proof = validateSchemaReadback(readback, q, policy, hasBaseline, now);
  if (proof.initialSourceSha !== q.sha) {
    if (compatibility) {
      check(proof.initialSourceSha === compatibility.operationSourceSha, 'COMPLETED_M55_OPERATION_SOURCE_CHANGED');
      return proof;
    }
    const ancestry = await api.gh(`/compare/${proof.initialSourceSha}...${q.sha}`);
    check(hasBaseline && ancestry.status === 'ahead', 'SCHEMA_SOURCE_NOT_AUTHORIZED_DESCENDANT');
  }
  return proof;
}
