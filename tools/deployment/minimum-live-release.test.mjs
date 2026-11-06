import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {standingPolicy} from './release-control.mjs';
import {schemaSource,approvedSchemaReadback,verifySchemaFirst} from './commission-schema-first.mjs';
import {objectDigest} from './github-evidence.mjs';
import {validatePostResetCandidate} from './post-reset-live-release.mjs';
import {validateMinimumLiveCandidate} from './minimum-live-release.mjs';
const bytes=()=>readFileSync(new URL('../../governance/minimum-live-release-20261106.json',import.meta.url));
const q=()=>{const r=JSON.parse(bytes());return {sha:r.candidateSha,ciRunId:r.ciRunId,ciRunAttempt:1,policySha256:r.policySha256,
  qualificationOnly:false,repository:'aqua-lifestyle/aqua-lifestyle',executorRepository:'aqua-lifestyle/aqua-deployment',
  environment:'production-release',profile:'normal-integrated',renderServiceId:'srv-d9f0k8e1a83c73d8n1b0',
  vercelProjectId:'prj_6qL1e43KhsWrRshY5GxdmGl3HGMz',vercelTeamId:'team_Hc3BWfhTLfwLzwbgbtaasBUY'};};
function fixture(){const candidate=q(),selected=validateMinimumLiveCandidate(candidate),carry=selected.completedCarry;
  const pins=[...schemaSource.migrationFiles,...schemaSource.holdSources,...schemaSource.cleanStartSources];
  const read=async path=>carry.sourceOverrides.find(p=>p.path===path)?.candidateSha256??
    (path===carry.guardOverride.path?carry.guardOverride.candidateSha256:pins.find(p=>p.path===path)?.sha256);
  const api={gh:async path=>({status:'ahead',files:path===`/compare/${carry.operationSourceSha}...${candidate.sha}`
    ?carry.sourceOverrides.map(p=>({filename:p.path,status:'modified'})):schemaSource.migrationFiles.map(p=>({filename:p.path,status:p.status}))})};
  return {candidate,selected,carry,pins,read,api};}

test('minimum LIVE binding changes only the reviewed selector pin and preserves accepted history and held purpose',async()=>{
  const f=fixture(),previous=JSON.parse(readFileSync(new URL('../../governance/post-reset-live-release-20261106.json',import.meta.url)));
  const prior=validatePostResetCandidate({...q(),sha:previous.candidateSha,ciRunId:previous.ciRunId}).completedCarry;
  assert.equal(f.selected.requiredReadinessVersion,2);
  assert.equal(f.carry.databaseOperationAuthorized,false);assert.equal(f.carry.financialActivationAuthorized,false);
  assert.equal(f.carry.productionDeploymentAuthorized,false);
  const expected=structuredClone(prior);expected.candidateSha=f.candidate.sha;
  expected.sourceOverrides.find(p=>p.path===f.selected.runtimePath).candidateSha256=f.selected.candidateRuntimeSha256;
  assert.deepEqual(f.carry,expected);
  const before=objectDigest(approvedSchemaReadback);
  const proof=await verifySchemaFirst(f.api,f.candidate,standingPolicy,f.read,approvedSchemaReadback,true);
  assert.equal(proof.initialSourceSha,f.carry.operationSourceSha);assert.equal(objectDigest(approvedSchemaReadback),before);
});

test('minimum LIVE binding rejects changed source pins, extra migrations and missing ancestry',async()=>{
  const f=fixture();for(const pin of f.pins)
    await assert.rejects(verifySchemaFirst(f.api,f.candidate,standingPolicy,async path=>path===pin.path?'0'.repeat(64):f.read(path),approvedSchemaReadback,true),/SOURCE_CHANGED/);
  for(const result of [{status:'behind',files:[]},{status:'ahead',files:[{filename:'EF/Migrations/Unapproved.cs'}]}]){
    const api={gh:async path=>path===`/compare/${f.carry.operationSourceSha}...${f.candidate.sha}`?result:
      {status:'ahead',files:schemaSource.migrationFiles.map(p=>({filename:p.path,status:p.status}))}};
    await assert.rejects(verifySchemaFirst(api,f.candidate,standingPolicy,f.read,approvedSchemaReadback,true),/ANCESTRY_REQUIRED|SCHEMA_CHANGE_REQUIRES/);
  }
});

test('minimum LIVE binding denies other CI, source, target, purpose and immutable-record substitutions',()=>{
  for(const edit of [q=>q.sha='a'.repeat(40),q=>q.ciRunId='999',q=>q.ciRunAttempt=2,q=>q.policySha256='0'.repeat(64),
    q=>q.qualificationOnly=true,q=>q.memberRelease='other',q=>q.repository='other',q=>q.executorRepository='other',
    q=>q.environment='other',q=>q.profile='other',q=>q.renderServiceId='other',q=>q.vercelProjectId='other',q=>q.vercelTeamId='other']){
    const candidate=q();edit(candidate);assert.throws(()=>validateMinimumLiveCandidate(candidate),/EXACT_SCOPE_REQUIRED/);
  }
  for(const edit of [r=>r.candidateRuntimeSha256='0'.repeat(64),r=>r.requiredReadinessVersion=1,r=>r.previousBindingSha256='0'.repeat(64)]){
    const record=JSON.parse(bytes());edit(record);
    assert.throws(()=>validateMinimumLiveCandidate(q(),Buffer.from(JSON.stringify(record))),/RECORD_CHANGED/);
  }
});
