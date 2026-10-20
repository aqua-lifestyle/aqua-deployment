import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture } from './fixtures/provider.mjs';
import { legacyRecoveryPair } from './first-release-recovery.mjs';

const aliasPath = `/v2/deployments/${legacyRecoveryPair.vercelDeployId}/aliases`;

test('authoritative alias mapping accepts a retained deployment whose embedded alias array omits the domain', async () => {
  const f=fixture(), read=f.api.vercel, calls=[];
  f.api.vercel=async (route,body)=>{
    if(route===aliasPath){calls.push(route);return {aliases:[{alias:legacyRecoveryPair.productionDomain}]};}
    const result=await read(route,body);
    if(route.endsWith('/'+legacyRecoveryPair.vercelDeployId))result.alias=[];
    return result;
  };
  await f.execute();
  assert.ok(calls.length>=3);
  assert.ok(calls.every(path=>path===aliasPath));
  assert.deepEqual(f.posts.map(p=>p.provider),['render','vercel']);
});

test('missing, conflicting, redirected or unavailable authoritative mappings deny even when embedded aliases look valid', async () => {
  for (const response of [
    {}, {aliases:null}, {aliases:[]}, {aliases:[{alias:'wrong.example.test'}]},
    {aliases:[{alias:legacyRecoveryPair.productionDomain},{alias:legacyRecoveryPair.productionDomain}]},
    {aliases:[{alias:legacyRecoveryPair.productionDomain,redirect:'https://other.example.test'}]},
    {aliases:[{alias:legacyRecoveryPair.productionDomain,deploymentId:'dpl_Other'}]},
    {aliases:[{alias:legacyRecoveryPair.productionDomain,projectId:'prj_other'}]},
    new Error('provider read unavailable')
  ]) {
    const f=fixture(), read=f.api.vercel;
    f.api.vercel=async (route,body)=>{
      if(route===aliasPath){if(response instanceof Error)throw response;return response;}
      return read(route,body);
    };
    await assert.rejects(f.execute());
    assert.equal(f.posts.length,0);
  }
});

test('loss of authoritative alias mapping after Render prevents all frontend uploads and deployment', async () => {
  const f=fixture(), read=f.api.vercel;
  f.api.vercel=async (route,body)=>{
    if(route===aliasPath && f.state.newRender?.status==='live')return {aliases:[]};
    return read(route,body);
  };
  await assert.rejects(f.execute(),/FIRST_RELEASE_RECOVERY_PROVIDER_IDENTITY_MISMATCH/);
  assert.deepEqual(f.posts.map(p=>p.provider),['render']);
  assert.equal(f.state.uploads.length,0);
});
