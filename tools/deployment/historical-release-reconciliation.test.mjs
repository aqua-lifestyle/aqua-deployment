import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { evidencePlan, targets, standingPolicy, policyDigest, admissionJobName,
  validateBaselineReceipt, validateResumeReceipt } from './release-control.mjs';
import { validateMemberReceipt } from './member-release.mjs';
import { objectDigest, sha256 } from './github-evidence.mjs';
import { isReconciledHistoricalRun, validateReconciliationRecords, validateHistoricalContext,
  validateHistoricalArtifact, validateHistoricalAudit, validateFailedRenderReconciliation } from './historical-release-reconciliation.mjs';

const record = validateReconciliationRecords();
const archives = ['member-interrupted-audit.zip', 'member-frontend-failed-audit.zip'].map(name =>
  readFileSync(new URL('./fixtures/' + name, import.meta.url)));
const reports = archives.map(archive => {
  const dir = mkdtempSync(join(tmpdir(), 'aqua-historical-audit-'));
  try {
    const path = join(dir, 'audit.zip'); writeFileSync(path, archive);
    return execFileSync('unzip', ['-p', path, 'release-report.jsonl'], { maxBuffer: 2 * 1024 * 1024 });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
const audits = reports.map(bytes => bytes.toString('utf8').trim().split('\n').map(JSON.parse));
const failedRender = validateFailedRenderReconciliation();
const failedArchive = Buffer.from(readFileSync(new URL('./fixtures/failed-render-41527223264-1.zip.b64', import.meta.url), 'utf8'), 'base64');
const failedReport = execFileSync('funzip', [], { input: failedArchive, maxBuffer: 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
const failedAudit = failedReport.toString('utf8').trim().split('\n').map(JSON.parse);
const candidate = () => ({ version: 4, repository: targets.repository, sha: failedRender.acceptedCandidateSha,
  ciRunId: '41322531293', ciRunAttempt: 1, executorRepository: targets.executor.repository, executorSha: 'd'.repeat(40),
  releaseRunId: '456', releaseRunAttempt: 1, policySha256: policyDigest(standingPolicy),
  environment: targets.environment, profile: targets.profile, renderServiceId: targets.render.id,
  vercelProjectId: targets.vercel.id, vercelTeamId: targets.vercel.teamId, qualificationOnly: true });
const descriptor = pin => ({ runId: pin.runId, runAttempt: pin.attempt, sha: pin.executorSha, artifactId: pin.artifactId });
const prior = pin => ({ id: Number(pin.runId), run_number: pin.runNumber, run_attempt: pin.attempt,
  head_sha: pin.executorSha, head_branch: 'main', event: 'workflow_dispatch', path: '.github/workflows/deploy.yml',
  name: 'Qualified production executor', status: 'completed', conclusion: 'failure', actor: { login: 'Xolani-M', id: 86495928 },
  repository: { full_name: targets.executor.repository }, head_repository: { full_name: targets.executor.repository } });
const production = run => ({ name: 'Unattended recovery release', run_id: run.id, run_attempt: run.run_attempt,
  status: 'completed', conclusion: 'failure', steps: [
    { name: 'Revalidate policy, provenance, providers and recovery before automatic deployment', conclusion: 'failure' }
  ] });
const metadata = (pin, index) => ({ id: Number(pin.artifactId), name: `production-release-audit-${pin.runId}-1`,
  digest: 'sha256:' + pin.archiveSha256, expired: false, size_in_bytes: archives[index].length,
  workflow_run: { id: Number(pin.runId), head_sha: pin.executorSha, head_branch: 'main',
    repository_id: record.executorRepositoryId, head_repository_id: record.executorRepositoryId } });

function historyFixture(includeFailedRender = false) {
  const q = candidate(), selected = includeFailedRender ? [...record.runs, failedRender.run] : record.runs;
  if (includeFailedRender) Object.assign(q, { sha: failedRender.acceptedCandidateSha, ciRunId: '41601901625', ciRunAttempt: 1 });
  const bytes = includeFailedRender ? [...archives, failedArchive] : [...archives];
  const runs = selected.map(prior), metas = selected.map((pin, index) => index < 2 ? metadata(pin, index) : {
    ...metadata(pin, 0), size_in_bytes: failedArchive.length }), downloads = [];
  // The historical runs really were numbers 6 and 7. Keep the complete namespace
  // in this substitute rather than weakening the guard's contiguous-history rule.
  const last = includeFailedRender ? 16 : 7;
  const skipped = Array.from({ length: last }, (_, i) => ({ ...runs[0], id: 100 + i, run_number: i + 1, head_sha: 'e'.repeat(40) }))
    .filter(run => !runs.some(prior => prior.run_number === run.run_number));
  const current = { ...runs[0], id: 456, run_number: last + 1, head_sha: q.executorSha, status: 'in_progress', conclusion: null };
  const history = [current, ...runs.toReversed(), ...skipped];
  const jobs = run => [
    { name: 'Qualify immutable source candidate', conclusion: 'success' },
    { name: admissionJobName, conclusion: 'success' },
    runs.includes(run) ? production(run) : { name: 'Unattended recovery release', conclusion: 'skipped', steps: [] }
  ].map(j => ({ ...j, run_id: run.id, run_attempt: run.run_attempt, status: 'completed' }));
  const api = { executor: async path => {
    if (path === '') return { id: record.executorRepositoryId };
    if (path === '/actions/runs/456') return structuredClone(current);
    if (path.startsWith('/actions/workflows/deploy.yml/runs?')) return { total_count: history.length, workflow_runs: structuredClone(history) };
    for (const run of [...runs, ...skipped]) if (path === `/actions/runs/${run.id}/attempts/1/jobs?per_page=100`)
      return { total_count: 3, jobs: jobs(run) };
    for (let i = 0; i < runs.length; i++) {
      if (path === `/actions/runs/${runs[i].id}/artifacts?per_page=100`) return { total_count: 1, artifacts: [metas[i]] };
      if (path === `/actions/artifacts/${metas[i].id}`) return metas[i];
    }
    assert.fail('Unexpected GitHub route: ' + path);
  }, artifact: async (owner, id) => {
    assert.equal(owner, 'executor'); downloads.push(id);
    const index = selected.findIndex(r => r.artifactId === id); assert.notEqual(index, -1);
    return bytes[index];
  }, render: () => assert.fail('Provider access forbidden'), vercel: () => assert.fail('Provider access forbidden') };
  return { q, runs, metas, history, bytes, downloads, api };
}

test('both authentic failed audits recognize only the exact historical acknowledged effects', () => {
  for (let i = 0; i < record.runs.length; i++) {
    const pin = record.runs[i], run = prior(pin);
    assert.equal(sha256(archives[i]), pin.archiveSha256);
    assert.equal(sha256(reports[i]), pin.rawReportSha256);
    assert.equal(objectDigest(audits[i]), pin.rowsSha256);
    assert.deepEqual(validateHistoricalContext(run, 1, production(run), candidate(), targets), pin);
    validateHistoricalArtifact(pin, descriptor(pin), metadata(pin, i));
    const result = validateHistoricalAudit(audits[i], descriptor(pin), pin, targets);
    assert.equal(result.originalConclusion, 'failure'); assert.equal(result.terminalFailureCode, pin.terminalFailureCode);
    assert.equal(result.outcome, pin.outcome);
    for (const key of ['successfulFullReleasePredecessor', 'replayAuthority', 'deploymentAuthority']) assert.equal(result[key], false);
  }
});

test('the authentic acknowledged Render failure remains failed, with its original digest and no Vercel request or replay authority', () => {
  const pin = failedRender.run, run = prior(pin), q = { ...candidate(), sha: failedRender.acceptedCandidateSha };
  assert.equal(sha256(failedArchive), pin.archiveSha256); assert.equal(sha256(failedReport), pin.reportSha256);
  assert.equal(objectDigest(failedAudit), pin.rowsSha256); assert.equal(failedAudit.length, 27);
  assert.equal(failedRender.policySha256, failedAudit[0].policySha256);
  assert.notEqual(failedRender.policySha256, policyDigest(standingPolicy));
  assert.deepEqual(validateHistoricalContext(run, 1, production(run), q, targets), pin);
  const f = historyFixture(true); validateHistoricalArtifact(pin, descriptor(pin), f.metas[2]);
  const proof = validateHistoricalAudit(failedAudit, descriptor(pin), pin, targets);
  assert.equal(proof.originalConclusion, 'failure'); assert.equal(proof.terminalFailureCode, pin.terminalFailureCode);
  assert.equal(proof.outcome, 'ACKNOWLEDGED_RENDER_FAILURE_NO_VERCEL_REQUEST');
  assert.equal(proof.renderDeployId, 'dep-dbkftrcipgvc73asn0lg');
  for (const key of ['successfulFullReleasePredecessor', 'replayAuthority', 'deploymentAuthority']) assert.equal(proof[key], false);
  assert.throws(() => validateBaselineReceipt(failedAudit, descriptor(pin), q));
  assert.throws(() => validateMemberReceipt(failedAudit, descriptor(pin), targets));
  assert.throws(() => validateResumeReceipt(failedAudit, { ...q, releaseRunAttempt: 2 }));
});

test('recovery renewal carries only the exact accepted candidate/policy while preserving original reconciliation hashes', () => {
  const historical = { ...candidate(), sha: record.candidateSha, policySha256: record.policySha256 };
  for (const pin of record.runs) {
    const run = prior(pin);
    assert.deepEqual(validateHistoricalContext(run, 1, production(run), historical, targets), pin);
    assert.throws(() => validateHistoricalContext(run, 1, production(run),
      { ...historical, policySha256: policyDigest(standingPolicy) }, targets), /EXACT_CANDIDATE_AND_TARGETS_REQUIRED/);
  }
  for (const pin of [...record.runs, failedRender.run]) {
    const run = prior(pin), accepted = { ...candidate(), qualificationOnly: false };
    assert.deepEqual(validateHistoricalContext(run, 1, production(run), accepted, targets), pin);
    for (const edit of [p => p.authorization.maxCiAgeSeconds--, p => p.schemaFirst.evidenceSha256 = 'a'.repeat(64),
      p => p.firstReleaseRecovery.evidenceSha256 = 'b'.repeat(64)]) {
      const policy = structuredClone(standingPolicy); edit(policy);
      assert.throws(() => validateHistoricalContext(run, 1, production(run),
        { ...accepted, policySha256: policyDigest(policy) }, targets), /CANDIDATE_OR_TARGETS_CHANGED|EXACT_CANDIDATE_AND_TARGETS_REQUIRED/);
    }
  }
});

test('full history consumes the three exact factual reconciliations for the accepted candidate without creating a successful predecessor', async () => {
  const f = historyFixture(true), plan = await evidencePlan(f.api, f.q, standingPolicy);
  assert.equal(plan.historicalReconciliations.length, 3);
  assert.equal(plan.historicalReconciliations.find(r => r.runId === failedRender.run.runId).originalConclusion, 'failure');
  assert.deepEqual(f.downloads.toSorted(), [...record.runs, failedRender.run].map(r => r.artifactId).toSorted());
  assert.deepEqual(plan.verifiedReleases, []); assert.equal(plan.baseline, null); assert.equal(plan.resume, null);
  assert.equal(plan.memberContinuation, undefined); assert.equal(plan.memberReleases, undefined);
  assert.equal(plan.priorFailedRuns.some(r => r.runId === failedRender.run.runId), false);
});

test('Render failure recognition denies another run, attempt, outcome, producer, source, policy or target', () => {
  const pin = failedRender.run;
  const unrelated = prior(pin); unrelated.id++;
  assert.equal(isReconciledHistoricalRun(unrelated.id), false);
  assert.throws(() => validateHistoricalContext(unrelated, 1, production(unrelated), historyFixture(true).q, targets), /FAILED_RUN_OR_EXECUTION_CHANGED/);
  for (const change of [r => r.run_attempt = 2, r => r.run_number++, r => r.head_sha = 'a'.repeat(40),
    r => r.conclusion = 'success', r => r.status = 'in_progress', r => r.actor.id = 1,
    r => r.repository.full_name = 'foreign/repo', r => r.head_repository.full_name = 'foreign/repo',
    r => r.path = '.github/workflows/other.yml', r => r.event = 'push']) {
    const run = prior(pin); change(run);
    assert.throws(() => validateHistoricalContext(run, 1, production(run), historyFixture(true).q, targets), /FAILED_RENDER_EXECUTION_CHANGED/);
  }
  for (const change of [q => q.sha = record.candidateSha, q => q.sha = 'a'.repeat(40), q => q.policySha256 = '0'.repeat(64),
    q => q.memberRelease = 'foreign', q => q.renderServiceId = 'srv-other', q => q.vercelProjectId = 'prj_other']) {
    const q = historyFixture(true).q; change(q); const run = prior(pin);
    assert.throws(() => validateHistoricalContext(run, 1, production(run), q, targets), /FAILED_RENDER_CANDIDATE_OR_TARGETS_CHANGED/);
  }
  for (const value of ['success', 'skipped']) {
    const run = prior(pin), job = production(run); job.conclusion = value;
    assert.throws(() => validateHistoricalContext(run, 1, job, historyFixture(true).q, targets), /FAILED_RENDER_EXECUTION_CHANGED/);
  }
});

test('failed Render reconciliation cannot be altered into effectlessness, a refreshed observation or permission to deploy', () => {
  for (const change of [r => r.renderOperation.effect = 'NO_EFFECTS', r => r.renderOperation.statuses.at(-1).state = 'success',
    r => r.postFailurePublicObservation.observedAt = '2030-01-01T00:00:00Z', r => r.deploymentAuthority = true,
    r => r.originalFailureRewritten = true, r => r.limitations.databaseWriteAbsence = 'PROVEN_ZERO']) {
    const next = structuredClone(failedRender); change(next);
    assert.throws(() => validateFailedRenderReconciliation(Buffer.from(JSON.stringify(next))), /FAILED_RENDER_RECORD_CHANGED/);
  }
});

test('the acknowledged failure requires the original available artifact and rejects forged or mutating audit evidence', async () => {
  for (const change of [f => f.metas[2].expired = true, f => f.metas[2].digest = 'sha256:' + '0'.repeat(64),
    f => f.metas[2].workflow_run.repository_id = 1, f => f.bytes[2] = archives[0]]) {
    const f = historyFixture(true); change(f);
    await assert.rejects(evidencePlan(f.api, f.q, standingPolicy), /ORIGINAL_ARTIFACT_REQUIRED|AUDIT_ARTIFACT_REQUIRED|ARTIFACT_PROVENANCE_INVALID|ARTIFACT_DIGEST_MISMATCH/);
  }
  for (const change of [rows => rows.pop(), rows => rows.at(-1).code = 'UNEXPECTED_RELEASE_ERROR',
    rows => rows.find(r => r.phase === 'render-requested').renderDeployId = 'dep-other',
    rows => rows.push({ ...rows.at(-1), phase: 'vercel-requesting' }),
    rows => rows.push({ ...rows.at(-1), phase: 'verified' })]) {
    const rows = structuredClone(failedAudit); change(rows);
    assert.throws(() => validateHistoricalAudit(rows, descriptor(failedRender.run), failedRender.run, targets), /FAILED_RENDER_ORIGINAL_AUDIT_REQUIRED/);
  }
});

test('full-release history authenticates both archives and keeps recognition separate from baseline and resume', async () => {
  const f = historyFixture(), plan = await evidencePlan(f.api, f.q, standingPolicy);
  assert.equal(plan.historicalReconciliations.length, 2);
  assert.deepEqual(f.downloads.toSorted(), record.runs.map(r => r.artifactId).toSorted());
  assert.deepEqual(plan.verifiedReleases, []); assert.equal(plan.baseline, null);
  assert.equal(plan.resume, null); assert.deepEqual(plan.resumeChain, []);
  assert.equal(plan.memberContinuation, undefined); assert.equal(plan.memberReleases, undefined);
  assert.equal(plan.firstReleaseRecoveryEvidenceSha256, standingPolicy.firstReleaseRecovery.evidenceSha256);
  assert.equal(f.q.qualificationOnly, true);
});

test('recognition cannot convert either failed audit into a successful full-release or member predecessor or retry receipt', () => {
  for (let i = 0; i < record.runs.length; i++) {
    const d = descriptor(record.runs[i]), rows = audits[i];
    assert.throws(() => validateBaselineReceipt(rows, d, candidate()));
    assert.throws(() => validateMemberReceipt(rows, d, targets));
    assert.throws(() => validateResumeReceipt(rows, { ...candidate(), releaseRunAttempt: 2 }));
  }
});

test('immutable authority, reconciliation and qualified observations reject substitution and unresolved effects', () => {
  const names = ['historical-release-reconciliation-authority-20261102.json', 'historical-release-reconciliation-20261102.json',
    'native-held-baseline-observation-20261102.json', 'held-frontend-source-evidence-20261029.json'];
  const original = Object.fromEntries(names.map(name => [name, readFileSync(new URL('../../governance/' + name, import.meta.url))]));
  for (const name of names) {
    const bytes = { ...original, [name]: Buffer.from('{}\n') };
    assert.throws(() => validateReconciliationRecords(bytes), /IMMUTABLE_RECORD_CHANGED/);
  }
  for (const change of [r => r.unresolvedMaterialProviderEffectsIdentified.push('UNKNOWN_REQUEST'),
    r => r.runs[0].unresolvedEffects.push('UNACKNOWLEDGED_RENDER'), r => r.runs[1].unresolvedEffects.push('UNACKNOWLEDGED_VERCEL'),
    r => r.runs.push({ ...r.runs[0], runId: '999' }), r => r.originalFailuresRewritten = true,
    r => r.successfulFullReleasePredecessor = true, r => r.replayAuthority = true, r => r.deploymentAuthority = true]) {
    const altered = structuredClone(record); change(altered);
    assert.throws(() => validateReconciliationRecords({ ...original, [names[1]]: Buffer.from(JSON.stringify(altered)) }), /IMMUTABLE_RECORD_CHANGED/);
  }
});

test('run, attempt, producer, source, original failure and provider-step mismatches deny recognition', () => {
  for (const pin of record.runs) for (const change of [r => r.id++, r => r.run_attempt = 2, r => r.run_number++,
    r => r.head_sha = 'a'.repeat(40), r => r.conclusion = 'success', r => r.status = 'in_progress',
    r => r.actor.id = 1, r => r.actor.login = 'untrusted', r => r.head_branch = 'other',
    r => r.repository.full_name = 'other/repo', r => r.head_repository.full_name = 'other/repo',
    r => r.event = 'push', r => r.path = '.github/workflows/other.yml']) {
    const run = prior(pin); change(run);
    assert.throws(() => validateHistoricalContext(run, 1, production(run), candidate(), targets), /FAILED_RUN_OR_EXECUTION_CHANGED/);
  }
  for (const change of [p => p.conclusion = 'success', p => p.steps = [], p => p.steps[0].conclusion = 'skipped',
    p => p.run_attempt = 2, p => p.run_id++, p => p.status = 'in_progress']) {
    const run = prior(record.runs[0]), job = production(run); change(job);
    assert.throws(() => validateHistoricalContext(run, 1, job, candidate(), targets), /FAILED_RUN_OR_EXECUTION_CHANGED/);
  }
});

test('the recognition is restricted to the accepted application, full-release purpose, policy and exact targets', () => {
  const run = prior(record.runs[0]);
  for (const change of [q => q.sha = record.originalIdentity.sha, q => q.sha = 'a'.repeat(40),
    q => q.memberRelease = record.originalIdentity.memberRelease, q => q.policySha256 = '0'.repeat(64),
    q => q.executorRepository = 'other/executor', q => q.environment = 'other', q => q.profile = 'other',
    q => q.renderServiceId = 'srv-other', q => q.vercelProjectId = 'prj_other', q => q.vercelTeamId = 'team_other']) {
    const q = candidate(); change(q);
    assert.throws(() => validateHistoricalContext(run, 1, production(run), q, targets), /EXACT_CANDIDATE_AND_TARGETS_REQUIRED/);
  }
  for (const change of [t => t.render.id = 'srv-other', t => t.vercel.id = 'prj_other', t => t.vercel.teamId = 'team_other',
    t => t.vercel.productionUrl = 'https://other.invalid', t => t.vercel.rootDirectory = 'other', t => t.repository = 'other/source']) {
    const t = structuredClone(targets); change(t);
    assert.throws(() => validateHistoricalContext(run, 1, production(run), candidate(), t), /EXACT_CANDIDATE_AND_TARGETS_REQUIRED/);
  }
});

test('original artifact ID, digest, attempt and repository cannot be substituted', () => {
  for (let i = 0; i < record.runs.length; i++) {
    const pin = record.runs[i];
    for (const change of [m => m.id++, m => m.digest = 'sha256:' + '0'.repeat(64),
      m => m.workflow_run.repository_id = 1, m => m.workflow_run.head_repository_id = 1]) {
      const m = metadata(pin, i); change(m);
      assert.throws(() => validateHistoricalArtifact(pin, descriptor(pin), m), /ORIGINAL_ARTIFACT_REQUIRED/);
    }
    for (const change of [d => d.runAttempt = 2, d => d.runId = '999', d => d.sha = 'a'.repeat(40), d => d.artifactId = '1']) {
      const d = descriptor(pin); change(d);
      assert.throws(() => validateHistoricalArtifact(pin, d, metadata(pin, i)), /ORIGINAL_ARTIFACT_REQUIRED/);
    }
  }
});

test('provider identities, source proofs, terminal codes and unacknowledged requests in audits cannot be substituted', () => {
  for (let i = 0; i < record.runs.length; i++) for (const change of [
    rows => rows[0].sha = 'a'.repeat(40), rows => rows[0].renderServiceId = 'srv-other',
    rows => rows[0].vercelProjectId = 'prj_other', rows => rows[0].vercelTeamId = 'team_other',
    rows => rows.at(-1).renderDeployId = 'dep-other', rows => rows.at(-1).vercelDeployId = 'dpl_other',
    rows => rows.at(-1).code = 'UNEXPECTED_RELEASE_ERROR', rows => rows.at(-1).phase = 'member-deployed',
    rows => rows.push({ ...rows.at(-1), phase: 'member-render-requesting' }),
    rows => rows.push({ ...rows.at(-1), phase: 'member-vercel-requesting' })]) {
    const rows = structuredClone(audits[i]); change(rows);
    assert.throws(() => validateHistoricalAudit(rows, descriptor(record.runs[i]), record.runs[i], targets), /ORIGINAL_AUDIT_CHANGED/);
  }
  const rows = structuredClone(audits[1]); rows.find(r => r.vercelSourceProof).vercelSourceProof.sourceSha = 'a'.repeat(40);
  assert.throws(() => validateHistoricalAudit(rows, descriptor(record.runs[1]), record.runs[1], targets), /ORIGINAL_AUDIT_CHANGED/);
});

test('actual history path rejects substituted metadata, expired archives and changed downloaded bytes', async () => {
  for (const change of [f => f.metas[1].digest = 'sha256:' + '0'.repeat(64), f => f.metas[1].expired = true,
    f => f.metas[1].workflow_run.head_sha = 'a'.repeat(40), f => f.bytes[1] = archives[0],
    f => f.metas[1].workflow_run.repository_id = 1]) {
    const f = historyFixture(); change(f);
    await assert.rejects(evidencePlan(f.api, f.q, standingPolicy), /ORIGINAL_ARTIFACT_REQUIRED|AUDIT_ARTIFACT_REQUIRED|ARTIFACT_PROVENANCE_INVALID|ARTIFACT_DIGEST_MISMATCH/);
  }
});

test('unrelated failed provider runs still deny after all selected exact reconciliations pass', async () => {
  for (const includeFailedRender of [false, true]) {
    const f = historyFixture(includeFailedRender), unrelated = { ...prior(record.runs[0]), id: 999, run_number: f.history[0].run_number };
    f.history[0].run_number++; f.history.push(unrelated);
    const read = f.api.executor;
    f.api.executor = async path => path.startsWith('/contents/') ? {
      type: 'file', path: path.slice('/contents/'.length).split('?')[0], encoding: 'base64',
      size: 18, content: Buffer.from('unsupported source').toString('base64')
    } : path === '/actions/runs/999/attempts/1/jobs?per_page=100' ? { total_count: 3, jobs: [
      { name: 'Qualify immutable source candidate', conclusion: 'success' },
      { name: admissionJobName, conclusion: 'success' }, production(unrelated)
    ].map(j => ({ ...j, run_id: 999, run_attempt: 1, status: 'completed' })) } : read(path);
    assert.equal(isReconciledHistoricalRun(999), false);
    await assert.rejects(evidencePlan(f.api, f.q, standingPolicy), /^Error: UNVERIFIED_PRIOR_RELEASE_REQUIRES_RECONCILIATION$/);
    assert.equal(f.downloads.length, includeFailedRender ? 3 : 2);
  }
});

test('a second attempt on either historical run is not recognized as the settled first attempt', async () => {
  for (let i = 0; i < 2; i++) {
    const f = historyFixture(); f.runs[i].run_attempt = 2;
    const read = f.api.executor;
    f.api.executor = async path => path === `/actions/runs/${f.runs[i].id}/attempts/1` ?
      { ...f.runs[i], run_attempt: 1 } : path === `/actions/runs/${f.runs[i].id}/attempts/1/jobs?per_page=100` ?
        { total_count: 3, jobs: [ { name: 'Qualify immutable source candidate', conclusion: 'success' },
          { name: admissionJobName, conclusion: 'success' }, production(f.runs[i])
        ].map(j => ({ ...j, run_id: f.runs[i].id, run_attempt: 1, status: 'completed' })) } : read(path);
    await assert.rejects(evidencePlan(f.api, f.q, standingPolicy), /FAILED_RUN_OR_EXECUTION_CHANGED/);
  }
});
