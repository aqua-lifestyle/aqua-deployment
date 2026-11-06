// Exact cohesive correction, preserving all completed-operation evidence.
import {readFileSync} from 'node:fs';
import {sha256} from './github-evidence.mjs';
import {rootUnboundCandidateSha,rootUnboundRecordDigest,validateRootUnboundCandidate} from './root-unbound-release.mjs';
import {ReadinessReleaseDenied} from './readiness-release.mjs';
const url=new URL('../../governance/post-reset-live-release-20261106.json',import.meta.url);
export const postResetCandidateSha=JSON.parse(readFileSync(url)).candidateSha;
export const postResetRecordDigest='3e1c64fc3cf7eb165f06ce1d1eb6ae137a9e36fa971531889e7a9c442c3b1857';
export function validatePostResetCandidate(q,bytes=readFileSync(url)){
  const check=(ok,code)=>{if(!ok)throw new ReadinessReleaseDenied(code);};
  check(Buffer.isBuffer(bytes)&&sha256(bytes)===postResetRecordDigest,'POST_RESET_RELEASE_RECORD_CHANGED');
  const r=JSON.parse(bytes),previousBytes=readFileSync(new URL('../../governance/root-unbound-release-20261106.json',import.meta.url));
  check(sha256(previousBytes)===rootUnboundRecordDigest,'ROOT_UNBOUND_RELEASE_RECORD_CHANGED');
  const previous=JSON.parse(previousBytes);
  check(r.contract==='aqua.post-reset-live-exact-release'&&r.version===1&&r.applicationPr===124&&
    q.sha===r.candidateSha&&q.ciRunId===r.ciRunId&&q.ciRunAttempt===r.ciRunAttempt&&q.policySha256===r.policySha256&&
    r.previousCandidateSha===rootUnboundCandidateSha&&r.previousBindingSha256===rootUnboundRecordDigest&&
    r.scope==='code-only-held-deployment'&&r.requiredReadinessVersion===2&&q.qualificationOnly===false&&q.memberRelease===undefined,
  'POST_RESET_RELEASE_EXACT_SCOPE_REQUIRED');
  const carry=validateRootUnboundCandidate({...q,sha:previous.candidateSha,ciRunId:previous.ciRunId,ciRunAttempt:previous.ciRunAttempt}).completedCarry;
  const pins=JSON.parse(readFileSync(new URL('./commission-schema-source.json',import.meta.url))).cleanStartSources;
  const paths=[...previous.sourceOverrides.map(p=>p.path),
    'AqualLifeStyle/9.4.2/aspnet-core/src/AqualLifeStyle.Web.Host/Startup/AQGreenD10OperatorEvidenceSource.cs'];
  check(Array.isArray(r.sourceOverrides)&&r.sourceOverrides.length===paths.length&&paths.every(path=>{
    const selected=r.sourceOverrides.filter(p=>p.path===path);
    return selected.length===1&&selected[0].operationSourceSha256===pins.find(p=>p.path===path)?.sha256&&
      /^[a-f0-9]{64}$/.test(selected[0].candidateSha256)&&selected[0].candidateSha256!==selected[0].operationSourceSha256;
  })&&r.sourceOverrides[0].candidateSha256===previous.sourceOverrides[0].candidateSha256,'POST_RESET_REVIEWED_SOURCES_REQUIRED');
  return {...r,completedCarry:{...carry,candidateSha:r.candidateSha,sourceOverrides:r.sourceOverrides}};
}
