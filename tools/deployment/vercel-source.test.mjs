import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { fixture, source, previous, frontendFixtureFiles, frontendFixtureArchive, runnerEnv } from './fixtures/provider.mjs';
import { prepareFrontend, approvedPublicInputs, validatePublicInputs, validateFrontendProof } from './vercel-source.mjs';
import { clients, targets, validateResumeReceipt, validateBaselineReceipt, verifyCandidate } from './release-control.mjs';
import { objectDigest } from './github-evidence.mjs';
const sha256 = b => createHash('sha256').update(b).digest('hex');

test('real qualified Git archive binds each uploaded file and the approved frontend root', () => {
  const f = fixture(), archive = f.state.frontendArchive;
  const bundle = prepareFrontend(archive, source, targets.vercel, approvedPublicInputs(targets.vercel));
  assert.equal(bundle.proof.sourceArchiveSha256, sha256(archive));
  assert.equal(bundle.proof.manifest.length, Object.keys(frontendFixtureFiles).length);
  validateFrontendProof(bundle.proof, source, targets.vercel);
  for (const file of bundle.files) {
    assert.equal(file.file, targets.vercel.rootDirectory + '/' + file.file.slice(targets.vercel.rootDirectory.length + 1));
    assert.equal(file.sha, createHash('sha1').update(file.data).digest('hex'));
    assert.equal(file.sha256, sha256(file.data));
  }
  assert.throws(() => prepareFrontend(archive, previous, targets.vercel, approvedPublicInputs(targets.vercel)), /COMMIT_MISMATCH/);
  const altered = Buffer.from(archive); altered[2000] ^= 1;
  const candidate = { ...f.state.candidate, sourceSha256: sha256(altered) };
  assert.throws(() => verifyCandidate(candidate, f.state.candidate, altered, archive), /NOT_QUALIFIED_GIT_SOURCE/);
  assert.throws(() => validateFrontendProof({ ...bundle.proof, sourceSha: previous }, source, targets.vercel));
});

test('missing, additional and conflicting public inputs are rejected rather than defaulted', () => {
  const approved = approvedPublicInputs(targets.vercel);
  for (const inputs of [null, {}, { NEXT_PUBLIC_ABP_API_URL: approved.NEXT_PUBLIC_ABP_API_URL },
    { ...approved, NEXT_PUBLIC_DEFAULT_TENANT_NAME: 'foreign' }, { ...approved, YOCO_SECRET_KEY: 'canary' }])
    assert.throws(() => validatePublicInputs(inputs, targets.vercel));
});

test('source environment files and build configuration cannot replace approved build precedence', () => {
  for (const edit of [
    files => files['.env.production'] = 'NEXT_PUBLIC_DEFAULT_TENANT_NAME=foreign',
    files => files['package.json'] = JSON.stringify({ scripts: { build: 'NEXT_PUBLIC_DEFAULT_TENANT_NAME=foreign next build' } }),
    files => files['vercel.json'] = JSON.stringify({ framework: 'nextjs', buildCommand: 'npm run build', installCommand: 'npm ci', env: { NEXT_PUBLIC_DEFAULT_TENANT_NAME: 'foreign' } }),
    files => files['next.config.ts'] = 'export default {env:{NEXT_PUBLIC_DEFAULT_TENANT_NAME:"foreign"}};',
    files => files['linked-file'] = {symlink:'/outside-forbidden'},
    files => delete files['package-lock.json']
  ]) {
    const files = { ...frontendFixtureFiles }; edit(files);
    const { archive, sha } = frontendFixtureArchive(files);
    assert.throws(() => prepareFrontend(archive, sha, targets.vercel, approvedPublicInputs(targets.vercel)), /FORBIDDEN|PRECEDENCE_CONFLICT|REGULAR_FILES_REQUIRED/);
  }
});

test('unlinked Vercel deploy uses immutable upload hashes and explicit public build overrides', async () => {
  const f = fixture(); f.state.publicVars.forEach(row => { row.type = 'sensitive'; delete row.value; });
  const read = f.api.vercel;
  f.api.vercel = async (route, body) => { assert.ok(!route.startsWith('/v1/projects/')); return read(route, body); };
  await f.execute();
  const body = f.posts.find(x => x.provider === 'vercel').body;
  assert.equal(body.gitSource, undefined); assert.equal(f.state.project.link, null);
  assert.deepEqual(body.env, approvedPublicInputs(targets.vercel)); assert.deepEqual(body.build.env, body.env);
  assert.equal(body.projectSettings.rootDirectory, targets.vercel.rootDirectory);
  for (const file of body.files) assert.ok(f.state.uploads.some(x => x.digest === file.sha && x.data.length === file.size));
  const proof = f.reports.at(-1).vercelSourceProof;
  assert.equal(body.meta.aquaFileSourceSha256, objectDigest(proof));
  assert.equal(proof.publicBuildInputsSha256, objectDigest(body.build.env));
  const descriptor = { runId: f.state.candidate.releaseRunId, runAttempt: 1, sha: f.state.candidate.executorSha };
  validateBaselineReceipt(f.reports, descriptor, f.state.candidate);
  assert.throws(() => validateBaselineReceipt(f.reports.filter(x => x.phase !== 'vercel-files-uploaded'), descriptor, f.state.candidate));
});

test('missing public metadata and readable conflicts deny before any provider mutation', async () => {
  for (const change of [f => f.state.publicVars.pop(), f => { f.state.publicVars[0].type = 'plain'; f.state.publicVars[0].value = 'foreign'; },
    f => f.state.publicVars.push({ ...f.state.publicVars[0] })]) {
    const f = fixture(); change(f); await assert.rejects(f.execute()); assert.equal(f.posts.length, 0); assert.equal(f.state.uploads.length, 0);
  }
});

test('provider omission or substitution of effective build inputs cannot produce a verified receipt', async () => {
  for (const change of [d => delete d.build, d => delete d.env.NEXT_PUBLIC_ABP_API_URL,
    d => d.build.env.NEXT_PUBLIC_DEFAULT_TENANT_NAME = 'foreign', d => d.projectSettings.rootDirectory = 'foreign',
    d => d.meta.aquaFileSourceSha256 = '0'.repeat(64), d => d.gitSource = { sha: source, repoId: '789' }]) {
    const f = fixture(), read = f.api.vercel;
    f.api.vercel = async (route, body) => { const d = await read(route, body); if (route.endsWith('/dpl_New')) change(d); return d; };
    await assert.rejects(f.execute(), /VERCEL_.*(UNVERIFIABLE|MISMATCH)/);
    assert.ok(!f.reports.some(x => x.phase === 'verified'));
  }
});

test('uncertain partial uploads cannot create a deployment or be blindly replayed', async () => {
  const f = fixture(); let calls = 0;
  f.api.uploadVercel = async () => { if (++calls === 2) throw Error('uncertain'); };
  await assert.rejects(f.execute(), /uncertain/); assert.deepEqual(f.posts.map(x => x.provider), ['render']);
  assert.throws(() => validateResumeReceipt(f.reports, { ...f.state.candidate, releaseRunAttempt: 2 }), /AMBIGUOUS/);
});

test('qualification drift during a bounded file-upload batch prevents deployment creation', async () => {
  const f = fixture(); let uploads = 0;
  f.api.uploadVercel = async () => { uploads++; f.state.main = previous; };
  await assert.rejects(f.execute(), /STALE/); assert.ok(uploads > 0 && uploads <= 32);
  assert.deepEqual(f.posts.map(x => x.provider), ['render']);
});

test('upload client binds exact bytes to fixed provider, scope and hash without retry or credential forwarding', async () => {
  const env = runnerEnv(), bytes = Buffer.from('qualified source file'), digest = createHash('sha1').update(bytes).digest('hex');
  const calls = [];
  const api = clients(env, async (url, options) => { calls.push({ url, options }); return new Response('', { status: 200 }); });
  assert.equal(typeof api.uploadVercel, 'function'); assert.equal(calls.length, 0);
  await assert.rejects(api.uploadVercel(bytes, '0'.repeat(40)), /HASH_MISMATCH/); assert.equal(calls.length, 0);
  await api.uploadVercel(bytes, digest); assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.vercel.com/v2/files?teamId=' + targets.vercel.teamId);
  assert.equal(calls[0].options.headers['x-vercel-digest'], digest);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer ' + env.VERCEL_TOKEN);
  assert.equal(calls[0].options.redirect, 'error'); assert.ok(calls[0].options.body.equals(bytes));
  let attempts = 0;
  await assert.rejects(clients(env, async () => { attempts++; throw Error('opaque'); }).uploadVercel(bytes, digest), /AMBIGUOUS/);
  assert.equal(attempts, 1);
});
