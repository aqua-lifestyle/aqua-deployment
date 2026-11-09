import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {standingPolicy} from './release-control.mjs';
import {schemaSource,approvedSchemaReadback,verifySchemaFirst} from './commission-schema-first.mjs';
import {objectDigest} from './github-evidence.mjs';
import {validateVerifiedHoldCandidate} from './verified-hold-release.mjs';
import {validateUnusedExpiryCandidate} from './unused-expiry-release.mjs';
import {heldRecoveryRecord,verifyHeldRecovery,validateHeldRecoveryProof} from './held-recovery-reconciliation.mjs';
const bytes=()=>readFileSync(new URL('../../governance/unused-expiry-release-20261108.json',import.meta.url));
const q=()=>{const r=JSON.parse(bytes());return {sha:r.candidateSha,ciRunId:r.ciRunId,ciRunAttempt:r.ciRunAttempt,policySha256:r.policySha256,
 qualificationOnly:false,repository:'aqua-lifestyle/aqua-lifestyle',executorRepository:'aqua-lifestyle/aqua-deployment',environment:'production-release',profile:'normal-integrated',
 renderServiceId:'srv-d9f0k8e1a83c73d8n1b0',vercelProjectId:'prj_6qL1e43KhsWrRshY5GxdmGl3HGMz',vercelTeamId:'team_Hc3BWfhTLfwLzwbgbtaasBUY'};};
function fixture(){const candidate=q(),selected=validateUnusedExpiryCandidate(candidate),carry=selected.completedCarry;
 const pins=[...schemaSource.migrationFiles,...schemaSource.holdSources,...schemaSource.cleanStartSources];
 const read=async path=>carry.sourceOverrides.find(p=>p.path===path)?.candidateSha256??(path===carry.guardOverride.path?carry.guardOverride.candidateSha256:pins.find(p=>p.path===path)?.sha256);
 const api={gh:async path=>({status:'ahead',files:path===`/compare/${carry.operationSourceSha}...${candidate.sha}`?
 carry.sourceOverrides.map(p=>({filename:p.path,status:'modified'})):schemaSource.migrationFiles.map(p=>({filename:p.path,status:p.status}))})};
 return {candidate,selected,carry,pins,read,api};}
test('unused-expiry successor retains immutable facts and updates exactly reviewed startup/model pins',async()=>{
 const f=fixture(),previous=JSON.parse(readFileSync(new URL('../../governance/verified-hold-release-20261107.json',import.meta.url)));
 const expected=structuredClone(validateVerifiedHoldCandidate({...q(),sha:previous.candidateSha,ciRunId:previous.ciRunId,ciRunAttempt:previous.ciRunAttempt}).completedCarry);
 expected.candidateSha=f.candidate.sha;for(const p of f.selected.sourceOverrides)expected.sourceOverrides.find(x=>x.path===p.path).candidateSha256=p.candidateSha256;
 assert.deepEqual(f.carry,expected);assert.equal(f.selected.requiredReadinessVersion,2);assert.equal(f.carry.databaseOperationAuthorized,false);assert.equal(f.carry.financialActivationAuthorized,false);
 const before=objectDigest(approvedSchemaReadback);await verifySchemaFirst(f.api,f.candidate,standingPolicy,f.read,approvedSchemaReadback,true);assert.equal(objectDigest(approvedSchemaReadback),before);
});
test('unused-expiry binding keeps every source migration ancestry CI purpose and target boundary',async()=>{
 const f=fixture();for(const p of f.pins)await assert.rejects(verifySchemaFirst(f.api,f.candidate,standingPolicy,async path=>path===p.path?'0'.repeat(64):f.read(path),approvedSchemaReadback,true),/SOURCE_CHANGED/);
 for(const edit of [x=>x.sha='a'.repeat(40),x=>x.ciRunId='99',x=>x.ciRunAttempt=1,x=>x.qualificationOnly=true,x=>x.memberRelease='other',x=>x.environment='other',
 x=>x.profile='other',x=>x.repository='other',x=>x.executorRepository='other',x=>x.renderServiceId='other',x=>x.vercelProjectId='other',x=>x.vercelTeamId='other',x=>x.policySha256='0'.repeat(64)]){
 const value=q();edit(value);assert.throws(()=>validateUnusedExpiryCandidate(value),/EXACT_SCOPE_REQUIRED/);}
 const record=JSON.parse(bytes());record.sourceOverrides.pop();assert.throws(()=>validateUnusedExpiryCandidate(q(),Buffer.from(JSON.stringify(record))),/RECORD_CHANGED/);
 for(const result of [{status:'behind',files:[]},{status:'ahead',files:[{filename:'EF/Migrations/Other.cs'}]}])await assert.rejects(
 verifySchemaFirst({gh:async path=>path===`/compare/${f.carry.operationSourceSha}...${f.candidate.sha}`?result:{status:'ahead',files:schemaSource.migrationFiles.map(p=>({filename:p.path,status:p.status}))}},
 f.candidate,standingPolicy,f.read,approvedSchemaReadback,true),/ANCESTRY_REQUIRED|SCHEMA_CHANGE_REQUIRES/);
});
function recovered(){const r=heldRecoveryRecord();return {r,baseline:{renderDeployId:r.previousRenderDeployId,renderSha:r.renderSha,vercelDeployId:r.vercelDeployId,vercelSha:r.renderSha},
 api:{render:async path=>path.includes('/deploys/')?{id:r.renderDeployId,status:'live',commit:{id:r.renderSha}}:
 {key:path.split('/').at(-1),value:path.endsWith('/Yoco__Mode')?'live':'false'}}};}
test('owned complete held recovery acknowledges actual same-source provider object without replacing original baseline',async()=>{
 const f=recovered(),before=objectDigest(f.baseline),proof=await verifyHeldRecovery(f.api,q(),f.baseline);
 assert.equal(objectDigest(f.baseline),before);assert.equal(proof.previousRenderDeployId,f.r.previousRenderDeployId);assert.equal(proof.renderDeployId,f.r.renderDeployId);
 assert.equal(f.r.normalActivationGranted,false);assert.equal(f.r.newProviderRequestOrResumeAuthorityGranted,false);
 validateHeldRecoveryProof(proof,q());assert.throws(()=>validateHeldRecoveryProof({...proof,renderDeployId:'dep-other'},q()),/PROOF_CHANGED/);
});
test('owned recovery denies wrong baseline foreign provider source status and changed live mode/holds',async()=>{
 for(const edit of [x=>x.renderDeployId='dep-other',x=>x.renderSha='a'.repeat(40),x=>x.vercelDeployId='dpl_Other',x=>x.vercelSha='a'.repeat(40)]){
 const f=recovered();edit(f.baseline);await assert.rejects(verifyHeldRecovery(f.api,q(),f.baseline));}
 for(const edit of [x=>x.id='dep-other',x=>x.commit.id='a'.repeat(40),x=>x.status='update_in_progress',x=>x.status='update_failed']){
 const f=recovered(),read=f.api.render;f.api.render=async path=>{const x=await read(path);if(path.includes('/deploys/'))edit(x);return x;};await assert.rejects(verifyHeldRecovery(f.api,q(),f.baseline));}
 for(const key of ['Yoco__Mode','App__FinancialOperations__Enabled','App__AQGreenV2__Commissioning__Enabled']){
 const f=recovered(),read=f.api.render;f.api.render=async path=>{const x=await read(path);if(path.endsWith('/'+key))x.value='changed';return x;};await assert.rejects(verifyHeldRecovery(f.api,q(),f.baseline));}
});
