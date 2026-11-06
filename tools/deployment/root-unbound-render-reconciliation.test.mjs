import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { ownerRenderRecord, verifyOwnerRenderRedeployment, validateOwnerRenderProof } from './root-unbound-render-reconciliation.mjs';
import { createAuditWriter, validateResumeReceipt } from './release-control.mjs';

const binding = JSON.parse(readFileSync(new URL('../../governance/root-unbound-release-20261106.json', import.meta.url)));
function fixture() {
  const r = ownerRenderRecord();
  const q = { sha: binding.candidateSha, ciRunId: binding.ciRunId, ciRunAttempt: 1,
    qualificationOnly: false, policySha256: binding.policySha256,
    repository: 'aqua-lifestyle/aqua-lifestyle', executorRepository: 'aqua-lifestyle/aqua-deployment',
    environment: 'production-release', profile: 'normal-integrated', version: 4,
    releaseRunId: '999', releaseRunAttempt: 1, executorSha: 'c'.repeat(40),
    renderServiceId: 'srv-d9f0k8e1a83c73d8n1b0', vercelProjectId: 'prj_6qL1e43KhsWrRshY5GxdmGl3HGMz',
    vercelTeamId: 'team_Hc3BWfhTLfwLzwbgbtaasBUY' };
  const baseline = { renderDeployId: r.previousRenderDeployId, renderSha: r.renderSha,
    vercelDeployId: r.vercelDeployId, vercelSha: r.renderSha };
  const native = { id: r.renderDeployId, status: 'live', commit: { id: r.renderSha } };
  const mode = { key: 'Yoco__Mode', value: 'live' }, reads = [];
  const api = { render: async (...args) => {
    assert.equal(args.length, 1, 'reconciliation is GET-only'); reads.push(args[0]);
    if (args[0] === `/services/${q.renderServiceId}/deploys/${r.renderDeployId}`) return native;
    if (args[0] === `/services/${q.renderServiceId}/env-vars/Yoco__Mode`) return mode;
    throw Error('Unexpected provider read');
  } };
  return { r, q, baseline, native, mode, api, reads };
}

test('owner redeploy reconciliation retains original baseline and verifies only the exact provider object and live mode', async () => {
  const f = fixture(), before = structuredClone(f.baseline);
  const proof = await verifyOwnerRenderRedeployment(f.api, f.q, f.baseline);
  validateOwnerRenderProof(proof, f.q);
  assert.deepEqual(f.baseline, before); assert.equal(f.reads.length, 2);
  assert.equal(proof.renderDeployId, f.r.renderDeployId);
  assert.equal(proof.previousRenderDeployId, f.r.previousRenderDeployId);
});

test('owner redeploy reconciliation rejects changed baseline, source, provider state, mode and candidate', async () => {
  for (const edit of [f => f.baseline.renderDeployId = 'dep-other', f => f.baseline.vercelDeployId = 'dpl_Other',
    f => f.native.id = 'dep-other', f => f.native.commit.id = 'a'.repeat(40),
    f => f.native.status = 'update_failed', f => f.mode.value = 'test', f => f.mode.key = 'other',
    f => f.q.sha = 'b'.repeat(40), f => f.q.qualificationOnly = true]) {
    const f = fixture(); edit(f);
    await assert.rejects(verifyOwnerRenderRedeployment(f.api, f.q, f.baseline), /UNVERIFIED|EXACT_SCOPE_REQUIRED/);
  }
  const record = ownerRenderRecord(); record.renderDeployId = 'dep-other';
  assert.throws(() => ownerRenderRecord(Buffer.from(JSON.stringify(record))), /OWNER_RENDER_RECORD_CHANGED/);
});

test('owner redeploy proof survives same-run retry without becoming an acknowledged provider request', async () => {
  const f = fixture(), proof = await verifyOwnerRenderRedeployment(f.api, f.q, f.baseline), rows = [];
  const emit = createAuditWriter(f.q, row => rows.push(row));
  emit({ phase: 'baseline-selected', ownerRenderRedeploy: proof });
  emit({ phase: 'failed', code: 'PROTECTED_RUNTIME_READINESS_FAILED' });
  const prior = validateResumeReceipt(rows, { ...f.q, releaseRunAttempt: 2 });
  assert.deepEqual(prior.ownerRenderRedeploy, proof);
  assert.equal(prior.renderDeployId, undefined); assert.equal(prior.vercelDeployId, undefined);
});

test('owner redeploy proof cannot be altered or attached to another candidate', async () => {
  const f = fixture(), proof = await verifyOwnerRenderRedeployment(f.api, f.q, f.baseline);
  assert.throws(() => validateOwnerRenderProof({ ...proof, renderDeployId: 'dep-other' }, f.q), /OWNER_RENDER_PROOF_CHANGED/);
  assert.throws(() => validateOwnerRenderProof(proof, { ...f.q, sha: 'b'.repeat(40) }), /EXACT_SCOPE_REQUIRED/);
});
