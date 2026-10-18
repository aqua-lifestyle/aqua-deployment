import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const targets = JSON.parse(readFileSync(new URL('./targets.json', import.meta.url)));
// Only the executor's reviewed targets.json selects this mode. Candidate input
// cannot supply an execution repository, workflow, provider URL or target.
export const execution = targets.executor ?? { repository: targets.repository,
  workflow: 'release.yml', name: 'Qualified production release', event: 'workflow_run' };
const external = execution.repository !== targets.repository;
const releaseApi = api => external ? api.executor : api.gh;
export const standingPolicy = JSON.parse(readFileSync(new URL('./unattended-policy.json', import.meta.url)));
export const requiredJobs = [
  'Backend application coverage partition', 'Backend web coverage partition',
  ...['application-administration', 'application-membership', 'application-authentication',
    'application-remainder', 'entity-framework-migrations', 'entity-framework-placement',
    'entity-framework-remainder', 'remainder'].map(x => `Backend application tests (${x})`),
  ...['placement', 'controllers', 'remainder'].map(x => `Backend web tests (${x})`),
  'Frontend quality checks', 'PostgreSQL transactional invitation regressions',
  'Validate container images', 'Release safety tests'
];
const shaPattern = /^[a-f0-9]{40}$/;
const activeRender = new Set(['created', 'queued', 'build_in_progress', 'pre_deploy_in_progress', 'update_in_progress']);
const activeVercel = new Set(['QUEUED', 'INITIALIZING', 'BUILDING']);
const renderStates = new Set([...activeRender, 'live', 'deactivated', 'build_failed',
  'pre_deploy_failed', 'update_failed', 'canceled']);
const vercelStates = new Set([...activeVercel, 'READY', 'ERROR', 'CANCELED']);
const sourceIdentityFields = ['repository', 'sha', 'ciRunId', 'ciRunAttempt'];
const targetIdentity = Object.freeze({ environment: targets.environment, profile: targets.profile,
  renderServiceId: targets.render.id, vercelProjectId: targets.vercel.id, vercelTeamId: targets.vercel.teamId });
const releaseIdentityFields = ['version', ...sourceIdentityFields, 'releaseRunId', 'releaseRunAttempt', 'policySha256',
  ...Object.keys(targetIdentity), ...(external ? ['executorRepository', 'executorSha'] : [])];
const positiveId = value => typeof value === 'string' && /^[1-9]\d*$/.test(value);
const positiveAttempt = value => Number.isSafeInteger(value) && value > 0;

export class ReleaseFailure extends Error {}
export function requireThat(condition, code) {
  if (!condition) throw new ReleaseFailure(code);
}
export function validateRun(run, jobs, mainSha) {
  requireThat(positiveId(String(run.id)) && Number.isSafeInteger(run.id) &&
    positiveAttempt(run.run_attempt), 'CI_IDENTITY_UNVERIFIABLE');
  requireThat(run.repository?.full_name === targets.repository &&
    run.head_repository?.full_name === targets.repository, 'CI_REPOSITORY_MISMATCH');
  requireThat(run.event === 'push' && run.head_branch === 'main' &&
    run.path === '.github/workflows/ci.yml' && run.name === 'Continuous integration', 'CI_SOURCE_NOT_MAIN_PUSH');
  requireThat(run.status === 'completed' && run.conclusion === 'success', 'CI_NOT_SUCCESSFUL');
  requireThat(shaPattern.test(run.head_sha) && run.head_sha === mainSha, 'STALE_OR_INVALID_SOURCE');
  requireThat(!targets.excludedCommits.includes(run.head_sha), 'CURRENT_MERGE_NOT_AUTHORIZED');
  requireThat(jobs.length === requiredJobs.length && new Set(jobs.map(j => j.name)).size === jobs.length &&
    jobs.every(j => j.run_id === run.id && j.run_attempt === run.run_attempt) &&
    requiredJobs.every(name => jobs.some(j => j.name === name && j.status === 'completed' &&
      j.conclusion === 'success')), 'CI_INVENTORY_NOT_QUALIFIED');
  return { version: 1, repository: targets.repository, sha: run.head_sha,
    ciRunId: String(run.id), ciRunAttempt: run.run_attempt, ciUrl: run.html_url };
}

export function policyDigest(policy) {
  requireThat(policy?.version === 2 && /^[a-z0-9-]{1,80}$/.test(policy.epoch) &&
    policy.profile === targets.profile && policy.baseline === 'automatic' &&
    Object.keys(policy).every(key => ['version', 'epoch', 'profile', 'baseline'].includes(key)),
  'STANDING_POLICY_INVALID');
  const canonical = value => value && typeof value === 'object' ?
    (Array.isArray(value) ? value.map(canonical) :
      Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))) : value;
  return createHash('sha256').update(JSON.stringify(canonical(policy))).digest('hex');
}

export function freezeCandidate(qualified, env, policy = standingPolicy) {
  requireThat(env.GITHUB_REPOSITORY === execution.repository && positiveId(env.GITHUB_RUN_ID) &&
    positiveId(env.GITHUB_RUN_ATTEMPT) && positiveAttempt(Number(env.GITHUB_RUN_ATTEMPT)) &&
    env.GITHUB_REF === 'refs/heads/main' &&
    env.GITHUB_WORKFLOW_REF === `${execution.repository}/.github/workflows/${execution.workflow}@refs/heads/main` &&
    (!external || (shaPattern.test(env.GITHUB_SHA) && env.GITHUB_WORKFLOW_SHA === env.GITHUB_SHA)),
  'RELEASE_CONTEXT_UNVERIFIABLE');
  const candidate = { ...qualified, version: external ? 4 : 3,
    ...(external ? { executorRepository: execution.repository, executorSha: env.GITHUB_SHA } : {}), releaseRunId: env.GITHUB_RUN_ID,
    releaseRunAttempt: Number(env.GITHUB_RUN_ATTEMPT), policySha256: policyDigest(policy), ...targetIdentity };
  validateReleaseIdentity(candidate);
  return Object.freeze(candidate);
}

function validateReleaseIdentity(identity) {
  requireThat(identity?.version === (external ? 4 : 3) &&
    (!external || (identity.executorRepository === execution.repository && shaPattern.test(identity.executorSha))) && identity.repository === targets.repository &&
    shaPattern.test(identity.sha) && positiveId(identity.ciRunId) && positiveAttempt(identity.ciRunAttempt) &&
    positiveId(identity.releaseRunId) && positiveAttempt(identity.releaseRunAttempt) &&
    /^[a-f0-9]{64}$/.test(identity.policySha256) &&
    Object.entries(targetIdentity).every(([key, value]) => identity[key] === value),
  'RELEASE_IDENTITY_UNVERIFIABLE');
}

export function releaseKey(identity) {
  validateReleaseIdentity(identity);
  return createHash('sha256').update(JSON.stringify(
    releaseIdentityFields.map(key => [key, identity[key]]))).digest('hex');
}

export function verifyCandidate(candidate, qualified, archive, trustedArchive) {
  validateReleaseIdentity(candidate);
  for (const key of releaseIdentityFields)
    requireThat(candidate[key] === qualified[key], 'CANDIDATE_PROVENANCE_MISMATCH');
  requireThat(candidate.sourceSha256 === createHash('sha256').update(archive).digest('hex'),
    'CANDIDATE_CONTENT_MISMATCH');
  requireThat(Buffer.isBuffer(trustedArchive) && archive.equals(trustedArchive),
    'CANDIDATE_NOT_QUALIFIED_GIT_SOURCE');
}

export function validatePolicy(qualified, env, policy = standingPolicy) {
  validateReleaseIdentity(qualified);
  requireThat(env.GITHUB_REPOSITORY === execution.repository && env.GITHUB_RUN_ID === qualified.releaseRunId &&
    env.GITHUB_RUN_ATTEMPT === String(qualified.releaseRunAttempt) &&
    env.GITHUB_REF === 'refs/heads/main' &&
    env.GITHUB_WORKFLOW_REF === `${execution.repository}/.github/workflows/${execution.workflow}@refs/heads/main` &&
    (!external || (env.GITHUB_SHA === qualified.executorSha && env.GITHUB_WORKFLOW_SHA === qualified.executorSha)),
  'TRUSTED_RELEASE_CONTEXT_REQUIRED');
  requireThat(qualified.policySha256 === policyDigest(policy), 'STANDING_POLICY_CHANGED');
  requireThat(env.RENDER_API_KEY?.trim() && env.VERCEL_TOKEN?.trim(), 'DEPLOYMENT_CREDENTIALS_REQUIRED');
}

export function validateEnvironment(environment, branches) {
  requireThat(environment.name === targets.environment && environment.can_admins_bypass === false &&
    Array.isArray(environment.protection_rules) &&
    environment.protection_rules.every(r => r.type === 'branch_policy') &&
    environment.deployment_branch_policy?.custom_branch_policies === true &&
    environment.deployment_branch_policy?.protected_branches === false && branches.length === 1 &&
    branches[0].name === 'main' && branches[0].type === 'branch', 'UNATTENDED_MAIN_ONLY_ENVIRONMENT_REQUIRED');
}

// Owner-controlled merge governance, not an independently protected verifier.
// One non-bypassable ruleset must enforce all mandatory checks and history safety.
export function validateMainGovernance(rules, ruleset) {
  requireThat(Array.isArray(rules) && rules.length > 0 && rules.length < 100 &&
    rules.every(r => ['Repository', 'Organization'].includes(r.ruleset_source_type) && positiveAttempt(r.ruleset_id)),
  'MAIN_GOVERNANCE_UNVERIFIABLE');
  const checksRequired = r => r.type === 'required_status_checks' &&
    r.parameters?.strict_required_status_checks_policy === true &&
    r.parameters.do_not_enforce_on_create === false &&
    Array.isArray(r.parameters.required_status_checks) && requiredJobs.every(name => {
      const matches = r.parameters.required_status_checks.filter(c => c.context === name);
      return matches.length === 1 && matches[0].integration_id === 15368;
    });
  requireThat(ruleset?.source_type === 'Repository' && ruleset.source === targets.repository &&
    positiveAttempt(ruleset.id) && ruleset.enforcement === 'active' && ruleset.target === 'branch' &&
    Array.isArray(ruleset.conditions?.ref_name?.include) && ruleset.conditions.ref_name.include.length === 1 &&
    ruleset.conditions.ref_name.include[0] === 'refs/heads/main' &&
    Array.isArray(ruleset.conditions.ref_name.exclude) && ruleset.conditions.ref_name.exclude.length === 0 &&
    Array.isArray(ruleset.bypass_actors), 'MAIN_RULESET_CUSTODY_UNVERIFIABLE');
  requireThat(ruleset.bypass_actors.length === 0, 'MAIN_RULESET_BYPASS_FORBIDDEN');
  const effective = rules.filter(r => r.ruleset_id === ruleset.id &&
    r.ruleset_source_type === ruleset.source_type && r.ruleset_source === ruleset.source);
  requireThat(Array.isArray(ruleset.rules) && [effective, ruleset.rules].every(rows =>
    ['deletion', 'non_fast_forward'].every(type => rows.some(r => r.type === type)) &&
    rows.some(checksRequired)), 'MAIN_CI_GOVERNANCE_REQUIRED');
}

export async function validateInfrastructure(api, identity) {
  const rules = await api.gh('/rules/branches/main?per_page=100');
  requireThat(Array.isArray(rules) && rules.length > 0 && rules.length < 100,
    'MAIN_GOVERNANCE_UNVERIFIABLE');
  const checkRules = rules.filter(r => r.type === 'required_status_checks' &&
    r.ruleset_source_type === 'Repository' && r.ruleset_source === targets.repository && positiveAttempt(r.ruleset_id));
  requireThat(checkRules.length === 1, 'MAIN_CI_GOVERNANCE_REQUIRED');
  // GitHub hides bypass_actors without ruleset write access. Missing evidence
  // fails closed; never grant the release runner administration to evade this.
  const ruleset = await api.gh(`/rulesets/${checkRules[0].ruleset_id}`);
  validateMainGovernance(rules, ruleset);
  const environment = await api.gh(`/environments/${targets.environment}`);
  const page = await api.gh(`/environments/${targets.environment}/deployment-branch-policies?per_page=100`);
  requireThat(page.total_count === page.branch_policies?.length, 'ENVIRONMENT_BRANCH_INVENTORY_INCOMPLETE');
  validateEnvironment(environment, page.branch_policies);
  if (external) {
    validateReleaseIdentity(identity);
    const head = await api.executor('/git/ref/heads/main');
    requireThat(head.object?.sha === identity.executorSha, 'STALE_EXECUTOR_REVISION');
    const current = await api.executor(`/actions/runs/${identity.releaseRunId}`);
    validateReleaseRun(current);
    requireThat(String(current.id) === identity.releaseRunId && current.head_sha === identity.executorSha &&
      current.run_attempt === identity.releaseRunAttempt && current.status === 'in_progress',
      'EXECUTOR_ATTEMPT_CHANGED');
    const environment = await api.executor(`/environments/${targets.environment}`);
    const page = await api.executor(`/environments/${targets.environment}/deployment-branch-policies?per_page=100`);
    requireThat(page.total_count === page.branch_policies?.length, 'ENVIRONMENT_BRANCH_INVENTORY_INCOMPLETE');
    validateEnvironment(environment, page.branch_policies);
    const rules = await api.executor('/rules/branches/main?per_page=100');
    requireThat(Array.isArray(rules) && rules.length > 0 && rules.length < 100, 'EXECUTOR_HISTORY_PROTECTION_REQUIRED');
    const ids = [...new Set(rules.map(r => r.ruleset_id))];
    let protectedHistory = false;
    for (const id of ids) {
      requireThat(positiveAttempt(id), 'EXECUTOR_HISTORY_PROTECTION_REQUIRED');
      const rule = await api.executor(`/rulesets/${id}`);
      if (rule.enforcement === 'active' && rule.source === execution.repository &&
        rule.source_type === 'Repository' && rule.target === 'branch' &&
        Array.isArray(rule.bypass_actors) && rule.bypass_actors.length === 0 &&
        ['deletion', 'non_fast_forward'].every(type => rule.rules?.some(r => r.type === type) &&
          rules.some(r => r.type === type && r.ruleset_id === id))) protectedHistory = true;
    }
    requireThat(protectedHistory, 'EXECUTOR_HISTORY_PROTECTION_REQUIRED');
    await validateLegacyHistory(api);
  }
}


export async function validateLegacyHistory(api) {
  if (!external) return;
  const runs = [];
  let count;
  for (let page = 1; page <= 20; page++) {
    const result = await api.gh(`/actions/workflows/release.yml/runs?branch=main&per_page=100&page=${page}`);
    requireThat(Number.isSafeInteger(result.total_count) && result.total_count >= 1 &&
      Array.isArray(result.workflow_runs) && (count === undefined || count === result.total_count),
      'LEGACY_RELEASE_HISTORY_REQUIRES_RECONCILIATION');
    count = result.total_count;
    runs.push(...result.workflow_runs);
    requireThat(runs.length <= count && new Set(runs.map(r => r.id)).size === runs.length,
      'LEGACY_RELEASE_HISTORY_REQUIRES_RECONCILIATION');
    if (runs.length === count) break;
    requireThat(result.workflow_runs.length === 100 && page < 20, 'LEGACY_RELEASE_HISTORY_INCOMPLETE');
  }
  // This existing first run was observed before takeover. Losing it or a later
  // run cannot be interpreted as absence of historical provider activity.
  requireThat(positiveId(execution.legacyFirstRunId) && runs.some(r =>
    String(r.id) === execution.legacyFirstRunId && r.run_number === 1) &&
    runs.every(r => positiveAttempt(r.run_number) && r.run_number <= count) &&
    new Set(runs.map(r => r.run_number)).size === count, 'LEGACY_RELEASE_HISTORY_GAP_RECONCILE');
  for (const run of runs) {
    requireThat(run.repository?.full_name === targets.repository && run.head_repository?.full_name === targets.repository &&
      run.path === '.github/workflows/release.yml' && run.head_branch === 'main' && run.event === 'workflow_run' &&
      (run.status === 'completed' || run.name === 'Automatic deployment trigger') &&
      positiveAttempt(run.run_attempt) && run.run_attempt <= 20,
      'LEGACY_RELEASE_HISTORY_REQUIRES_RECONCILIATION');
    for (let attempt = 1; attempt <= run.run_attempt; attempt++) {
      const page = await api.gh(`/actions/runs/${run.id}/attempts/${attempt}/jobs?per_page=100`);
      requireThat(page.total_count === page.jobs?.length, 'LEGACY_RELEASE_HISTORY_REQUIRES_RECONCILIATION');
      if (run.name === 'Automatic deployment trigger') {
        requireThat(page.jobs.length === 1 && page.jobs[0].name === 'Dispatch qualified executor',
          'LEGACY_RELEASE_HISTORY_REQUIRES_RECONCILIATION');
        continue;
      }
      requireThat(run.name === 'Qualified production release' && page.jobs.length === 2,
        'LEGACY_RELEASE_HISTORY_REQUIRES_RECONCILIATION');
      const production = page.jobs.find(j => ['Unattended recovery release', 'Authorized recovery release'].includes(j.name));
      requireThat(production && (production.conclusion === 'skipped' || production.steps?.some(s =>
        ['Revalidate authority, providers, source and recovery before deployment',
         'Revalidate policy, provenance, providers and recovery before automatic deployment'].includes(s.name) &&
        s.conclusion === 'skipped')), 'LEGACY_RELEASE_HISTORY_REQUIRES_RECONCILIATION');
    }
  }
}

export async function validateCandidateProvenance(api, candidate) {
  const list = await api.gh(`/commits/${candidate.sha}/pulls?per_page=100`);
  requireThat(Array.isArray(list) && list.length < 100, 'MERGED_PR_INVENTORY_UNVERIFIABLE');
  const matches = list.filter(p => p.merge_commit_sha === candidate.sha && p.merged_at &&
    p.base?.ref === 'main' && p.base.repo?.full_name === targets.repository);
  requireThat(matches.length === 1 && positiveAttempt(matches[0].number), 'QUALIFIED_MERGED_MAIN_PR_REQUIRED');
  const path = `/pulls/${matches[0].number}`;
  const pr = await api.gh(path);
  requireThat(pr.merged === true && pr.state === 'closed' && pr.merge_commit_sha === candidate.sha &&
    pr.base?.ref === 'main' && pr.base.repo?.full_name === targets.repository && shaPattern.test(pr.head?.sha) &&
    Number.isFinite(Date.parse(pr.merged_at)) && positiveAttempt(pr.user?.id), 'MERGED_PR_PROVENANCE_UNVERIFIABLE');
  const current = await api.gh(path);
  requireThat(current.merged === true && current.state === 'closed' && current.merge_commit_sha === pr.merge_commit_sha &&
    current.head?.sha === pr.head.sha && current.merged_at === pr.merged_at &&
    current.user?.id === pr.user.id && current.base?.ref === 'main' &&
    current.base.repo?.full_name === targets.repository, 'MERGED_PR_EVIDENCE_CHANGED');
}

export function validateRender(service, rows) {
  const d = service.serviceDetails;
  requireThat(service.id === targets.render.id && service.name === targets.render.name &&
    service.repo?.replace(/\.git$/, '') === `https://github.com/${targets.repository}` &&
    service.branch === 'main' && service.suspended === 'not_suspended' &&
    service.autoDeployTrigger === 'off' && service.autoDeploy === 'no' && !service.rootDir &&
    d?.runtime === 'docker' && d.healthCheckPath === '/api/health' &&
    d.envSpecificDetails?.dockerContext === '.' &&
    d.envSpecificDetails?.dockerfilePath === './docker/api/Dockerfile' &&
    d.envSpecificDetails?.preDeployCommand === '' && d.envSpecificDetails?.dockerCommand === '',
  'RENDER_TARGET_OR_RECOVERY_CONFIGURATION_DRIFT');
  const vars = Object.fromEntries(rows.map(x => [x.envVar.key, x.envVar.value]));
  requireThat(vars.ASPNETCORE_ENVIRONMENT === 'Production' && vars.App__Recovery__Enabled === 'true',
    'ACTIVE_RECOVERY_BASELINE_REQUIRED');
  for (const key of ['App__WeeklyCommissions__Enabled', 'App__EntryMonthlyObligations__Enabled',
    'App__FinancialOperations__Enabled', 'App__BackgroundJobs__Enabled', 'AQGreenV2Demo__Enabled',
    'AQGreenV2Pilot__Enabled', 'App__AQGreenV2__Commissioning__Enabled', 'SEED_DEMO_DATA', 'Bird__Enabled'])
    requireThat(vars[key] === 'false', 'RESTRICTED_OPERATION_NOT_HELD');
  for (const key of ['Yoco__Mode', 'Yoco__SecretKey', 'Yoco__WebhookSecret', 'Bird__ApiKey'])
    requireThat(!vars[key]?.trim(), 'RECOVERY_PROVIDER_ISOLATION_REQUIRED');
}

export function validateVercel(project, repoId) {
  requireThat(project.id === targets.vercel.id && project.accountId === targets.vercel.teamId &&
    project.name === targets.vercel.name && project.rootDirectory === targets.vercel.rootDirectory &&
    project.nodeVersion === '24.x' && !project.commandForIgnoringBuildStep &&
    project.link?.type === 'github' && String(project.link.repoId) === String(repoId) &&
    project.link.productionBranch === 'main' && project.link.org === 'aqua-lifestyle' &&
    project.link.repo === 'aqua-lifestyle' && project.autoAssignCustomDomains === true &&
    !project.buildCommand && !project.installCommand && !project.outputDirectory,
  'VERCEL_TARGET_OR_GIT_CONFIGURATION_DRIFT');
}

export function validateVercelVariables(rows) {
  for (const [key, expected] of [['NEXT_PUBLIC_ABP_API_URL', targets.vercel.publicApiUrl],
    ['NEXT_PUBLIC_DEFAULT_TENANT_NAME', targets.vercel.defaultTenantName]]) {
    const selected = rows.filter(x => x.key === key && x.target?.includes('production'));
    requireThat(selected.length === 1 && !selected[0].gitBranch &&
      selected[0].value === expected, 'VERCEL_PUBLIC_BUILD_CONFIGURATION_UNVERIFIED');
  }
}

export function validateHealth(response, sha) {
  const j = response.body.result ?? response.body;
  requireThat(response.status === 200 && j.status === 'Healthy' && j.buildId === sha &&
    j.environment === 'Production' && j.databaseStatus === 'Healthy' && j.redisStatus === 'Healthy' &&
    j.dataProtectionKeyStoreStatus === 'Healthy' && response.recovery === 'true',
  'API_REVISION_OR_RECOVERY_READINESS_FAILED');
}

// No configurable provider URL, response bodies, request headers or raw errors are logged.
// POSTs are never automatically retried: a lost response requires provider reconciliation.
export function clients(env, fetcher = fetch) {
  async function request(base, token, route, body) {
    requireThat(token, 'PROVIDER_CREDENTIAL_UNAVAILABLE');
    let response;
    try {
      response = await fetcher(base + route, { method: body ? 'POST' : 'GET', redirect: 'error',
        signal: AbortSignal.timeout(30_000), headers: { Authorization: `Bearer ${token}`,
          Accept: 'application/json', 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}) });
    } catch { throw new ReleaseFailure(body ? 'AMBIGUOUS_PROVIDER_POST_INSPECT_BEFORE_RETRY' : 'PROVIDER_READ_FAILED'); }
    requireThat(response.ok, body ? 'PROVIDER_POST_REJECTED_INSPECT_BEFORE_RETRY' : 'PROVIDER_READ_REJECTED');
    try { return await response.json(); } catch { throw new ReleaseFailure('INVALID_PROVIDER_RESPONSE'); }
  }
  return {
    gh: (route, body) => request(`https://api.github.com/repos/${targets.repository}`, env.GH_TOKEN, route, body),
    executor: (route, body) => request(`https://api.github.com/repos/${execution.repository}`, env.GH_TOKEN, route, body),
    render: (route, body) => request('https://api.render.com/v1', env.RENDER_API_KEY, route, body),
    vercel: (route, body) => request('https://api.vercel.com', env.VERCEL_TOKEN,
      route + (route.includes('?') ? '&' : '?') + `teamId=${targets.vercel.teamId}`, body),
    health: async () => {
      let r;
      try { r = await fetcher(targets.render.healthUrl, { redirect: 'error',
        signal: AbortSignal.timeout(30_000), headers: { 'Cache-Control': 'no-cache' } });
        return { status: r.status, recovery: r.headers.get('x-aqua-recovery-suspended'), body: await r.json() };
      } catch { throw new ReleaseFailure('API_HEALTH_UNAVAILABLE'); }
    },
    web: async () => {
      try { const r = await fetcher(targets.vercel.productionUrl, { redirect: 'error',
        signal: AbortSignal.timeout(30_000), headers: { 'Cache-Control': 'no-cache' } });
        requireThat(r.status === 200, 'WEB_READINESS_FAILED');
      } catch { throw new ReleaseFailure('WEB_READINESS_FAILED'); }
    }
  };
}

export async function qualify(api, runId) {
  requireThat(/^\d+$/.test(String(runId)), 'CI_RUN_ID_INVALID');
  const run = await api.gh(`/actions/runs/${runId}`);
  requireThat(String(run.id) === String(runId) && positiveAttempt(run.run_attempt), 'CI_IDENTITY_UNVERIFIABLE');
  const page = await api.gh(`/actions/runs/${runId}/attempts/${run.run_attempt}/jobs?per_page=100`);
  requireThat(page.total_count === page.jobs?.length, 'CI_INVENTORY_INCOMPLETE');
  if (external) for (const job of page.jobs ?? []) {
    const prefix = `https://api.github.com/repos/${targets.repository}/check-runs/`;
    const id = job.check_run_url?.startsWith(prefix) ? job.check_run_url.slice(prefix.length) : '';
    requireThat(positiveId(id) && Number.isSafeInteger(Number(id)), 'CI_CHECK_IDENTITY_UNVERIFIABLE');
    const check = await api.gh(`/check-runs/${id}`);
    requireThat(String(check.id) === id && check.app?.id === 15368 && check.head_sha === run.head_sha &&
      check.name === job.name && check.status === 'completed' && check.conclusion === 'success',
      'CI_TRUSTED_APP_REQUIRED');
  }
  const main = await api.gh('/git/ref/heads/main');
  const qualified = validateRun(run, page.jobs, main.object.sha);
  // The latest run can change while its attempt-specific jobs are being read.
  const current = await api.gh(`/actions/runs/${runId}`);
  requireThat(current.id === run.id && current.run_attempt === run.run_attempt, 'CI_QUALIFICATION_CHANGED');
  const currentQualified = validateRun(current, page.jobs, main.object.sha);
  requireThat(sourceIdentityFields.every(key => currentQualified[key] === qualified[key]), 'CI_QUALIFICATION_CHANGED');
  return Object.freeze(qualified);
}

export async function requalify(api, frozen) {
  const fresh = await qualify(api, frozen.ciRunId);
  requireThat(sourceIdentityFields.every(key => fresh[key] === frozen[key]), 'CI_QUALIFICATION_CHANGED');
  return fresh;
}

export function createAuditWriter(identity, emit) {
  validateReleaseIdentity(identity);
  const known = {};
  return row => {
    for (const key of ['renderDeployId', 'vercelDeployId', 'renderReleaseRunAttempt', 'vercelReleaseRunAttempt',
      'baselineRenderDeployId', 'baselineVercelDeployId', 'baselineRenderSha', 'baselineVercelSha'])
      if (row[key] !== undefined) known[key] = row[key];
    emit({ ...row, ...Object.fromEntries(releaseIdentityFields.map(key => [key, identity[key]])), ...known });
  };
}

export function validateResumeReceipt(rows, frozen) {
  requireThat(frozen.releaseRunAttempt > 1 && rows.length > 0 && rows.length <= 100,
    'RESUME_RECEIPT_REQUIRED');
  const known = {};
  let attempt = 1;
  const pending = new Set();
  for (const row of rows) {
    validateReleaseIdentity(row);
    requireThat(releaseIdentityFields.filter(key => key !== 'releaseRunAttempt')
      .every(key => row[key] === frozen[key]) && row.releaseRunAttempt >= attempt &&
      row.releaseRunAttempt <= attempt + 1 && row.releaseRunAttempt < frozen.releaseRunAttempt,
    'RESUME_RECEIPT_IDENTITY_MISMATCH');
    attempt = row.releaseRunAttempt;
    requireThat(['evidence-selected', 'baseline-selected', 'admitted', 'render-requesting', 'render-requested',
      'render-ready', 'vercel-requesting', 'vercel-requested', 'verified', 'failed'].includes(row.phase),
      'RESUME_RECEIPT_UNVERIFIABLE');
    requireThat(row.phase !== 'verified', 'RELEASE_ALREADY_VERIFIED');
    requireThat(!['AMBIGUOUS_PROVIDER_POST_INSPECT_BEFORE_RETRY', 'INVALID_PROVIDER_RESPONSE',
      'RENDER_DEPLOYMENT_ID_UNAVAILABLE', 'VERCEL_DEPLOYMENT_ID_UNAVAILABLE',
      'PROVIDER_POST_REJECTED_INSPECT_BEFORE_RETRY', 'UNEXPECTED_RELEASE_ERROR'].includes(row.code),
    'AMBIGUOUS_PRIOR_REQUEST_REQUIRES_RECONCILIATION');
    for (const provider of ['render', 'vercel']) {
      if (row.phase === `${provider}-requesting`) pending.add(provider);
      if (row.phase === `${provider}-requested` && row[`${provider}DeployId`]) pending.delete(provider);
    }
    for (const key of ['renderDeployId', 'vercelDeployId', 'renderReleaseRunAttempt', 'vercelReleaseRunAttempt']) {
      if (row[key] === undefined) continue;
      requireThat(known[key] === undefined || known[key] === row[key], 'CONTRADICTORY_RESUME_RECEIPT');
      known[key] = row[key];
    }
  }
  requireThat(rows[0].releaseRunAttempt === 1 && attempt === frozen.releaseRunAttempt - 1,
    'RESUME_RECEIPT_CHAIN_INCOMPLETE');
  requireThat(pending.size === 0, 'AMBIGUOUS_PRIOR_REQUEST_REQUIRES_RECONCILIATION');
  for (const provider of ['render', 'vercel']) {
    const id = known[`${provider}DeployId`], attempt = known[`${provider}ReleaseRunAttempt`];
    requireThat(id === undefined ? attempt === undefined :
      (positiveAttempt(attempt) && attempt < frozen.releaseRunAttempt &&
        (provider === 'render' ? /^dep-[a-z0-9]+$/ : /^dpl_[A-Za-z0-9]+$/).test(id)),
    'RESUME_RECEIPT_UNVERIFIABLE');
  }
  requireThat(!known.vercelDeployId || known.renderDeployId, 'CONTRADICTORY_RESUME_RECEIPT');
  return Object.freeze(known);
}

export async function auditArtifact(api, run, attempt) {
  const inventory = await releaseApi(api)(`/actions/runs/${run.id}/artifacts?per_page=100`);
  requireThat(inventory.total_count === inventory.artifacts?.length, 'AUDIT_ARTIFACT_INVENTORY_INCOMPLETE');
  const name = `production-release-audit-${run.id}-${attempt}`;
  const selected = inventory.artifacts.filter(a => a.name === name);
  requireThat(selected.length === 1 && !selected[0].expired && positiveId(String(selected[0].id)) &&
    selected[0].workflow_run?.id === run.id && selected[0].workflow_run?.head_sha === run.head_sha,
  'TRUSTED_AUDIT_ARTIFACT_REQUIRED');
  return { artifactId: String(selected[0].id), runId: String(run.id), runAttempt: attempt, sha: run.head_sha };
}

function validateReleaseRun(run) {
  requireThat(Number.isSafeInteger(run.id) && positiveId(String(run.id)) && positiveAttempt(run.run_attempt) &&
    positiveAttempt(run.run_number) && shaPattern.test(run.head_sha) &&
    run.repository?.full_name === execution.repository && run.head_repository?.full_name === execution.repository &&
    run.event === execution.event && run.head_branch === 'main' &&
    run.path === `.github/workflows/${execution.workflow}` && run.name === execution.name,
  'RELEASE_WORKFLOW_PROVENANCE_REQUIRED');
}

async function releaseProductionJob(api, run, attempt) {
  const page = await releaseApi(api)(`/actions/runs/${run.id}/attempts/${attempt}/jobs?per_page=100`);
  const jobs = page.jobs;
  requireThat(page.total_count === jobs?.length && jobs.length === 2 &&
    new Set(jobs.map(j => j.name)).size === 2 &&
    jobs.every(j => j.run_id === run.id && j.run_attempt === attempt && j.status === 'completed'),
  'PRIOR_RELEASE_EXECUTION_UNVERIFIABLE');
  const candidate = jobs.find(j => j.name === 'Qualify immutable source candidate');
  const production = jobs.find(j => ['Unattended recovery release', 'Authorized recovery release'].includes(j.name));
  requireThat(candidate && production && (production.conclusion !== 'success' || candidate.conclusion === 'success'),
    'PRIOR_RELEASE_EXECUTION_UNVERIFIABLE');
  return production;
}

export async function evidencePlan(api, candidate, policy) {
  const current = await releaseApi(api)(`/actions/runs/${candidate.releaseRunId}`);
  validateReleaseRun(current);
  requireThat(current.head_sha === (external ? candidate.executorSha : candidate.sha) && current.run_attempt === candidate.releaseRunAttempt &&
    candidate.policySha256 === policyDigest(policy), 'RELEASE_CONTEXT_OR_POLICY_EPOCH_MISMATCH');
  const runs = [];
  let count;
  for (let page = 1; page <= 20; page++) {
    const result = await releaseApi(api)(`/actions/workflows/${execution.workflow}/runs?branch=main&event=${execution.event}&per_page=100&page=${page}`);
    requireThat(Number.isSafeInteger(result.total_count) && Array.isArray(result.workflow_runs) &&
      (count === undefined || count === result.total_count), 'RELEASE_HISTORY_UNVERIFIABLE');
    count = result.total_count;
    runs.push(...result.workflow_runs);
    requireThat(new Set(runs.map(r => r.id)).size === runs.length && runs.length <= count,
      'RELEASE_HISTORY_UNVERIFIABLE');
    if (runs.length === count) break;
    requireThat(result.workflow_runs.length === 100 && page < 20, 'RELEASE_HISTORY_INCOMPLETE');
  }
  for (const run of runs) validateReleaseRun(run);
  const era = runs.filter(r => r.run_number <= current.run_number);
  requireThat(era.length === current.run_number &&
    new Set(era.map(r => r.run_number)).size === era.length &&
    era.some(r => r.id === current.id && r.run_attempt === current.run_attempt), 'RELEASE_HISTORY_GAP_RECONCILE');
  const successful = [];
  for (const run of runs.filter(r => r.id !== current.id)) {
    requireThat(run.status === 'completed', 'CONCURRENT_RELEASE_RUN');
    requireThat(run.run_attempt <= 20, 'RELEASE_ATTEMPT_HISTORY_TOO_LARGE');
    for (let attempt = run.run_attempt; attempt >= 1; attempt--) {
      const past = attempt === run.run_attempt ? run : await releaseApi(api)(`/actions/runs/${run.id}/attempts/${attempt}`);
      validateReleaseRun(past);
      requireThat(past.id === run.id && past.run_attempt === attempt && past.head_sha === run.head_sha &&
        past.run_number === run.run_number && past.status === 'completed', 'RELEASE_ATTEMPT_HISTORY_UNVERIFIABLE');
      if (past.conclusion === 'success') {
        const production = await releaseProductionJob(api, run, attempt);
        // GitHub can conclude an entirely skipped workflow successfully. It is
        // positive evidence of no deployment, never a VERIFIED predecessor.
        if (production.conclusion === 'skipped') continue;
        requireThat(production.conclusion === 'success', 'RELEASE_SUCCESS_WITHOUT_VERIFICATION');
        successful.push(past); break;
      }
    }
  }
  requireThat(successful.every(r => r.run_number < current.run_number), 'NEWER_RELEASE_ALREADY_COMPLETED');
  const latest = successful.sort((a, b) => b.run_number - a.run_number)[0];
  for (const run of runs.filter(r => r.id !== current.id &&
    r.run_number > (latest?.run_number ?? 0))) {
    // A failed prior run may have submitted a request whose history is not visible
    // yet. Only a positively unexecuted provider step is safe to supersede.
    for (let attempt = 1; attempt <= run.run_attempt; attempt++) {
      const production = await releaseProductionJob(api, run, attempt);
      const deployStep = production?.name === 'Authorized recovery release' ?
        'Revalidate authority, providers, source and recovery before deployment' :
        'Revalidate policy, provenance, providers and recovery before automatic deployment';
      requireThat(production && (production.conclusion === 'skipped' ||
        production.steps?.some(s => s.name === deployStep && s.conclusion === 'skipped')),
      'UNVERIFIED_PRIOR_RELEASE_REQUIRES_RECONCILIATION');
    }
  }
  requireThat(candidate.releaseRunAttempt <= 20, 'RELEASE_ATTEMPT_HISTORY_TOO_LARGE');
  const resumeChain = [];
  for (let attempt = 1; attempt < candidate.releaseRunAttempt; attempt++)
    resumeChain.push(await auditArtifact(api, current, attempt));
  return { policySha256: candidate.policySha256,
    baseline: latest ? await auditArtifact(api, latest, latest.run_attempt) : null,
    resume: resumeChain.at(-1) ?? null, resumeChain };
}

export function validateBaselineReceipt(rows, descriptor, candidate) {
  requireThat(rows.length > 0 && rows.length <= 100, 'VERIFIED_BASELINE_RECEIPT_REQUIRED');
  const first = rows[0], last = rows.at(-1);
  for (const row of rows) {
    validateReleaseIdentity(row);
    requireThat(releaseIdentityFields.every(key => row[key] === first[key]) &&
      row.releaseRunId === descriptor.runId && row.releaseRunAttempt === descriptor.runAttempt &&
      (external ? row.executorSha === descriptor.sha : row.sha === descriptor.sha) && row.policySha256 === candidate.policySha256,
    'BASELINE_RECEIPT_PROVENANCE_MISMATCH');
  }
  requireThat(last.phase === 'verified' && last.renderSha === last.sha && last.vercelSha === last.sha && rows.filter(r => r.phase === 'verified').length === 1 &&
    /^dep-[a-z0-9]+$/.test(last.renderDeployId) && /^dpl_[A-Za-z0-9]+$/.test(last.vercelDeployId) &&
    ['renderReleaseRunAttempt', 'vercelReleaseRunAttempt'].every(key =>
      positiveAttempt(last[key]) && last[key] <= last.releaseRunAttempt), 'VERIFIED_BASELINE_RECEIPT_REQUIRED');
  for (const key of ['renderDeployId', 'vercelDeployId', 'renderReleaseRunAttempt', 'vercelReleaseRunAttempt'])
    requireThat(rows.every(row => row[key] === undefined || row[key] === last[key]), 'CONTRADICTORY_BASELINE_RECEIPT');
  return Object.freeze({ renderDeployId: last.renderDeployId, renderSha: last.sha,
    vercelDeployId: last.vercelDeployId, vercelSha: last.sha, origin: last });
}

export async function waitFor(read, state, good, pending, options) {
  const { attempts = 120, pause = () => new Promise(resolve => setTimeout(resolve, 10_000)) } = options ?? {};
  for (let i = 0; i < attempts; i++) {
    const value = await read();
    if (state(value) === good) return value;
    requireThat(pending.has(state(value)), 'PROVIDER_DEPLOYMENT_FAILED_INSPECT_RELEASE_REPORT');
    if (i + 1 < attempts) await pause();
  }
  throw new ReleaseFailure('PROVIDER_TIMEOUT_RECONCILE_BEFORE_RETRY');
}

export async function deploymentHistory(api, provider) {
  const result = [], seen = new Set();
  let cursor;
  // Fail closed on an unexpectedly large/inconsistent inventory. Never interpret
  // a truncated first page as absence of a concurrent/previous deployment.
  for (let page = 0; page < 20; page++) {
    let rows, next;
    if (provider === 'render') {
      const data = await api.render(`/services/${targets.render.id}/deploys?limit=100` +
        (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''));
      rows = data.map(x => x.deploy);
      if (data.length === 100) next = data.at(-1).cursor;
      requireThat(rows.every(x => renderStates.has(x.status)), 'UNKNOWN_RENDER_DEPLOYMENT_STATE');
      requireThat(data.length !== 100 || next, 'RENDER_HISTORY_INCOMPLETE');
    } else {
      const data = await api.vercel(`/v6/deployments?projectId=${targets.vercel.id}&limit=100` +
        (cursor ? `&until=${encodeURIComponent(cursor)}` : ''));
      rows = data.deployments; next = data.pagination?.next;
      requireThat(rows.every(x => vercelStates.has(x.state ?? x.readyState)), 'UNKNOWN_VERCEL_DEPLOYMENT_STATE');
    }
    result.push(...rows);
    if (!next) return result;
    requireThat(!seen.has(String(next)), 'PROVIDER_HISTORY_CURSOR_REPEATED');
    seen.add(String(next)); cursor = next;
  }
  throw new ReleaseFailure('PROVIDER_HISTORY_INVENTORY_TOO_LARGE');
}

export async function deploy(api, qualified, policy, report, options = {}) {
  validateReleaseIdentity(qualified);
  const guard = async () => {
    validatePolicy(qualified, options.env ?? process.env, policy);
    await requalify(api, qualified);
    await validateInfrastructure(api, qualified);
    await validateCandidateProvenance(api, qualified);
  };
  await guard();
  const plan = options.evidencePlan;
  requireThat(plan && plan.policySha256 === qualified.policySha256, 'FROZEN_EVIDENCE_PLAN_REQUIRED');
  requireThat(!!plan.baseline === !!options.baselineRows, 'BASELINE_RECEIPT_REQUIRED');
  requireThat(qualified.releaseRunAttempt === 1 ? !plan.resume && !options.receiptRows :
    plan.resume?.runId === qualified.releaseRunId && plan.resume.runAttempt === qualified.releaseRunAttempt - 1 &&
    plan.resume.sha === (external ? qualified.executorSha : qualified.sha) && options.receiptRows, 'RESUME_RECEIPT_REQUIRED');
  const prior = options.receiptRows ? validateResumeReceipt(options.receiptRows, qualified) : {};
  const servicePath = `/services/${targets.render.id}`;
  const projectPath = `/v9/projects/${targets.vercel.id}`;
  const repository = await api.gh('');
  const readRender = async () => {
    const service = await api.render(servicePath);
    const rows = await api.render(`${servicePath}/env-vars?limit=100`);
    // More than one page cannot safely be interpreted as a complete configuration.
    requireThat(rows.length < 100, 'RENDER_ENVIRONMENT_INVENTORY_INCOMPLETE');
    validateRender(service, rows);
  };
  await readRender();
  let project = await api.vercel(projectPath);
  validateVercel(project, repository.id);
  const readVercelVariables = async () => validateVercelVariables(
    (await api.vercel(`/v10/projects/${targets.vercel.id}/env?decrypt=true`)).envs);
  await readVercelVariables();
  // A verified predecessor remains authoritative after the first rollout. On the
  // first rollout, select the current exact provider pair automatically. On a
  // partial retry use the original immutable baseline, never the advanced live SHA.
  let baselineProof;
  if (plan.baseline) baselineProof = validateBaselineReceipt(options.baselineRows, plan.baseline, qualified);
  else {
    const baselineRow = options.receiptRows?.find(row => row.phase === 'baseline-selected');
    requireThat(!prior.renderDeployId || baselineRow, 'RESUME_BASELINE_RECEIPT_REQUIRED');
    if (baselineRow) {
      baselineProof = { renderDeployId: baselineRow.baselineRenderDeployId, renderSha: baselineRow.baselineRenderSha,
        vercelDeployId: baselineRow.baselineVercelDeployId, vercelSha: baselineRow.baselineVercelSha };
    } else {
      const live = (await deploymentHistory(api, 'render')).filter(row => row.status === 'live');
      requireThat(live.length === 1, 'AUTOMATIC_RENDER_BASELINE_UNVERIFIABLE');
      const webId = project.targets?.production?.id;
      requireThat(/^dpl_[A-Za-z0-9]+$/.test(webId), 'AUTOMATIC_VERCEL_BASELINE_UNVERIFIABLE');
      const web = await api.vercel(`/v13/deployments/${webId}`);
      baselineProof = { renderDeployId: live[0].id, renderSha: live[0].commit?.id,
        vercelDeployId: webId, vercelSha: web.gitSource?.sha };
    }
    requireThat(/^dep-[a-z0-9]+$/.test(baselineProof.renderDeployId) &&
      /^dpl_[A-Za-z0-9]+$/.test(baselineProof.vercelDeployId) &&
      shaPattern.test(baselineProof.renderSha ?? '') && shaPattern.test(baselineProof.vercelSha ?? ''),
    'AUTOMATIC_BASELINE_PROVENANCE_UNVERIFIABLE');
  }
  const baselineFields = { baselineRenderDeployId: baselineProof.renderDeployId,
    baselineVercelDeployId: baselineProof.vercelDeployId, baselineRenderSha: baselineProof.renderSha,
    baselineVercelSha: baselineProof.vercelSha };
  report({ phase: 'baseline-selected', ...baselineFields });
  requireThat(baselineProof.renderSha !== qualified.sha && baselineProof.vercelSha !== qualified.sha,
    'SOURCE_ALREADY_DEPLOYED_RETAIN_ORIGINAL_CI_PROVENANCE');
  for (const key of Object.keys(baselineFields))
    requireThat(!options.receiptRows || options.receiptRows.every(row => row[key] === undefined ||
      row[key] === baselineFields[key]), 'RESUME_BASELINE_MISMATCH');
  const baseline = await api.render(`${servicePath}/deploys/${baselineProof.renderDeployId}`);
  requireThat(baseline.id === baselineProof.renderDeployId && baseline.commit?.id === baselineProof.renderSha &&
    ['live', 'deactivated'].includes(baseline.status), 'ROLLBACK_BASELINE_REVISION_UNAVAILABLE');
  const oldWeb = await api.vercel(`/v13/deployments/${baselineProof.vercelDeployId}`);
  requireThat(oldWeb.id === baselineProof.vercelDeployId && oldWeb.projectId === targets.vercel.id &&
    oldWeb.target === 'production' && oldWeb.readyState === 'READY' && !oldWeb.aliasError &&
    oldWeb.gitSource?.sha === baselineProof.vercelSha &&
    String(oldWeb.gitSource?.repoId) === String(repository.id), 'ROLLBACK_FRONTEND_PROVENANCE_UNVERIFIED');
  if (baselineProof.origin) {
    const origin = { ...baselineProof.origin, releaseRunAttempt: baselineProof.origin.vercelReleaseRunAttempt };
    requireThat(oldWeb.meta?.aquaReleaseIdentity === releaseKey(origin) &&
      oldWeb.meta?.aquaCiRunId === origin.ciRunId && oldWeb.meta?.aquaCiRunAttempt === String(origin.ciRunAttempt),
    'ROLLBACK_FRONTEND_PROVENANCE_UNVERIFIED');
  }
  const compare = await api.gh(`/compare/${baseline.commit.id}...${qualified.sha}`);
  requireThat(compare.status === 'ahead' || compare.status === 'identical', 'SOURCE_NOT_BASELINE_DESCENDANT');
  requireThat(compare.files?.length < 300 && !compare.files.some(f =>
    /\/Migrations\//i.test(f.filename) || /\/Migrations\//i.test(f.previous_filename ?? '')),
  'SCHEMA_CHANGE_REQUIRES_SEPARATE_AUTHORIZATION');
  const renderDeploys = await deploymentHistory(api, 'render');
  const live = renderDeploys.filter(x => x.status === 'live');
  requireThat(live.length === 1 && (live[0].id === baselineProof.renderDeployId ||
    (live[0].id === prior.renderDeployId && live[0].commit?.id === qualified.sha)), 'RENDER_BASELINE_DRIFT');
  validateHealth(await api.health(), live[0].commit.id);
  requireThat(renderDeploys.every(x => !activeRender.has(x.status) || x.id === prior.renderDeployId),
    'CONCURRENT_RENDER_DEPLOYMENT');
  let render = prior.renderDeployId ? renderDeploys.find(x => x.id === prior.renderDeployId) : undefined;
  requireThat(!prior.renderDeployId || (render && render.commit?.id === qualified.sha),
    'RENDER_RECEIPT_DEPLOYMENT_MISMATCH');
  requireThat(renderDeploys.every(x => x.commit?.id !== qualified.sha || x.id === prior.renderDeployId),
    'RENDER_PROVENANCE_RECEIPT_REQUIRED');
  const vercelDeploys = await deploymentHistory(api, 'vercel');
  requireThat(vercelDeploys.every(x => !activeVercel.has(x.state ?? x.readyState) ||
    x.uid === prior.vercelDeployId), 'CONCURRENT_VERCEL_DEPLOYMENT');
  requireThat(vercelDeploys.every(x =>
    (x.meta?.aquaCiRunId !== qualified.ciRunId && x.meta?.aquaSourceSha !== qualified.sha) ||
    x.uid === prior.vercelDeployId), 'VERCEL_PROVENANCE_RECEIPT_REQUIRED');
  const origin = { ...qualified, releaseRunAttempt: prior.vercelReleaseRunAttempt ?? qualified.releaseRunAttempt };
  const isOurs = x => x.gitSource?.sha === qualified.sha &&
    String(x.gitSource?.repoId) === String(repository.id) && x.projectId === targets.vercel.id &&
    x.meta?.aquaCiRunId === qualified.ciRunId && x.meta?.aquaCiRunAttempt === String(qualified.ciRunAttempt) &&
    x.meta?.aquaReleaseIdentity === releaseKey(origin) && x.target === 'production';
  let existingVercel;
  for (const d of vercelDeploys.filter(x => x.uid === prior.vercelDeployId)) {
    requireThat(/^dpl_[A-Za-z0-9]+$/.test(d.uid), 'VERCEL_DEPLOYMENT_ID_UNAVAILABLE');
    const full = await api.vercel(`/v13/deployments/${d.uid}`);
    requireThat(isOurs(full), 'VERCEL_SOURCE_PROVENANCE_MISMATCH');
    requireThat(full.readyState === 'READY' || activeVercel.has(full.readyState), 'PRIOR_VERCEL_FAILURE_REQUIRES_OPERATOR');
    requireThat(!existingVercel, 'AMBIGUOUS_VERCEL_DEPLOYMENTS');
    existingVercel = full;
  }
  requireThat(!prior.vercelDeployId || existingVercel, 'VERCEL_RECEIPT_DEPLOYMENT_MISMATCH');
  requireThat(project.targets?.production?.id === baselineProof.vercelDeployId ||
    (existingVercel && project.targets?.production?.id === existingVercel.id), 'VERCEL_BASELINE_DRIFT');

  report({ phase: 'admitted', sha: qualified.sha, ciRunId: qualified.ciRunId,
    ...baselineFields, ...prior });
  if (render) requireThat(render.status === 'live' || activeRender.has(render.status), 'PRIOR_RENDER_FAILURE_REQUIRES_OPERATOR');
  else {
    // Recheck freshness immediately before the irreversible provider request.
    await guard();
    await readRender();
    const latestRender = await deploymentHistory(api, 'render');
    requireThat(latestRender.filter(x => x.status === 'live').length === 1 &&
      latestRender.some(x => x.id === baselineProof.renderDeployId && x.status === 'live' &&
        x.commit?.id === baselineProof.renderSha) && latestRender.every(x => !activeRender.has(x.status)) &&
      latestRender.every(x => x.commit?.id !== qualified.sha), 'RENDER_CHANGED_BEFORE_REQUEST');
    report({ phase: 'render-requesting' });
    render = await api.render(`${servicePath}/deploys`, { commitId: qualified.sha, clearCache: 'do_not_clear' });
  }
  requireThat(/^dep-[a-z0-9]+$/.test(render.id), 'RENDER_DEPLOYMENT_ID_UNAVAILABLE');
  report({ phase: 'render-requested', renderDeployId: render.id,
    renderReleaseRunAttempt: prior.renderReleaseRunAttempt ?? qualified.releaseRunAttempt });
  render = await waitFor(() => api.render(`${servicePath}/deploys/${render.id}`),
    x => x.status, 'live', activeRender, options);
  requireThat(render.commit?.id === qualified.sha, 'RENDER_SOURCE_PROVENANCE_MISMATCH');
  await readRender();
  validateHealth(await api.health(), qualified.sha);
  report({ phase: 'render-ready', renderDeployId: render.id, sha: render.commit.id });

  await guard();
  const currentRender = await deploymentHistory(api, 'render');
  requireThat(currentRender.filter(x => x.status === 'live').length === 1 &&
    currentRender.some(x => x.status === 'live' && x.id === render.id && x.commit?.id === qualified.sha) &&
    currentRender.every(x => !activeRender.has(x.status) || x.id === render.id), 'RENDER_CHANGED_AFTER_READINESS');
  project = await api.vercel(projectPath);
  validateVercel(project, repository.id);
  await readVercelVariables();
  requireThat(project.targets?.production?.id === baselineProof.vercelDeployId ||
    (existingVercel && project.targets?.production?.id === existingVercel.id), 'VERCEL_BASELINE_DRIFT');
  if (!existingVercel) {
    await guard();
    await readRender();
    const latestVercel = await deploymentHistory(api, 'vercel');
    requireThat(latestVercel.every(x => !activeVercel.has(x.state ?? x.readyState) &&
      x.meta?.aquaCiRunId !== qualified.ciRunId && x.meta?.aquaSourceSha !== qualified.sha),
    'VERCEL_CHANGED_BEFORE_REQUEST');
    report({ phase: 'vercel-requesting' });
    existingVercel = await api.vercel('/v13/deployments', {
      name: targets.vercel.name, project: targets.vercel.id, target: 'production',
      gitSource: { type: 'github', repoId: String(repository.id), ref: qualified.sha, sha: qualified.sha },
      meta: { aquaCiRunId: qualified.ciRunId, aquaCiRunAttempt: String(qualified.ciRunAttempt),
        aquaSourceSha: qualified.sha, aquaReleaseIdentity: releaseKey(qualified) }
    });
  }
  requireThat(/^dpl_[A-Za-z0-9]+$/.test(existingVercel.id), 'VERCEL_DEPLOYMENT_ID_UNAVAILABLE');
  report({ phase: 'vercel-requested', vercelDeployId: existingVercel.id,
    vercelReleaseRunAttempt: prior.vercelReleaseRunAttempt ?? qualified.releaseRunAttempt });
  const vercel = await waitFor(() => api.vercel(`/v13/deployments/${existingVercel.id}`),
    x => x.readyState, 'READY', activeVercel, options);
  requireThat(isOurs(vercel) && vercel.projectId === targets.vercel.id && !vercel.aliasError,
    'VERCEL_SOURCE_PROVENANCE_MISMATCH');
  project = await api.vercel(projectPath);
  requireThat(project.targets?.production?.id === vercel.id, 'VERCEL_PRODUCTION_ALIAS_NOT_ASSIGNED');
  await api.web();
  await guard();
  await readRender();
  validateHealth(await api.health(), qualified.sha);
  const finalRender = await deploymentHistory(api, 'render');
  requireThat(finalRender.filter(x => x.status === 'live').length === 1 &&
    finalRender.some(x => x.id === render.id && x.status === 'live' && x.commit?.id === qualified.sha) &&
    finalRender.every(x => !activeRender.has(x.status)), 'RENDER_CHANGED_BEFORE_VERIFICATION');
  validateVercel(project = await api.vercel(projectPath), repository.id);
  await readVercelVariables();
  const finalWeb = await api.vercel(`/v13/deployments/${vercel.id}`);
  requireThat(project.targets?.production?.id === vercel.id && finalWeb.readyState === 'READY' &&
    isOurs(finalWeb) && !finalWeb.aliasError, 'VERCEL_CHANGED_BEFORE_VERIFICATION');
  const finalVercel = await deploymentHistory(api, 'vercel');
  requireThat(finalVercel.every(x => !activeVercel.has(x.state ?? x.readyState) || x.uid === vercel.id),
    'CONCURRENT_VERCEL_BEFORE_VERIFICATION');
  report({ phase: 'verified', sha: qualified.sha, renderSha: render.commit.id, vercelSha: vercel.gitSource.sha,
    renderDeployId: render.id, vercelDeployId: vercel.id });
}

let failureReport;
export async function main(env, options = {}) {
  failureReport = undefined;
  const api = options.api ?? clients(env);
  const policy = options.policy ?? standingPolicy;
  const mode = options.mode ?? process.argv[2];
  if (mode === 'qualify-tag') {
    requireThat(env.GITHUB_EVENT_NAME === 'push' && /^refs\/tags\/v\d+\.\d+\.\d+$/.test(env.GITHUB_REF), 'VERSION_TAG_REQUIRED');
    const runs = await api.gh(`/actions/workflows/ci.yml/runs?branch=main&event=push&head_sha=${env.GITHUB_SHA}&per_page=100`);
    const run = runs.workflow_runs.find(x => x.status === 'completed' && x.conclusion === 'success');
    requireThat(run, 'QUALIFIED_MAIN_CI_REQUIRED');
    const q = await qualify(api, run.id);
    requireThat(q.sha === env.GITHUB_SHA, 'TAG_SOURCE_NOT_QUALIFIED');
    appendFileSync(env.GITHUB_OUTPUT, `sha=${q.sha}\n`);
    return;
  }
  let q;
  const sourceArchive = sha => execFileSync('git', ['-C', external ? env.SOURCE_DIR : '.',
    'archive', '--format=tar', sha], { maxBuffer: 100 * 1024 * 1024 });
  if (external) {
    requireThat(env.GITHUB_EVENT_NAME === 'workflow_dispatch', 'EXECUTOR_DISPATCH_REQUIRED');
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH));
    const inputs = event.inputs;
    requireThat(inputs && Object.keys(inputs).sort().join(',') === 'ci_run_attempt,ci_run_id,sha' &&
      positiveId(inputs.ci_run_id) && positiveId(inputs.ci_run_attempt) && shaPattern.test(inputs.sha),
      'EXECUTOR_INPUT_INVALID');
    const qualified = await qualify(api, inputs.ci_run_id);
    requireThat(qualified.sha === inputs.sha && String(qualified.ciRunAttempt) === inputs.ci_run_attempt,
      'CI_EVENT_PROVENANCE_MISMATCH');
    q = freezeCandidate(qualified, env, policy);
    requireThat(execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim() === q.executorSha,
      'EXECUTOR_CHECKOUT_MISMATCH');
  } else {
  requireThat(env.GITHUB_EVENT_NAME === 'workflow_run', 'COMPLETED_CI_EVENT_REQUIRED');
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH));
  requireThat(event.action === 'completed' && event.workflow_run?.event === 'push' &&
    event.workflow_run?.head_branch === 'main' && event.workflow_run?.status === 'completed' &&
    event.workflow_run?.conclusion === 'success' &&
    event.workflow_run?.repository?.full_name === targets.repository &&
    event.workflow_run?.head_repository?.full_name === targets.repository, 'COMPLETED_MAIN_PUSH_REQUIRED');
  const qualified = await qualify(api, event.workflow_run.id);
  requireThat(qualified.sha === event.workflow_run.head_sha && qualified.ciRunAttempt === event.workflow_run.run_attempt,
    'CI_EVENT_PROVENANCE_MISMATCH');
  q = freezeCandidate(qualified, env, policy);
  requireThat(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() === q.sha,
    'CHECKOUT_SOURCE_MISMATCH');
  }
  if (mode === 'candidate') {
    // Detect accidental reviewer/wait gates before entering the environment job.
    await validateInfrastructure(api, q);
    await validateCandidateProvenance(api, q);
    const archive = sourceArchive(q.sha);
    writeFileSync(`${env.CANDIDATE_DIR}/source.tar`, archive);
    writeFileSync(`${env.CANDIDATE_DIR}/candidate.json`, JSON.stringify({ ...q,
      sourceSha256: createHash('sha256').update(archive).digest('hex') }, null, 2) + '\n');
    appendFileSync(env.GITHUB_OUTPUT, `sha=${q.sha}\n`);
    return;
  }
  requireThat(mode === 'deploy' || mode === 'admit', 'RELEASE_MODE_INVALID');
  verifyCandidate(JSON.parse(readFileSync(`${env.CANDIDATE_DIR}/candidate.json`)), q,
    readFileSync(`${env.CANDIDATE_DIR}/source.tar`),
    sourceArchive(q.sha));
  const report = createAuditWriter(q, row => appendFileSync(env.RELEASE_REPORT, JSON.stringify(row) + '\n'));
  failureReport = code => report({ phase: 'failed', code });
  validatePolicy(q, env, policy);
  await validateInfrastructure(api, q);
  await validateCandidateProvenance(api, q);
  const plan = await evidencePlan(api, q, policy);
  if (mode === 'admit') {
    report({ phase: 'evidence-selected' });
    writeFileSync(`${env.CANDIDATE_DIR}/evidence-plan.json`, JSON.stringify(plan) + '\n');
    appendFileSync(env.GITHUB_OUTPUT, `baseline-artifact-id=${plan.baseline?.artifactId ?? ''}\n` +
      `baseline-run-id=${plan.baseline?.runId ?? ''}\nreceipt-artifact-id=${plan.resumeChain.map(x => x.artifactId).join(',')}\n`);
    return;
  }
  let admittedPlan;
  try { admittedPlan = JSON.parse(readFileSync(`${env.CANDIDATE_DIR}/evidence-plan.json`, 'utf8')); }
  catch { throw new ReleaseFailure('FROZEN_EVIDENCE_PLAN_REQUIRED'); }
  requireThat(JSON.stringify(admittedPlan) === JSON.stringify(plan), 'RELEASE_EVIDENCE_PLAN_CHANGED');
  const readAudit = file => {
    let text;
    try { text = readFileSync(file, 'utf8');
      requireThat(text.length <= 1024 * 1024, 'AUDIT_RECEIPT_UNVERIFIABLE');
      return text.trim().split('\n').map(line => JSON.parse(line));
    } catch { throw new ReleaseFailure('AUDIT_RECEIPT_UNVERIFIABLE'); }
  };
  await deploy(api, q, policy, report, { env, evidencePlan: plan,
    ...options.deploymentOptions,
    baselineRows: plan.baseline ? readAudit(env.BASELINE_RECEIPT_FILE) : undefined,
    receiptRows: plan.resume ? plan.resumeChain.flatMap(d => readAudit(plan.resumeChain.length === 1 ?
      `${env.RESUME_RECEIPT_DIR}/release-report.jsonl` :
      `${env.RESUME_RECEIPT_DIR}/production-release-audit-${d.runId}-${d.runAttempt}/release-report.jsonl`)) : undefined });
}

export async function run(env, options = {}) {
  try { await main(env, options); return 0; }
  catch (error) {
    const code = error instanceof ReleaseFailure ? error.message : 'UNEXPECTED_RELEASE_ERROR';
    if (failureReport) failureReport(code);
    else if (env.RELEASE_REPORT)
      appendFileSync(env.RELEASE_REPORT, JSON.stringify({ phase: 'blocked', code, identityVerified: false }) + '\n');
    console.error(`::error::${code}. See the safe-release runbook; do not resume or retry provider requests blindly.`);
    if (env.GITHUB_STEP_SUMMARY)
      appendFileSync(env.GITHUB_STEP_SUMMARY, `Release blocked/failed: **${code}**.\nSee docs/operations/safe-automatic-deployment.md. No automatic rollback or configuration repair.\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await run(process.env);
}
