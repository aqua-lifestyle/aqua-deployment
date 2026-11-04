import { readFileSync } from 'node:fs';
import { objectDigest, sha256 } from './github-evidence.mjs';
import { validateCompletedCandidateCarryForward } from './commission-schema-first.mjs';
const nativeSource = JSON.parse(readFileSync(new URL('./native-recovery-source.json', import.meta.url)));
const fixedTargets = JSON.parse(readFileSync(new URL('./targets.json', import.meta.url)));
export const nativeRecoveryPolicyKind = 'held-native-first-release-recovery-v1';

// Exact owner-authorized legacy pair. These are deployment identities, not an
// assertion of frontend source provenance. Never accept pins from dispatch input.
export const legacyRecoveryPair = Object.freeze({
  renderServiceId: 'srv-d9f0k8e1a83c73d8n1b0',
  renderDeployId: 'dep-db8av3dg1s2s739m6sgg',
  renderSha: '1251fb82979e18be53d1d0e7f5c6fab2d0c50a58',
  vercelTeamId: 'team_Hc3BWfhTLfwLzwbgbtaasBUY',
  vercelProjectId: 'prj_6qL1e43KhsWrRshY5GxdmGl3HGMz',
  vercelDeployId: 'dpl_EwGB3apX3P5JnU5KfG3rLzn21Kgf',
  productionDomain: 'www.aqualifestyleclub.co.za',
  rootDirectory: 'AqualLifeStyle/9.4.2/aqua-frontend'
});
export const approvedRecoveryReadback = JSON.parse(readFileSync(
  new URL('../../governance/first-release-recovery-readback-20261104.json', import.meta.url), 'utf8'));
export class FirstReleaseRecoveryDenied extends Error {}
const check = (ok, code) => { if (!ok) throw new FirstReleaseRecoveryDenied(code); };
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...keys].sort().join(',');

function validateNativeRecovery(o, candidate, policy, schemaProof) {
  const p = nativeSource, n = o.nativeRecovery;
  // Reuse the already-pinned exact candidate carry-forward. The completed
  // operation/authority keep their original source; this is not general ancestry.
  const carried = candidate.sha !== p.candidateSha;
  const carry = carried ? validateCompletedCandidateCarryForward() : null;
  const observationPins = carried ? p.currentObservation : p;
  check(exact(o, ['observedAt', 'expiresAt', 'observer', 'candidateSha', 'baseline', 'nativeRecovery', 'compatibility', 'recovery']) &&
    o.candidateSha === candidate.sha && (carried ?
      candidate.sha === carry.candidateSha && carry.operationSourceSha === p.candidateSha &&
      carry.policyScopeSha256 === p.policyScopeSha256 && carry.targetsSha256 === p.targetsSha256 &&
      carry.databaseIdentitySha256 === p.databaseIdentitySha256 && carry.tenantId === p.tenantId : candidate.sha === p.candidateSha) &&
    objectDigest(o.baseline) === objectDigest(p.heldPair) &&
    objectDigest(policy.firstReleaseRecovery.baseline) === objectDigest(legacyRecoveryPair) &&
    policy.firstReleaseRecovery.baseline.renderSha === p.sourceComparisonBaselineSha &&
    objectDigest(policy.scope) === p.policyScopeSha256 && objectDigest(fixedTargets) === p.targetsSha256 &&
    schemaProof?.initialSourceSha === p.candidateSha && schemaProof.evidenceSha256 === p.schemaEvidenceSha256 &&
    schemaProof.schemaEvidenceKind === 'COMPLETED_ADDITIVE_MIGRATION55_V1', 'NATIVE_RECOVERY_EXACT_SCOPE_REQUIRED');
  check(exact(n, ['mode', 'receiverSourceSha', 'sourceAvailable', 'usesCurrentConfiguration', 'cachedArtifactEligibility',
    'cachedRollbackAuthorized', 'databaseRollbackAllowed', 'databaseIdentitySha256', 'tenantId',
    'ownerAuthoritySha256', 'ownerAuthorityReference', 'observationSha256', 'observationReference',
    'frontendSourceEvidenceSha256', 'frontendSourceEvidenceReference']) &&
    n.mode === 'health-gated-exact-source-held-redeploy-v1' && n.receiverSourceSha === p.heldPair.renderSha &&
    n.sourceAvailable === true && n.usesCurrentConfiguration === true && n.cachedArtifactEligibility === 'NOT_VERIFIED' &&
    n.cachedRollbackAuthorized === false && n.databaseRollbackAllowed === false && n.databaseIdentitySha256 === p.databaseIdentitySha256 && n.tenantId === p.tenantId &&
    ['ownerAuthoritySha256', 'ownerAuthorityReference', 'frontendSourceEvidenceSha256', 'frontendSourceEvidenceReference'].every(k => n[k] === p[k]) &&
    ['observationSha256', 'observationReference'].every(k => n[k] === observationPins[k]), 'NATIVE_RECOVERY_EVIDENCE_REQUIRED');
  const records = [
    ['native-held-recovery-authority-20261102.json', p.ownerAuthoritySha256],
    ['native-held-baseline-observation-20261102.json', p.observationSha256],
    ['held-frontend-source-evidence-20261029.json', p.frontendSourceEvidenceSha256]
  ].map(([name, digest]) => { const bytes = readFileSync(new URL('../../governance/' + name, import.meta.url));
    check(sha256(bytes) === digest, 'NATIVE_RECOVERY_RECORD_CHANGED'); return JSON.parse(bytes); });
  const [authority, observed, frontend] = records, v = observed.verification, m = observed.nativeMechanism;
  check(authority.businessDecisionStatus === 'CONFIRMED' && authority.decision.minimumVersionedNativeRecoveryAdmissionAmendmentAuthorized === true &&
    authority.decision.actualVerifiedHeldProviderBaselineRequired === true && authority.decision.sourceAndMigrationComparisonBaselinesMustRemainUnchanged === true &&
    authority.decision.cachedArtifactAvailabilityOrEligibilityMayNotBeAssumed === true &&
    authority.scope.candidateSha === p.candidateSha && authority.scope.nativeDatabaseIdentitySha256 === p.databaseIdentitySha256 && authority.scope.tenantId === p.tenantId &&
    (carried || observed.observedAt === o.observedAt) && objectDigest(observed.baseline) === objectDigest(p.heldPair) &&
    observed.producer.result === 'success' && observed.producer.actor === o.observer.login && observed.producer.actorId === o.observer.id &&
    observed.producer.workflow === 'provider-credential-check.yml' && observed.producer.mode === 'native-recovery-readback' &&
    v.allAuthenticatedGetChecksSucceeded === true && v.exactRenderRevisionLiveAndHealthy === true && v.exactVercelDeploymentReady === true &&
    v.projectTeamRootAndAuthoritativeDomainMappingVerifiedBeforeAndAfter === true && v.operationalHoldsVerified === true &&
    v.serviceType === 'web_service' && v.runtime === 'docker' && v.plan === 'starter' && v.instances === 1 &&
    v.attachedPersistentDisk === false && v.healthCheckPath === '/api/health' && v.autoDeploy === 'off' && v.maintenance === false &&
    m.selected === n.mode && m.sourceSha === n.receiverSourceSha && m.sourceAvailable === true &&
    m.cachedArtifactEligibility === 'NOT_VERIFIED' && m.cachedArtifactRollbackAuthorizedByThisRecord === false &&
    observed.schemaCompatibility.heldReceiverSchema55Compatible === true && observed.schemaCompatibility.databaseRollbackAllowed === false &&
    observed.schemaCompatibility.acceptedSchemaEvidenceSha256 === schemaProof.evidenceSha256 &&
    frontend.qualificationResult === 'PASS' && frontend.deploymentId === p.heldPair.vercelDeployId && frontend.sourceSha === p.heldPair.vercelSha &&
    observed.frontendSource.qualificationRecordSha256 === frontend.protectedQualificationRecordSha256 &&
    observed.frontendSource.sourceProofSha256 === frontend.sourceProofSha256, 'NATIVE_RECOVERY_VERIFIED_OBSERVATION_REQUIRED');
  if (carried) {
    const bytes = readFileSync(new URL('../../governance/native-held-baseline-observation-20261104.json', import.meta.url));
    check(sha256(bytes) === observationPins.observationSha256, 'NATIVE_RECOVERY_RECORD_CHANGED');
    const current = JSON.parse(bytes), producer = current.producer;
    const { vercelSha, ...pair } = p.heldPair;
    check(current.contract === 'aqua.native-recovery-baseline-observation' && current.version === 1 && current.status === 'VERIFIED' &&
      current.observedAt === o.observedAt && producer.runId === observationPins.runId && producer.runAttempt === observationPins.runAttempt &&
      producer.executorSha === observationPins.executorSha && producer.workflow === 'provider-credential-check.yml' && producer.mode === 'native-recovery-readback' &&
      producer.actor === o.observer.login && producer.actorId === String(o.observer.id) &&
      objectDigest(current.baseline) === objectDigest(pair) && current.frontendSource.sha === vercelSha &&
      current.frontendSource.qualificationRecordSha256 === frontend.protectedQualificationRecordSha256 &&
      current.frontendSource.sourceProofSha256 === frontend.sourceProofSha256 &&
      current.serviceProfile.operationalHoldsVerified === true && current.renderDeploymentState.live.id === pair.renderDeployId &&
      current.renderDeploymentState.live.revision === pair.renderSha && current.renderDeploymentState.live.status === 'live' &&
      current.authenticatedReads.length > 0 && current.authenticatedReads.every(r => r.httpStatus === 200) &&
      current.readStatusSha256 === sha256(Buffer.from(JSON.stringify(current.authenticatedReads))),
    'NATIVE_RECOVERY_VERIFIED_OBSERVATION_REQUIRED');
  }
  check(exact(o.compatibility, ['schemaAndData', 'configuration', 'evidenceReference']) &&
    o.compatibility.schemaAndData === 'HELD_RECEIVER_SCHEMA55_ONLY' && o.compatibility.configuration === true && o.compatibility.evidenceReference === observationPins.observationReference &&
    exact(o.recovery, ['mode', 'sourceSha', 'schemaEvidenceSha256', 'legacyFinancialRollbackAllowed']) &&
    o.recovery.mode === 'forward-only-hold-aware' && o.recovery.sourceSha === candidate.sha &&
    o.recovery.schemaEvidenceSha256 === schemaProof.evidenceSha256 && o.recovery.legacyFinancialRollbackAllowed === false,
  'NATIVE_RECOVERY_HOLD_PRESERVING_METHOD_REQUIRED');
  return { kind: nativeRecoveryPolicyKind, frontendSourceProvenance: 'VERIFIED_MEMBER_SOURCE_AUDIT',
    nativeRecoveryMode: n.mode, cachedArtifactEligibility: n.cachedArtifactEligibility,
    cachedRollbackAuthorized: false, databaseRollbackAllowed: false, ...p.heldPair };
}

export function validNativeHeldFrontend(proof, web) {
  const p = nativeSource.heldPair;
  return proof?.kind === nativeRecoveryPolicyKind && proof.vercelDeployId === p.vercelDeployId && proof.vercelSha === p.vercelSha &&
    web.id === p.vercelDeployId && web.projectId === p.vercelProjectId && (!web.gitSource ||
      web.gitSource.sha === p.vercelSha && String(web.gitSource.repoId) === nativeSource.sourceRepositoryId);
}

// Same custody model as the existing administrator ruleset readback: original,
// non-secret operator evidence is reviewed in a protected executor merge. This
// is not independent provider attestation, a self-hash, or rollback execution.
export function validateFirstReleaseRecovery(readback, candidate, policy, now = Date.now, schemaProof = null) {
  const native = policy.firstReleaseRecovery?.kind === nativeRecoveryPolicyKind;
  check(readback && typeof readback === 'object' && !Array.isArray(readback),
    'FIRST_RELEASE_RECOVERY_EVIDENCE_REQUIRED');
  check(objectDigest(readback) === policy.firstReleaseRecovery.evidenceSha256,
    'FIRST_RELEASE_RECOVERY_EVIDENCE_CHANGED');
  check(exact(readback, ['contract', 'version', 'status', 'observation']) &&
    readback.contract === 'aqua.first-release-recovery-readback' && readback.version === (native ? 3 : schemaProof ? 2 : 1) &&
    readback.status === 'VERIFIED', 'FIRST_RELEASE_RECOVERY_EVIDENCE_REQUIRED');
  const o = readback.observation;
  check(exact(o, ['observedAt', 'expiresAt', 'observer', 'candidateSha', 'baseline',
    ...(native ? ['nativeRecovery'] : ['renderArtifact', 'vercelArtifact']), 'compatibility', ...(schemaProof ? ['recovery'] : [])]), 'FIRST_RELEASE_RECOVERY_EVIDENCE_INVALID');
  const time = now(), observed = Date.parse(o.observedAt), expiry = Date.parse(o.expiresAt);
  check(Number.isFinite(time) && Number.isFinite(observed) && Number.isFinite(expiry) &&
    observed <= time + 30_000 && observed >= time - policy.authorization.maxCiAgeSeconds * 1000 &&
    expiry > time && expiry > observed && expiry <= observed + policy.authorization.maxCiAgeSeconds * 1000,
    'FIRST_RELEASE_RECOVERY_EVIDENCE_EXPIRED');
  check(exact(o.observer, ['login', 'id']) && policy.authorization.administrators.some(
    a => a.login === o.observer.login && a.id === o.observer.id), 'FIRST_RELEASE_RECOVERY_OBSERVER_UNAPPROVED');
  if (native) return { ...validateNativeRecovery(o, candidate, policy, schemaProof), evidenceSha256: objectDigest(readback) };
  check(o.candidateSha === candidate.sha && objectDigest(o.baseline) === objectDigest(legacyRecoveryPair),
    'FIRST_RELEASE_RECOVERY_IDENTITY_MISMATCH');
  // Fixed-origin, immutable supporting records, not arbitrary URLs to retrieve
  // with a credential. Their interpretation is the named operator's approval.
  const reference = value => typeof value === 'string' &&
    /^https:\/\/github\.com\/aqua-lifestyle\/aqua-deployment\/blob\/[a-f0-9]{40}\/governance\/[A-Za-z0-9_./-]+$/.test(value) &&
    !value.split('/').includes('..');
  for (const artifact of [o.renderArtifact, o.vercelArtifact]) {
    check(exact(artifact, ['retrievable', 'rollbackEligible', 'evidenceReference']) &&
      artifact.retrievable === true && artifact.rollbackEligible === true && reference(artifact.evidenceReference),
      'FIRST_RELEASE_RECOVERY_ARTIFACT_UNAVAILABLE');
  }
  check(exact(o.compatibility, ['schemaAndData', 'configuration', 'evidenceReference']) &&
    o.compatibility.schemaAndData === !schemaProof && o.compatibility.configuration === true &&
    reference(o.compatibility.evidenceReference), 'FIRST_RELEASE_RECOVERY_COMPATIBILITY_UNVERIFIED');
  if (schemaProof) check(exact(o.recovery, ['mode', 'sourceSha', 'schemaEvidenceSha256', 'legacyFinancialRollbackAllowed']) &&
    o.recovery.mode === 'forward-only-hold-aware' && o.recovery.sourceSha === candidate.sha &&
    o.recovery.schemaEvidenceSha256 === schemaProof.evidenceSha256 &&
    o.recovery.legacyFinancialRollbackAllowed === false, 'FIRST_RELEASE_FORWARD_RECOVERY_REQUIRED');
  return { kind: schemaProof ? 'pinned-legacy-forward-remediation-v1' : 'pinned-legacy-retained-artifact-v1', evidenceSha256: objectDigest(readback),
    frontendSourceProvenance: 'UNVERIFIED_LEGACY', ...legacyRecoveryPair };
}

export function validateLegacyProviderPair(proof, render, web, project, domain, acknowledgedReplacementId, aliasEvidence) {
  // After an acknowledged Vercel operation, the alias may legitimately have
  // moved. Only the exact ID from the validated same-run receipt permits this;
  // never select a different baseline or accept an unreceipted replacement.
  const moved = /^dpl_[A-Za-z0-9]+$/.test(acknowledgedReplacementId ?? '') &&
    acknowledgedReplacementId !== proof.vercelDeployId &&
    project.targets?.production?.id === acknowledgedReplacementId;
  const aliasDeploymentId = moved ? acknowledgedReplacementId : proof.vercelDeployId;
  // Deployment.alias is not authoritative for custom domains. This response
  // must come from GET /v2/deployments/<exact ID>/aliases on the fixed team.
  // Never fall back to embedded aliases, custom metadata or a project target.
  const aliases = aliasEvidence?.aliases;
  const matches = Array.isArray(aliases) ? aliases.filter(a => a?.alias === proof.productionDomain) : [];
  const mapped = aliasEvidence?.deploymentId === aliasDeploymentId && Array.isArray(aliases) &&
    aliases.every(a => a && typeof a.alias === 'string') && matches.length === 1 &&
    !matches[0].redirect &&
    (matches[0].deploymentId === undefined || matches[0].deploymentId === aliasDeploymentId) &&
    (matches[0].projectId === undefined || matches[0].projectId === proof.vercelProjectId);
  check(render.id === proof.renderDeployId && render.commit?.id === proof.renderSha &&
    ['live', 'deactivated'].includes(render.status) && project.id === proof.vercelProjectId &&
    project.accountId === proof.vercelTeamId && project.rootDirectory === proof.rootDirectory &&
    web.id === proof.vercelDeployId && web.projectId === proof.vercelProjectId &&
    web.target === 'production' && web.readyState === 'READY' && !web.aliasError &&
    mapped &&
    domain?.name === proof.productionDomain && domain.projectId === proof.vercelProjectId &&
    domain.verified === true && !domain.redirect,
    'FIRST_RELEASE_RECOVERY_PROVIDER_IDENTITY_MISMATCH');
}
