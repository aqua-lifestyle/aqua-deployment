import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fixture, source, previous, run, jobs, runnerEnv, fixtureNow } from './fixtures/provider.mjs';
import { standingPolicy, freezeCandidate, validateRun, validateResumeReceipt, main } from './release-control.mjs';
import { objectDigest, verifyGitHubEvidence, createGitHubAdmission } from './github-evidence.mjs';
import { schemaSource, approvedSchemaReadback, verifySchemaFirst, validateMigrationDelta } from './commission-schema-first.mjs';

const now = () => fixtureNow;
const reference = 'https://github.com/aqua-lifestyle/aqua-deployment/blob/' + 'f'.repeat(40) + '/governance/synthetic-original.json';
const admin = {login:'Xolani-M',id:86495928};
const time = offset => new Date(fixtureNow + offset).toISOString();
function schemaFixture() {
  const f = fixture();
  f.state.policy = structuredClone(standingPolicy);
  f.state.files = schemaSource.migrationFiles.map(p => ({filename:p.path,status:p.status}));
  for (const p of [...schemaSource.migrationFiles,...schemaSource.holdSources]) f.state.sourceDigests.set(p.path,p.sha256);
  f.state.schemaReadback = {contract:'aqua.commission-schema-first-readback',version:1,status:'VERIFIED',observation:{
    candidateSha:source,observedAt:time(-1000),observer:admin,databaseIdentitySha256:'a'.repeat(64),tenantId:1,
    b6:{status:'ACQUISITION_ACCEPTED',databaseIdentitySha256:'a'.repeat(64),tenantId:1,migrationCount:54,
      schemaDigest:'b'.repeat(64),acquisitionDigest:'c'.repeat(64),acceptedAt:time(-4000),evidenceReference:reference},
    authorization:{status:'AUTHORIZED',migrationId:schemaSource.migrationId,sourceSha:source,
      migrationSha256:schemaSource.migrationFiles[0].sha256,authorizedBy:admin,authorizedAt:time(-3000),evidenceReference:reference},
    application:{migrationId:schemaSource.migrationId,appliedAt:time(-2000),beforeCount:54,afterCount:55,
      beforeSchemaDigest:'b'.repeat(64),beforeHistoryDigest:'d'.repeat(64),afterHistoryDigest:'e'.repeat(64),
      existingHistoryUnchanged:true,appendOnlyGuardsVerified:true,evidenceReference:reference},
    controls:{financialOperationsHeld:true,v2CommissioningHeld:true,workersHeld:true,startupMigrationsDisabled:true,evidenceReference:reference},
    recovery:{mode:'forward-only-hold-aware',sourceSha:source,sourceAvailable:true,schemaPreserved:true,
      invalidationsPreserved:true,payoutGuardsPreserved:true,legacyFinancialRollbackAllowed:false,evidenceReference:reference}}};
  f.state.recoveryReadback.version = 2;
  f.state.recoveryReadback.observation.compatibility.schemaAndData = false;
  f.refresh = async () => {
    f.state.policy.schemaFirst.evidenceSha256 = objectDigest(f.state.schemaReadback);
    f.state.recoveryReadback.observation.recovery = {mode:'forward-only-hold-aware',sourceSha:source,
      schemaEvidenceSha256:f.state.policy.schemaFirst.evidenceSha256,legacyFinancialRollbackAllowed:false};
    f.state.policy.firstReleaseRecovery.evidenceSha256 = objectDigest(f.state.recoveryReadback);
    f.state.candidate = freezeCandidate(validateRun(run(),jobs(),source),runnerEnv(),f.state.policy);
    const evidence = await verifyGitHubEvidence(f.api,f.state.candidate,f.state.policy,f.readSourceDigest,now);
    f.admission = createGitHubAdmission(f.state.candidate,f.state.policy,evidence,now);
  };
  f.executeSchema = options => f.execute({admissionReceipt:f.admission,...options});
  return f;
}

test('the exact applied additive migration uses forward-only recovery and preserves Render-first admission',async()=>{
  const f=schemaFixture();await f.refresh();await f.executeSchema();
  assert.deepEqual(f.posts.map(x=>x.provider),['render','vercel']);
  assert.equal(f.reports.at(-1).recoveryMode,'forward-only-hold-aware');
  assert.equal(f.reports.at(-1).schemaFirstEvidenceSha256,objectDigest(f.state.schemaReadback));
  assert.equal(f.reports.at(-1).renderSha,source);
  assert.ok(f.posts.every(x=>!JSON.stringify(x).includes('rollback')));
});

test('unverified or altered schema evidence denies before any provider read with no legacy fallback',async()=>{
  for(const edit of [f=>f.state.schemaReadback=approvedSchemaReadback,
    f=>f.state.schemaReadback.observation.tenantId=2]){
    const f=schemaFixture();await f.refresh();edit(f);
    await assert.rejects(f.executeSchema(),/SCHEMA_EVIDENCE_CHANGED/);
    assert.equal(f.state.providerCalls,0);assert.equal(f.posts.length,0);
  }
});

test('the selected policy with its real UNVERIFIED schema record blocks production',async()=>{
  const f=schemaFixture();f.state.schemaReadback=approvedSchemaReadback;await f.refresh();
  await assert.rejects(f.executeSchema(),/SCHEMA_EVIDENCE_REQUIRED/);
  assert.equal(f.state.providerCalls,0);assert.equal(f.posts.length,0);
});

test('unavailable source or comparison evidence denies without a provider read',async()=>{
  for(const dependency of ['source','compare']){const f=schemaFixture();await f.refresh();
    if(dependency==='source')f.state.sourceDigests.delete(schemaSource.holdSources[0].path);
    else{const read=f.api.gh;f.api.gh=async route=>{if(route.startsWith('/compare/'))throw Error('Unavailable comparison');return read(route);};}
    await assert.rejects(f.executeSchema());assert.equal(f.state.providerCalls,0);assert.equal(f.posts.length,0);
  }
});

test('B6 acquisition, exact separate authorization, applied schema and recovery facts cannot be omitted or reordered',async()=>{
  const changes=[
    o=>o.b6.status='UNVERIFIED',o=>o.b6.migrationCount=53,o=>o.b6.tenantId=2,
    o=>o.b6.databaseIdentitySha256='0'.repeat(64),o=>o.b6.acceptedAt=time(-1500),
    o=>o.authorization.status='PROPOSED',o=>o.authorization.sourceSha=previous,
    o=>o.authorization.migrationSha256='0'.repeat(64),o=>o.authorization.authorizedBy={login:'other',id:1},
    o=>o.authorization.authorizedAt=time(-1000),o=>o.application.afterCount=54,
    o=>o.application.beforeSchemaDigest='0'.repeat(64),o=>o.application.existingHistoryUnchanged=false,
    o=>o.application.appendOnlyGuardsVerified=false,o=>o.observedAt=time(1000),
    o=>{o.observedAt=time(-90_000_000);o.b6.acceptedAt=time(-90_004_000);
      o.authorization.authorizedAt=time(-90_003_000);o.application.appliedAt=time(-90_002_000);},
    o=>o.controls.financialOperationsHeld=false,o=>o.controls.v2CommissioningHeld=false,
    o=>o.controls.workersHeld=false,o=>o.controls.startupMigrationsDisabled=false,
    o=>o.recovery.sourceSha=previous,o=>o.recovery.sourceAvailable=false,
    o=>o.recovery.invalidationsPreserved=false,o=>o.recovery.payoutGuardsPreserved=false,
    o=>o.recovery.legacyFinancialRollbackAllowed=true,
    o=>o.authorization.evidenceReference='https://attacker.invalid/authorization',
    o=>o.observer={login:'Xolani-M',id:1},o=>o.candidateSha=previous,
    o=>o.extra='unexpected'
  ];
  for(const change of changes){const f=schemaFixture();change(f.state.schemaReadback.observation);await f.refresh();
    await assert.rejects(f.executeSchema(),/SCHEMA_|B6_|MIGRATION_|HOLD_|ADDITIVE_/);
    assert.equal(f.state.providerCalls,0);assert.equal(f.posts.length,0);}
});

test('deleted, renamed, modified, extra or missing schema sources and missing payout guards remain denied',async()=>{
  const changes=[f=>f.state.files.pop(),f=>f.state.files[0].status='removed',
    f=>f.state.files[0].previous_filename=f.state.files[0].filename,
    f=>f.state.files.push({filename:'EF/Migrations/Other.cs',status:'added'}),
    ...[...schemaSource.migrationFiles,...schemaSource.holdSources].map(pin=>f=>f.state.sourceDigests.set(pin.path,'0'.repeat(64)))];
  for(const change of changes){const f=schemaFixture();await f.refresh();change(f);
    await assert.rejects(f.executeSchema(),/SCHEMA_/);assert.equal(f.state.providerCalls,0);}
  assert.throws(()=>validateMigrationDelta({status:'ahead',files:[{filename:'EF/Migrations/Other.cs'}]}),/SEPARATE_AUTHORIZATION/);
});

test('a legacy rollback claim cannot be disguised as migration-compatible recovery',async()=>{
  for(const change of [r=>r.observation.compatibility.schemaAndData=true,r=>r.version=1]){
    const f=schemaFixture();change(f.state.recoveryReadback);await f.refresh();
    await assert.rejects(f.executeSchema(),/FIRST_RELEASE_RECOVERY/);assert.equal(f.state.providerCalls,0);
  }
});

test('schema evidence loss after Render prevents every frontend upload and mutation',async()=>{
  const f=schemaFixture();await f.refresh();const read=f.api.readiness;
  f.api.readiness=async(...args)=>{const r=await read(...args);if(f.state.newRender?.status==='live')
    f.state.schemaReadback.observation.controls.financialOperationsHeld=false;return r;};
  await assert.rejects(f.executeSchema(),/SCHEMA_EVIDENCE_CHANGED/);
  assert.deepEqual(f.posts.map(p=>p.provider),['render']);assert.equal(f.state.uploads.length,0);
});

test('same-run recovery rejects removal of guard code and contradictory hold-preserving audit facts',async()=>{
  const f=schemaFixture();await f.refresh();const q=f.state.candidate;
  const rows=[{...q,phase:'evidence-selected',schemaFirstEvidenceSha256:objectDigest(f.state.schemaReadback),
    recoveryMode:'forward-only-hold-aware'}, {...q,phase:'failed',recoveryMode:'legacy-rollback'}];
  assert.throws(()=>validateResumeReceipt(rows,{...q,releaseRunAttempt:2}),/CONTRADICTORY_RESUME_RECEIPT/);
  f.state.sourceDigests.delete(schemaSource.holdSources[0].path);
  await assert.rejects(f.executeSchema(),/SCHEMA_OR_PAYOUT_GUARD_SOURCE_CHANGED/);assert.equal(f.state.providerCalls,0);
});

test('later code-only descendants retain the pinned schema and payout guards without a new migration authorization',async()=>{
  const f=schemaFixture();await f.refresh();
  await verifySchemaFirst(f.api,{...f.state.candidate,sha:'e'.repeat(40)},f.state.policy,
    f.readSourceDigest,f.state.schemaReadback,true,()=>fixtureNow+90_000_000);
  const read=f.api.gh;f.api.gh=async route=>route.startsWith(`/compare/${source}...`)?{status:'behind'}:read(route);
  await assert.rejects(verifySchemaFirst(f.api,{...f.state.candidate,sha:previous},f.state.policy,
    f.readSourceDigest,f.state.schemaReadback,true,now),/SCHEMA_SOURCE_NOT_AUTHORIZED_DESCENDANT/);
});

test('real pre-secret admission refuses unapplied migration before creating a receipt or touching providers',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'aqua-schema-admit-'));
  try{
    const repo=join(dir,'source'),candidateDir=join(dir,'candidate');mkdirSync(repo);mkdirSync(candidateDir);
    const git=(...args)=>execFileSync('git',['-C',repo,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
    git('init','-q');writeFileSync(join(repo,'inert.txt'),'Application code must not execute.');git('add','.');
    git('-c','user.name=fixture','-c','user.email=fixture@example.invalid','commit','-qm','Inert source');const sha=git('rev-parse','HEAD');
    const f=schemaFixture();await f.refresh();f.state.candidate={...f.state.candidate,sha,
      executorSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()};f.state.report.context.sha=sha;
    const transform=v=>v===source?sha:Array.isArray(v)?v.map(transform):v&&typeof v==='object'?
      Object.fromEntries(Object.entries(v).map(([k,x])=>[k,transform(x)])):v;
    f.state.schemaReadback=transform(f.state.schemaReadback);f.state.schemaReadback.observation.application.afterCount=54;
    f.state.policy.schemaFirst.evidenceSha256=objectDigest(f.state.schemaReadback);
    const read=f.api.gh;f.api.gh=async(...args)=>transform(await read(...args));
    const event=join(dir,'event.json');writeFileSync(event,JSON.stringify({inputs:{ci_run_id:'123',ci_run_attempt:'1',sha}}));
    const env={...runnerEnv(),GITHUB_SHA:f.state.candidate.executorSha,GITHUB_WORKFLOW_SHA:f.state.candidate.executorSha,
      GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_EVENT_PATH:event,SOURCE_DIR:repo,CANDIDATE_DIR:candidateDir,
      GITHUB_OUTPUT:join(dir,'outputs'),RELEASE_REPORT:join(dir,'audit'),AQUA_ADMISSION_RECEIPT_OUTPUT:join(dir,'receipt')};
    delete env.RENDER_API_KEY;delete env.VERCEL_TOKEN;
    const options={api:f.api,policy:f.state.policy,now,readSourceDigest:f.readSourceDigest,schemaReadback:f.state.schemaReadback};
    await main(env,{...options,mode:'candidate'});
    await assert.rejects(main(env,{...options,mode:'admit'}),/APPLIED_ADDITIVE_SCHEMA_REQUIRED/);
    assert.equal(existsSync(env.AQUA_ADMISSION_RECEIPT_OUTPUT),false);assert.equal(f.state.providerCalls,0);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
