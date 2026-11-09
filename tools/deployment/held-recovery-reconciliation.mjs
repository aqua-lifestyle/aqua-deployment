import {readFileSync} from 'node:fs';
import {sha256,objectDigest} from './github-evidence.mjs';
import {unusedExpiryRecordDigest,validateUnusedExpiryCandidate} from './unused-expiry-release.mjs';
import {ReadinessReleaseDenied} from './readiness-release.mjs';
export const heldRecoveryRecordDigest='453f9c953c9b6335d28a224dfc4da265937aa76a928a10b41808eb570db04909';
const check=(ok,code='OWNER_HELD_RECOVERY_UNVERIFIED')=>{if(!ok)throw new ReadinessReleaseDenied(code);};
export function heldRecoveryRecord(bytes=readFileSync(new URL('../../governance/held-recovery-reconciliation-20261108.json',import.meta.url))){
  check(Buffer.isBuffer(bytes)&&sha256(bytes)===heldRecoveryRecordDigest,'OWNER_HELD_RECOVERY_RECORD_CHANGED');
  const r=JSON.parse(bytes);check(r.contract==='aqua.owner-complete-held-recovery'&&r.version===1&&r.candidateBindingSha256===unusedExpiryRecordDigest&&
    r.scope==='acknowledge-existing-owner-held-recovery-only'&&r.recoveryKind==='complete-held-configuration-existing-build'&&
    r.normalActivationGranted===false&&r.newProviderRequestOrResumeAuthorityGranted===false);return r;
}
function proof(){const r=heldRecoveryRecord();return {bindingSha256:heldRecoveryRecordDigest,previousRenderDeployId:r.previousRenderDeployId,
  renderDeployId:r.renderDeployId,renderSha:r.renderSha,githubDeploymentId:r.githubDeploymentId,githubSuccessStatusId:r.githubSuccessStatusId};}
export function validateHeldRecoveryProof(value,q){validateUnusedExpiryCandidate({...q,qualificationOnly:false});
  check(value&&objectDigest(value)===objectDigest(proof()),'OWNER_HELD_RECOVERY_PROOF_CHANGED');}
export async function verifyHeldRecovery(api,q,baseline){
  validateUnusedExpiryCandidate(q);const r=heldRecoveryRecord();
  check(baseline.renderDeployId===r.previousRenderDeployId&&baseline.renderSha===r.renderSha&&baseline.vercelDeployId===r.vercelDeployId&&baseline.vercelSha===r.renderSha);
  const native=await api.render(`/services/${q.renderServiceId}/deploys/${r.renderDeployId}`);
  check(native.id===r.renderDeployId&&native.commit?.id===r.renderSha&&['live','deactivated'].includes(native.status));
  for(const [key,expected]of [['Yoco__Mode',r.yocoMode],['App__FinancialOperations__Enabled','false'],['App__AQGreenV2__Commissioning__Enabled','false']]){
    const v=await api.render(`/services/${q.renderServiceId}/env-vars/${key}`);check(v.key===key&&v.value===expected);}
  return proof(); // Existing guards still require unique live identity, fresh holds, health/OIDC and no competing work.
}
