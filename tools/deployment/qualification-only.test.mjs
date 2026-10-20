import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateDispatchInputs, freezeCandidate, standingPolicy, verifyCandidate, validatePolicy,
  deploy, main, evidencePlan, admissionJobName, targets } from './release-control.mjs';
import { createGitHubAdmission, validateGitHubAdmission, verifyGitHubEvidence, sha256 } from './github-evidence.mjs';
import { fixture, runnerEnv, source, previous, fixtureNow } from './fixtures/provider.mjs';
import { fetchSource } from './fetch-source.mjs';
const dispatch = { ci_run_id: '123', ci_run_attempt: '1', sha: source };
const now = () => fixtureNow;

test('qualification-only dispatch is strictly parsed and legacy three-field dispatch remains production mode', () => {
  assert.equal(validateDispatchInputs(dispatch).qualificationOnly, false);
  for (const value of [false, 'false', true, 'true'])
    assert.equal(validateDispatchInputs({ ...dispatch, qualification_only: value }).qualificationOnly,
      value === true || value === 'true');
  for (const value of [null, undefined, '', 'TRUE', 'False', ' true', 'false ', '0', '1', 0, 1, [], {}])
    assert.throws(() => validateDispatchInputs({ ...dispatch, qualification_only: value }), /EXECUTOR_INPUT_INVALID/);
  for (const value of [{ ...dispatch, target: 'other' }, { ...dispatch, ci_run_id: 123 },
    { ...dispatch, ci_run_attempt: '0' }, { ...dispatch, sha: 'main' }, {}, null, []])
    assert.throws(() => validateDispatchInputs(value), /EXECUTOR_INPUT_INVALID/);
});

test('inert source fetch accepts validated qualification-only requests and rejects invalid mode before fetching', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aqua-qualification-fetch-'));
  try {
    const path = join(dir, 'event.json');
    for (const value of [true, 'true', false, 'false']) {
      writeFileSync(path, JSON.stringify({ inputs: { ...dispatch, qualification_only: value } }));
      const calls = [];
      fetchSource({ GITHUB_EVENT_PATH: path, SOURCE_DIR: join(dir, 'objects') }, (command, args) => {
        calls.push({ command, args }); return args.includes('rev-parse') ? source + '\n' : '';
      });
      assert.equal(calls.length, 3);
      assert.ok(calls.every(c => c.command === 'git' && !c.args.includes('checkout')));
    }
    writeFileSync(path, JSON.stringify({ inputs: { ...dispatch, qualification_only: 'yes' } }));
    let calls = 0;
    assert.throws(() => fetchSource({ GITHUB_EVENT_PATH: path, SOURCE_DIR: join(dir, 'objects') }, () => calls++), /EXECUTOR_INPUT_INVALID/);
    assert.equal(calls, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('candidate artifacts and admission receipts bind qualification purpose in both directions', async () => {
  const f = fixture(), production = f.state.candidate;
  const qualification = freezeCandidate(production, runnerEnv(), f.state.policy, true);
  const bytes = Buffer.from('inert source archive');
  const artifact = { ...qualification, sourceSha256: sha256(bytes) };
  verifyCandidate(artifact, qualification, bytes, bytes);
  assert.throws(() => verifyCandidate(artifact, production, bytes, bytes), /CANDIDATE_PURPOSE_MISMATCH/);
  assert.throws(() => verifyCandidate({ ...artifact, qualificationOnly: false }, qualification, bytes, bytes), /CANDIDATE_PURPOSE_MISMATCH/);
  const evidence = await verifyGitHubEvidence(f.api, production, f.state.policy, f.readSourceDigest, now);
  const receipt = createGitHubAdmission(qualification, f.state.policy, evidence, now);
  assert.equal(receipt.version, 2); assert.equal(receipt.qualificationOnly, true);
  validateGitHubAdmission(receipt, qualification, f.state.policy, evidence, now);
  assert.throws(() => validateGitHubAdmission(receipt, production, f.state.policy, evidence, now), /ADMISSION_RECEIPT_MISMATCH/);
  const productionReceipt = createGitHubAdmission(production, f.state.policy, evidence, now);
  assert.notEqual(receipt.authorizationId, productionReceipt.authorizationId);
  assert.throws(() => validateGitHubAdmission(productionReceipt, qualification, f.state.policy, evidence, now), /ADMISSION_RECEIPT_MISMATCH/);
  assert.throws(() => validateGitHubAdmission({ ...receipt, qualificationOnly: false }, production, f.state.policy, evidence, now), /ADMISSION_RECEIPT_MISMATCH/);
  assert.throws(() => validateGitHubAdmission({ ...receipt, version: 1 }, qualification, f.state.policy, evidence, now), /ADMISSION_RECEIPT_MISMATCH/);
});

test('qualification-only candidates cannot enter either deployment guard or make any API call', async () => {
  const f = fixture(), candidate = { ...f.state.candidate, qualificationOnly: true };
  const forbidden = new Proxy({}, { get() { assert.fail('qualification must deny before API access'); } });
  await assert.rejects(deploy(forbidden, candidate, standingPolicy, () => {}), /QUALIFICATION_ONLY_CANNOT_DEPLOY/);
  assert.throws(() => validatePolicy(candidate, runnerEnv()), /QUALIFICATION_ONLY_CANNOT_DEPLOY/);
  assert.equal(f.state.providerCalls, 0);
});

test('production job requires the validated false output, never raw qualification input or missing output', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  assert.match(workflow, /qualification_only:\s+description:[^\n]+\s+required: false\s+type: boolean\s+default: false/);
  assert.match(workflow, /qualification_only: \$\{\{ steps\.candidate\.outputs\.qualification_only \}\}/);
  const production = workflow.split('\n  production:\n')[1];
  const condition = production.split('\n').find(line => line.trim().startsWith('if:')).trim();
  assert.equal(condition, "if: ${{ needs.candidate.result == 'success' && needs.admission.result == 'success' && needs.candidate.outputs.qualification_only == 'false' }}");
  // The exact workflow expression permits only the controller's literal false.
  for (const output of ['true', '', 'unknown', undefined]) assert.notEqual(output, 'false');
  const beforeProduction = workflow.split('\n  production:\n')[0];
  assert.doesNotMatch(beforeProduction, /environment:/);
  assert.deepEqual([...beforeProduction.matchAll(/secrets\.(\w+)/g)].map(x=>x[1]),
    ['AQGREEN_EVIDENCE_READ_TOKEN', 'AQGREEN_EVIDENCE_READ_TOKEN']);
});

test('qualification dispatch executes normal candidate/admission, retains a purpose-bound receipt and rejects deploy', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aqua-qualification-entry-'));
  try {
    const repo = join(dir, 'source'), candidateDir = join(dir, 'candidate'); mkdirSync(repo); mkdirSync(candidateDir);
    const git = args => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    git(['init', '-q']); git(['config', 'user.name', 'Fixture']); git(['config', 'user.email', 'fixture@example.invalid']);
    writeFileSync(join(repo, 'application.mjs'), "throw Error('CANDIDATE_MUST_NOT_EXECUTE');\n");
    git(['add', '.']); git(['commit', '-qm', 'qualification fixture']); const sha = git(['rev-parse', 'HEAD']);
    const executorSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const event = join(dir, 'event.json');
    const inputs = { ...dispatch, sha, qualification_only: 'true' };
    writeFileSync(event, JSON.stringify({ inputs }));
    const env = { ...runnerEnv(), GITHUB_SHA: executorSha, GITHUB_WORKFLOW_SHA: executorSha,
      GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_EVENT_PATH: event, SOURCE_DIR: repo,
      CANDIDATE_DIR: candidateDir, GITHUB_OUTPUT: join(dir, 'output'), RELEASE_REPORT: join(dir, 'report.jsonl'),
      AQUA_ADMISSION_RECEIPT_OUTPUT: join(dir, 'admission.json'), AQUA_ADMISSION_RECEIPT_FILE: join(dir, 'admission.json') };
    delete env.RENDER_API_KEY; delete env.VERCEL_TOKEN;
    const f = fixture(); f.state.candidate = { ...f.state.candidate, sha, executorSha, qualificationOnly: true };
    f.state.report.context.sha = sha;
    const transform = value => value === source ? sha : Array.isArray(value) ? value.map(transform) :
      value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k,v]) => [k,transform(v)])) : value;
    const gh = f.api.gh; f.api.gh = async (...args) => transform(await gh(...args));
    const dependencies = { api: f.api, readSourceDigest: f.readSourceDigest, now };
    await main(env, { ...dependencies, mode: 'candidate' });
    assert.match(readFileSync(env.GITHUB_OUTPUT, 'utf8'), /qualification_only=true\n/);
    const manifest = JSON.parse(readFileSync(join(candidateDir, 'candidate.json')));
    assert.equal(manifest.qualificationOnly, true);
    // The mode is not an exemption from the normal mandatory-case classifier.
    f.state.report.results[0].outcome = 'skipped';
    await assert.rejects(main(env, { ...dependencies, mode: 'admit' }), /MANDATORY_EXECUTION_NOT_QUALIFIED/);
    assert.equal(existsSync(env.AQUA_ADMISSION_RECEIPT_OUTPUT), false);
    f.state.report.results[0].outcome = 'passed';
    await main(env, { ...dependencies, mode: 'admit' });
    const receipt = JSON.parse(readFileSync(env.AQUA_ADMISSION_RECEIPT_OUTPUT));
    assert.equal(receipt.qualificationOnly, true); assert.equal(receipt.executorSha, executorSha);
    assert.equal(receipt.sha, sha); assert.equal(receipt.releaseRunAttempt, 1);
    assert.equal(receipt.ciRunId, '123'); assert.equal(receipt.ciRunAttempt, 1);
    await assert.rejects(main(env, { ...dependencies, mode: 'deploy' }), /QUALIFICATION_ONLY_CANNOT_DEPLOY/);
    // Even a different purpose in a dispatch cannot reuse this candidate/receipt.
    writeFileSync(event, JSON.stringify({ inputs: { ...inputs, qualification_only: 'false' } }));
    await assert.rejects(main(env, { ...dependencies, mode: 'admit' }), /CANDIDATE_PURPOSE_MISMATCH/);
    assert.equal(f.state.providerCalls, 0); assert.equal(f.posts.length, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a successful qualification with production skipped never becomes a deployed predecessor', async () => {
  const f = fixture(), q = f.state.candidate;
  const row = (id, number, status) => ({ id, run_number: number, run_attempt: 1, head_sha: q.executorSha,
    head_branch: 'main', event: 'workflow_dispatch', path: '.github/workflows/deploy.yml',
    name: 'Qualified production executor', status, conclusion: status === 'completed' ? 'success' : null,
    repository: { full_name: targets.executor.repository }, head_repository: { full_name: targets.executor.repository } });
  const prior = row(455, 1, 'completed'), current = row(456, 2, 'in_progress');
  const read = f.api.executor;
  f.api.executor = async route => {
    if (route === '/actions/runs/456') return current;
    if (route.startsWith('/actions/workflows/deploy.yml/runs?')) return { total_count: 2, workflow_runs: [current, prior] };
    if (route === '/actions/runs/455/attempts/1/jobs?per_page=100') return { total_count: 3, jobs: [
      { name: 'Qualify immutable source candidate', conclusion: 'success' },
      { name: admissionJobName, conclusion: 'success' },
      { name: 'Unattended recovery release', conclusion: 'skipped' }
    ].map(job => ({ ...job, status: 'completed', run_id: 455, run_attempt: 1 })) };
    return read(route);
  };
  const plan = await evidencePlan(f.api, q, f.state.policy);
  assert.equal(plan.baseline, null); assert.deepEqual(plan.verifiedReleases, []);
  assert.equal(f.state.providerCalls, 0);
});
