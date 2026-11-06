import { readFileSync } from 'node:fs';
import { objectDigest, sha256 } from './github-evidence.mjs';
import { rootUnboundRecordDigest, validateRootUnboundCandidate } from './root-unbound-release.mjs';
import { ReadinessReleaseDenied } from './readiness-release.mjs';

const recordUrl = new URL('../../governance/root-unbound-render-reconciliation-20261106.json', import.meta.url);
export const ownerRenderRecordDigest = '9588c731cbeac28ff076ccc2cc84c4dc7115d516a7d45fb9a62bd8eeb27c08d0';
const check = (ok, code = 'OWNER_RENDER_REDEPLOYMENT_UNVERIFIED') => { if (!ok) throw new ReadinessReleaseDenied(code); };
export function ownerRenderRecord(bytes = readFileSync(recordUrl)) {
  check(Buffer.isBuffer(bytes) && sha256(bytes) === ownerRenderRecordDigest, 'OWNER_RENDER_RECORD_CHANGED');
  const r = JSON.parse(bytes);
  check(r.candidateBindingSha256 === rootUnboundRecordDigest && r.scope === 'acknowledge-existing-owner-redeployment-only');
  return r;
}
function proof() {
  const r = ownerRenderRecord();
  return { bindingSha256: ownerRenderRecordDigest, previousRenderDeployId: r.previousRenderDeployId,
    renderDeployId: r.renderDeployId, renderSha: r.renderSha,
    githubDeploymentId: r.githubDeploymentId, githubSuccessStatusId: r.githubSuccessStatusId };
}
export function validateOwnerRenderProof(value, q) {
  // Audit rows have a separately authenticated full-release identity, not a
  // candidate qualification flag. This does not qualify or deploy a receipt.
  validateRootUnboundCandidate({ ...q, qualificationOnly: false });
  check(value && objectDigest(value) === objectDigest(proof()), 'OWNER_RENDER_PROOF_CHANGED');
}
export async function verifyOwnerRenderRedeployment(api, q, baseline) {
  validateRootUnboundCandidate(q);
  const r = ownerRenderRecord();
  check(baseline.renderDeployId === r.previousRenderDeployId && baseline.renderSha === r.renderSha &&
    baseline.vercelDeployId === r.vercelDeployId && baseline.vercelSha === r.renderSha);
  // The pinned record retains the authenticated GitHub deployment/success
  // readback. Recheck the actual provider object with existing provider access.
  const native = await api.render(`/services/${q.renderServiceId}/deploys/${r.renderDeployId}`);
  check(native.id === r.renderDeployId && native.commit?.id === r.renderSha && ['live','deactivated'].includes(native.status));
  const mode = await api.render(`/services/${q.renderServiceId}/env-vars/Yoco__Mode`);
  check(mode.key === 'Yoco__Mode' && mode.value === r.yocoMode);
  // Existing release code still requires this exact deployment uniquely live,
  // fresh held configuration, health/OIDC and no competing work before POST.
  return proof();
}
