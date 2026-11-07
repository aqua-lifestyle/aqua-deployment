// Exact owner-directed expiry-lifecycle successor. No general rollout exception.
import {readFileSync} from 'node:fs';
import {sha256} from './github-evidence.mjs';
import {minimumLiveCandidateSha,minimumLiveRecordDigest,validateMinimumLiveCandidate} from './minimum-live-release.mjs';
import {ReadinessReleaseDenied} from './readiness-release.mjs';
const url=new URL('../../governance/d10-one-time-release-20261107.json',import.meta.url);
export const d10OneTimeCandidateSha=JSON.parse(readFileSync(url)).candidateSha;
export const d10OneTimeRecordDigest='a2323dae3db7592bb7a802f43c65c6f8a632f5efecf6c0e9bd68ed9514d93701';
export function validateD10OneTimeCandidate(q,bytes=readFileSync(url)){
  const check=(ok,code)=>{if(!ok)throw new ReadinessReleaseDenied(code);};
  check(Buffer.isBuffer(bytes)&&sha256(bytes)===d10OneTimeRecordDigest,'D10_ONE_TIME_RELEASE_RECORD_CHANGED');
  const r=JSON.parse(bytes),previousBytes=readFileSync(new URL('../../governance/minimum-live-release-20261106.json',import.meta.url));
  check(sha256(previousBytes)===minimumLiveRecordDigest,'MINIMUM_LIVE_RELEASE_RECORD_CHANGED');
  const previous=JSON.parse(previousBytes);
  check(r.contract==='aqua.d10-one-time-exact-release'&&r.version===1&&r.applicationPr===126&&
    /^[a-f0-9]{40}$/.test(r.candidateSha)&&q.sha===r.candidateSha&&q.ciRunId===r.ciRunId&&q.ciRunAttempt===r.ciRunAttempt&&
    q.policySha256===r.policySha256&&r.previousCandidateSha===minimumLiveCandidateSha&&r.previousBindingSha256===minimumLiveRecordDigest&&
    r.scope==='code-only-held-deployment'&&r.requiredReadinessVersion===2&&q.qualificationOnly===false&&q.memberRelease===undefined,
  'D10_ONE_TIME_RELEASE_EXACT_SCOPE_REQUIRED');
  const carry=validateMinimumLiveCandidate({...q,sha:previous.candidateSha,ciRunId:previous.ciRunId,ciRunAttempt:previous.ciRunAttempt}).completedCarry;
  const paths=['AqualLifeStyle/9.4.2/aspnet-core/src/AqualLifeStyle.Application/ProgrammeParticipations/AQGreenD10ProductionSelectors.cs',
    'AqualLifeStyle/9.4.2/aspnet-core/src/AqualLifeStyle.Core/Domain/AQGreen/AQGreenD10Commissioning.cs'];
  check(Array.isArray(r.sourceOverrides)&&r.sourceOverrides.length===paths.length&&paths.every(path=>{
    const selected=r.sourceOverrides.filter(p=>p.path===path);
    return selected.length===1&&selected[0].previousCandidateSha256===carry.sourceOverrides.find(p=>p.path===path)?.candidateSha256&&
      /^[a-f0-9]{64}$/.test(selected[0].candidateSha256)&&selected[0].candidateSha256!==selected[0].previousCandidateSha256;
  }),'D10_ONE_TIME_REVIEWED_SOURCES_REQUIRED');
  return {...r,completedCarry:{...carry,candidateSha:r.candidateSha,sourceOverrides:carry.sourceOverrides.map(p=>
    ({...p,candidateSha256:r.sourceOverrides.find(s=>s.path===p.path)?.candidateSha256??p.candidateSha256}))}};
}
