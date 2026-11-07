// Exact owner-authorized pre-Normal health correction; no generic descendant grant.
import {readFileSync} from 'node:fs';
import {sha256} from './github-evidence.mjs';
import {d10OneTimeCandidateSha,d10OneTimeRecordDigest,validateD10OneTimeCandidate} from './d10-one-time-release.mjs';
import {ReadinessReleaseDenied} from './readiness-release.mjs';
const url=new URL('../../governance/verified-hold-release-20261107.json',import.meta.url);
export const verifiedHoldCandidateSha=JSON.parse(readFileSync(url)).candidateSha;
export const verifiedHoldRecordDigest='9ff14e8654f99343582459f71b0bb64045964af41772bd1f7ff7ef2071aff664';
export function validateVerifiedHoldCandidate(q,bytes=readFileSync(url)){
  const check=(ok,code)=>{if(!ok)throw new ReadinessReleaseDenied(code);};
  check(Buffer.isBuffer(bytes)&&sha256(bytes)===verifiedHoldRecordDigest,'VERIFIED_HOLD_RELEASE_RECORD_CHANGED');
  const r=JSON.parse(bytes),previousBytes=readFileSync(new URL('../../governance/d10-one-time-release-20261107.json',import.meta.url));
  check(sha256(previousBytes)===d10OneTimeRecordDigest,'D10_ONE_TIME_RELEASE_RECORD_CHANGED');
  const previous=JSON.parse(previousBytes);
  check(r.contract==='aqua.verified-hold-exact-release'&&r.version===1&&r.applicationPr===127&&
    /^[a-f0-9]{40}$/.test(r.candidateSha)&&q.sha===r.candidateSha&&q.ciRunId===r.ciRunId&&q.ciRunAttempt===r.ciRunAttempt&&q.policySha256===r.policySha256&&
    r.previousCandidateSha===d10OneTimeCandidateSha&&r.previousBindingSha256===d10OneTimeRecordDigest&&
    r.scope==='code-only-held-deployment'&&r.requiredReadinessVersion===2&&q.qualificationOnly===false&&q.memberRelease===undefined,
  'VERIFIED_HOLD_RELEASE_EXACT_SCOPE_REQUIRED');
  const carry=validateD10OneTimeCandidate({...q,sha:previous.candidateSha,ciRunId:previous.ciRunId,ciRunAttempt:previous.ciRunAttempt}).completedCarry;
  const path='AqualLifeStyle/9.4.2/aspnet-core/src/AqualLifeStyle.Application/ProgrammeParticipations/AQGreenD10ProductionSelectors.cs';
  check(r.runtimePath===path&&r.previousRuntimeSha256===carry.sourceOverrides.find(p=>p.path===path)?.candidateSha256&&
    /^[a-f0-9]{64}$/.test(r.candidateRuntimeSha256)&&r.candidateRuntimeSha256!==r.previousRuntimeSha256,'VERIFIED_HOLD_REVIEWED_SOURCE_REQUIRED');
  return {...r,completedCarry:{...carry,candidateSha:r.candidateSha,
    sourceOverrides:carry.sourceOverrides.map(p=>p.path===path?{...p,candidateSha256:r.candidateRuntimeSha256}:p)}};
}
