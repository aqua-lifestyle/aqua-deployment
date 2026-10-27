import { readFileSync } from 'node:fs';
import { objectDigest } from './github-evidence.mjs';

// Executor-owned pins from the frozen, CI-qualified application. No candidate
// manifest, dispatch input or migration command can extend this exception.
export const schemaSource = JSON.parse(readFileSync(new URL('./commission-schema-source.json', import.meta.url)));
export const approvedSchemaReadback = JSON.parse(readFileSync(
  new URL('../../governance/commission-schema-readback.json', import.meta.url)));
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
    ['commission-invalidation-schema-first-v1', 'commission-invalidation-clean-start-v1'].includes(p.kind) &&
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

export function validateSchemaReadback(r, q, policy, hasBaseline, now = Date.now) {
  const clean = policy.schemaFirst?.kind === 'commission-invalidation-clean-start-v1';
  check(validSchemaPolicy(policy.schemaFirst), 'SCHEMA_POLICY_INVALID');
  check(r && objectDigest(r) === policy.schemaFirst.evidenceSha256, 'SCHEMA_EVIDENCE_CHANGED');
  check(exact(r, ['contract', 'version', 'status', 'observation']) &&
    r.contract === 'aqua.commission-schema-first-readback' && r.version === (clean ? 2 : 1) && r.status === 'VERIFIED',
  'SCHEMA_EVIDENCE_REQUIRED');
  const o = r.observation;
  check(exact(o, ['candidateSha', 'observedAt', 'observer', 'databaseIdentitySha256', 'tenantId',
    clean ? 'cleanStart' : 'b6', 'authorization', 'application', 'controls', 'recovery']) && sha(o.candidateSha) &&
    (hasBaseline || o.candidateSha === q.sha) && digest(o.databaseIdentitySha256) &&
    Number.isSafeInteger(o.tenantId) && o.tenantId > 0, 'SCHEMA_SCOPE_MISMATCH');
  check(exact(o.observer, ['login', 'id']) && policy.authorization.administrators.some(
    a => a.login === o.observer.login && a.id === o.observer.id), 'SCHEMA_OBSERVER_UNAPPROVED');
  if (clean) validateCleanStart(o.cleanStart, o, policy);
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
    Date.parse(o.observedAt) <= time && (hasBaseline ||
      Date.parse(o.observedAt) >= time - policy.authorization.maxCiAgeSeconds * 1000),
  'B6_AUTHORIZATION_DDL_ORDER_OR_FRESHNESS_INVALID');
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
    initialSourceSha: o.candidateSha, recoveryMode: o.recovery.mode };
}

function validateCleanStart(c, o, policy) {
  check(exact(c, ['mode','status','databaseIdentitySha256','tenantId','migrationCount','schemaDigest',
    'classificationDigest','preflightDigest','resetSqlDigest','resetReceiptDigest','ownerAuthorizationDigest',
    'independentAcceptanceDigest','independenceRecordDigest','resetAt','acceptedAt','evidenceReference',
    'operator','reviewer','independenceVerified','protectedRecordsPreserved','genuineMembershipCount',
    'realFinancialExposureCount','unclassifiedCount','activeHistoricalCount','automaticPayoutsDisabled',
    'recoveryEvidenceDigest','noAdditionalChargeConfirmed']) && c.mode === 'CLEAN_START' && c.status === 'RESET_ACCEPTED' &&
    c.tenantId === 1 && c.tenantId === o.tenantId && c.databaseIdentitySha256 === o.databaseIdentitySha256 &&
    c.migrationCount === 54 && c.protectedRecordsPreserved === true && c.automaticPayoutsDisabled === true &&
    c.noAdditionalChargeConfirmed === true && c.independenceVerified === true &&
    ['genuineMembershipCount','realFinancialExposureCount','unclassifiedCount','activeHistoricalCount'].every(k => c[k] === 0) &&
    ['schemaDigest','classificationDigest','preflightDigest','resetSqlDigest','resetReceiptDigest','ownerAuthorizationDigest',
      'independentAcceptanceDigest','independenceRecordDigest','recoveryEvidenceDigest'].every(k => digest(c[k])) &&
    exact(c.operator,['login','id']) && c.operator.login === 'Xolani-M' && c.operator.id === 86495928 &&
    exact(c.reviewer,['login','id']) && c.reviewer.login === 'aqualifestyleclub' && c.reviewer.id === 307076734 &&
    policy.authorization.administrators.some(a => a.login === c.operator.login && a.id === c.operator.id) &&
    reference(c.evidenceReference) && utc(c.resetAt) && utc(c.acceptedAt) &&
    Date.parse(c.resetAt) <= Date.parse(c.acceptedAt), 'CLEAN_START_CLASSIFICATION_RESET_AND_INDEPENDENT_ACCEPTANCE_REQUIRED');
  // Account identities select the approved principals. Actual human independence
  // must additionally be verified in the protected record bound above.
  check(schemaSource.cleanStartSources?.some(p => p.path.endsWith('/reset.sql') && p.sha256 === c.resetSqlDigest),
    'CLEAN_START_RESET_SQL_NOT_PINNED');
}

export async function verifySchemaFirst(api, q, policy, readSource, readback = approvedSchemaReadback,
  hasBaseline = false, now = Date.now) {
  if (policy.version !== 7) return null; // Explicit historical policy, never an evidence fallback.
  check(validSchemaPolicy(policy.schemaFirst), 'SCHEMA_POLICY_INVALID');
  const clean = policy.schemaFirst.kind === 'commission-invalidation-clean-start-v1';
  check(!clean || schemaSource.cleanStartSources?.length > 0, 'CLEAN_START_SOURCES_NOT_PINNED');
  for (const pin of [...schemaSource.migrationFiles, ...schemaSource.holdSources,
    ...(clean ? schemaSource.cleanStartSources : [])])
    check(await readSource(pin.path) === pin.sha256, 'SCHEMA_OR_PAYOUT_GUARD_SOURCE_CHANGED');
  // The legacy-to-candidate diff must contain exactly the three pinned schema
  // files, including on later code-only releases. No further DDL is authorized.
  validateMigrationDelta(await api.gh(`/compare/${policy.firstReleaseRecovery.baseline.renderSha}...${q.sha}`), true, true);
  if (q.qualificationOnly) return null; // Purpose-bound receipts cannot deploy.
  const proof = validateSchemaReadback(readback, q, policy, hasBaseline, now);
  if (proof.initialSourceSha !== q.sha) {
    const ancestry = await api.gh(`/compare/${proof.initialSourceSha}...${q.sha}`);
    check(hasBaseline && ancestry.status === 'ahead', 'SCHEMA_SOURCE_NOT_AUTHORIZED_DESCENDANT');
  }
  return proof;
}
