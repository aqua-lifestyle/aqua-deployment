import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {fixture,source,previous,runnerEnv} from './fixtures/provider.mjs';
import {clients,targets,standingPolicy} from './release-control.mjs';
import {runtimeSettings,protectedReadiness,validateReadiness,readinessUrl} from './runtime-readiness.mjs';

const response=sha=>({status:200,body:{contract:'aqua.production-readiness',version:1,status:'Ready',buildId:sha,
  birdConfiguration:'StartupValidated',yocoConfiguration:'StartupValidated',profile:'normal-integrated',restrictedOperations:'ConfigurationHeld'}});

test('normal runtime permits required Bird/Yoco configuration without fetching their values',async()=>{
  const f=fixture(),reads=[],read=f.api.render;f.api.render=async(route,body)=>{if(!body)reads.push(route);return read(route,body);};
  await f.execute();assert.deepEqual(f.posts.map(x=>x.provider),['render','vercel']);
  assert.equal(standingPolicy.profile,'normal-integrated');assert.equal(standingPolicy.version,7);
  for(const route of reads.filter(x=>x.includes('/env-vars'))){const key=route.split('/env-vars/')[1];assert.ok(Object.hasOwn(runtimeSettings,key));}
  assert.ok(!reads.some(x=>/ApiKey|SecretKey|WebhookSecret|secret-files|env-vars\?/.test(x)));
});

test('bootstrap never asks the legacy API for the new endpoint and always checks it before Vercel',async()=>{
  const f=fixture(),events=[],render=f.api.render,vercel=f.api.vercel;
  f.api.render=async(route,body)=>{if(body)events.push('render');return render(route,body);};
  f.api.vercel=async(route,body)=>{if(body)events.push('vercel');return vercel(route,body);};
  f.api.readiness=async sha=>{assert.equal(sha,source);assert.equal(f.state.newRender?.status,'live');events.push('ready');return response(sha);};
  await f.execute();assert.deepEqual(events,['render','ready','ready','vercel','ready']);
});

test('missing, unauthorized, contradictory, wrong-revision or secret-bearing readiness stops before Vercel',async()=>{
  for(const mutate of [r=>r.status=404,r=>r.status=401,r=>r.body.buildId=previous,r=>r.body.birdConfiguration='Unavailable',
    r=>r.body.yocoConfiguration='Unavailable',r=>r.body.restrictedOperations='Unknown',r=>r.body.profile='recovery-only',
    r=>r.body.apiKey='secret-canary']){
    const f=fixture();f.api.readiness=async()=>{const r=response(source);mutate(r);return r;};
    await assert.rejects(f.execute());assert.deepEqual(f.posts.map(x=>x.provider),['render']);
  }
  const f=fixture();f.api.readiness=async()=>{throw Error('unavailable');};await assert.rejects(f.execute());
  assert.deepEqual(f.posts.map(x=>x.provider),['render']);
});

test('missing/changed normal flags and unsupported rollback provenance still stop before mutation',async()=>{
  for(const key of Object.keys(runtimeSettings)){const f=fixture();f.state.vars=f.state.vars.filter(x=>x.envVar.key!==key);
    await assert.rejects(f.execute());assert.equal(f.posts.length,0);}
  const f=fixture(),read=f.api.vercel;f.api.vercel=async(route,body)=>{const r=await read(route,body);if(route.endsWith('/dpl_EwGB3apX3P5JnU5KfG3rLzn21Kgf')){delete r.gitSource;r.id='dpl_Unidentified';r.meta={aqgreenSourceCommit:previous};}return r;};
  await assert.rejects(f.execute());assert.equal(f.posts.length,0);
});

test('Render environment enumeration, secret variables and files are denied before a network request',async()=>{
  let calls=0;const api=clients(runnerEnv(),async()=>{calls++;throw Error('must not fetch');});
  for(const route of [`/services/${targets.render.id}/env-vars?limit=100`,
    ...['Bird__ApiKey','Yoco__SecretKey','Yoco__WebhookSecret','DATABASE_URL'].map(k=>`/services/${targets.render.id}/env-vars/${k}`),
    `/services/${targets.render.id}/secret-files`])assert.throws(()=>api.render(route),/SECRET_BEARING_RENDER_READ_FORBIDDEN/);
  assert.equal(calls,0);
  assert.throws(()=>api.vercel(`/v10/projects/${targets.vercel.id}/env?decrypt=true`),/FRONTEND_SECRET_ENUMERATION_FORBIDDEN/);
  assert.equal(calls,0);
});

test('runtime credential names in frontend metadata deny before values are fetched or providers mutate',async()=>{
  const f=fixture(),read=f.api.vercel;let valueReads=0;
  f.state.publicVars.push({id:'forbidden',key:'NEXT_PUBLIC_YOCO_SECRET_KEY',target:['production'],type:'sensitive'});
  f.api.vercel=async(route,body)=>{if(route.startsWith('/v1/'))valueReads++;return read(route,body);};
  await assert.rejects(f.execute(),/RUNTIME_CREDENTIAL_IN_FRONTEND_CONFIGURATION/);
  assert.equal(valueReads,0);assert.equal(f.posts.length,0);
});

test('OIDC is requested for the fixed audience and never forwarded to GitHub, providers or a redirect',async()=>{
  const calls=[];const env={...runnerEnv(),GITHUB_EVENT_NAME:'workflow_dispatch',ACTIONS_ID_TOKEN_REQUEST_URL:'https://pipelines.actions.githubusercontent.com/fixture/token?api-version=2',ACTIONS_ID_TOKEN_REQUEST_TOKEN:'request-canary'};
  const fetcher=async(url,options)=>{calls.push({url,options});return calls.length===1?new Response(JSON.stringify({value:'oidc-canary'})):new Response(JSON.stringify(response(source).body));};
  validateReadiness(await protectedReadiness(env,source,fetcher),source);
  assert.equal(new URL(calls[0].url).searchParams.get('audience'),readinessUrl);
  assert.equal(calls[0].options.headers.Authorization,'Bearer request-canary');
  assert.equal(new URL(calls[1].url).origin,'https://aqualifestyle-api.onrender.com');
  assert.equal(calls[1].options.headers.Authorization,'Bearer oidc-canary');assert.ok(calls.every(x=>x.options.redirect==='error'));
  for(const changes of [{ACTIONS_ID_TOKEN_REQUEST_URL:'https://attacker.invalid/token'},
    {ACTIONS_ID_TOKEN_REQUEST_TOKEN:''},{GITHUB_REF:'refs/heads/feature/untrusted'}]){
    let requests=0;await assert.rejects(protectedReadiness({...env,...changes},source,async()=>{requests++;}));assert.equal(requests,0);
  }
  await assert.rejects(protectedReadiness(env,source,async()=>new Response('',{status:403})));
  assert.equal(env.RENDER_API_KEY,'synthetic-render-key'); // No provider credential enters either OIDC request.
  assert.ok(!JSON.stringify(calls).includes(env.RENDER_API_KEY));assert.ok(!JSON.stringify(calls).includes(env.VERCEL_TOKEN));
});

test('only the environment-bound production job obtains id-token permission',()=>{
  const workflow=readFileSync(new URL('../../.github/workflows/deploy.yml',import.meta.url),'utf8');
  const production=workflow.slice(workflow.indexOf('\n  production:'));
  assert.ok(!workflow.slice(0,workflow.indexOf('\n  production:')).includes('id-token:'));
  assert.match(production,/id-token: write/);assert.match(production,/environment: production-release/);
  assert.match(production,/qualification_only == 'false'/);
});
