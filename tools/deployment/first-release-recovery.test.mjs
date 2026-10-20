import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture, fixtureNow, source } from './fixtures/provider.mjs';
import { objectDigest } from './github-evidence.mjs';
import { policyDigest, validateResumeReceipt } from './release-control.mjs';
import { approvedRecoveryReadback, legacyRecoveryPair, validateFirstReleaseRecovery,
  validateLegacyProviderPair } from './first-release-recovery.mjs';

const now = () => fixtureNow;
function legacyFixture() {
  const f = fixture(), read = f.api.vercel;
  f.api.vercel = async (route, body) => {
    const result = await read(route, body);
    if (route.endsWith('/' + legacyRecoveryPair.vercelDeployId)) {
      delete result.gitSource;
      result.meta = { aqgreenSourceCommit: 'f'.repeat(40) }; // Not source evidence.
    }
    return result;
  };
  return f;
}

test('only the pinned legacy recovery artifact is allowed without claiming frontend source provenance', async () => {
  const f = legacyFixture();
  await f.execute();
  assert.deepEqual(f.posts.map(p => p.provider), ['render', 'vercel']);
  const baseline = f.reports.find(r => r.phase === 'baseline-selected');
  assert.equal(baseline.baselineRenderDeployId, legacyRecoveryPair.renderDeployId);
  assert.equal(baseline.baselineRenderSha, legacyRecoveryPair.renderSha);
  assert.equal(baseline.baselineVercelDeployId, legacyRecoveryPair.vercelDeployId);
  assert.equal(baseline.baselineVercelSourceProvenance, 'UNVERIFIED_LEGACY');
  assert.equal(Object.hasOwn(baseline, 'baselineVercelSha'), false);
  assert.equal(baseline.firstReleaseRecoveryEvidenceSha256, objectDigest(f.state.recoveryReadback));
  assert.equal(f.reports.at(-1).renderSha, source);
  assert.equal(f.reports.at(-1).vercelSha, source);
  assert.equal(f.reports.at(-1).phase, 'verified');
});

test('checked-in missing evidence denies production rather than inventing operator eligibility', async () => {
  const f = legacyFixture();
  f.state.recoveryReadback = approvedRecoveryReadback;
  await assert.rejects(f.execute(), /FIRST_RELEASE_RECOVERY_EVIDENCE_CHANGED/);
  assert.equal(f.state.providerCalls, 0);
  assert.equal(f.posts.length, 0);
});

test('operator evidence rejects wrong identities, unknown availability, incompatibility, stale and malformed claims', () => {
  const f = fixture();
  for (const change of [
    r => r.status = 'UNVERIFIED', r => r.observation = null,
    r => r.observation.candidateSha = '0'.repeat(40),
    r => r.observation.baseline.renderSha = '0'.repeat(40),
    r => r.observation.baseline.vercelDeployId = 'dpl_Other',
    r => r.observation.baseline.productionDomain = 'attacker.invalid',
    r => r.observation.observer.id = 1,
    r => r.observation.observedAt = new Date(fixtureNow + 31_000).toISOString(),
    r => r.observation.expiresAt = new Date(fixtureNow).toISOString(),
    r => r.observation.renderArtifact.retrievable = false,
    r => r.observation.renderArtifact.rollbackEligible = false,
    r => r.observation.vercelArtifact.retrievable = false,
    r => delete r.observation.vercelArtifact.rollbackEligible,
    r => r.observation.compatibility.schemaAndData = false,
    r => r.observation.compatibility.configuration = false,
    r => r.observation.compatibility.evidenceReference = 'https://attacker.invalid',
    r => r.observation.secret = 'must-never-be-accepted'
  ]) {
    const record = structuredClone(f.state.recoveryReadback), policy = structuredClone(f.state.policy);
    change(record);
    policy.firstReleaseRecovery.evidenceSha256 = objectDigest(record);
    assert.throws(() => validateFirstReleaseRecovery(record, f.state.candidate, policy, now), /FIRST_RELEASE_RECOVERY/);
  }
  assert.throws(() => validateFirstReleaseRecovery(undefined, f.state.candidate, f.state.policy, now), /EVIDENCE_REQUIRED/);
  const policy = structuredClone(f.state.policy);
  policy.firstReleaseRecovery.baseline.vercelDeployId = 'dpl_Other';
  assert.throws(() => policyDigest(policy), /STANDING_POLICY_INVALID/);
});

test('changed provider identities, missing domain and unavailable artifacts stop before Render mutation', async () => {
  for (const mutate of [
    f => f.state.renderRows[0].id = 'dep-other',
    f => f.state.renderRows[0].commit.id = '0'.repeat(40),
    f => f.state.project.targets.production.id = 'dpl_Other',
    f => f.state.domain.verified = false,
    f => f.state.domain.projectId = 'prj_other',
    f => f.state.domain.redirect = 'attacker.invalid',
    f => f.state.recoveryAliases={aliases:[]},
    f => { const read=f.api.render; f.api.render=async (...args)=>{
      if(args[0].endsWith('/deploys/'+legacyRecoveryPair.renderDeployId))throw Error('artifact unavailable');return read(...args);}; }
  ]) {
    const f = legacyFixture(); mutate(f);
    await assert.rejects(f.execute());
    assert.equal(f.posts.length, 0);
  }
});

test('baseline eligibility is checked again after Render and loss blocks all frontend uploads and mutations', async () => {
  const f = legacyFixture(), read = f.api.vercel;
  f.api.vercel = async (...args) => {
    const r = await read(...args);
    if (f.state.newRender?.status === 'live' && args[0].endsWith('/'+legacyRecoveryPair.vercelDeployId))
      r.readyState = 'ERROR';
    return r;
  };
  await assert.rejects(f.execute(), /FIRST_RELEASE_RECOVERY_PROVIDER_IDENTITY_MISMATCH/);
  assert.deepEqual(f.posts.map(p => p.provider), ['render']);
  assert.equal(f.state.uploads.length, 0);
});

test('same-run recovery cannot substitute frozen legacy identity, provenance or operator evidence', () => {
  const f=fixture(), q=f.state.candidate, retry={...q,releaseRunAttempt:2};
  const row={...q,phase:'baseline-selected',baselineRenderDeployId:legacyRecoveryPair.renderDeployId,
    baselineRenderSha:legacyRecoveryPair.renderSha,baselineVercelDeployId:legacyRecoveryPair.vercelDeployId,
    baselineVercelSourceProvenance:'UNVERIFIED_LEGACY',firstReleaseRecoveryEvidenceSha256:objectDigest(f.state.recoveryReadback)};
  assert.equal(validateResumeReceipt([row],retry).baselineVercelSourceProvenance,'UNVERIFIED_LEGACY');
  for (const change of [r=>r.baselineRenderDeployId='dep-other',r=>r.baselineRenderSha='0'.repeat(40),
    r=>r.baselineVercelDeployId='dpl_Other',r=>r.baselineVercelSourceProvenance='GIT_SOURCE',
    r=>r.firstReleaseRecoveryEvidenceSha256='0'.repeat(64)]) {
    const changed={...row,phase:'admitted'};change(changed);
    assert.throws(()=>validateResumeReceipt([row,changed],retry),/CONTRADICTORY_RESUME_RECEIPT/);
  }
});

test('an alias moved after Vercel requires the exact acknowledged replacement and never changes the legacy artifact', () => {
  const f=fixture(), proof=validateFirstReleaseRecovery(f.state.recoveryReadback,f.state.candidate,f.state.policy,now);
  const render={id:proof.renderDeployId,commit:{id:proof.renderSha},status:'deactivated'};
  const web={id:proof.vercelDeployId,projectId:proof.vercelProjectId,target:'production',readyState:'READY',alias:[]};
  const project={...f.state.project,targets:{production:{id:'dpl_Replacement'}}};
  const aliases={deploymentId:'dpl_Replacement',aliases:[{alias:proof.productionDomain}]};
  assert.throws(()=>validateLegacyProviderPair(proof,render,web,project,f.state.domain,undefined,aliases),/IDENTITY_MISMATCH/);
  assert.throws(()=>validateLegacyProviderPair(proof,render,web,project,f.state.domain,'dpl_Other',aliases),/IDENTITY_MISMATCH/);
  validateLegacyProviderPair(proof,render,web,project,f.state.domain,'dpl_Replacement',aliases);
  assert.throws(()=>validateLegacyProviderPair(proof,render,web,project,f.state.domain,'dpl_Replacement',
    {...aliases,deploymentId:proof.vercelDeployId}),/IDENTITY_MISMATCH/);
  assert.throws(()=>validateLegacyProviderPair(proof,render,{...web,id:'dpl_Other'},project,f.state.domain,'dpl_Replacement',aliases),/IDENTITY_MISMATCH/);
});
