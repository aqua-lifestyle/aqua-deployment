import { readFileSync } from 'node:fs';
import { objectDigest } from './github-evidence.mjs';

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
  new URL('../../governance/first-release-recovery-readback.json', import.meta.url), 'utf8'));
export class FirstReleaseRecoveryDenied extends Error {}
const check = (ok, code) => { if (!ok) throw new FirstReleaseRecoveryDenied(code); };
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...keys].sort().join(',');

// Same custody model as the existing administrator ruleset readback: original,
// non-secret operator evidence is reviewed in a protected executor merge. This
// is not independent provider attestation, a self-hash, or rollback execution.
export function validateFirstReleaseRecovery(readback, candidate, policy, now = Date.now) {
  check(readback && typeof readback === 'object' && !Array.isArray(readback),
    'FIRST_RELEASE_RECOVERY_EVIDENCE_REQUIRED');
  check(objectDigest(readback) === policy.firstReleaseRecovery.evidenceSha256,
    'FIRST_RELEASE_RECOVERY_EVIDENCE_CHANGED');
  check(exact(readback, ['contract', 'version', 'status', 'observation']) &&
    readback.contract === 'aqua.first-release-recovery-readback' && readback.version === 1 &&
    readback.status === 'VERIFIED', 'FIRST_RELEASE_RECOVERY_EVIDENCE_REQUIRED');
  const o = readback.observation;
  check(exact(o, ['observedAt', 'expiresAt', 'observer', 'candidateSha', 'baseline',
    'renderArtifact', 'vercelArtifact', 'compatibility']), 'FIRST_RELEASE_RECOVERY_EVIDENCE_INVALID');
  const time = now(), observed = Date.parse(o.observedAt), expiry = Date.parse(o.expiresAt);
  check(Number.isFinite(time) && Number.isFinite(observed) && Number.isFinite(expiry) &&
    observed <= time + 30_000 && observed >= time - policy.authorization.maxCiAgeSeconds * 1000 &&
    expiry > time && expiry > observed && expiry <= observed + policy.authorization.maxCiAgeSeconds * 1000,
    'FIRST_RELEASE_RECOVERY_EVIDENCE_EXPIRED');
  check(exact(o.observer, ['login', 'id']) && policy.authorization.administrators.some(
    a => a.login === o.observer.login && a.id === o.observer.id), 'FIRST_RELEASE_RECOVERY_OBSERVER_UNAPPROVED');
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
    o.compatibility.schemaAndData === true && o.compatibility.configuration === true &&
    reference(o.compatibility.evidenceReference), 'FIRST_RELEASE_RECOVERY_COMPATIBILITY_UNVERIFIED');
  return { kind: 'pinned-legacy-retained-artifact-v1', evidenceSha256: objectDigest(readback),
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
