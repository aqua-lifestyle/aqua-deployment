import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { authenticateHistoricalPolicy, validateBaselineReceipt, policyDigest,
  freezeCandidate, standingPolicy, targets } from './release-control.mjs';
import { approvedInventory, inventoryDigest, sha256, verifyApprovedDefinitions } from './github-evidence.mjs';
import { runnerEnv } from './fixtures/provider.mjs';
import { validateFailedFrontendRecord, validateFailedFrontendContext } from './failed-frontend-release.mjs';

const executorSha = 'e42e5288502085368eb1c7c9017643f63f9d2b19';
const originalDigest = '717b071718a7032c49055673092c1aa62114055c3d5ab22a8708ef5ca509f840';
const originalInventory = '8ae9edb167884e84db0ed9d342eb315bb6d19ee51722eb20f75fb2c4ea99dbd5';
const historicalPolicy = Buffer.from(readFileSync(new URL('./unattended-policy.json', import.meta.url), 'utf8')
  .replace(inventoryDigest, originalInventory));
const historicalInventory = Buffer.from(readFileSync(new URL('./approved-security-tests.json', import.meta.url), 'utf8')
  .replace('dffaae558c04afc614a9ab1c7782c3af492c5f1e8e0d622247d1e93aa3eae81f',
    'e28faa320901a6c9c88072d049e44964f35fad91a932318e43438ee6d1a72b17')
  .replace('e5626ea6cd0efa8f03f1d71ebbb5bf4bbecf1522b74e44e47434396d4e697de0',
    'c8628caff8fce379e0f4919d24d89bfd03643d35a22ec66ba51490eab63ba29e')
  .replace('c2c517babdd99ec3d07c08cb2d6401918371aae2341ab21997423585cb7c920c',
    'b526238b9175800ca815a744487fe68fc9de7034acd2f024e3075c4cfeb33cd4'));
const gitBlobSha = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const descriptor = { runId: '43429695806', runAttempt: 1, sha: executorSha };
const sourceApi = (policyBytes = historicalPolicy, inventoryBytes = historicalInventory) => ({
  executor: async path => {
    assert.ok(path.endsWith(`?ref=${executorSha}`));
    const bytes = path.includes('/approved-security-tests.json?') ? inventoryBytes : policyBytes;
    const file = path.includes('/approved-security-tests.json?') ? 'approved-security-tests.json' : 'unattended-policy.json';
    return { type: 'file', path: `tools/deployment/${file}`, encoding: 'base64',
      size: bytes.length, sha: gitBlobSha(bytes), content: bytes.toString('base64') };
  }
});

test('authentic historical policy and inventory bind a successful predecessor without renewing release authority', async () => {
  assert.equal(sha256(historicalInventory), originalInventory);
  assert.equal(sha256(historicalPolicy), 'c9afde42f7a91f82558e7eea72a018e41d025239ae781aef7c2a41109459321a');
  assert.throws(() => policyDigest(JSON.parse(historicalPolicy)), /STANDING_POLICY_INVALID/);
  const q = freezeCandidate({ repository: targets.repository, sha: 'a'.repeat(40),
    ciRunId: '43843220947', ciRunAttempt: 1 }, runnerEnv(), standingPolicy, false,
  'post-normal-backend-frontend-v1');
  const priorSha = 'b8d86e5e60997483423b273d5f426c08b411f573';
  const { backendSuccessor, combinedRelease, ...fullIdentity } = q;
  const row = { ...fullIdentity, sha: priorSha, executorSha, policySha256: originalDigest,
    releaseRunId: descriptor.runId,
    phase: 'verified', renderSha: priorSha, vercelSha: priorSha,
    renderDeployId: 'dep-old', vercelDeployId: 'dpl_Old',
    renderReleaseRunAttempt: 1, vercelReleaseRunAttempt: 1 };
  assert.throws(() => validateBaselineReceipt([row], descriptor, q), /BASELINE_RECEIPT_PROVENANCE_MISMATCH/);
  const proof = await authenticateHistoricalPolicy(sourceApi(), descriptor, originalDigest);
  assert.equal(proof.policySha256, originalDigest);
  assert.equal(validateBaselineReceipt([row], descriptor, q, proof).origin.sha, priorSha);
  assert.throws(() => validateBaselineReceipt([row], descriptor, q, { ...proof }), /BASELINE_RECEIPT_PROVENANCE_MISMATCH/);
  assert.throws(() => validateBaselineReceipt([{ ...row, policySha256: 'f'.repeat(64) }], descriptor, q, proof),
    /BASELINE_RECEIPT_PROVENANCE_MISMATCH/);
  assert.throws(() => validateBaselineReceipt([row], { ...descriptor, sha: 'f'.repeat(40) }, q, proof),
    /BASELINE_RECEIPT_PROVENANCE_MISMATCH/);
  await assert.rejects(authenticateHistoricalPolicy(sourceApi(), descriptor, 'f'.repeat(64)),
    /HISTORICAL_POLICY_UNVERIFIABLE/);
  await assert.rejects(authenticateHistoricalPolicy(sourceApi(Buffer.from(historicalPolicy.toString().replace(
    'maxCiAgeSeconds": 86400', 'maxCiAgeSeconds": 3600'))), descriptor, originalDigest),
  /HISTORICAL_POLICY_UNVERIFIABLE/);
  await assert.rejects(authenticateHistoricalPolicy(sourceApi(historicalPolicy,
    Buffer.from(historicalInventory.toString().replace('e28faa320901', 'f28faa320901'))), descriptor, originalDigest),
  /HISTORICAL_POLICY_UNVERIFIABLE/);
});

test('current mandatory source approval remains exact and rejects a changed source', async () => {
  const digests = new Map(approvedInventory.sources.map(row => [row.path, row.sha256]));
  digests.set('tools/deployment/mandatory-security-tests.json', inventoryDigest);
  await verifyApprovedDefinitions(standingPolicy, path => digests.get(path));
  digests.set('docker/api/Dockerfile', '0'.repeat(64));
  await assert.rejects(verifyApprovedDefinitions(standingPolicy, path => digests.get(path)),
    /MANDATORY_SOURCE_CHANGED/);
});

test('the original failed frontend effect remains failed across the current policy epoch', () => {
  const record = validateFailedFrontendRecord(), e = record.originalExecution;
  const run = { id: Number(e.runId), run_number: e.runNumber, run_attempt: 1,
    head_sha: e.executorSha, actor: e.actor, status: 'completed', conclusion: 'failure' };
  const production = { id: Number(e.productionJobId), name: 'Unattended recovery release',
    conclusion: 'failure', steps: [{ name: e.failedStep, conclusion: 'failure' }] };
  const q = freezeCandidate({ repository: targets.repository, sha: 'a'.repeat(40),
    ciRunId: '43843220947', ciRunAttempt: 1 }, runnerEnv(), standingPolicy, false,
  'post-normal-backend-frontend-v1');
  assert.equal(validateFailedFrontendContext(run, run, 1, production, q, targets).scope.originalRunRemainsFailed, true);
  assert.throws(() => validateFailedFrontendContext(run, run, 1, production,
    { ...q, policySha256: 'f'.repeat(64) }, targets), /FAILED_FRONTEND_RUN_NOT_RECONCILABLE/);
  assert.throws(() => validateFailedFrontendContext(run, run, 1, { ...production, conclusion: 'success' },
    q, targets), /FAILED_FRONTEND_RUN_NOT_RECONCILABLE/);
});
