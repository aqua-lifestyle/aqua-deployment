import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fixture,qualified,runnerEnv,source,previous,run,jobs,fixtureNow} from './fixtures/provider.mjs';
import {clients,freezeCandidate,validatePolicy,verifyCandidate,targets,standingPolicy,qualify,
  evidencePlan,releaseKey,validateLegacyHistory,main,validateResumeReceipt,validateBaselineReceipt,
  validateAdmissionJob,requireDeploymentAttestation,admissionJobName} from './release-control.mjs';
import {fetchSource} from './fetch-source.mjs';

test('external rollout preserves exact Render-first sequence and independently bound revisions',async()=>{
  const f=fixture();await f.execute();
  assert.deepEqual(f.posts.map(x=>x.provider),['render','vercel']);
  assert.equal(f.posts[0].body.commitId,source);
  assert.equal(f.posts[1].body.gitSource.sha,source);
  assert.equal(f.posts[1].body.project,targets.vercel.id);
  assert.equal(f.reports.at(-1).renderSha,source);assert.equal(f.reports.at(-1).vercelSha,source);
  assert.equal(f.reports.at(-1).executorRepository,targets.executor.repository);
  assert.equal(f.reports.at(-1).executorSha,'d'.repeat(40));
});
test('inactive prototype rejects missing, altered, expired, mismatched or unverifiable attestations',async()=>{
  const seed=fixture(),valid=seed.authorizationFor(seed.state.candidate);
  const cases=[
    ['missing',null],
    ['altered signature',{...valid,envelope:{...valid.envelope,signature:'A'.repeat(86)}}],
    ['stale source',seed.authorizationFor(seed.state.candidate,c=>{c.source.commitSha=previous;return c;})],
    ['wrong run',seed.authorizationFor(seed.state.candidate,c=>{c.source.ciRunId='999';return c;})],
    ['wrong attempt',seed.authorizationFor(seed.state.candidate,c=>{c.source.ciRunAttempt=2;return c;})],
    ['expired',seed.authorizationFor(seed.state.candidate,c=>{c.expiresAt='2000-01-01T00:00:00.000Z';return c;})],
    ['unavailable verifier',{...valid,cryptoProvider:null}]
  ];
  for(const [label,authorization] of cases){
    const f=fixture();
    await assert.rejects(requireDeploymentAttestation(authorization,f.state.candidate),undefined,label);
    assert.equal(f.posts.length,0,label);
    assert.equal(f.state.providerCalls,0,label);
    assert.equal(f.state.renderReads,0,label);
    assert.equal(f.state.vercelReads,0,label);
  }
});
test('inactive prototype consumes the same signed authorization once in its test store',async()=>{
  const f=fixture(),authorization=f.authorizationFor(f.state.candidate);
  const results=await Promise.allSettled([requireDeploymentAttestation(authorization,f.state.candidate),requireDeploymentAttestation(authorization,f.state.candidate)]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(results.filter(x=>x.status==='rejected').length,1);
  assert.equal(f.posts.length,0);
});
for(const [label,mutate] of [
  ['missing credentials',f=>{delete f.state.env.RENDER_API_KEY;}],
  ['wrong main',f=>{f.state.main=previous;}],
  ['missing CI check',f=>{f.state.jobCount=16;}],
  ['missing environment',f=>{f.state.environment={};}],
  ['restricted operation enabled',f=>{f.state.vars.find(x=>x.envVar.key==='Bird__Enabled').envVar.value='true';}],
  ['redirected provider target',f=>{f.state.service.id='srv-untrusted';}],
  ['unlinked frontend',f=>{f.state.project.link=null;}],
  ['migration',f=>{f.state.files=[{filename:'EF/Migrations/Unauthorized.cs'}];}],
  ['concurrent provider operation',f=>{f.state.renderRows.push({id:'dep-foreign',status:'queued',commit:{id:previous}});}],
])test(`${label} cannot acquire a provider mutation`,async()=>{
  const f=fixture();mutate(f);await assert.rejects(f.execute());assert.equal(f.posts.length,0);
});
test('Render failure and incorrect backend health prevent frontend deployment',async()=>{
  for(const healthFailure of [false,true]){
    const f=fixture();const read=f.api.render;
    if(healthFailure){const health=f.api.health;f.api.health=async()=>{const r=await health();if(f.state.newRender?.status==='live')r.body.result.buildId=previous;return r;};}
    else f.api.render=async(route,body)=>route.endsWith('/dep-new')?{id:'dep-new',status:'build_failed',commit:{id:source}}:read(route,body);
    await assert.rejects(f.execute());assert.deepEqual(f.posts.map(x=>x.provider),['render']);
  }
});
test('wrong CI App, revision, result or check URL is rejected',async()=>{
  for(const mutate of [c=>c.app.id=1,c=>c.head_sha=previous,c=>c.conclusion='neutral',c=>c.name='forged']){
    const f=fixture();const read=f.api.gh;f.api.gh=async(route)=>{const r=await read(route);if(route.startsWith('/check-runs/'))mutate(r);return r;};
    await assert.rejects(f.execute());assert.equal(f.posts.length,0);
  }
  const f=fixture();const read=f.api.gh;f.api.gh=async route=>{const r=await read(route);if(route.includes('/jobs?'))r.jobs[0].check_run_url='https://attacker.invalid/check';return r;};
  await assert.rejects(f.execute());assert.equal(f.posts.length,0);
});
test('failed, skipped, duplicate, excluded and wrong-attempt mandatory CI cannot qualify',async()=>{
  for(const mutate of [r=>r.jobs.pop(),r=>r.jobs[0].conclusion='skipped',r=>r.jobs[0].run_attempt=2,
    r=>r.jobs[0].name='renamed',r=>r.jobs[0]=r.jobs[1]]){
    const f=fixture();const read=f.api.gh;f.api.gh=async route=>{const r=await read(route);if(route.includes('/jobs?'))mutate(r);return r;};
    await assert.rejects(f.execute());assert.equal(f.posts.length,0);
  }
});
test('executor revision, repository, branch and attempt cannot be substituted',()=>{
  const q=qualified();
  for(const env of [{...runnerEnv(),GITHUB_REPOSITORY:targets.repository},{...runnerEnv(),GITHUB_REF:'refs/heads/feature/attacker'},
    {...runnerEnv(),GITHUB_WORKFLOW_SHA:previous},{...runnerEnv(),GITHUB_RUN_ATTEMPT:'2'}])
    assert.throws(()=>validatePolicy(q,env));
  assert.notEqual(releaseKey(q),releaseKey({...q,executorSha:previous}));
});
test('candidate artifact must match independently fetched Git bytes and exact CI identity',()=>{
  const q=qualified(),bytes=Buffer.from('Git archive');const candidate={...q,sourceSha256:createHash('sha256').update(bytes).digest('hex')};
  verifyCandidate(candidate,q,bytes,bytes);
  for(const c of [{...candidate,sha:previous},{...candidate,ciRunAttempt:2},{...candidate,executorSha:previous}])
    assert.throws(()=>verifyCandidate(c,q,bytes,bytes));
  assert.throws(()=>verifyCandidate(candidate,q,Buffer.from('forged'),bytes));
  assert.throws(()=>verifyCandidate(candidate,q,bytes,Buffer.from('different Git archive')));
});
test('external receipts and history belong to executor, never application runs',async()=>{
  const q=qualified(),calls=[];
  const r={id:456,run_attempt:1,run_number:1,head_sha:q.executorSha,head_branch:'main',event:'workflow_dispatch',
    path:'.github/workflows/deploy.yml',name:'Qualified production executor',status:'in_progress',
    repository:{full_name:targets.executor.repository},head_repository:{full_name:targets.executor.repository}};
  const api={gh:async()=>{throw Error('source run IDs must not be used');},executor:async route=>{
    calls.push(route);if(route==='/actions/runs/456')return r;
    if(route.startsWith('/actions/workflows/deploy.yml/runs?'))return {total_count:1,workflow_runs:[r]};throw Error(route);
  }};
  const plan=await evidencePlan(api,q,standingPolicy);assert.equal(plan.baseline,null);assert.equal(calls.length,2);
  r.head_sha=source;await assert.rejects(evidencePlan(api,q,standingPolicy));
});
test('legacy application provider ambiguity is preserved during executor takeover',async()=>{
  const legacy={id:38912818702,run_number:1,run_attempt:1,repository:{full_name:targets.repository},head_repository:{full_name:targets.repository},
    path:'.github/workflows/release.yml',head_branch:'main',event:'workflow_run',status:'completed',name:'Qualified production release'};
  const job={name:'Unattended recovery release',conclusion:'failure',steps:[{name:'Revalidate policy, provenance, providers and recovery before automatic deployment',conclusion:'skipped'}]};
  const api={gh:async route=>route.includes('/jobs?')?{total_count:2,jobs:[{name:'Qualify immutable source candidate'},job]}:{total_count:1,workflow_runs:[legacy]}};
  await validateLegacyHistory(api);job.steps[0].conclusion='failure';await assert.rejects(validateLegacyHistory(api),/RECONCILIATION/);
});
test('provider token destinations are fixed and redirects are rejected',async()=>{
  const calls=[];const api=clients({...runnerEnv(),GH_TOKEN:'github-canary'},async(url,opts)=>{calls.push({url,opts});return {ok:true,json:async()=>({})};});
  await api.render('/services/'+targets.render.id);await api.vercel('/v9/projects/'+targets.vercel.id);await api.executor('/actions/runs/456');
  assert.deepEqual(calls.map(x=>new URL(x.url).origin),['https://api.render.com','https://api.vercel.com','https://api.github.com']);
  assert.ok(calls.every(x=>x.opts.redirect==='error'));
  assert.equal(calls[2].opts.headers.Authorization,'Bearer github-canary');
  assert.ok(!JSON.stringify(calls[0]).includes('synthetic-vercel-token'));
});
test('application targets, scripts and arbitrary fields are not executor inputs',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'aqua-executor-input-'));try{
    const path=join(dir,'event.json');const q=qualified();
    for(const input of [{ci_run_id:'123',ci_run_attempt:'1',sha:source,target:'attacker'},
      {ci_run_id:'123',ci_run_attempt:'2',sha:source},{ci_run_id:'123',ci_run_attempt:'1',sha:previous}]){
      writeFileSync(path,JSON.stringify({inputs:input}));const f=fixture();
      await assert.rejects(main({...runnerEnv(),GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_EVENT_PATH:path},{mode:'candidate',api:f.api}));
      assert.equal(f.posts.length,0);
    }
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('source fetch is inert, fixed-origin, SHA-only and strips inherited credentials/config',()=>{
  const dir=mkdtempSync(join(tmpdir(),'aqua-inert-'));try{
    const path=join(dir,'event.json');writeFileSync(path,JSON.stringify({inputs:{ci_run_id:'123',ci_run_attempt:'1',sha:source}}));
    const calls=[];fetchSource({GITHUB_EVENT_PATH:path,SOURCE_DIR:join(dir,'objects'),GITHUB_WORKSPACE:'/trusted',
      RENDER_API_KEY:'render-canary',VERCEL_TOKEN:'vercel-canary',GIT_CONFIG_COUNT:'1'},(exe,args,opts)=>{
        calls.push({exe,args,opts});return args.includes('rev-parse')?source+'\n':'';});
    assert.equal(calls.length,3);assert.ok(calls.every(x=>x.exe==='git' && !('RENDER_API_KEY' in x.opts.env)));
    assert.ok(calls.every(x=>!('VERCEL_TOKEN' in x.opts.env) && !('GIT_CONFIG_COUNT' in x.opts.env)));
    assert.ok(calls[1].args.includes('https://github.com/aqua-lifestyle/aqua-lifestyle.git'));
    assert.ok(calls.every(x=>!x.args.includes('checkout')&&!x.args.includes('submodule')));
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('separate pre-secret admission gates the only provider-secret job',()=>{
  const wf=readFileSync(new URL('../../.github/workflows/deploy.yml',import.meta.url),'utf8');
  const extract = (name,next) => wf.match(new RegExp(`\\n  ${name}:([\\s\\S]*?)(?=\\n  ${next}:|$)`))?.[1] ?? '';
  const candidate=extract('candidate','admission'),admission=extract('admission','production'),production=extract('production','');
  assert.ok(candidate && admission && production);
  assert.ok(!candidate.includes('secrets.'));
  assert.ok(!admission.includes('environment:'));
  assert.doesNotMatch(admission,/secrets\.(RENDER_API_KEY|VERCEL_TOKEN)/);
  assert.doesNotMatch(admission,/secrets\./);
  assert.match(production,/needs: \[candidate, admission\]/);
  assert.match(production,/needs\.admission\.result == 'success'/);
  assert.match(production,/environment: production-release/);
  assert.match(production,/secrets\.RENDER_API_KEY/);
  assert.match(production,/secrets\.VERCEL_TOKEN/);
  assert.match(production,/ref: \$\{\{ github.sha \}\}/);
  assert.doesNotMatch(candidate,/npm|npx/);assert.doesNotMatch(admission,/npm|npx/);
  assert.doesNotMatch(production,/npm|npx/);
  assert.match(wf,/group: production-release\s+cancel-in-progress: false/);
  assert.match(wf,/github.ref == 'refs\/heads\/main'/);
  assert.doesNotMatch(wf,/\$\{\{ inputs\./);
  assert.doesNotMatch(admission,/api\.render\.com|api\.vercel\.com/);
  assert.match(admission,/AQUA_ADMISSION_RECEIPT_OUTPUT/);
  assert.doesNotMatch(wf,/AQUA_AUTHORIZATION_BUNDLE|ATTESTATION_REPLAY_DATABASE_URL/);
  assert.equal((production.match(/node tools\/deployment\/release-control\.mjs deploy/g)??[]).length,1);
  for(const name of readdirSync(new URL('../../.github/workflows/',import.meta.url)).filter(n=>n.endsWith('.yml')&&n!=='deploy.yml'))
    assert.doesNotMatch(readFileSync(new URL(`../../.github/workflows/${name}`,import.meta.url),'utf8'),/secrets\.(RENDER_API_KEY|VERCEL_TOKEN)/);
  for(const line of wf.split('\n').filter(l=>l.includes('uses:')))assert.match(line,/@[a-f0-9]{40}/);
});

test('missing, skipped or wrong-attempt admission execution cannot qualify the provider job',async()=>{
  const f=fixture(),q=f.state.candidate,read=f.api.executor;
  const route=`/actions/runs/${q.releaseRunId}/attempts/${q.releaseRunAttempt}/jobs?per_page=100`;
  const complete=[
    {name:'Qualify immutable source candidate',status:'completed',conclusion:'success'},
    {name:admissionJobName,status:'completed',conclusion:'success'},
    {name:'Unattended recovery release',status:'in_progress',conclusion:null}
  ].map(job=>({...job,run_id:Number(q.releaseRunId),run_attempt:q.releaseRunAttempt}));
  for(const jobs of [complete.filter(x=>x.name!==admissionJobName),
    complete.map(x=>x.name===admissionJobName?{...x,conclusion:'skipped'}:x),
    complete.map(x=>x.name===admissionJobName?{...x,run_attempt:2}:x)]){
    f.api.executor=async path=>path===route?{total_count:jobs.length,jobs}:read(path);
    await assert.rejects(validateAdmissionJob(f.api,q));
    assert.equal(f.state.providerCalls,0);
  }
});

test('real Git source passes candidate, admission and deployment entries without executing candidate code',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'aqua-executor-entry-'));
  try{
    const repo=join(dir,'source'),candidate=join(dir,'candidate');mkdirSync(repo);mkdirSync(candidate);
    const git=args=>execFileSync('git',args,{cwd:repo,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
    git(['init','-q']);git(['config','user.name','Disposable fixture']);git(['config','user.email','fixture@example.invalid']);
    writeFileSync(join(repo,'package.json'),JSON.stringify({scripts:{install:'exit 99'}}));
    writeFileSync(join(repo,'targets.json'),'https://attacker.invalid');
    writeFileSync(join(repo,'application.mjs'),`throw Error('CANDIDATE_CODE_MUST_NOT_EXECUTE');`);
    mkdirSync(join(repo,'tools/deployment'),{recursive:true});
    writeFileSync(join(repo,'tools/deployment/release-control.mjs'),`throw Error('CANDIDATE_CONTROLLER_MUST_NOT_EXECUTE');`);
    writeFileSync(join(repo,'tools/deployment/targets.json'),JSON.stringify({render:{id:'attacker',healthUrl:'https://attacker.invalid'}}));
    git(['add','.']);git(['commit','-qm','Disposable source']);const sha=git(['rev-parse','HEAD']);
    const executorSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
    const event=join(dir,'event.json');writeFileSync(event,JSON.stringify({inputs:{ci_run_id:'123',ci_run_attempt:'1',sha}}));
    const env={...runnerEnv(),GITHUB_SHA:executorSha,GITHUB_WORKFLOW_SHA:executorSha,GITHUB_EVENT_NAME:'workflow_dispatch',
      GITHUB_EVENT_PATH:event,SOURCE_DIR:repo,CANDIDATE_DIR:candidate,GITHUB_OUTPUT:join(dir,'outputs'),RELEASE_REPORT:join(dir,'report.jsonl')};
    const f=fixture();f.state.candidate={...f.state.candidate,sha,executorSha};f.state.report.context.sha=sha;
    const transform=value=>value===source?sha:Array.isArray(value)?value.map(transform):
      value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,transform(v)])):value;
    for(const key of ['gh','render','vercel','health']){const original=f.api[key];f.api[key]=async(...args)=>transform(await original(...args));}
    const executorApi=f.api.executor;
    const current={id:456,run_attempt:1,run_number:1,head_sha:executorSha,head_branch:'main',event:'workflow_dispatch',
      path:'.github/workflows/deploy.yml',name:'Qualified production executor',status:'in_progress',
      repository:{full_name:targets.executor.repository},head_repository:{full_name:targets.executor.repository}};
    f.api.executor=async route=>route==='/git/ref/heads/main'?{object:{sha:executorSha}}:route==='/actions/runs/456'?current:route.startsWith('/actions/workflows/deploy.yml/runs?')?
      {total_count:1,workflow_runs:[current]}:executorApi(route);
    const publicEnv={...env};delete publicEnv.RENDER_API_KEY;delete publicEnv.VERCEL_TOKEN;
    const dependencies={api:f.api,now:()=>fixtureNow,readSourceDigest:f.readSourceDigest};
    await main(publicEnv,{mode:'candidate',...dependencies});assert.equal(f.posts.length,0);
    const manifest=JSON.parse(readFileSync(join(candidate,'candidate.json')));
    assert.equal(manifest.sha,sha);assert.equal(manifest.executorSha,executorSha);
    assert.ok(readFileSync(join(candidate,'source.tar')).length>0);
    await assert.rejects(main(publicEnv,{mode:'admit',api:f.api,now:()=>fixtureNow}),/MANDATORY_SOURCE/);
    assert.equal(f.state.providerCalls,0);
    const admissionDir=join(dir,'admission');mkdirSync(admissionDir);
    env.AQUA_ADMISSION_RECEIPT_OUTPUT=join(admissionDir,'admission-receipt.json');
    env.AQUA_ADMISSION_RECEIPT_FILE=env.AQUA_ADMISSION_RECEIPT_OUTPUT;
    publicEnv.AQUA_ADMISSION_RECEIPT_OUTPUT=env.AQUA_ADMISSION_RECEIPT_OUTPUT;
    f.state.report.results[0].outcome='skipped';
    await assert.rejects(main(publicEnv,{mode:'admit',...dependencies}),/MANDATORY_EXECUTION_NOT_QUALIFIED/);
    assert.equal(existsSync(env.AQUA_ADMISSION_RECEIPT_OUTPUT),false);assert.equal(f.state.providerCalls,0);
    f.state.report.results[0].outcome='passed';
    await main(publicEnv,{mode:'admit',...dependencies});assert.equal(f.posts.length,0);
    assert.equal(f.state.providerCalls,0,'pre-secret admission must not read Render or Vercel');
    await assert.rejects(main({...env,AQUA_ADMISSION_RECEIPT_FILE:join(dir,'missing-receipt.json')},
      {mode:'deploy',...dependencies,deploymentOptions:{attempts:3,pause:async()=>{}}}),
      /ADMISSION_RECEIPT_MISMATCH/);
    assert.equal(f.posts.length,0);
    await main(env,{mode:'deploy',...dependencies,deploymentOptions:{attempts:3,pause:async()=>{}}});
    assert.deepEqual(f.posts.map(x=>x.provider),['render','vercel']);
    const final=JSON.parse(readFileSync(env.RELEASE_REPORT,'utf8').trim().split('\n').at(-1));
    assert.equal(final.phase,'verified');assert.equal(final.sha,sha);assert.equal(final.executorSha,executorSha);
    assert.equal(final.renderSha,sha);assert.equal(final.vercelSha,sha);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('external retries bind source and executor identities and cannot cross an unacknowledged request',()=>{
  const q=qualified(),retry={...q,releaseRunAttempt:2};
  const rows=[{...q,phase:'evidence-selected'}];validateResumeReceipt(rows,retry);
  for(const mutation of [{sha:previous},{executorSha:previous},{ciRunAttempt:2}])
    assert.throws(()=>validateResumeReceipt([{...rows[0],...mutation}],retry));
  assert.throws(()=>validateResumeReceipt([...rows,{...q,phase:'render-requesting'}],retry),/AMBIGUOUS/);
});

test('verified predecessor binds its own executor commit and its independently recorded source',()=>{
  const q=qualified(),baseline={...q,sha:previous,executorSha:'e'.repeat(40),phase:'verified',renderSha:previous,vercelSha:previous,
    renderDeployId:'dep-old',vercelDeployId:'dpl_Old',renderReleaseRunAttempt:1,vercelReleaseRunAttempt:1};
  const descriptor={runId:q.releaseRunId,runAttempt:1,sha:baseline.executorSha};
  const proof=validateBaselineReceipt([baseline],descriptor,q);assert.equal(proof.renderSha,previous);
  assert.throws(()=>validateBaselineReceipt([baseline],{...descriptor,sha:q.executorSha},q));
});

test('application trigger still running does not create a recurring race barrier',async()=>{
  const f=fixture();const read=f.api.gh;f.api.gh=async route=>{
    const result=await read(route);
    if(route.startsWith('/actions/workflows/release.yml/runs?')){
      result.total_count=2;result.workflow_runs.push({...result.workflow_runs[0],id:9,run_number:2,
        status:'in_progress',name:'Automatic deployment trigger'});
    }
    if(route.startsWith('/actions/runs/9/'))return {total_count:1,jobs:[{name:'Dispatch qualified executor',status:'in_progress'}]};
    return result;
  };
  await validateLegacyHistory(f.api);
});

test('old executor commits and replaced executor attempts cannot make provider mutations',async()=>{
  for(const staleSha of [true,false]){
    const f=fixture();const read=f.api.executor;f.api.executor=async route=>{
      const value=await read(route);
      if(staleSha&&route==='/git/ref/heads/main')value.object.sha=previous;
      if(!staleSha&&route.startsWith('/actions/runs/'))value.run_attempt++;
      return value;
    };
    await assert.rejects(f.execute(),/STALE_EXECUTOR|EXECUTOR_ATTEMPT_CHANGED/);assert.equal(f.posts.length,0);
  }
});

test('legacy history paginates beyond 100 triggers and rejects gaps, duplicates and truncation',async()=>{
  const f=fixture();const first=(await f.api.gh('/actions/workflows/release.yml/runs?')).workflow_runs[0];
  const rows=[first,...Array.from({length:100},(_,i)=>({...first,id:i+1000,run_number:i+2,name:'Automatic deployment trigger'}))];
  const api={gh:async route=>route.includes('/actions/workflows/')?
    {total_count:101,workflow_runs:rows.slice((Number(new URL('https://fixture.invalid'+route).searchParams.get('page'))-1)*100,
      Number(new URL('https://fixture.invalid'+route).searchParams.get('page'))*100)}:
    route.startsWith('/actions/runs/38912818702/')?{total_count:2,jobs:[{}, {name:'Unattended recovery release',conclusion:'skipped'}]}:
    {total_count:1,jobs:[{name:'Dispatch qualified executor'}]}};
  await validateLegacyHistory(api);
  const original=api.gh;
  api.gh=async route=>{const r=await original(route);if(route.includes('page=2'))r.workflow_runs=[rows[0]];return r;};
  await assert.rejects(validateLegacyHistory(api),/RECONCILIATION/);
  api.gh=async route=>{const r=await original(route);if(route.includes('page=1'))r.workflow_runs=r.workflow_runs.slice(1);return r;};
  await assert.rejects(validateLegacyHistory(api),/INCOMPLETE/);
  const gap=structuredClone(rows);gap[50].run_number=500;
  api.gh=async route=>{const r=await original(route);if(r.workflow_runs)r.workflow_runs=r.workflow_runs.map(x=>gap.find(y=>y.id===x.id));return r;};
  await assert.rejects(validateLegacyHistory(api),/GAP_RECONCILE/);
  api.gh=async()=>({total_count:0,workflow_runs:[]});await assert.rejects(validateLegacyHistory(api));
});
