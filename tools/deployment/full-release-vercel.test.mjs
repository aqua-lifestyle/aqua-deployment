import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture } from './fixtures/provider.mjs';
import { targets } from './release-control.mjs';
import { approvedPublicInputs } from './vercel-source.mjs';

// Execute the real full-release orchestration with provider substitutes. These
// compiled literals are test responses, never represented as live observations.
const compiled = '.parse({NEXT_PUBLIC_ABP_API_URL:"https://aqualifestyle-api.onrender.com",NEXT_PUBLIC_DEFAULT_TENANT_NAME:"Default",NEXT_PUBLIC_MONITORING_ENDPOINT:void 0})';
const path = '/_next/static/chunks/public-env.js';
function namesOnlyFixture() {
  const f = fixture(), read = f.api.vercel;
  f.state.compiled = compiled;
  f.state.publicReads = 0;
  f.state.aliasReads = 0;
  f.api.vercel = async (route, body) => {
    if (route === '/v2/deployments/dpl_New/aliases') {
      f.state.aliasReads++;
      return { aliases: [{ alias: new URL(targets.vercel.productionUrl).hostname, deploymentId: 'dpl_New', projectId: targets.vercel.id }] };
    }
    const result = await read(route, body);
    if (route === '/v13/deployments/dpl_New') {
      result.build.env = Object.keys(approvedPublicInputs(targets.vercel));
      result.env = Object.keys(approvedPublicInputs(targets.vercel));
    }
    return result;
  };
  f.publicFetch = async (url, options) => {
    f.state.publicReads++;
    assert.equal(new URL(url).origin, targets.vercel.productionUrl);
    assert.equal(options.redirect, 'error');
    assert.deepEqual(options.headers, { 'Cache-Control': 'no-store' });
    assert.equal(options.body, undefined);
    assert.ok(!f.reports.some(row => row.phase === 'verified'));
    return new Response(new URL(url).pathname === '/login' ? `<script src="${path}"></script>` : f.state.compiled);
  };
  return f;
}

test('full release verifies names-only Vercel responses against actual public assets before recording success', async () => {
  const f = namesOnlyFixture();
  await f.execute({ publicFetch: f.publicFetch });
  assert.deepEqual(f.posts.map(row => row.provider), ['render', 'vercel']);
  assert.equal(f.state.publicReads, 4);
  assert.equal(f.state.aliasReads, 4);
  const final = f.reports.at(-1), observation = final.vercelPublicInputsObservation;
  assert.equal(final.phase, 'verified');
  assert.equal(observation.deploymentId, final.vercelDeployId);
  assert.equal(observation.sourceSha, final.sha);
  assert.deepEqual(observation.observedPublicInputs, approvedPublicInputs(targets.vercel));
  assert.equal(observation.configurationEvidence, 'compiled-literals-from-frozen-public-env-module');
  assert.equal(observation.compiledAssets.length, 1);
  assert.equal(observation.secretsRead, false);
});

test('readable effective maps still require authoritative alias binding and never fetch substitute public values', async () => {
  const f = fixture();
  await f.execute({ publicFetch: () => assert.fail('readable maps must use their effective values') });
  assert.equal(f.reports.at(-1).vercelPublicInputsObservation.configurationEvidence, 'provider-reported-effective-public-inputs');
  const denied = fixture(), read = denied.api.vercel;
  denied.api.vercel = async (...args) => args[0] === '/v2/deployments/dpl_New/aliases' ? { aliases: [] } : read(...args);
  await assert.rejects(denied.execute({ publicFetch: () => assert.fail('no public-value fallback') }), /VERCEL_PUBLIC_ALIAS_NOT_BOUND_TO_DEPLOYMENT/);
  assert.deepEqual(denied.posts.map(row => row.provider), ['render', 'vercel']);
  assert.ok(!denied.reports.some(row => row.phase === 'verified'));
});

test('full release rejects missing, conflicting or default-only compiled inputs without a verified receipt', async () => {
  for (const code of [compiled.replace('"Default"', '"Foreign"'), compiled.replace('"Default"', 'void 0'),
    'z.string().default("Default")', compiled + compiled.replace('"Default"', '"Foreign"')]) {
    const f = namesOnlyFixture(); f.state.compiled = code;
    await assert.rejects(f.execute({ publicFetch: f.publicFetch }), /VERCEL_/);
    assert.deepEqual(f.posts.map(row => row.provider), ['render', 'vercel']);
    assert.ok(!f.reports.some(row => row.phase === 'verified'));
    assert.ok(f.reports.some(row => row.phase === 'vercel-requested' && row.vercelDeployId === 'dpl_New'));
  }
});

test('full release rejects final alias drift and preserves acknowledged operation IDs', async () => {
  const f = namesOnlyFixture(), read = f.api.vercel;
  f.api.vercel = async (...args) => {
    const result = await read(...args);
    if (args[0] === '/v2/deployments/dpl_New/aliases' && f.state.aliasReads === 4) result.aliases = [];
    return result;
  };
  await assert.rejects(f.execute({ publicFetch: f.publicFetch }), /VERCEL_PUBLIC_ALIAS_NOT_BOUND_TO_DEPLOYMENT/);
  assert.equal(f.state.publicReads, 4);
  assert.deepEqual(f.posts.map(row => row.provider), ['render', 'vercel']);
  assert.ok(!f.reports.some(row => row.phase === 'verified'));
  assert.equal(f.reports.at(-1).vercelDeployId, 'dpl_New');
});

test('full release does not use public observations to bypass malformed provider shape or source provenance', async () => {
  for (const edit of [web => web.build.env = { NEXT_PUBLIC_DEFAULT_TENANT_NAME: 'Foreign' },
    web => web.meta.aquaFileSourceSha256 = '0'.repeat(64), web => web.gitSource = { sha: 'f'.repeat(40) }]) {
    const f = namesOnlyFixture(), read = f.api.vercel;
    f.api.vercel = async (...args) => {
      const result = await read(...args);
      if (args[0] === '/v13/deployments/dpl_New') edit(result);
      return result;
    };
    await assert.rejects(f.execute({ publicFetch: f.publicFetch }), /VERCEL_/);
    assert.equal(f.state.publicReads, 0);
    assert.ok(!f.reports.some(row => row.phase === 'verified'));
  }
});
