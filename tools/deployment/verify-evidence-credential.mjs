// One-off read-capability check, not release admission or deployment authority.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { clients, targets, standingPolicy, qualify, validateEnvironment, validateMainGovernance,
  validateCandidateProvenance, ReleaseFailure, requireThat } from './release-control.mjs';
import { approvedBypassReadback, GovernanceReadbackDenied } from './governance-readback.mjs';
import { sha256, validateArtifact, maxArtifactBytes } from './github-evidence.mjs';

const executor = targets.executor.repository;
export function approvedCredentialContext(event, env, checkoutSha) {
  const pr = event?.pull_request, actor = event?.sender;
  const head = pr?.head?.sha;
  requireThat(env.GITHUB_ACTIONS === 'true' && env.GITHUB_EVENT_NAME === 'pull_request' && event?.action === 'labeled' &&
    env.GITHUB_REPOSITORY === executor && event.repository?.full_name === executor &&
    pr?.number === 1 && pr.state === 'open' && pr.base?.ref === 'main' &&
    pr.base?.repo?.full_name === executor && pr.head?.repo?.full_name === executor &&
    /^[a-f0-9]{40}$/.test(head ?? '') && checkoutSha === head &&
    event.label?.name === `readpat-${head}` &&
    pr.labels?.some(label => label.name === event.label.name) &&
    env.GITHUB_REF === 'refs/pull/1/merge' && env.GITHUB_RUN_ATTEMPT === '1' &&
    env.GITHUB_WORKFLOW_REF === `${executor}/.github/workflows/credential-check.yml@refs/pull/1/merge` &&
    env.GITHUB_ACTOR === actor?.login && env.GITHUB_ACTOR_ID === String(actor?.id) &&
    env.GITHUB_TRIGGERING_ACTOR === actor?.login &&
    standingPolicy.authorization.administrators.some(a => a.login === actor?.login && a.id === actor?.id),
  'CREDENTIAL_CHECK_CONTEXT_DENIED');
  return head;
}

async function currentApproval(api, head) {
  const pr = await api.executor('/pulls/1');
  requireThat(pr.state === 'open' && pr.head?.sha === head && pr.head.repo?.full_name === executor &&
    pr.base?.ref === 'main' && pr.base.repo?.full_name === executor &&
    pr.labels?.some(label => label.name === `readpat-${head}`), 'CREDENTIAL_CHECK_APPROVAL_CHANGED');
  const page = await api.executor(`/commits/${head}/check-runs?check_name=Executor%20safety%20tests&filter=latest&per_page=100`);
  requireThat(page.total_count === 1 && page.check_runs?.length === 1 &&
    page.check_runs[0].name === 'Executor safety tests' && page.check_runs[0].app?.id === 15368 &&
    page.check_runs[0].head_sha === head && page.check_runs[0].status === 'completed' &&
    page.check_runs[0].conclusion === 'success', 'CREDENTIAL_CHECK_SAFETY_CI_REQUIRED');
}

export async function checkCredential(env, { event, checkoutSha, mode, fetcher = fetch, emit = () => {} }) {
  const head = approvedCredentialContext(event, env, checkoutSha);
  requireThat(['context', 'verify'].includes(mode), 'CREDENTIAL_CHECK_MODE_INVALID');
  const token = mode === 'context' ? env.GH_TOKEN : env.AQGREEN_EVIDENCE_READ_TOKEN;
  requireThat(typeof token === 'string' && token.trim().length > 0, 'CREDENTIAL_CHECK_TOKEN_REQUIRED');
  let phase = 'approved-context';
  const transport = async (url, options) => {
    requireThat(!options?.method || options.method === 'GET', 'CREDENTIAL_CHECK_GET_ONLY');
    const response = await fetcher(url, { ...options, method: 'GET' });
    emit({ check: phase, httpStatus: response.status });
    return response;
  };
  const api = clients({ AQGREEN_EVIDENCE_READ_TOKEN: token }, transport);
  await currentApproval(api, head);
  if (mode === 'context') { emit({ check: 'trusted-context', result: 'PASS', executorSha: head }); return; }

  phase = 'credential-identity';
  const identityResponse = await transport('https://api.github.com/user', { method: 'GET', redirect: 'error',
    signal: AbortSignal.timeout(30_000), headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  requireThat(identityResponse.ok, 'CREDENTIAL_CHECK_IDENTITY_UNAVAILABLE');
  const identity = await identityResponse.json();
  requireThat(identity.login === 'Xolani-M' && identity.id === 86495928, 'CREDENTIAL_CHECK_IDENTITY_MISMATCH');

  phase = 'application-ci-runs';
  const main = await api.gh('/git/ref/heads/main');
  requireThat(/^[a-f0-9]{40}$/.test(main.object?.sha ?? ''), 'CREDENTIAL_CHECK_SOURCE_UNAVAILABLE');
  const runs = await api.gh(`/actions/workflows/ci.yml/runs?branch=main&event=push&head_sha=${main.object.sha}&per_page=100`);
  requireThat(Array.isArray(runs.workflow_runs), 'CREDENTIAL_CHECK_CI_UNAVAILABLE');
  const run = runs.workflow_runs.find(r => r.head_sha === main.object.sha && r.status === 'completed' && r.conclusion === 'success');
  requireThat(run, 'CREDENTIAL_CHECK_CI_UNAVAILABLE');
  phase = 'application-jobs-checks';
  const qualified = await qualify(api, run.id);
  phase = 'source-provenance';
  const blob = await api.gh(`/contents/.github/workflows/ci.yml?ref=${qualified.sha}`);
  requireThat(blob.type === 'file' && /^[a-f0-9]{40}$/.test(blob.sha ?? ''), 'CREDENTIAL_CHECK_SOURCE_UNAVAILABLE');
  await validateCandidateProvenance(api, qualified);

  phase = 'application-artifact-metadata';
  const repository = await api.gh('');
  const page = await api.gh(`/actions/runs/${qualified.ciRunId}/artifacts?per_page=100`);
  requireThat(Array.isArray(page.artifacts) && page.total_count === page.artifacts.length,
    'CREDENTIAL_CHECK_ARTIFACT_INVENTORY_UNAVAILABLE');
  const artifact = page.artifacts.filter(a => !a.expired && a.size_in_bytes > 0 && a.size_in_bytes <= maxArtifactBytes)
    .sort((a, b) => a.size_in_bytes - b.size_in_bytes)[0];
  requireThat(artifact, 'CREDENTIAL_CHECK_ARTIFACT_UNAVAILABLE');
  const descriptor = validateArtifact(artifact, qualified.ciRunId, qualified.sha, artifact.name, repository.id);
  const fresh = await api.gh(`/actions/artifacts/${descriptor.id}`);
  requireThat(JSON.stringify(validateArtifact(fresh, qualified.ciRunId, qualified.sha, artifact.name, repository.id)) ===
    JSON.stringify(descriptor), 'CREDENTIAL_CHECK_ARTIFACT_CHANGED');
  phase = 'authenticated-artifact-download';
  const archive = await api.artifact('source', descriptor.id);
  requireThat(`sha256:${sha256(archive)}` === descriptor.digest, 'CREDENTIAL_CHECK_ARTIFACT_DIGEST_MISMATCH');

  for (const [repositoryName, read] of [[targets.repository, api.gh], [executor, api.executor]]) {
    phase = repositoryName === executor ? 'executor-governance-history' : 'application-governance-history';
    const rules = await read('/rules/branches/main?per_page=100');
    requireThat(Array.isArray(rules) && rules.length > 0 && rules.length < 100, 'CREDENTIAL_CHECK_GOVERNANCE_UNAVAILABLE');
    const ids = [...new Set(rules.map(r => r.ruleset_id))];
    const snapshots = [];
    for (const id of ids) {
      requireThat(Number.isSafeInteger(id) && id > 0, 'CREDENTIAL_CHECK_GOVERNANCE_UNAVAILABLE');
      const live = await read(`/rulesets/${id}`);
      // Only the governing ruleset needs private bypass metadata. Other active
      // history rules remain visible and cannot replace this approved rule.
      if ((repositoryName === targets.repository && id === 25297647) ||
          (repositoryName === executor && id === 25403847)) snapshots.push(approvedBypassReadback(live, repositoryName));
    }
    requireThat(snapshots.length === 1, 'CREDENTIAL_CHECK_GOVERNANCE_UNAVAILABLE');
    if (repositoryName === targets.repository) validateMainGovernance(rules, snapshots[0]);
    else requireThat(snapshots[0].enforcement === 'active' && Array.isArray(snapshots[0].bypass_actors) &&
      snapshots[0].bypass_actors.length === 0 && ['deletion', 'non_fast_forward'].every(type =>
        rules.some(r => r.type === type && r.ruleset_id === snapshots[0].id)), 'CREDENTIAL_CHECK_GOVERNANCE_UNAVAILABLE');
    const environment = await read('/environments/production-release');
    const branches = await read('/environments/production-release/deployment-branch-policies?per_page=100');
    requireThat(branches.total_count === branches.branch_policies?.length, 'CREDENTIAL_CHECK_GOVERNANCE_UNAVAILABLE');
    validateEnvironment(environment, branches.branch_policies);
    const history = await read('/actions/runs?per_page=1');
    requireThat(Number.isSafeInteger(history.total_count) && history.total_count > 0 && history.workflow_runs?.length === 1,
      'CREDENTIAL_CHECK_HISTORY_UNAVAILABLE');
    const row = history.workflow_runs[0];
    requireThat(Number.isSafeInteger(row.id) && row.id > 0 && Number.isSafeInteger(row.run_attempt) && row.run_attempt > 0,
      'CREDENTIAL_CHECK_HISTORY_UNAVAILABLE');
    await read(`/actions/runs/${row.id}`);
    const jobs = await read(`/actions/runs/${row.id}/attempts/${row.run_attempt}/jobs?per_page=100`);
    requireThat(Array.isArray(jobs.jobs) && jobs.total_count === jobs.jobs.length, 'CREDENTIAL_CHECK_HISTORY_UNAVAILABLE');
    await read(`/actions/runs/${row.id}/artifacts?per_page=100`);
  }
  phase = 'final-approval'; await currentApproval(api, head);
  emit({ check: 'evidence-read-access', result: 'PASS', executorSha: head,
    ciRunId: qualified.ciRunId, ciRunAttempt: qualified.ciRunAttempt, artifactId: descriptor.id });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await checkCredential(process.env, { event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH)),
      checkoutSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      mode: process.argv[2], emit: row => console.log(JSON.stringify(row)) });
  } catch (error) {
    const code = error instanceof ReleaseFailure || error instanceof GovernanceReadbackDenied ? error.message : 'CREDENTIAL_CHECK_FAILED';
    console.log(JSON.stringify({ check: 'credential-check', result: 'FAIL', code })); process.exitCode = 1;
  }
}
