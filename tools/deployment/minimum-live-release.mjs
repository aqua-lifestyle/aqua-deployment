// One owner-approved scoped simplification; no generic descendant/financial grant.
import {readFileSync} from 'node:fs';
import {sha256} from './github-evidence.mjs';
import {postResetCandidateSha,postResetRecordDigest,validatePostResetCandidate} from './post-reset-live-release.mjs';
import {ReadinessReleaseDenied} from './readiness-release.mjs';
const url=new URL('../../governance/minimum-live-release-20261106.json',import.meta.url);
export const minimumLiveCandidateSha=JSON.parse(readFileSync(url)).candidateSha;
export const minimumLiveRecordDigest='06eb95715b1ba44d50b96ca44251df80a7085b9dc5a85cd4ea97b5a6fac08481';
export function validateMinimumLiveCandidate(q,bytes=readFileSync(url)){
  const check=(ok,code)=>{if(!ok)throw new ReadinessReleaseDenied(code);};
  check(Buffer.isBuffer(bytes)&&sha256(bytes)===minimumLiveRecordDigest,'MINIMUM_LIVE_RELEASE_RECORD_CHANGED');
  const r=JSON.parse(bytes),previousBytes=readFileSync(new URL('../../governance/post-reset-live-release-20261106.json',import.meta.url));
  check(sha256(previousBytes)===postResetRecordDigest,'POST_RESET_RELEASE_RECORD_CHANGED');
  const previous=JSON.parse(previousBytes);
  check(r.contract==='aqua.minimum-live-exact-release'&&r.version===1&&r.applicationPr===125&&
    q.sha===r.candidateSha&&q.ciRunId===r.ciRunId&&q.ciRunAttempt===r.ciRunAttempt&&q.policySha256===r.policySha256&&
    r.previousCandidateSha===postResetCandidateSha&&r.previousBindingSha256===postResetRecordDigest&&
    r.scope==='code-only-held-deployment'&&r.requiredReadinessVersion===2&&q.qualificationOnly===false&&q.memberRelease===undefined,
  'MINIMUM_LIVE_RELEASE_EXACT_SCOPE_REQUIRED');
  const carry=validatePostResetCandidate({...q,sha:previous.candidateSha,ciRunId:previous.ciRunId,ciRunAttempt:previous.ciRunAttempt}).completedCarry;
  const path='AqualLifeStyle/9.4.2/aspnet-core/src/AqualLifeStyle.Application/ProgrammeParticipations/AQGreenD10ProductionSelectors.cs';
  check(r.runtimePath===path&&r.previousRuntimeSha256===carry.sourceOverrides.find(p=>p.path===path)?.candidateSha256&&
    /^[a-f0-9]{64}$/.test(r.candidateRuntimeSha256)&&r.candidateRuntimeSha256!==r.previousRuntimeSha256,'MINIMUM_LIVE_REVIEWED_SOURCE_REQUIRED');
  return {...r,completedCarry:{...carry,candidateSha:r.candidateSha,
    sourceOverrides:carry.sourceOverrides.map(p=>p.path===path?{...p,candidateSha256:r.candidateRuntimeSha256}:p)}};
}
