import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fixture, source, previous, fixtureNow, zipFixture, runnerEnv } from './fixtures/provider.mjs';
import { standingPolicy, policyDigest, evidencePlan, clients, admissionJobName, releaseKey } from './release-control.mjs';
import { approvedInventory, approvedInventoryBytes, inventoryDigest, verifyApprovedDefinitions,
  verifyGitHubEvidence, createGitHubAdmission, validateGitHubAdmission, gitSourceDigest, sha256 } from './github-evidence.mjs';
import { schemaSource } from './commission-schema-first.mjs';
const now = () => fixtureNow;
const verified = f => verifyGitHubEvidence(f.api, f.state.candidate, f.state.policy, f.readSourceDigest, now);

// Exactly the existing 240 identities; this suite adds executor tests, not cases
// to the application's mandatory inventory. Providers are controlled substitutes.
test('GitHub evidence authenticates the exact report and all 240 approved mandatory executions', async () => {
  const f=fixture(), evidence=await verified(f);
  assert.equal(approvedInventory.tests.length,240);assert.equal(approvedInventory.sources.length,25);
  assert.equal(sha256(approvedInventoryBytes),inventoryDigest);
  assert.equal(evidence.testsVerified,240);assert.equal(evidence.artifact.runId,'123');
  const receipt=createGitHubAdmission(f.state.candidate,f.state.policy,evidence,now);
  validateGitHubAdmission(receipt,f.state.candidate,f.state.policy,evidence,now);
  assert.equal(f.state.providerCalls,0);
});

test('each approved source and the candidate inventory are pinned outside candidate authority', async () => {
  for (const path of [...approvedInventory.sources.map(x=>x.path),'tools/deployment/mandatory-security-tests.json']) {
    const f=fixture();f.state.sourceDigests.set(path,'0'.repeat(64));
    await assert.rejects(verified(f),/MANDATORY_SOURCE_CHANGED/);assert.equal(f.state.providerCalls,0);
  }
  const f=fixture();await assert.rejects(verifyApprovedDefinitions({...standingPolicy,authorization:{...standingPolicy.authorization,inventorySha256:'0'.repeat(64)}},f.readSourceDigest),/INVENTORY_REQUIRED/);
});

test('mandatory reports reject skipped, deleted, renamed, duplicated and forged executions', async () => {
  const cases=[
    r=>r.results.pop(),r=>r.results[0].outcome='skipped',r=>r.results[0].executions=0,
    r=>r.results[0].executions=2,r=>r.results[0].name+=' renamed',r=>r.results[0].id='AQUA-SEC-9999',
    r=>r.results[0]=r.results[1],r=>r.inventorySha256='0'.repeat(64),r=>r.exitCode=1,
    r=>r.summary.skipped=1,r=>r.summary.passed--,r=>r.context.sha=previous,
    r=>r.context.runId='999',r=>r.context.runAttempt=2,r=>r.context.kind='local',
    r=>r.context.repository='attacker/repository',r=>delete r.summary
  ];
  for(const change of cases){const f=fixture();change(f.state.report);await assert.rejects(f.execute(),/MANDATORY_EXECUTION_NOT_QUALIFIED/);assert.equal(f.state.providerCalls,0);}
});

test('the original 170-pass one-skip regression cannot qualify against the full inventory', async () => {
  const f=fixture();f.state.report.results=f.state.report.results.slice(0,171);
  const render=f.state.report.results.find(r=>r.name==='Render failure never starts Vercel or automatic rollback');
  assert.ok(render,'the original Render-failure test remains mandatory');
  render.outcome='skipped';render.executions=0;
  f.state.report.summary={tests:171,passed:170,failed:0,skipped:1,cancelled:0,todo:0,suites:0};
  await assert.rejects(f.execute(),/MANDATORY_EXECUTION_NOT_QUALIFIED/);assert.equal(f.state.providerCalls,0);
});

test('missing, duplicate, wrong-attempt and incomplete artifact inventories deny before provider reads', async () => {
  for(const change of [p=>p.artifacts=[],p=>p.artifacts.push(p.artifacts[0]),p=>p.total_count++,p=>p.artifacts[0].name+='-other']){
    const f=fixture(),read=f.api.gh;f.api.gh=async route=>{const p=await read(route);if(route.includes('/artifacts?'))change(p);return p;};
    await assert.rejects(f.execute());assert.equal(f.state.providerCalls,0);
  }
});

test('artifact ownership, digest, availability and archive contents must be verifiable', async () => {
  for(const change of [a=>a.expired=true,a=>delete a.digest,a=>a.digest='sha256:'+'0'.repeat(64),
    a=>a.workflow_run.id=999,a=>a.workflow_run.head_sha=previous,a=>a.workflow_run.repository_id=1,
    a=>a.workflow_run.head_repository_id=1,a=>a.workflow_run.head_branch='feature',a=>a.size_in_bytes=8*1024*1024]){
    const f=fixture(),read=f.api.gh;f.api.gh=async route=>{const p=await read(route);if(route.includes('/artifacts?'))change(p.artifacts[0]);if(route==='/actions/artifacts/7890')change(p);return p;};
    await assert.rejects(f.execute());assert.equal(f.state.providerCalls,0);
  }
  for(const bytes of [Buffer.from('invalid zip'),zipFixture('other.json','{}'),zipFixture('report.json','not json'),zipFixture('report.json','{}',{'extra.json':'{}'})]){
    const f=fixture(),read=f.api.gh;f.api.artifact=async()=>bytes;
    f.api.gh=async route=>{const p=await read(route);if(route.includes('/artifacts?')){p.artifacts[0].digest=`sha256:${sha256(bytes)}`;p.artifacts[0].size_in_bytes=bytes.length;}
      if(route==='/actions/artifacts/7890'){p.digest=`sha256:${sha256(bytes)}`;p.size_in_bytes=bytes.length;}return p;};
    await assert.rejects(f.execute());assert.equal(f.state.providerCalls,0);
  }
  const f=fixture();f.api.artifact=async()=>{throw Error('unavailable');};await assert.rejects(f.execute(),/unavailable/);assert.equal(f.state.providerCalls,0);
});

test('artifact substitution between listing, metadata and download is rejected', async () => {
  const f=fixture(),read=f.api.gh;f.api.gh=async route=>{const p=await read(route);if(route==='/actions/artifacts/7890')p.digest='sha256:'+'0'.repeat(64);return p;};
  await assert.rejects(f.execute(),/ARTIFACT_SUBSTITUTED/);assert.equal(f.state.providerCalls,0);
  const other=fixture();other.api.artifact=async()=>Buffer.from('substituted download');
  await assert.rejects(other.execute(),/ARTIFACT_DIGEST_MISMATCH/);assert.equal(other.state.providerCalls,0);
});

test('stale, future, undated and changing CI evidence is rejected', async () => {
  for(const change of [r=>r.updated_at=new Date(fixtureNow-86400_001).toISOString(),
    r=>r.updated_at=new Date(fixtureNow+30_001).toISOString(),r=>delete r.updated_at,r=>r.run_attempt=2]){
    const f=fixture(),read=f.api.gh;f.api.gh=async route=>{const p=await read(route);if(route==='/actions/runs/123')change(p);return p;};
    await assert.rejects(f.execute());assert.equal(f.state.providerCalls,0);
  }
  const f=fixture(),read=f.api.gh;let reads=0;
  f.api.gh=async route=>{const p=await read(route);if(route==='/actions/runs/123'&&++reads===2)p.run_attempt=2;return p;};
  await assert.rejects(verified(f),/CI_EVIDENCE_CHANGED/);assert.equal(f.state.providerCalls,0);
});

test('receipts bind every identity, policy and evidence coordinate and cannot cross attempts', async () => {
  const f=fixture(),q=f.state.candidate,evidence=await verified(f),receipt=createGitHubAdmission(q,f.state.policy,evidence,now);
  for(const change of [r=>r.repository='attacker/repo',r=>r.sha=previous,r=>r.ciRunId='999',r=>r.ciRunAttempt=2,
    r=>r.executorSha=previous,r=>r.executorRepository='attacker/executor',r=>r.releaseRunId='999',r=>r.releaseRunAttempt=2,
    r=>r.policySha256='0'.repeat(64),r=>r.evidenceSha256='0'.repeat(64),r=>r.environment='other',r=>r.inventorySha256='0'.repeat(64),
    r=>r.renderServiceId='other',r=>r.vercelProjectId='other',r=>r.authorizationId='0'.repeat(64),r=>r.extra=true]){
    const altered=structuredClone(receipt);change(altered);
    await assert.rejects(f.execute({admissionReceipt:altered}),/ADMISSION_RECEIPT_MISMATCH/);assert.equal(f.state.providerCalls,0);
  }
  assert.throws(()=>validateGitHubAdmission(receipt,{...q,releaseRunAttempt:2},f.state.policy,evidence,now),/ADMISSION_RECEIPT_MISMATCH/);
  assert.throws(()=>validateGitHubAdmission(receipt,q,f.state.policy,evidence,()=>fixtureNow+3600_000),/EXPIRED/);
  const future=createGitHubAdmission(q,f.state.policy,evidence,()=>fixtureNow+30_001);
  assert.throws(()=>validateGitHubAdmission(future,q,f.state.policy,evidence,now),/EXPIRED_OR_UNDATED/);
});

test('explicit policy selection rejects old modes, broadened scope and silent attestation fallback', async () => {
  for(const change of [p=>p.version=2,p=>delete p.authorization,p=>p.authorization.kind='signed-attestation',
    p=>p.scope.repository='attacker/repo',p=>p.scope.branch='feature',p=>p.scope.renderServiceId='other',
    p=>p.authorization.maxCiAgeSeconds=86401,p=>p.authorization.maxAdmissionAgeSeconds=0,
    p=>p.authorization.administrators[0].id=1,p=>p.extra=true]){
    const p=structuredClone(standingPolicy);change(p);assert.throws(()=>policyDigest(p),/STANDING_POLICY_INVALID/);
  }
  const f=fixture();await assert.rejects(f.execute({admissionReceipt:null,authorization:f.authorizationFor(f.state.candidate)}),/ADMISSION_RECEIPT_REQUIRED/);
  assert.equal(f.state.providerCalls,0);
});

test('standing authorization requires a trusted administrator merge of the exact executor revision', async () => {
  for(const by of [{login:'contributor',id:1},{login:'Xolani-M',id:1},{login:'aqualifestyleclub',id:307076734}]){
    const f=fixture(),read=f.api.executor;f.api.executor=async route=>{const p=await read(route);if(route==='/pulls/1')p.merged_by=by;return p;};
    if(by.id===307076734)await f.execute();else{await assert.rejects(f.execute(),/ADMINISTRATOR_APPROVAL_REQUIRED/);assert.equal(f.state.providerCalls,0);}
  }
  const f=fixture(),read=f.api.executor;f.api.executor=async route=>{const p=await read(route);if(route==='/pulls/1')p.merge_commit_sha=previous;return p;};
  await assert.rejects(f.execute(),/ADMINISTRATOR_APPROVAL_REQUIRED/);assert.equal(f.state.providerCalls,0);
});

function historyFixture({deployedSha=previous,conclusion='success',status='completed'}={}) {
  const f=fixture(),q=f.state.candidate;
  const run=(id,number,sha)=>({id,run_number:number,run_attempt:1,head_sha:sha,head_branch:'main',event:'workflow_dispatch',
    path:'.github/workflows/deploy.yml',name:'Qualified production executor',status:'in_progress',
    repository:{full_name:q.executorRepository},head_repository:{full_name:q.executorRepository}});
  const past={...run(455,1,'e'.repeat(40)),status,conclusion},current=run(456,2,q.executorSha);
  const rows=[{...q,sha:deployedSha,executorSha:past.head_sha,releaseRunId:'455',ciRunId:'122',phase:'verified',
    renderSha:deployedSha,vercelSha:deployedSha,renderDeployId:'dep-prior',vercelDeployId:'dpl_Prior',renderReleaseRunAttempt:1,vercelReleaseRunAttempt:1}];
  const archive=()=>zipFixture('release-report.jsonl',rows.map(x=>JSON.stringify(x)).join('\n')+'\n');
  const metadata=()=>({id:8955,name:'production-release-audit-455-1',expired:false,size_in_bytes:archive().length,digest:`sha256:${sha256(archive())}`,
    workflow_run:{id:455,head_sha:past.head_sha,head_branch:'main',repository_id:987,head_repository_id:987}});
  const read=f.api.executor,download=f.api.artifact;
  f.api.executor=async route=>{
    if(route==='/actions/runs/456')return structuredClone(current);
    if(route==='/actions/runs/455')return structuredClone(past);
    if(route.startsWith('/actions/workflows/deploy.yml/runs?'))return {total_count:2,workflow_runs:structuredClone([current,past])};
    if(route==='/actions/runs/455/attempts/1/jobs?per_page=100')return {total_count:3,jobs:[
      {name:'Qualify immutable source candidate',conclusion:'success'},
      {name:admissionJobName,conclusion:'success'},
      {name:'Unattended recovery release',conclusion:past.conclusion,steps:[{name:'Revalidate policy, provenance, providers and recovery before automatic deployment',conclusion:past.conclusion}]}]
      .map(x=>({...x,status:'completed',run_id:455,run_attempt:1}))};
    if(route==='/actions/runs/455/artifacts?per_page=100')return {total_count:1,artifacts:[metadata()]};
    if(route==='/actions/artifacts/8955')return metadata();
    return read(route);
  };
  f.api.artifact=async(owner,id)=>owner==='executor'&&id==='8955'?archive():download(owner,id);
  return {...f,past,current,rows};
}

test('complete authenticated history rejects a deployed SHA even under another CI identity', async () => {
  const f=historyFixture();const plan=await evidencePlan(f.api,f.state.candidate,f.state.policy);
  assert.equal(plan.verifiedReleases.length,1);assert.equal(plan.verifiedReleases[0].sourceSha,previous);
  f.rows[0].sha=source;f.rows[0].renderSha=source;f.rows[0].vercelSha=source;
  for(const candidate of [f.state.candidate,{...f.state.candidate,ciRunId:'999',ciRunAttempt:2}])
    await assert.rejects(evidencePlan(f.api,candidate,f.state.policy),/SOURCE_ALREADY_VERIFIED/);
  assert.equal(f.state.providerCalls,0);
});

test('verified production predecessor cannot fall back to legacy health when protected readiness is unavailable',async()=>{
  const f=historyFixture(),prior=f.rows[0],render=f.api.render,vercel=f.api.vercel;
  f.state.plan=await evidencePlan(f.api,f.state.candidate,f.state.policy);f.state.baselineRows=f.rows;
  f.state.renderRows[0].id='dep-prior';f.state.project.targets.production.id='dpl_Prior';
  f.api.render=async(route,body)=>route.endsWith('/deploys/dep-prior')?f.state.renderRows[0]:render(route,body);
  f.api.vercel=async(route,body)=>route.endsWith('/dpl_Prior')?{id:'dpl_Prior',projectId:f.state.project.id,
    target:'production',readyState:'READY',gitSource:{sha:previous,repoId:'789'},
    meta:{aquaReleaseIdentity:releaseKey(prior),aquaCiRunId:prior.ciRunId,aquaCiRunAttempt:String(prior.ciRunAttempt)}}:vercel(route,body);
  let calls=0;f.api.readiness=async sha=>{assert.equal(sha,previous);calls++;throw Error('unavailable');};
  await assert.rejects(f.execute(),/PROTECTED_RUNTIME_READINESS_FAILED/);assert.equal(calls,1);assert.equal(f.posts.length,0);
});

test('a subsequent release cannot reuse the first-release exception for a predecessor without verified source',async()=>{
  const f=historyFixture(), render=f.api.render, vercel=f.api.vercel;
  f.state.plan=await evidencePlan(f.api,f.state.candidate,f.state.policy);f.state.baselineRows=f.rows;
  f.state.renderRows[0].id='dep-prior';f.state.project.targets.production.id='dpl_Prior';
  f.api.render=async(route,body)=>route.endsWith('/deploys/dep-prior')?f.state.renderRows[0]:render(route,body);
  f.api.vercel=async(route,body)=>route.endsWith('/dpl_Prior')?{id:'dpl_Prior',projectId:f.state.project.id,
    target:'production',readyState:'READY',alias:['www.aqualifestyleclub.co.za']}:vercel(route,body);
  await assert.rejects(f.execute(),/ROLLBACK_FRONTEND_PROVENANCE_UNVERIFIED/);
  assert.equal(f.posts.length,0);
});

test('concurrent active runs cannot both admit; serialized duplicate observes prior completion', async () => {
  const f=historyFixture({deployedSha:source,status:'in_progress'});
  const contenders=[{...f.state.candidate,executorSha:f.past.head_sha,releaseRunId:'455'},f.state.candidate];
  const results=await Promise.allSettled(contenders.map(q=>evidencePlan(f.api,q,f.state.policy)));
  assert.ok(results.every(x=>x.status==='rejected'&&/CONCURRENT_RELEASE_RUN/.test(x.reason.message)));
  f.past.status='completed';
  await assert.rejects(evidencePlan(f.api,f.state.candidate,f.state.policy),/SOURCE_ALREADY_VERIFIED/);
  assert.equal(f.state.providerCalls,0);
});

test('missing history, expired audits and unresolved previous provider operations fail closed', async () => {
  const f=historyFixture(),read=f.api.executor;
  f.api.executor=async route=>{const p=await read(route);if(route.includes('/artifacts?'))p.artifacts[0].expired=true;return p;};
  await assert.rejects(evidencePlan(f.api,f.state.candidate,f.state.policy),/AUDIT_ARTIFACT_REQUIRED/);
  f.api.executor=async route=>{const p=await read(route);if(route==='/actions/artifacts/8955')p.digest='sha256:'+'0'.repeat(64);return p;};
  await assert.rejects(evidencePlan(f.api,f.state.candidate,f.state.policy),/DIGEST_MISMATCH/);
  f.api.executor=async route=>{const p=await read(route);if(route.includes('/workflows/deploy.yml/runs?')){p.workflow_runs=p.workflow_runs.slice(0,1);p.total_count=1;}return p;};
  await assert.rejects(evidencePlan(f.api,f.state.candidate,f.state.policy),/HISTORY_GAP/);
  const failed=historyFixture({conclusion:'failure'});
  await assert.rejects(evidencePlan(failed.api,failed.state.candidate,failed.state.policy),/REQUIRES_RECONCILIATION/);
  assert.equal(failed.state.providerCalls,0);
});

test('same-run retry reconciles every prior audit before admission, including already verified and uncertain requests', async () => {
  const f=fixture(),first=f.state.candidate,candidate={...first,releaseRunAttempt:2};
  const current={id:456,run_number:1,run_attempt:2,head_sha:first.executorSha,head_branch:'main',event:'workflow_dispatch',
    path:'.github/workflows/deploy.yml',name:'Qualified production executor',status:'in_progress',
    repository:{full_name:first.executorRepository},head_repository:{full_name:first.executorRepository}};
  let rows=[{...first,phase:'evidence-selected'}];
  const archive=()=>zipFixture('release-report.jsonl',rows.map(x=>JSON.stringify(x)).join('\n')+'\n');
  const metadata=()=>({id:8966,name:'production-release-audit-456-1',expired:false,size_in_bytes:archive().length,
    digest:`sha256:${sha256(archive())}`,workflow_run:{id:456,head_sha:first.executorSha,head_branch:'main',repository_id:987,head_repository_id:987}});
  const read=f.api.executor;f.api.executor=async route=>{
    if(route==='/actions/runs/456')return current;
    if(route.startsWith('/actions/workflows/deploy.yml/runs?'))return {total_count:1,workflow_runs:[current]};
    if(route==='/actions/runs/456/artifacts?per_page=100')return {total_count:1,artifacts:[metadata()]};
    if(route==='/actions/artifacts/8966')return metadata();
    return read(route);
  };
  f.api.artifact=async()=>archive();
  const plan=await evidencePlan(f.api,candidate,f.state.policy);assert.equal(plan.resumeChain.length,1);
  for(const additional of [{phase:'render-requesting'},{phase:'verified'},
    {phase:'failed',code:'AMBIGUOUS_PROVIDER_POST_INSPECT_BEFORE_RETRY'},
    {phase:'evidence-selected',ciRunId:'999'}]){
    rows=[{...first,phase:'evidence-selected'},{...first,...additional}];
    await assert.rejects(evidencePlan(f.api,candidate,f.state.policy),/AMBIGUOUS|ALREADY_VERIFIED|IDENTITY_MISMATCH/);
  }
  assert.equal(f.state.providerCalls,0);
});

test('artifact transport follows only GitHub-authenticated redirects without forwarding credentials', async () => {
  const calls=[];
  const api=clients({...runnerEnv(),AQGREEN_EVIDENCE_READ_TOKEN:'github-canary'},async(url,options)=>{
    calls.push({url,options});return calls.length===1?new Response(null,{status:302,headers:{location:'https://storage.example.invalid/artifact?signature=redacted'}}):new Response(Buffer.from('zip substitute'));
  });
  assert.equal((await api.artifact('source','7890')).toString(),'zip substitute');
  assert.equal(calls[0].options.headers.Authorization,'Bearer github-canary');assert.equal(calls[0].options.redirect,'manual');
  assert.equal(calls[1].options.headers,undefined);assert.equal(calls[1].options.redirect,'error');
  for(const response of [new Response(null,{status:403}),new Response(null,{status:302,headers:{location:'http://storage.example.invalid'}})]){
    const bad=clients({AQGREEN_EVIDENCE_READ_TOKEN:'github-canary'},async()=>response);await assert.rejects(bad.artifact('source','7890'));
  }
});

test('inert Git definition reads reject symlinks, missing files and unapproved paths', () => {
  const dir=mkdtempSync(join(tmpdir(),'aqua-definition-git-'));
  try{
    const git=args=>execFileSync('git',args,{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
    git(['init','-q']);git(['config','user.name','Fixture']);git(['config','user.email','fixture@example.invalid']);
    mkdirSync(join(dir,'tools/deployment'),{recursive:true});
    const path='tools/deployment/release-control.test.mjs',content="throw Error('NEVER_EXECUTE');\n";
    writeFileSync(join(dir,path),content);git(['add','.']);git(['commit','-qm','inert fixture']);const sha=git(['rev-parse','HEAD']);
    assert.equal(gitSourceDigest(dir,sha,path),sha256(content));
    rmSync(join(dir,path));symlinkSync('somewhere',join(dir,path));git(['add','.']);git(['commit','-qm','symlink fixture']);
    assert.throws(()=>gitSourceDigest(dir,git(['rev-parse','HEAD']),path),/NOT_REGULAR/);
    assert.throws(()=>gitSourceDigest(dir,sha,'tools/deployment/missing.mjs'),/APPROVED_SOURCE_PATH_REQUIRED/);
    assert.throws(()=>gitSourceDigest(dir,sha,'.github/workflows/ci.yml'),/NOT_REGULAR/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('the real Git reader admits every executor-pinned clean-start source without executing it', () => {
  const dir=mkdtempSync(join(tmpdir(),'aqua-clean-start-definition-git-'));
  try {
    const git=args=>execFileSync('git',args,{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
    git(['init','-q']);git(['config','user.name','Fixture']);git(['config','user.email','fixture@example.invalid']);
    const content="throw Error('NEVER_EXECUTE');\n";
    assert.ok(schemaSource.cleanStartSources.length>0);
    for(const pin of schemaSource.cleanStartSources){
      mkdirSync(dirname(join(dir,pin.path)),{recursive:true});writeFileSync(join(dir,pin.path),content);
    }
    git(['add','.']);git(['commit','-qm','inert clean-start fixture']);const sha=git(['rev-parse','HEAD']);
    for(const pin of schemaSource.cleanStartSources) assert.equal(gitSourceDigest(dir,sha,pin.path),sha256(content));
    assert.throws(()=>gitSourceDigest(dir,sha,'unapproved-clean-start.sql'),/APPROVED_SOURCE_PATH_REQUIRED/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
