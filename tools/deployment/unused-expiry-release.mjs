// Exact availability correction; original history and all execution fences retained.
import {readFileSync} from 'node:fs';
import {sha256} from './github-evidence.mjs';
import {verifiedHoldCandidateSha,verifiedHoldRecordDigest,validateVerifiedHoldCandidate} from './verified-hold-release.mjs';
import {ReadinessReleaseDenied} from './readiness-release.mjs';
const url=new URL('../../governance/unused-expiry-release-20261108.json',import.meta.url);
export const unusedExpiryCandidateSha=JSON.parse(readFileSync(url)).candidateSha;
export const unusedExpiryRecordDigest='19728918520eb3b4fc33e40545a476b3abedbb6b1ceb225414843ee205177bfa';
export function validateUnusedExpiryCandidate(q,bytes=readFileSync(url)){
  const check=(ok,code)=>{if(!ok)throw new ReadinessReleaseDenied(code);};
  check(Buffer.isBuffer(bytes)&&sha256(bytes)===unusedExpiryRecordDigest,'UNUSED_EXPIRY_RELEASE_RECORD_CHANGED');
  const r=JSON.parse(bytes),previousBytes=readFileSync(new URL('../../governance/verified-hold-release-20261107.json',import.meta.url));
  check(sha256(previousBytes)===verifiedHoldRecordDigest,'VERIFIED_HOLD_RELEASE_RECORD_CHANGED');
  const previous=JSON.parse(previousBytes);
  check(r.contract==='aqua.unused-expiry-exact-release'&&r.version===1&&r.applicationPr===128&&
    /^[a-f0-9]{40}$/.test(r.candidateSha)&&q.sha===r.candidateSha&&q.ciRunId===r.ciRunId&&q.ciRunAttempt===r.ciRunAttempt&&q.policySha256===r.policySha256&&
    r.previousCandidateSha===verifiedHoldCandidateSha&&r.previousBindingSha256===verifiedHoldRecordDigest&&
    r.scope==='code-only-held-deployment'&&r.requiredReadinessVersion===2&&q.qualificationOnly===false&&q.memberRelease===undefined,
    'UNUSED_EXPIRY_RELEASE_EXACT_SCOPE_REQUIRED');
  const carry=validateVerifiedHoldCandidate({...q,sha:previous.candidateSha,ciRunId:previous.ciRunId,ciRunAttempt:previous.ciRunAttempt}).completedCarry;
  const paths=['AqualLifeStyle/9.4.2/aspnet-core/src/AqualLifeStyle.Application/ProgrammeParticipations/AQGreenD10ProductionSelectors.cs',
    'AqualLifeStyle/9.4.2/aspnet-core/src/AqualLifeStyle.Core/Domain/AQGreen/AQGreenD10Commissioning.cs'];
  check(Array.isArray(r.sourceOverrides)&&r.sourceOverrides.length===paths.length&&paths.every(path=>{
    const a=r.sourceOverrides.filter(p=>p.path===path);return a.length===1&&a[0].previousCandidateSha256===carry.sourceOverrides.find(p=>p.path===path)?.candidateSha256&&
      /^[a-f0-9]{64}$/.test(a[0].candidateSha256)&&a[0].candidateSha256!==a[0].previousCandidateSha256;
  }),'UNUSED_EXPIRY_REVIEWED_SOURCES_REQUIRED');
  return {...r,completedCarry:{...carry,candidateSha:r.candidateSha,sourceOverrides:carry.sourceOverrides.map(p=>
    ({...p,candidateSha256:r.sourceOverrides.find(s=>s.path===p.path)?.candidateSha256??p.candidateSha256}))}};
}
