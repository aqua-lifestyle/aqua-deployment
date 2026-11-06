import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {objectDigest, sha256} from './github-evidence.mjs';
import {fixture, zipFixture} from './fixtures/provider.mjs';
import {evidencePlan, admissionJobName, targets, ReleaseFailure} from './release-control.mjs';
import {authenticatePreMutationProducer, classifyPriorFailedRun, PriorRunNotRecognized, validateRecognitionAuthority,
  mutationCapablePhases, reconciliationForbiddenCodes, productionDeployStep,
  providerReadScopes} from './release-prior-run-classification.mjs';

const authority = readFileSync(new URL('../../governance/general-pre-mutation-release-history-authority-20261102.json', import.meta.url));
const rows = readFileSync(new URL('./fixtures/prior-run-prod-read-failure-audit-41494396970.jsonl', import.meta.url), 'utf8')
  .trim().split('\n').map(line => JSON.parse(line));
const mergedSha = '110ab4fb83bbf9291fcf23d6332b430de4390c6c';
const producer = {executorSha: mergedSha,
  workflowSha256: sha256(readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url))),
  controllerSha256: 'e4b76c1a5ca22d047675e5f1d7964bd20f9c413d3bc540cd29f7406834c585ab'};
const run = (id, o = {}) => ({id, runNumber: o.num ?? 12, runAttempt: o.attempts ?? 1, headSha: o.sha ?? mergedSha,
  status: o.status ?? 'completed', conclusion: o.conclusion ?? 'failure',
  repository: 'aqua-lifestyle/aqua-deployment', headRepository: 'aqua-lifestyle/aqua-deployment'});
const skipped = name => ({name: name ?? 'Unattended recovery release', conclusion: 'skipped'});
const failedJob = (name, stepEnd = 'skipped') => ({name: name ?? 'Unattended recovery release', conclusion: 'failure',
  steps: [{name: productionDeployStep(name), conclusion: stepEnd}]});
const audit = (o = {}) => ({descriptor: {artifactId: '13165273087', runId: String(o.runId ?? 41494396970),
  runAttempt: o.attempt ?? 1, sha: o.sha ?? mergedSha}, producer, rows: o.rows ?? rows});
const recognize = input => classifyPriorFailedRun(input);

test('pinned authority record authenticates the whole general recognition rule', () => {
  assert.equal(sha256(authority), 'ef9e8877e5078576bd694841a9bfb3a011337a86c2ce6054857aa7dbcd694423');
  const accepted = validateRecognitionAuthority(authority);
  assert.equal(accepted.contract, 'aqua.general-pre-mutation-release-history-authorization');
  assert.throws(() => validateRecognitionAuthority(Buffer.from(authority.toString().replace(/\./g, 'x'))), /IMMUTABLE_AUTHORITY_CHANGED/);
  const weakened = JSON.parse(authority.toString());
  // The whole-file pin: even a single decisive-flip re-serialization fails the
  // authenticated-digest check before the semantic invariant set is reachable.
  for (const flip of ['generalAuthenticatedPreMutationRecognitionAuthorized', 'noFailedRunPromotedToSuccessfulRelease',
    'productionDeploymentAuthorizedByThisDecision', 'historicalRunRecognitionPreserved']) {
    const next = structuredClone(weakened);
    next.decision[flip] = !next.decision[flip];
    assert.throws(() => validateRecognitionAuthority(Buffer.from(JSON.stringify(next))), /IMMUTABLE_AUTHORITY_CHANGED/);
  }
});

test('failed runs with skipped production are recognized without any per-run exception', () => {
  for (const [runId, num] of [[41495524552, 13], [41493666511, 11], [41486812924, 9], [41465983665, 8]]) {
    assert.deepEqual(recognize({run: run(runId, {num}), attempt: 1, production: skipped()}),
      {runId: String(runId), runNumber: num, runAttempt: 1, basis: 'production-never-executed',
        productionConclusion: 'skipped'});
  }
  const entry = recognize({run: run(41495524552, {num: 13}), attempt: 1, production: skipped()});
  assert.equal(entry.terminalFailureCode, undefined);
  assert.equal(entry.auditArtifactId, undefined);
  assert.equal('renderDeployId' in entry, false);
});

test('a failed production job that never entered the deploy step is recognized from the job record alone', () => {
  assert.deepEqual(recognize({run: run(41495524552, {num: 13}), attempt: 1, production: failedJob()}),
    {runId: '41495524552', runNumber: 13, runAttempt: 1, basis: 'deploy-step-never-entered',
      productionConclusion: 'failure'});
  assert.deepEqual(recognize({run: run(41494396970, {num: 12, sha: mergedSha}), attempt: 1,
    production: failedJob('Authorized recovery release')}), {
    runId: '41494396970', runNumber: 12, runAttempt: 1, basis: 'deploy-step-never-entered',
    productionConclusion: 'failure'});
});

test('a complete PROVIDER_READ_REJECTED audit that never initiated a mutation is recognized', () => {
  assert.deepEqual(recognize({run: run(41494396970, {num: 12}), attempt: 1, production: failedJob(undefined, 'failure'), audit: audit()}),
    {runId: '41494396970', runNumber: 12, runAttempt: 1, basis: 'audit-verified-never-mutated',
      productionConclusion: 'failure', producer, auditArtifactId: '13165273087',
      rowsSha256: objectDigest(rows), terminalFailureCode: 'PROVIDER_READ_REJECTED'});
});

test('substituted, conflicting or incomplete audit evidence fails closed', () => {
  const cases = [
    ['head sha moved', {run: run(41494396970, {num: 12, sha: 'a'.repeat(40)}), attempt: 1, production: failedJob(undefined, 'failure'), audit: audit()}],
    ['wrong artifact attempt', {run: run(41494396970, {num: 12}), attempt: 2, production: failedJob(undefined, 'failure'), audit: audit()}],
    ['truncated', {run: run(41494396970, {num: 12}), attempt: 1, production: failedJob(undefined, 'failure'), audit: audit({rows: rows.slice(0, 1)})}],
    ['empty', {run: run(41494396970, {num: 12}), attempt: 1, production: failedJob(undefined, 'failure'), audit: audit({rows: []})}],
    ['missing audit', {run: run(41494396970, {num: 12}), attempt: 1, production: failedJob(undefined, 'failure'), audit: undefined}],
    ['conflicting identity', {run: run(41494396970, {num: 12}), attempt: 1, production: failedJob(undefined, 'failure'),
      audit: audit({rows: [rows[0], {...rows[1], ciRunId: '999'}]})}],
    ['forged candidate sha', {run: run(41494396970, {num: 12}), attempt: 1, production: failedJob(undefined, 'failure'),
      audit: audit({rows: [rows[0], {...rows[1], sha: 'b'.repeat(40)}]})}],
    ['unknown phase', {run: run(41494396970, {num: 12}), attempt: 1, production: failedJob(undefined, 'failure'),
      audit: audit({rows: [rows[0], {...rows[1], phase: 'left-reconciliation'}]})}],
    ['wrong read scope', {run: run(41494396970, {num: 12}), attempt: 1, production: failedJob(undefined, 'failure'),
      audit: audit({rows: [rows[0], {...rows[1], phase: 'provider-read', scope: 'vercel-creates-project'}]})}],
    ['deployment identity present', {run: run(41494396970, {num: 12}), attempt: 1, production: failedJob(undefined, 'failure'),
      audit: audit({rows: [rows[0], {...rows[1], vercelDeployId: 'dpl_Unknown'}]})}],
    ['reconciliation-required terminal code', {run: run(41494396970, {num: 12}), attempt: 1, production: failedJob(undefined, 'failure'),
      audit: audit({rows: [rows[0], {...rows[1], code: 'PROVIDER_TIMEOUT_RECONCILE_BEFORE_RETRY'}]})}],
    ['terminal row not last', {run: run(41494396970, {num: 12}), attempt: 1, production: failedJob(undefined, 'failure'),
      audit: audit({rows: [rows[1], rows[0]]})}],
    ['duplicate failures', {run: run(41494396970, {num: 12}), attempt: 1, production: failedJob(undefined, 'failure'),
      audit: audit({rows: [rows[0], rows[1], {...rows[1]}]})}]
  ];
  for (const [label, input] of cases)
    assert.throws(() => recognize(input), PriorRunNotRecognized, label);
  // A row claiming verification contradicts the failed run and is never promoted.
  assert.throws(() => recognize({run: run(41494396970, {num: 12}), attempt: 1, production: failedJob(undefined, 'failure'),
    audit: audit({rows: [rows[0], {...rows[1], phase: 'verified', renderDeployId: 'dep-ok', vercelDeployId: 'dpl-ok'}]})}), PriorRunNotRecognized);
});

test('reviewed baseline-drift producer requires a complete no-mutation audit and grants no continuation', () => {
  const head = '0ab4b7142709cb55227b5e5d57d1f071b81ef266';
  const stopped = rows.map(row => ({...row, executorSha: head}));
  stopped.at(-1).code = 'RENDER_BASELINE_DRIFT';
  const input = {run: run(41494396970, {sha: head}), attempt: 1, production: failedJob(undefined, 'failure'),
    audit: {...audit({sha: head, rows: stopped}), producer: {...producer, executorSha: head,
      controllerSha256: 'faf99ea1fec489f19811bb0b8786ba6d1709880657baeccc1e7f121b96bdbc3d'}}};
  const result = recognize(input);
  assert.equal(result.basis, 'audit-verified-never-mutated');
  assert.equal(result.terminalFailureCode, 'RENDER_BASELINE_DRIFT');
  assert.equal(result.renderDeployId, undefined);
  for (const phase of mutationCapablePhases) {
    const changed = structuredClone(input);
    changed.audit.rows.splice(1, 0, {...stopped[0], phase});
    assert.throws(() => recognize(changed), /MUTATION_PHASE_REQUIRES_RECONCILIATION/);
  }
});

test('attempted, acknowledged or ambiguous provider writes always require reconciliation', () => {
  for (const phase of ['render-requesting', 'render-requested', 'render-ready', 'vercel-files-requesting',
    'vercel-files-uploaded', 'vercel-requesting', 'vercel-requested']) {
    assert.throws(() => recognize({run: run(41494396970, {num: 12}), attempt: 1, production: failedJob(undefined, 'failure'),
      audit: audit({rows: [rows[0], {...rows[1], phase}, rows[1]]})}), /PRIOR_MUTATION_PHASE_REQUIRES_RECONCILIATION/, phase);
  }
  for (const phase of ['member-readiness', 'member-baseline-selected', 'member-render-reconciled',
    'member-render-requesting', 'member-render-requested', 'member-handoff-sample', 'member-render-ready',
    'member-vercel-files-requesting', 'member-vercel-files-uploaded', 'member-vercel-requesting',
    'member-vercel-requested', 'member-deployed']) {
    assert.throws(() => recognize({run: run(41494396970, {num: 12}), attempt: 1, production: failedJob(undefined, 'failure'),
      audit: audit({rows: [rows[0], {...rows[1], phase}, rows[1]]})}), /PRIOR_MUTATION_PHASE_REQUIRES_RECONCILIATION/, phase);
  }
  for (const code of ['AMBIGUOUS_PROVIDER_POST_INSPECT_BEFORE_RETRY', 'INVALID_PROVIDER_RESPONSE',
    'RENDER_DEPLOYMENT_ID_UNAVAILABLE', 'VERCEL_DEPLOYMENT_ID_UNAVAILABLE',
    'PROVIDER_POST_REJECTED_INSPECT_BEFORE_RETRY', 'PROVIDER_DEPLOYMENT_FAILED_INSPECT_RELEASE_REPORT',
    'UNEXPECTED_RELEASE_ERROR']) {
    assert.throws(() => recognize({run: run(41494396970, {num: 12}), attempt: 1, production: failedJob(undefined, 'failure'),
      audit: audit({rows: [rows[0], {...rows[1], code}]})}), /PRIOR_AUDIT_TERMINAL_OUTCOME_UNRECOGNIZABLE/, code);
  }
  assert.equal(mutationCapablePhases.has('provider-read'), false);
  assert.equal(reconciliationForbiddenCodes.has('PROVIDER_READ_REJECTED'), false);
  for (const scope of providerReadScopes) {
    const readAudit = {rows: [rows[0], {...rows[1], phase: 'provider-read', scope}, rows[1]]};
    assert.deepEqual(recognize({run: run(41494396970, {num: 12}), attempt: 1,
      production: failedJob(undefined, 'failure'), audit: {...audit(), rows: readAudit.rows}})
      .terminalFailureCode, 'PROVIDER_READ_REJECTED');
  }
});

test('successful, in-progress and foreign-workflow runs are never classified and never become predecessors', () => {
  const cases = [
    ['success production job', {run: run(41494396970, {num: 12}), attempt: 1, production: {name: 'Unattended recovery release', conclusion: 'success'}}],
    ['cancelled production job', {run: run(41494396970, {num: 12}), attempt: 1, production: {name: 'Unattended recovery release', conclusion: 'cancelled'}}],
    ['unknown production job', {run: run(41494396970, {num: 12}), attempt: 1, production: {name: 'Untrusted release', conclusion: 'skipped'}}],
    ['run still running', {run: run(41494396970, {num: 12, status: 'in_progress'}), attempt: 1, production: skipped()}],
    ['run succeeded overall', {run: run(41494396970, {num: 12, conclusion: 'success'}), attempt: 1, production: skipped()}],
    ['foreign repository', {run: {...run(41494396970, {num: 12}), repository: 'aqua-lifestyle/attacker-fork'}, attempt: 1, production: skipped()}],
    ['fork head', {run: {...run(41494396970, {num: 12}), headRepository: 'attacker/aqua-deployment'}, attempt: 1, production: skipped()}],
    ['bad run number', {run: {...run(41494396970, {num: 0})}, attempt: 1, production: skipped()}],
    ['attempt beyond history', {run: run(41494396970, {num: 12}), attempt: 2, production: skipped()}],
    ['no run', {run: undefined, attempt: 1, production: skipped()}]
  ];
  for (const [label, input] of cases)
    assert.throws(() => recognize(input), PriorRunNotRecognized, label);
  assert.throws(() => recognize({run: run(41494396970, {num: 12}), attempt: 0, production: skipped()}), /PRIOR_ATTEMPT_OUT_OF_RANGE/);
  assert.throws(() => recognize({run: run(41494396970, {num: 12}), attempt: 1, production: {name: 'Unattended recovery release', conclusion: 'success'}}),
    /PRIOR_PRODUCTION_CONCLUSION_UNRECOGNIZED/);
  // A succeeded prior run itself is excluded before any classification route.
  assert.throws(() => recognize({run: run(41494396970, {num: 12, conclusion: 'success'}), attempt: 1, production: failedJob()}),
    /PRIOR_RUN_IDENTITY_UNVERIFIABLE/);
  for (const descriptor of [
      {artifactId: '13165273087', runId: '41494396969', runAttempt: 1, sha: mergedSha},
      {artifactId: '13165273087', runId: '41494396970', runAttempt: 1, sha: 'c'.repeat(40)},
      undefined]) {
    assert.throws(() => recognize({run: run(41494396970, {num: 12}), attempt: 1, production: failedJob(undefined, 'failure'), audit: {
      descriptor, producer, rows}}), /PRIOR_AUDIT_DESCRIPTOR_BINDING_FAILED|PRIOR_AUDIT_AUTHENTICATED_EVIDENCE_REQUIRED/);
  }
});

test('producer source is authenticated at the exact revision; changed write-ahead code denies', async () => {
  const files = new Map(['.github/workflows/deploy.yml', 'tools/deployment/release-control.mjs'].map(path =>
    [path, readFileSync(new URL('../../' + path, import.meta.url))]));
  const read = async route => {
    const [path, ref] = route.slice('/contents/'.length).split('?ref=');
    assert.equal(ref, mergedSha);
    const bytes = files.get(path);
    return {type: 'file', path, encoding: 'base64', size: bytes.length, content: bytes.toString('base64')};
  };
  const proof = await authenticatePreMutationProducer(read, mergedSha);
  assert.equal(proof.controllerSha256, sha256(files.get('tools/deployment/release-control.mjs')));
  for (const path of files.keys()) {
    const original = files.get(path);
    files.set(path, Buffer.from('unrecognized producer code'));
    await assert.rejects(authenticatePreMutationProducer(read, mergedSha), /WRITE_AHEAD_CONTRACT_UNSUPPORTED/);
    files.set(path, original);
  }
  assert.throws(() => recognize({run: run(41494396970), attempt: 1, production: failedJob(undefined, 'failure'),
    audit: {...audit(), producer: undefined}}), /WRITE_AHEAD_CONTRACT_UNSUPPORTED/);
  const unknown = [rows[0], {...rows[1], code: 'UNKNOWN_NEW_FAILURE'}];
  assert.throws(() => recognize({run: run(41494396970), attempt: 1, production: failedJob(undefined, 'failure'),
    audit: audit({rows: unknown})}), /TERMINAL_OUTCOME_UNRECOGNIZABLE/);
});

// Authenticated-transport substitutes exercise the real evidencePlan, artifact
// metadata validation, ZIP digest verification and JSONL reader. This is not a
// hosted Actions or provider observation; only the audit JSONL is incident data.
function historyFixture() {
  const f = fixture(), q = f.state.candidate;
  const identity = {head_branch: 'main', event: 'workflow_dispatch', path: '.github/workflows/deploy.yml',
    name: 'Qualified production executor', repository: {full_name: targets.executor.repository},
    head_repository: {full_name: targets.executor.repository}, run_attempt: 1};
  const past = {...identity, id: 41494396970, run_number: 1, head_sha: mergedSha, status: 'completed', conclusion: 'failure'};
  const current = {...identity, id: 456, run_number: 2, head_sha: q.executorSha, status: 'in_progress'};
  const state = {rows: structuredClone(rows), production: failedJob(undefined, 'failure'), expired: false,
    corrupt: false, repositoryId: 987, approval: true, history: [current, past]};
  const archive = () => zipFixture('release-report.jsonl', state.rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  const metadata = () => ({id: 13165273087, name: 'production-release-audit-41494396970-1', expired: state.expired,
    size_in_bytes: archive().length, digest: 'sha256:' + sha256(archive()),
    workflow_run: {id: past.id, head_sha: past.head_sha, head_branch: 'main',
      repository_id: state.repositoryId, head_repository_id: state.repositoryId}});
  const read = f.api.executor, download = f.api.artifact;
  f.api.executor = async route => {
    if (route === '/actions/runs/456') return structuredClone(current);
    if (route.startsWith('/actions/workflows/deploy.yml/runs?'))
      return {total_count: state.history.length, workflow_runs: structuredClone(state.history)};
    if (route === `/actions/runs/${past.id}/attempts/1/jobs?per_page=100`)
      return {total_count: 3, jobs: [{name: 'Qualify immutable source candidate', conclusion: 'success'},
        {name: admissionJobName, conclusion: 'success'}, state.production].map(j =>
        ({...j, status: 'completed', run_id: past.id, run_attempt: 1}))};
    if (route === `/commits/${mergedSha}/pulls?per_page=100`) return state.approval ? [{number: 99,
      merge_commit_sha: mergedSha, merged_at: '2026-11-02T16:00:00Z', base: {ref: 'main', repo: {full_name: targets.executor.repository}}}] : [];
    if (route === '/pulls/99') return {number: 99, merged: true, state: 'closed', merge_commit_sha: mergedSha,
      merged_at: '2026-11-02T16:00:00Z', base: {ref: 'main', repo: {full_name: targets.executor.repository}},
      merged_by: {login: 'Xolani-M', id: 86495928}};
    if (route.startsWith('/contents/')) {
      const [path, ref] = route.slice('/contents/'.length).split('?ref=');
      assert.equal(ref, mergedSha);
      const bytes = readFileSync(new URL('../../' + path, import.meta.url));
      return {type: 'file', path, encoding: 'base64', size: bytes.length, content: bytes.toString('base64')};
    }
    if (route === `/actions/runs/${past.id}/artifacts?per_page=100`)
      return {total_count: 1, artifacts: [metadata()]};
    if (route === '/actions/artifacts/13165273087') return metadata();
    return read(route);
  };
  f.api.artifact = async (owner, id) => owner === 'executor' && id === '13165273087' ?
    state.corrupt ? Buffer.from('substituted archive') : archive() : download(owner, id);
  return {...f, historyState: state, past, current};
}

test('real history admission recognizes the incident without creating a predecessor or continuation', async () => {
  const f = historyFixture();
  const plan = await evidencePlan(f.api, f.state.candidate, f.state.policy);
  assert.equal(plan.priorFailedRuns.length, 1);
  assert.equal(plan.priorFailedRuns[0].basis, 'audit-verified-never-mutated');
  assert.equal(plan.priorFailedRuns[0].rowsSha256, objectDigest(rows));
  assert.deepEqual(plan.verifiedReleases, []);
  assert.equal(plan.baseline, null);
  assert.equal(plan.resume, null);
  assert.deepEqual(plan.resumeChain, []);
  assert.equal(f.past.conclusion, 'failure');
  assert.equal(f.historyState.production.conclusion, 'failure');
  assert.deepEqual(await evidencePlan(f.api, f.state.candidate, f.state.policy), plan);
  assert.equal(f.posts.length, 0);
});

test('authenticated history rejects expired, substituted, truncated, contradictory and mutating evidence', async () => {
  for (const [label, change, error] of [
    ['expired', f => f.historyState.expired = true, /TRUSTED_AUDIT_ARTIFACT_REQUIRED/],
    ['wrong repository', f => f.historyState.repositoryId = 1, /ARTIFACT_PROVENANCE_INVALID/],
    ['archive substitution', f => f.historyState.corrupt = true, /ARTIFACT_DIGEST_MISMATCH/],
    ['truncated', f => f.historyState.rows.pop(), /REQUIRES_RECONCILIATION/],
    ['attempt substitution', f => f.historyState.rows[1].releaseRunAttempt = 2, /REQUIRES_RECONCILIATION/],
    ['unacknowledged write', f => f.historyState.rows.splice(1, 0, {...rows[1], phase: 'render-requesting'}), /REQUIRES_RECONCILIATION/],
    ['confirmed write', f => f.historyState.rows[1].renderDeployId = 'dep-acknowledged', /REQUIRES_RECONCILIATION/],
    ['unknown failure', f => f.historyState.rows[1].code = 'UNCLASSIFIED', /REQUIRES_RECONCILIATION/],
    ['unapproved producer', f => f.historyState.approval = false, /EXECUTOR_ADMINISTRATOR_APPROVAL_REQUIRED/]
  ]) {
    const f = historyFixture(); change(f);
    await assert.rejects(evidencePlan(f.api, f.state.candidate, f.state.policy), error, label);
    assert.equal(f.posts.length, 0, label);
  }
});

test('history admission authenticates a baseline-drift stop without skipping archive or administrator checks', async () => {
  const f = historyFixture(); f.historyState.rows.at(-1).code = 'RENDER_BASELINE_DRIFT';
  const plan = await evidencePlan(f.api, f.state.candidate, f.state.policy);
  assert.equal(plan.priorFailedRuns[0].terminalFailureCode, 'RENDER_BASELINE_DRIFT');
  assert.deepEqual(plan.verifiedReleases, []); assert.equal(plan.resume, null); assert.equal(f.posts.length, 0);
  f.historyState.corrupt = true;
  await assert.rejects(evidencePlan(f.api, f.state.candidate, f.state.policy), /ARTIFACT_DIGEST_MISMATCH/);
});

test('a later read-only failed admission does not restart the prior-failure reconciliation cycle', async () => {
  const f = historyFixture(), later = {...f.past, id: 41495524552, run_number: 2};
  f.current.run_number = 3; f.historyState.history.push(later);
  const read = f.api.executor;
  f.api.executor = async route => route === `/actions/runs/${later.id}/attempts/1/jobs?per_page=100` ?
    {total_count: 3, jobs: [{name: 'Qualify immutable source candidate', conclusion: 'success'},
      {name: admissionJobName, conclusion: 'failure'}, skipped()].map(j =>
      ({...j, status: 'completed', run_id: later.id, run_attempt: 1}))} : read(route);
  const plan = await evidencePlan(f.api, f.state.candidate, f.state.policy);
  assert.deepEqual(plan.priorFailedRuns.map(r => r.basis).sort(), ['audit-verified-never-mutated', 'production-never-executed']);
  assert.deepEqual(plan.verifiedReleases, []);
  assert.equal(f.posts.length, 0);
});

test('a successful qualification rerun cannot erase an earlier attempt or turn it into deployment success', async () => {
  const f = historyFixture(); f.past.run_attempt = 2; f.past.conclusion = 'success';
  const read = f.api.executor;
  f.api.executor = async route => {
    if (route === `/actions/runs/${f.past.id}/attempts/1`) return {...f.past, run_attempt: 1, conclusion: 'failure'};
    if (route === `/actions/runs/${f.past.id}/attempts/2/jobs?per_page=100`)
      return {total_count: 3, jobs: [{name: 'Qualify immutable source candidate', conclusion: 'success'},
        {name: admissionJobName, conclusion: 'success'}, skipped()].map(j =>
        ({...j, status: 'completed', run_id: f.past.id, run_attempt: 2}))};
    return read(route);
  };
  const plan = await evidencePlan(f.api, f.state.candidate, f.state.policy);
  assert.deepEqual(plan.priorFailedRuns.map(r => r.runAttempt), [1]);
  assert.deepEqual(plan.verifiedReleases, []);
  f.historyState.rows.splice(1, 0, {...rows[1], phase: 'vercel-files-requesting'});
  await assert.rejects(evidencePlan(f.api, f.state.candidate, f.state.policy), /REQUIRES_RECONCILIATION/);
  assert.equal(f.posts.length, 0);
});

test('read rejection leaves a non-sensitive diagnostic scope before any provider write', async () => {
  for (const [provider, matches, scope] of [
    ['gh', route => route === '', 'github-repository'],
    ['render', route => route === `/services/${targets.render.id}`, 'render-service'],
    ['render', route => route.includes('/env-vars/'), 'render-env'],
    ['vercel', route => route === `/v9/projects/${targets.vercel.id}`, 'vercel-project'],
    ['vercel', route => route.includes('/env?'), 'vercel-env'],
    ['render', route => route.includes('/deploys?'), 'render-deploy-history'],
    ['vercel', route => route.startsWith('/v13/deployments/'), 'vercel-deployment']
  ]) {
    const f = fixture(), read = f.api[provider]; let rejected = false;
    f.api[provider] = async (route, body) => {
      if (!body && f.reports.some(r => r.phase === 'evidence-selected') && matches(route)) {
        rejected = true; throw new ReleaseFailure('PROVIDER_READ_REJECTED');
      }
      return read(route, body);
    };
    await assert.rejects(f.execute(), /PROVIDER_READ_REJECTED/, scope);
    assert.equal(rejected, true, scope);
    assert.equal(f.reports.at(-1).scope, scope);
    assert.equal(f.posts.length, 0);
    assert.equal(f.reports.some(r => r.url || r.headers || r.body), false);
  }
});
