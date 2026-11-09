import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { approvedRecoveryReadback, legacyRecoveryPair, validateFirstReleaseRecovery,
  validateLegacyProviderPair, FirstReleaseRecoveryDenied, nativeRecoveryPolicyKind, validNativeHeldFrontend } from './first-release-recovery.mjs';
import { AttestationDenied, verifyPrototypeAttestation } from './authorization-attestation.mjs';
import { VercelSourceDenied, approvedPublicInputs, prepareFrontend, validateFrontendProof, fileDeploymentBody,
  validateFileDeployment, validateFileDeploymentSource, verifyObservedFileDeployment } from './vercel-source.mjs';
import { runtimeSettings, cleanStartRuntimeSettings, protectedReadiness, validateReadiness, validateD10Bindings } from './runtime-readiness.mjs';
import { memberPolicy, memberPolicyDigest, memberRuntimeSettings, MemberReleaseDenied, memberContinuation,
  validateMemberContinuation, validateMemberIdentity, verifyMemberSource, verifyMemberAuthority, validateMemberReceipt, deployMemberRelease } from './member-release.mjs';
import { approvedSchemaReadback, validSchemaPolicy, verifySchemaFirst, validateMigrationDelta,
  SchemaFirstDenied, isCleanStartSchemaKind, completedMigration55PolicyKind } from './commission-schema-first.mjs';
import { GitHubEvidenceDenied, canonical, inventoryDigest, maxArtifactBytes,
  gitSourceDigest, verifyGitHubEvidence, createGitHubAdmission, validateGitHubAdmission,
  readGitHubArtifact, readAuditFile, validateArtifact, objectDigest, sha256 } from './github-evidence.mjs';
import { HistoricalReconciliationDenied, isReconciledHistoricalRun, validateHistoricalContext,
  validateHistoricalArtifact, validateHistoricalAudit } from './historical-release-reconciliation.mjs';
import { partialReleaseRunId, reconcilePartialRelease, partialRenderReuse,
  validatePartialRenderOrigin } from './partial-release-reconciliation.mjs';
import { readinessCandidateSha, readinessStartingBackend, validateReadinessStartingBackend,
  validateReadinessStartingAudit, readinessRenderReuse, validateReadinessRenderOrigin,
  ReadinessReleaseDenied } from './readiness-release.mjs';
import { authenticatePreMutationProducer, classifyPriorFailedRun, PriorRunNotRecognized,
  productionDeployStep, providerReadScopes } from './release-prior-run-classification.mjs';
import { rootUnboundCandidateSha } from './root-unbound-release.mjs';
import { postResetCandidateSha } from './post-reset-live-release.mjs';
import { minimumLiveCandidateSha } from './minimum-live-release.mjs';
import { d10OneTimeCandidateSha } from './d10-one-time-release.mjs';
import { verifiedHoldCandidateSha } from './verified-hold-release.mjs';
import { unusedExpiryCandidateSha } from './unused-expiry-release.mjs';
import { verifyHeldRecovery } from './held-recovery-reconciliation.mjs';
import { verifyOwnerRenderRedeployment, validateOwnerRenderProof } from './root-unbound-render-reconciliation.mjs';

export const targets = JSON.parse(readFileSync(new URL('./targets.json', import.meta.url)));
// Only the executor's reviewed targets.json selects this mode. Candidate input
// cannot supply an execution repository, workflow, provider URL or target.
export const execution = targets.executor ?? { repository: targets.repository,
  workflow: 'release.yml', name: 'Qualified production release', event: 'workflow_run' };
const external = execution.repository !== targets.repository;
const releaseApi = api => external ? api.executor : api.gh;
export const standingPolicy = JSON.parse(readFileSync(new URL('./unattended-policy.json', import.meta.url)));
export const admissionJobName = 'Verify approved GitHub evidence before provider access';
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
    new Set(jobs.map(j => j.id)).size === jobs.length && jobs.every(j => positiveAttempt(j.id)) &&
    jobs.every(j => j.run_id === run.id && j.run_attempt === run.run_attempt) &&
    requiredJobs.every(name => jobs.some(j => j.name === name && j.status === 'completed' &&
      j.conclusion === 'success')), 'CI_INVENTORY_NOT_QUALIFIED');
  return { version: 1, repository: targets.repository, sha: run.head_sha,
    ciRunId: String(run.id), ciRunAttempt: run.run_attempt, ciUrl: run.html_url };
}

export function policyDigest(policy) {
  const owns = (object, keys) => object && typeof object === 'object' && !Array.isArray(object) &&
    Object.keys(object).sort().join(',') === keys.sort().join(',');
  const a = policy?.authorization;
  const expectedScope = { repository: targets.repository, branch: 'main', executorRepository: execution.repository, ...targetIdentity,
    frontend: { mode: 'vercel-files-v1', rootDirectory: targets.vercel.rootDirectory, publicBuildInputs: approvedPublicInputs(targets.vercel) } };
  const schemaFirst = policy?.version === 7;
  requireThat((policy?.version === 6 || schemaFirst) && /^[a-z0-9-]{1,80}$/.test(policy.epoch) &&
    policy.profile === targets.profile && policy.baseline === 'automatic' &&
    owns(policy, ['version', 'epoch', 'profile', 'baseline', 'authorization', 'scope', 'firstReleaseRecovery',
      ...(schemaFirst ? ['schemaFirst'] : [])]) && (!schemaFirst || validSchemaPolicy(policy.schemaFirst)) &&
    owns(policy.firstReleaseRecovery, ['kind', 'baseline', 'evidenceSha256']) &&
    (policy.firstReleaseRecovery.kind === (schemaFirst ? 'pinned-legacy-forward-remediation-v1' : 'pinned-legacy-retained-artifact-v1') ||
      schemaFirst && policy.schemaFirst.kind === completedMigration55PolicyKind && policy.firstReleaseRecovery.kind === nativeRecoveryPolicyKind) &&
    objectDigest(policy.firstReleaseRecovery.baseline) === objectDigest(legacyRecoveryPair) &&
    /^[a-f0-9]{64}$/.test(policy.firstReleaseRecovery.evidenceSha256) &&
    owns(a, ['kind', 'approval', 'administrators', 'inventorySourceCommit', 'inventorySha256', 'maxCiAgeSeconds', 'maxAdmissionAgeSeconds']) &&
    a.kind === 'github-evidence-v1' && a.approval === 'trusted-administrator-executor-merge' &&
    a.inventorySha256 === inventoryDigest && shaPattern.test(a.inventorySourceCommit) &&
    positiveAttempt(a.maxCiAgeSeconds) && a.maxCiAgeSeconds <= 86400 &&
    positiveAttempt(a.maxAdmissionAgeSeconds) && a.maxAdmissionAgeSeconds <= 3600 &&
    Array.isArray(a.administrators) && a.administrators.length === 2 &&
    [{ login: 'Xolani-M', id: 86495928 }, { login: 'aqualifestyleclub', id: 307076734 }].every(admin =>
      a.administrators.filter(x => owns(x, ['login', 'id']) && x.login === admin.login && x.id === admin.id).length === 1) &&
    JSON.stringify(canonical(policy.scope)) === JSON.stringify(canonical(expectedScope)),
  'STANDING_POLICY_INVALID');
  return createHash('sha256').update(JSON.stringify(canonical(policy))).digest('hex');
}

export async function validateExecutorApproval(api, identity, policy = standingPolicy) {
  requireThat(identity.policySha256 === policyDigest(policy), 'STANDING_POLICY_CHANGED');
  const rows = await api.executor(`/commits/${identity.executorSha}/pulls?per_page=100`);
  requireThat(Array.isArray(rows) && rows.length < 100, 'EXECUTOR_APPROVAL_UNVERIFIABLE');
  const matches = rows.filter(pr => pr.merge_commit_sha === identity.executorSha && pr.merged_at &&
    pr.base?.ref === 'main' && pr.base.repo?.full_name === execution.repository);
  requireThat(matches.length === 1 && positiveAttempt(matches[0].number), 'EXECUTOR_ADMINISTRATOR_APPROVAL_REQUIRED');
  const pr = await api.executor(`/pulls/${matches[0].number}`);
  requireThat(pr.number === matches[0].number && pr.merged === true && pr.state === 'closed' && pr.merge_commit_sha === identity.executorSha &&
    pr.base?.ref === 'main' && pr.base.repo?.full_name === execution.repository &&
    Number.isFinite(Date.parse(pr.merged_at)) &&
    policy.authorization.administrators.some(a => a.id === pr.merged_by?.id && a.login === pr.merged_by?.login),
  'EXECUTOR_ADMINISTRATOR_APPROVAL_REQUIRED');
}

export function validateDispatchInputs(inputs) {
  requireThat(inputs && typeof inputs === 'object' && !Array.isArray(inputs) &&
    Object.keys(inputs).every(k => ['ci_run_id', 'ci_run_attempt', 'sha', 'qualification_only', 'release_mode'].includes(k)) &&
    positiveId(inputs.ci_run_id) && positiveId(inputs.ci_run_attempt) && shaPattern.test(inputs.sha),
  'EXECUTOR_INPUT_INVALID');
  // workflow_dispatch's event payload uses strings; accept native booleans too,
  // without coercing null, empty strings, numbers or other truthy input.
  const mode = Object.hasOwn(inputs, 'qualification_only') ? inputs.qualification_only : false;
  requireThat([true, false, 'true', 'false'].includes(mode), 'EXECUTOR_INPUT_INVALID');
  const releaseMode = Object.hasOwn(inputs, 'release_mode') ? inputs.release_mode : 'full';
  requireThat(['full', memberPolicy.mode].includes(releaseMode) &&
    (releaseMode === 'full' || inputs.sha === memberPolicy.frontendSha), 'EXECUTOR_INPUT_INVALID');
  return { ci_run_id: inputs.ci_run_id, ci_run_attempt: inputs.ci_run_attempt, sha: inputs.sha,
    qualificationOnly: mode === true || mode === 'true', ...(releaseMode !== 'full' ? { releaseMode } : {}) };
}

export function freezeCandidate(qualified, env, policy = standingPolicy, qualificationOnly = false, releaseMode = 'full') {
  requireThat(typeof qualificationOnly === 'boolean', 'EXECUTOR_INPUT_INVALID');
  requireThat(['full', memberPolicy.mode].includes(releaseMode), 'EXECUTOR_INPUT_INVALID');
  requireThat(env.GITHUB_REPOSITORY === execution.repository && positiveId(env.GITHUB_RUN_ID) &&
    positiveId(env.GITHUB_RUN_ATTEMPT) && positiveAttempt(Number(env.GITHUB_RUN_ATTEMPT)) &&
    env.GITHUB_REF === 'refs/heads/main' && env.GITHUB_REF_PROTECTED === 'true' &&
    env.GITHUB_WORKFLOW_REF === `${execution.repository}/.github/workflows/${execution.workflow}@refs/heads/main` &&
    (!external || (shaPattern.test(env.GITHUB_SHA) && env.GITHUB_WORKFLOW_SHA === env.GITHUB_SHA)),
  'RELEASE_CONTEXT_UNVERIFIABLE');
  const candidate = { ...qualified, version: external ? 4 : 3, qualificationOnly,
    ...(releaseMode === memberPolicy.mode ? { memberRelease: memberPolicyDigest } : {}),
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
  if (identity.memberRelease !== undefined) validateMemberIdentity(identity);
}

export function releaseKey(identity) {
  validateReleaseIdentity(identity);
  return createHash('sha256').update(JSON.stringify(
    [...releaseIdentityFields, ...(identity.memberRelease !== undefined ? ['memberRelease'] : [])]
      .map(key => [key, identity[key]]))).digest('hex');
}

export function verifyCandidate(candidate, qualified, archive, trustedArchive) {
  validateReleaseIdentity(candidate);
  requireThat(typeof qualified.qualificationOnly === 'boolean' &&
    candidate.qualificationOnly === qualified.qualificationOnly &&
    candidate.memberRelease === qualified.memberRelease, 'CANDIDATE_PURPOSE_MISMATCH');
  for (const key of releaseIdentityFields)
    requireThat(candidate[key] === qualified[key], 'CANDIDATE_PROVENANCE_MISMATCH');
  requireThat(candidate.sourceSha256 === createHash('sha256').update(archive).digest('hex'),
    'CANDIDATE_CONTENT_MISMATCH');
  requireThat(Buffer.isBuffer(trustedArchive) && archive.equals(trustedArchive),
    'CANDIDATE_NOT_QUALIFIED_GIT_SOURCE');
}

export function validatePolicy(qualified, env, policy = standingPolicy) {
  validateReleaseIdentity(qualified);
  requireThat(qualified.qualificationOnly === false, 'QUALIFICATION_ONLY_CANNOT_DEPLOY');
  requireThat(env.GITHUB_REPOSITORY === execution.repository && env.GITHUB_RUN_ID === qualified.releaseRunId &&
    env.GITHUB_RUN_ATTEMPT === String(qualified.releaseRunAttempt) &&
    env.GITHUB_REF === 'refs/heads/main' && env.GITHUB_REF_PROTECTED === 'true' &&
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

// Retained for the historical setup checker, not the deployment execution path.
// GitHub's existing protected merge process enforces these settings.
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

export async function validateInfrastructure(api, identity, policy = standingPolicy) {
  // Protected merges and GitHub's environment boundary enforce settings. Runtime
  // authenticates the exact administrator-approved executor and current run;
  // it must not need branch-rules, ruleset or environment-administration reads.
  if (external) {
    validateReleaseIdentity(identity);
    await validateExecutorApproval(api, identity, policy);
  }
  if (external) {
    const head = await api.executor('/git/ref/heads/main');
    requireThat(head.object?.sha === identity.executorSha, 'STALE_EXECUTOR_REVISION');
    const current = await api.executor(`/actions/runs/${identity.releaseRunId}`);
    validateReleaseRun(current);
    requireThat(String(current.id) === identity.releaseRunId && current.head_sha === identity.executorSha &&
      current.run_attempt === identity.releaseRunAttempt && current.status === 'in_progress',
      'EXECUTOR_ATTEMPT_CHANGED');
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

export function validateRender(service, rows, cleanStart = false, settings) {
  const expected = settings ?? (cleanStart ? cleanStartRuntimeSettings : runtimeSettings);
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
  requireThat(rows.length === Object.keys(expected).length &&
    new Set(rows.map(x => x.envVar.key)).size === rows.length &&
    Object.entries(expected).every(([key, allowed]) => allowed.includes(vars[key])),
  'NORMAL_RUNTIME_CONFIGURATION_UNVERIFIED');
}

export function validateVercel(project, repoId) {
  requireThat(project.id === targets.vercel.id && project.accountId === targets.vercel.teamId &&
    project.name === targets.vercel.name && project.rootDirectory === targets.vercel.rootDirectory &&
    project.nodeVersion === '24.x' && !project.commandForIgnoringBuildStep &&
    !project.link && project.autoAssignCustomDomains === true &&
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
    j.dataProtectionKeyStoreStatus === 'Healthy' && response.recovery === null,
  'API_REVISION_OR_RECOVERY_READINESS_FAILED');
}

// No configurable provider URL, response bodies, request headers or raw errors are logged.
// POSTs are never automatically retried: a lost response requires provider reconciliation.
export function clients(env, fetcher = fetch, reportGitHubRead = row => console.error(JSON.stringify(row))) {
  const evidenceToken = () => {
    requireThat(typeof env.AQGREEN_EVIDENCE_READ_TOKEN === 'string' &&
      env.AQGREEN_EVIDENCE_READ_TOKEN.trim().length > 0, 'GITHUB_EVIDENCE_READ_CREDENTIAL_REQUIRED');
    return env.AQGREEN_EVIDENCE_READ_TOKEN;
  };
  const executorToken = () => {
    requireThat(typeof env.GH_TOKEN === 'string' && env.GH_TOKEN.trim().length > 0,
      'GITHUB_EXECUTOR_JOB_CREDENTIAL_REQUIRED');
    return env.GH_TOKEN;
  };
  const tokenFor = owner => owner === 'source' ? evidenceToken() : executorToken();
  // Report only fixed repository/family identifiers and observed status, never
  // arbitrary routes, headers, bodies or errors. Preserve existing failure codes.
  const readContext = (repository, route) => ({ repository, operation:
    route.startsWith('/actions/') ? 'actions' : route.startsWith('/environments/') ? 'environments' :
    route.startsWith('/rules') ? 'governance' : route.includes('/check-runs') ? 'checks' :
    route.startsWith('/git/') || route.startsWith('/contents/') ? 'contents' :
    route.startsWith('/commits/') || route.startsWith('/pulls/') ? 'pull-request-provenance' : 'required-evidence' });
  async function request(base, token, route, body, github) {
    requireThat(token, 'PROVIDER_CREDENTIAL_UNAVAILABLE');
    let response;
    try {
      response = await fetcher(base + route, { method: body ? 'POST' : 'GET', redirect: 'error',
        signal: AbortSignal.timeout(30_000), headers: { Authorization: `Bearer ${token}`,
          Accept: 'application/json', 'Content-Type': 'application/json',
          ...(github ? { 'X-GitHub-Api-Version': '2022-11-28' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) });
    } catch {
      if (github) reportGitHubRead({ phase: 'github-read-failed', ...github, classification: 'TRANSPORT_UNAVAILABLE' });
      throw new ReleaseFailure(body ? 'AMBIGUOUS_PROVIDER_POST_INSPECT_BEFORE_RETRY' : 'PROVIDER_READ_FAILED');
    }
    if (!response.ok && github) reportGitHubRead({ phase: 'github-read-rejected', ...github,
      ...(Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ?
        { httpStatus: response.status } : {}) });
    requireThat(response.ok, body ? 'PROVIDER_POST_REJECTED_INSPECT_BEFORE_RETRY' : 'PROVIDER_READ_REJECTED');
    try { return await response.json(); } catch { throw new ReleaseFailure('INVALID_PROVIDER_RESPONSE'); }
  }
  const githubRead = (owner, route, body) => {
    requireThat(body === undefined, 'GITHUB_EVIDENCE_WRITE_FORBIDDEN');
    const repository = owner === 'source' ? targets.repository : execution.repository;
    return request(`https://api.github.com/repos/${repository}`, tokenFor(owner), route, undefined, readContext(repository, route));
  };
  return {
    gh: (route, body) => githubRead('source', route, body),
    executor: (route, body) => githubRead('executor', route, body),
    artifact: async (owner, id) => {
      requireThat(['source', 'executor'].includes(owner) && positiveId(id),
        'GITHUB_ARTIFACT_INPUT_INVALID');
      const token = tokenFor(owner);
      try {
        const repository = owner === 'source' ? targets.repository : execution.repository;
        const response = await fetcher(`https://api.github.com/repos/${repository}/actions/artifacts/${id}/zip`, {
          redirect: 'manual', signal: AbortSignal.timeout(30_000),
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
        });
        requireThat(response.status === 302, 'GITHUB_ARTIFACT_DOWNLOAD_UNAVAILABLE');
        const url = new URL(response.headers.get('location'));
        requireThat(url.protocol === 'https:' && !url.username && !url.password && !url.hash &&
          (!url.port || url.port === '443'), 'GITHUB_ARTIFACT_REDIRECT_INVALID');
        // GitHub supplies a short-lived archive URL. Never forward GitHub or
        // provider credentials to storage, and never log this signed URL.
        const archive = await fetcher(url.href, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
        requireThat(archive.ok && archive.body, 'GITHUB_ARTIFACT_DOWNLOAD_UNAVAILABLE');
        const chunks = []; let size = 0;
        for await (const chunk of archive.body) {
          size += chunk.length;
          requireThat(size <= maxArtifactBytes, 'GITHUB_ARTIFACT_TOO_LARGE');
          chunks.push(Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
      } catch (error) {
        if (error instanceof ReleaseFailure) throw error;
        throw new ReleaseFailure('GITHUB_ARTIFACT_DOWNLOAD_UNAVAILABLE');
      }
    },
    render: (route, body) => {
      if (route.includes('/env-vars') || route.includes('/secret-files')) {
        const prefix = `/services/${targets.render.id}/env-vars/`;
        requireThat(body === undefined && route.startsWith(prefix) &&
          (Object.hasOwn(cleanStartRuntimeSettings, route.slice(prefix.length)) ||
            Object.hasOwn(memberRuntimeSettings, route.slice(prefix.length))), 'SECRET_BEARING_RENDER_READ_FORBIDDEN');
      }
      return request('https://api.render.com/v1', env.RENDER_API_KEY, route, body);
    },
    vercel: (route, body) => {
      if (route.includes('/env?')) requireThat(body === undefined &&
        route === `/v10/projects/${targets.vercel.id}/env?decrypt=false`, 'FRONTEND_SECRET_ENUMERATION_FORBIDDEN');
      return request('https://api.vercel.com', env.VERCEL_TOKEN,
        route + (route.includes('?') ? '&' : '?') + `teamId=${targets.vercel.teamId}`, body);
    },
    uploadVercel: async (data, digest) => {
      requireThat(Buffer.isBuffer(data) && /^[a-f0-9]{40}$/.test(digest) &&
        createHash('sha1').update(data).digest('hex') === digest, 'VERCEL_UPLOAD_HASH_MISMATCH');
      requireThat(env.VERCEL_TOKEN, 'PROVIDER_CREDENTIAL_UNAVAILABLE');
      let response;
      try { response = await fetcher('https://api.vercel.com/v2/files?teamId=' + targets.vercel.teamId, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30_000), body: data,
        headers: { Authorization: 'Bearer ' + env.VERCEL_TOKEN, 'Content-Type': 'application/octet-stream',
          'Content-Length': String(data.length), 'x-vercel-digest': digest } }); }
      catch { throw new ReleaseFailure('AMBIGUOUS_PROVIDER_POST_INSPECT_BEFORE_RETRY'); }
      requireThat(response.ok, 'PROVIDER_POST_REJECTED_INSPECT_BEFORE_RETRY');
      // This authenticated acknowledgement binds bytes through the provider's
      // SHA1 integrity header. SHA256 remains the stronger local manifest identity.
    },
    health: async () => {
      let r;
      try { r = await fetcher(targets.render.healthUrl, { redirect: 'error',
        signal: AbortSignal.timeout(30_000), headers: { 'Cache-Control': 'no-cache' } });
        return { status: r.status, recovery: r.headers.get('x-aqua-recovery-suspended'),
          receiver: r.headers.get('x-aqua-yoco-receiver'), body: await r.json() };
      } catch { throw new ReleaseFailure('API_HEALTH_UNAVAILABLE'); }
    },
    memberProbe: async () => {
      const origin = new URL(targets.render.healthUrl).origin;
      const status = async (path, method = 'GET') => {
        try {
          const r = await fetcher(origin + path, { method, redirect: 'error', signal: AbortSignal.timeout(15000),
            headers: { 'Cache-Control': 'no-store', ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
            ...(method === 'POST' ? { body: '{}' } : {}) });
          await r.body?.cancel(); return r.status;
        } catch { throw new ReleaseFailure('MEMBER_FENCE_PROBE_UNAVAILABLE'); }
      };
      return { capability: await status('/api/services/app/AQGreenPilot/GetStatus'),
        unauthenticatedRead: await status('/api/services/app/Customer/GetMyCustomer'),
        write: await status('/api/services/app/ClubMemberProgrammeParticipation/CreateAQGreenJoiningCheckout', 'POST'),
        invalidSignature: await status('/api/payments/yoco/webhook', 'POST') };
    },
    readiness: async sha => {
      try { return await protectedReadiness(env, sha, fetcher); }
      catch { throw new ReleaseFailure('PROTECTED_RUNTIME_READINESS_FAILED'); }
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
  requireThat(Array.isArray(page.jobs) && page.total_count === page.jobs.length, 'CI_INVENTORY_INCOMPLETE');
  const checkIds = [];
  if (external) for (const job of page.jobs) {
    const prefix = `https://api.github.com/repos/${targets.repository}/check-runs/`;
    const id = job.check_run_url?.startsWith(prefix) ? job.check_run_url.slice(prefix.length) : '';
    requireThat(positiveId(id) && Number.isSafeInteger(Number(id)), 'CI_CHECK_IDENTITY_UNVERIFIABLE');
    checkIds.push(id);
  }
  requireThat(new Set(checkIds).size === checkIds.length, 'CI_CHECK_IDENTITY_UNVERIFIABLE');
  // GitHub's authenticated Actions run/attempt/jobs are the execution authority.
  // Protected governance still pins all required check contexts to App 15368;
  // admission still verifies the approved workflow/security definitions and report.
  // Do not re-query the Checks API with a fine-grained source PAT.
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
      'renderOriginRunId', 'renderOriginExecutorSha', 'renderReconciliation',
      'readinessRenderContinuation', 'ownerRenderRedeploy', 'd10RuntimeBindings',
      'startingRenderDeployId', 'startingRenderSha', 'startingBackendBindingSha256',
      'baselineRenderDeployId', 'baselineVercelDeployId', 'baselineRenderSha', 'baselineVercelSha',
      'baselineVercelSourceProvenance', 'firstReleaseRecoveryEvidenceSha256', 'schemaFirstEvidenceSha256', 'recoveryMode',
      'authorizationId', 'evidenceSha256', 'inventorySha256', 'evidenceArtifactId', 'vercelSourceProof'])
      if (row[key] !== undefined) known[key] = row[key];
    emit({ ...row, ...Object.fromEntries(releaseIdentityFields.map(key => [key, identity[key]])),
      ...(identity.memberRelease !== undefined ? { memberRelease: identity.memberRelease } : {}), ...known });
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
    requireThat(row.memberRelease === undefined && frozen.memberRelease === undefined, 'FULL_RELEASE_PURPOSE_REQUIRED');
    requireThat(releaseIdentityFields.filter(key => key !== 'releaseRunAttempt')
      .every(key => row[key] === frozen[key]) && row.releaseRunAttempt >= attempt &&
      row.releaseRunAttempt <= attempt + 1 && row.releaseRunAttempt < frozen.releaseRunAttempt,
    'RESUME_RECEIPT_IDENTITY_MISMATCH');
    attempt = row.releaseRunAttempt;
    requireThat(['evidence-selected', 'baseline-selected', 'admitted', 'render-requesting', 'render-requested',
      'render-ready', 'render-reconciled', 'vercel-files-requesting', 'vercel-files-uploaded', 'vercel-requesting', 'vercel-requested', 'verified', 'failed',
      'provider-read'].includes(row.phase),
      'RESUME_RECEIPT_UNVERIFIABLE');
    requireThat(row.phase !== 'provider-read' || providerReadScopes.has(row.scope), 'RESUME_RECEIPT_UNVERIFIABLE');
    requireThat(row.phase !== 'verified', 'RELEASE_ALREADY_VERIFIED');
    requireThat(!['AMBIGUOUS_PROVIDER_POST_INSPECT_BEFORE_RETRY', 'INVALID_PROVIDER_RESPONSE',
      'RENDER_DEPLOYMENT_ID_UNAVAILABLE', 'VERCEL_DEPLOYMENT_ID_UNAVAILABLE',
      'PROVIDER_POST_REJECTED_INSPECT_BEFORE_RETRY', 'UNEXPECTED_RELEASE_ERROR'].includes(row.code),
    'AMBIGUOUS_PRIOR_REQUEST_REQUIRES_RECONCILIATION');
    if (row.phase === 'vercel-files-requesting') pending.add('vercel-files');
    if (row.phase === 'vercel-files-uploaded') pending.delete('vercel-files');
    if (row.vercelSourceProof !== undefined) {
      validateFrontendProof(row.vercelSourceProof, frozen.sha, targets.vercel);
      requireThat(known.vercelSourceProof === undefined || objectDigest(known.vercelSourceProof) === objectDigest(row.vercelSourceProof), 'CONTRADICTORY_RESUME_RECEIPT');
      known.vercelSourceProof = row.vercelSourceProof;
    }
    if (row.renderReconciliation !== undefined) {
      validatePartialRenderOrigin(row, targets);
      requireThat(!known.renderReconciliation || objectDigest(known.renderReconciliation) === objectDigest(row.renderReconciliation),
        'CONTRADICTORY_RESUME_RECEIPT');
      known.renderReconciliation = row.renderReconciliation;
    }
    if (row.readinessRenderContinuation !== undefined) {
      validateReadinessRenderOrigin(row);
      requireThat(!known.readinessRenderContinuation || objectDigest(known.readinessRenderContinuation) === objectDigest(row.readinessRenderContinuation),
        'CONTRADICTORY_RESUME_RECEIPT');
      known.readinessRenderContinuation = row.readinessRenderContinuation;
    }
    requireThat(row.phase !== 'render-reconciled' || row.renderReconciliation || row.readinessRenderContinuation, 'RESUME_RECEIPT_UNVERIFIABLE');
    if (row.startingBackendBindingSha256 !== undefined) validateReadinessStartingAudit(row);
    if (row.d10RuntimeBindings !== undefined) {
      validateD10Bindings(row.d10RuntimeBindings, row.sha);
      requireThat(!known.d10RuntimeBindings || objectDigest(known.d10RuntimeBindings) === objectDigest(row.d10RuntimeBindings),
        'CONTRADICTORY_RESUME_RECEIPT');
      known.d10RuntimeBindings = row.d10RuntimeBindings;
    }
    if (row.ownerRenderRedeploy !== undefined) {
      validateOwnerRenderProof(row.ownerRenderRedeploy, row);
      requireThat(!known.ownerRenderRedeploy || objectDigest(known.ownerRenderRedeploy) === objectDigest(row.ownerRenderRedeploy),
        'CONTRADICTORY_RESUME_RECEIPT');
      known.ownerRenderRedeploy = row.ownerRenderRedeploy;
    }
    for (const provider of ['render', 'vercel']) {
      if (row.phase === `${provider}-requesting`) pending.add(provider);
      if (row.phase === `${provider}-requested` && row[`${provider}DeployId`]) pending.delete(provider);
    }
    for (const key of ['renderDeployId', 'vercelDeployId', 'renderReleaseRunAttempt', 'vercelReleaseRunAttempt',
      'renderOriginRunId', 'renderOriginExecutorSha',
      'startingRenderDeployId', 'startingRenderSha', 'startingBackendBindingSha256',
      'baselineRenderDeployId', 'baselineRenderSha', 'baselineVercelDeployId', 'baselineVercelSha',
      'baselineVercelSourceProvenance', 'firstReleaseRecoveryEvidenceSha256', 'schemaFirstEvidenceSha256', 'recoveryMode']) {
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
  requireThat((known.renderOriginRunId === undefined && known.renderOriginExecutorSha === undefined) || known.renderReconciliation || known.readinessRenderContinuation,
    'RESUME_RECEIPT_UNVERIFIABLE');
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
  requireThat(page.total_count === jobs?.length && jobs.length === 3 &&
    new Set(jobs.map(j => j.name)).size === 3 &&
    jobs.every(j => j.run_id === run.id && j.run_attempt === attempt && j.status === 'completed'),
  'PRIOR_RELEASE_EXECUTION_UNVERIFIABLE');
  const candidate = jobs.find(j => j.name === 'Qualify immutable source candidate');
  const admission = jobs.find(j => [admissionJobName, 'Verify independent authorization before provider access'].includes(j.name));
  const production = jobs.find(j => ['Unattended recovery release', 'Authorized recovery release'].includes(j.name));
  requireThat(candidate && admission && production &&
    (production.conclusion !== 'success' || (candidate.conclusion === 'success' && admission.conclusion === 'success')),
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
  const attemptsByRun = new Map();
  for (const run of runs.filter(r => r.id !== current.id)) {
    requireThat(run.status === 'completed', 'CONCURRENT_RELEASE_RUN');
    requireThat(run.run_attempt <= 20, 'RELEASE_ATTEMPT_HISTORY_TOO_LARGE');
    for (let attempt = run.run_attempt; attempt >= 1; attempt--) {
      const past = attempt === run.run_attempt ? run : await releaseApi(api)(`/actions/runs/${run.id}/attempts/${attempt}`);
      validateReleaseRun(past);
      requireThat(past.id === run.id && past.run_attempt === attempt && past.head_sha === run.head_sha &&
        past.run_number === run.run_number && past.status === 'completed', 'RELEASE_ATTEMPT_HISTORY_UNVERIFIABLE');
      attemptsByRun.set(`${run.id}:${attempt}`, past);
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
  successful.sort((a, b) => b.run_number - a.run_number);
  const latestObserved = successful[0];
  let latest;
  // GitHub's workflow-level concurrency is the serialization boundary. Consume
  // no portable ticket: authenticate every completed release's immutable audit.
  // Deleted history, expired evidence or a previously deployed SHA denies even
  // when the caller supplies another CI run/attempt or dispatches a fresh run.
  const verifiedReleases = [], memberReleases = [];
  for (const past of successful) {
    const descriptor = await auditArtifact(api, past, past.run_attempt);
    const rows = await readReleaseAudit(api, descriptor);
    if (rows[0]?.memberRelease !== undefined) {
      memberReleases.push(validateMemberReceipt(rows, descriptor, targets));
      continue;
    }
    latest ??= past;
    const proof = validateBaselineReceipt(rows, descriptor, candidate);
    requireThat(proof.origin.sha !== candidate.sha, 'SOURCE_ALREADY_VERIFIED');
    verifiedReleases.push({ ...descriptor, sourceSha: proof.origin.sha,
      ciRunId: proof.origin.ciRunId, ciRunAttempt: proof.origin.ciRunAttempt,
      receiptSha256: sha256(Buffer.from(JSON.stringify(rows))) });
  }
  let continuation, partialRenderContinuation, acknowledgedBackend, readinessRenderContinuation;
  const historicalReconciliations = [];
  const priorFailedRuns = [];
  for (const run of runs.filter(r => r.id !== current.id &&
    r.run_number > (latestObserved?.run_number ?? 0))) {
    // A failed prior run may have submitted a request whose history is not visible
    // yet. Classify it from authenticated execution evidence only: a positively
    // unexecuted mutation stage or a complete audit proving no mutation-capable
    // call was initiated. Neither is a successful release or retry receipt.
    for (let attempt = 1; attempt <= run.run_attempt; attempt++) {
      const production = await releaseProductionJob(api, run, attempt);
      const past = attemptsByRun.get(`${run.id}:${attempt}`);
      // Qualification-only success is already authenticated above. Preserve it
      // as a successful check with no deployment, not as a failed run/predecessor.
      if (past?.conclusion === 'success' && production.conclusion === 'skipped') continue;
      if (external && candidate.memberRelease === undefined && String(run.id) === partialReleaseRunId && attempt === 1) {
        const proof = await reconcilePartialRelease(api, run, past, production, candidate, targets);
        if (candidate.sha === readinessCandidateSha) acknowledgedBackend = readinessStartingBackend(candidate, proof);
        else partialRenderContinuation = proof;
        historicalReconciliations.push(proof);
        continue;
      }
      if (candidate.memberRelease !== undefined && String(run.id) === memberContinuation.runId) {
        requireThat(run.run_attempt === 1 && attempt === 1 && run.conclusion === 'failure' &&
          production.conclusion === 'failure', 'MEMBER_CONTINUATION_RUN_CHANGED');
        const descriptor = await auditArtifact(api, run, attempt);
        const metadata = await releaseApi(api)(`/actions/artifacts/${descriptor.artifactId}`);
        requireThat(metadata.digest === memberContinuation.artifactDigest, 'MEMBER_CONTINUATION_ARTIFACT_CHANGED');
        continuation = validateMemberContinuation(await readReleaseAudit(api, descriptor), descriptor);
        continue;
      }
      if (external && candidate.memberRelease === undefined && isReconciledHistoricalRun(run.id)) {
        const pin = validateHistoricalContext(run, attempt, production, candidate, targets);
        const descriptor = await auditArtifact(api, run, attempt);
        validateHistoricalArtifact(pin, descriptor, await releaseApi(api)(`/actions/artifacts/${descriptor.artifactId}`));
        const proof = validateHistoricalAudit(await readReleaseAudit(api, descriptor), descriptor, pin, targets);
        historicalReconciliations.push(proof);
        if (proof.renderContinuation === true) readinessRenderContinuation = proof;
        continue;
      }
      try {
        let audit;
        if (production.conclusion === 'failure' && !production.steps?.some(step =>
          step?.name === productionDeployStep(production.name) && step?.conclusion === 'skipped')) {
          // Only a reviewed producer with the write-ahead mutation invariant can
          // turn a complete authenticated audit into evidence of a read-only stop.
          requireThat(external && candidate.memberRelease === undefined,
            'UNVERIFIED_PRIOR_RELEASE_REQUIRES_RECONCILIATION');
          const producer = await authenticatePreMutationProducer(releaseApi(api), run.head_sha);
          await validateExecutorApproval(api, { executorSha: run.head_sha, policySha256: candidate.policySha256 }, policy);
          const descriptor = await auditArtifact(api, run, attempt);
          audit = { descriptor, producer, rows: await readReleaseAudit(api, descriptor) };
        }
        priorFailedRuns.push(classifyPriorFailedRun({
          run: { id: run.id, runNumber: run.run_number, runAttempt: run.run_attempt,
            headSha: run.head_sha, status: past?.status, conclusion: past?.conclusion,
            repository: run.repository?.full_name, headRepository: run.head_repository?.full_name },
          attempt, production, audit }));
      } catch (error) {
        if (error instanceof PriorRunNotRecognized) {
          throw new ReleaseFailure('UNVERIFIED_PRIOR_RELEASE_REQUIRES_RECONCILIATION');
        }
        throw error;
      }
    }
  }
  requireThat(candidate.releaseRunAttempt <= 20, 'RELEASE_ATTEMPT_HISTORY_TOO_LARGE');
  const resumeChain = [];
  for (let attempt = 1; attempt < candidate.releaseRunAttempt; attempt++)
    resumeChain.push(await auditArtifact(api, current, attempt));
  if (resumeChain.length) {
    const rows = [];
    for (const descriptor of resumeChain) rows.push(...await readReleaseAudit(api, descriptor));
    validateResumeReceipt(rows, candidate);
  }
  requireThat(candidate.memberRelease === undefined || memberReleases.length === 0,
    'MEMBER_RELEASE_ALREADY_DEPLOYED');
  requireThat(candidate.memberRelease === undefined || continuation, 'MEMBER_CONTINUATION_EVIDENCE_REQUIRED');
  return { policySha256: candidate.policySha256, verifiedReleases, priorFailedRuns,
    ...(partialRenderContinuation ? { partialRenderContinuation } : {}),
    ...(acknowledgedBackend ? { acknowledgedBackend } : {}),
    ...(readinessRenderContinuation ? { readinessRenderContinuation } : {}),
    ...(historicalReconciliations.length ? { historicalReconciliations } : {}),
    ...(continuation ? { memberContinuation: continuation } : {}),
    ...(memberReleases.length ? { memberReleases } : {}),
    firstReleaseRecoveryEvidenceSha256: latest ? null : policy.firstReleaseRecovery.evidenceSha256,
    baseline: latest ? await auditArtifact(api, latest, latest.run_attempt) : null,
    resume: resumeChain.at(-1) ?? null, resumeChain };
}

async function readReleaseAudit(api, descriptor) {
  const gh = releaseApi(api);
  const metadata = await gh(`/actions/artifacts/${descriptor.artifactId}`);
  const repository = await gh('');
  const artifact = validateArtifact(metadata, descriptor.runId, descriptor.sha,
    `production-release-audit-${descriptor.runId}-${descriptor.runAttempt}`, repository.id);
  requireThat(artifact.id === descriptor.artifactId, 'AUDIT_ARTIFACT_SUBSTITUTED');
  const bytes = await readGitHubArtifact(api, 'executor', artifact, 'release-report.jsonl');
  try {
    const lines = bytes.toString('utf8').trim().split('\n');
    requireThat(lines.length > 0 && lines.length <= 500, 'AUDIT_RECEIPT_UNVERIFIABLE');
    return lines.map(line => JSON.parse(line));
  } catch { throw new ReleaseFailure('AUDIT_RECEIPT_UNVERIFIABLE'); }
}

export function validateBaselineReceipt(rows, descriptor, candidate) {
  requireThat(rows.length > 0 && rows.length <= 100, 'VERIFIED_BASELINE_RECEIPT_REQUIRED');
  const first = rows[0], last = rows.at(-1);
  for (const row of rows) {
    validateReleaseIdentity(row);
    requireThat(row.memberRelease === undefined && candidate.memberRelease === undefined, 'FULL_RELEASE_PURPOSE_REQUIRED');
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
  if (last.renderReconciliation) {
    validatePartialRenderOrigin(last, targets);
    requireThat(rows.every(row => ['renderOriginRunId', 'renderOriginExecutorSha', 'renderReconciliation'].every(key =>
      row[key] === undefined || objectDigest(row[key]) === objectDigest(last[key]))), 'CONTRADICTORY_BASELINE_RECEIPT');
  } else if (last.readinessRenderContinuation) {
    validateReadinessRenderOrigin(last);
    requireThat(rows.every(row => ['renderOriginRunId','renderOriginExecutorSha','readinessRenderContinuation'].every(k =>
      row[k] === undefined || objectDigest(row[k]) === objectDigest(last[k]))), 'CONTRADICTORY_BASELINE_RECEIPT');
  } else requireThat(rows.every(row => row.renderOriginRunId === undefined && row.renderOriginExecutorSha === undefined &&
    row.readinessRenderContinuation === undefined &&
    row.renderReconciliation === undefined && row.phase !== 'render-reconciled'), 'VERIFIED_BASELINE_RECEIPT_REQUIRED');
  if (last.startingBackendBindingSha256 !== undefined) {
    validateReadinessStartingAudit(last);
    requireThat(rows.every(row => ['startingRenderDeployId','startingRenderSha','startingBackendBindingSha256'].every(k =>
      row[k] === undefined || row[k] === last[k])), 'CONTRADICTORY_BASELINE_RECEIPT');
  } else requireThat(rows.every(row => row.startingRenderDeployId === undefined && row.startingRenderSha === undefined &&
    row.startingBackendBindingSha256 === undefined), 'VERIFIED_BASELINE_RECEIPT_REQUIRED');
  if (last.vercelSourceProof) {
    validateFrontendProof(last.vercelSourceProof, last.sha, targets.vercel);
    requireThat(rows.every(row => !row.vercelSourceProof || objectDigest(row.vercelSourceProof) === objectDigest(last.vercelSourceProof)) &&
      rows.some(row => row.phase === 'vercel-files-uploaded' && row.vercelSourceProof) &&
      rows.some(row => row.phase === 'vercel-requested' && row.vercelSourceProof), 'VERIFIED_BASELINE_RECEIPT_REQUIRED');
  }
  if (last.d10RuntimeBindings !== undefined) {
    validateD10Bindings(last.d10RuntimeBindings, last.sha);
    requireThat(rows.some(row => row.phase === 'provider-read' && row.scope === 'readiness-bindings' && row.d10RuntimeBindings) &&
      rows.every(row => row.d10RuntimeBindings === undefined || objectDigest(row.d10RuntimeBindings) === objectDigest(last.d10RuntimeBindings)),
      'CONTRADICTORY_BASELINE_RECEIPT');
  } else requireThat(rows.every(row => row.d10RuntimeBindings === undefined), 'VERIFIED_BASELINE_RECEIPT_REQUIRED');
  if (last.ownerRenderRedeploy !== undefined) {
    validateOwnerRenderProof(last.ownerRenderRedeploy, last);
    requireThat(rows.every(row => row.ownerRenderRedeploy === undefined ||
      objectDigest(row.ownerRenderRedeploy) === objectDigest(last.ownerRenderRedeploy)), 'CONTRADICTORY_BASELINE_RECEIPT');
  } else requireThat(rows.every(row => row.ownerRenderRedeploy === undefined), 'VERIFIED_BASELINE_RECEIPT_REQUIRED');
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
  requireThat(qualified.qualificationOnly === false, 'QUALIFICATION_ONLY_CANNOT_DEPLOY');
  policyDigest(policy); // Explicit mode selection; signed bundles never select a fallback.
  const readSource = options.readSourceDigest ?? (path => gitSourceDigest(options.env?.SOURCE_DIR, qualified.sha, path));
  const evidence = await verifyGitHubEvidence(api, qualified, policy, readSource, options.now);
  validateGitHubAdmission(options.admissionReceipt, qualified, policy, evidence, options.now);
  await validateAdmissionJob(api, qualified);
  let guard = async () => {
    validatePolicy(qualified, options.env ?? process.env, policy);
    await requalify(api, qualified);
    validateGitHubAdmission(options.admissionReceipt, qualified, policy, evidence, options.now);
    await validateInfrastructure(api, qualified, policy);
    await validateCandidateProvenance(api, qualified);
    if (qualified.memberRelease !== undefined) {
      verifyMemberSource(options.env?.SOURCE_DIR, qualified);
      await verifyMemberAuthority(api, qualified, options.env ?? process.env, options.now);
    }
  };
  await guard();
  const plan = options.evidencePlan;
  requireThat(plan && plan.policySha256 === qualified.policySha256, 'FROZEN_EVIDENCE_PLAN_REQUIRED');
  requireThat(objectDigest(await evidencePlan(api, qualified, policy)) === objectDigest(plan),
    'RELEASE_EVIDENCE_PLAN_CHANGED');
  if (qualified.memberRelease !== undefined) {
    return deployMemberRelease(api, qualified, report, { ...options, guard, targets,
      validateRender, validateVercel, validateHealth, deploymentHistory, waitFor, releaseKey,
      validateAdmission: () => validateGitHubAdmission(options.admissionReceipt, qualified, policy, evidence, options.now) });
  }
  requireThat(!!plan.baseline === !!options.baselineRows, 'BASELINE_RECEIPT_REQUIRED');
  requireThat(qualified.releaseRunAttempt === 1 ? !plan.resume && !options.receiptRows :
    plan.resume?.runId === qualified.releaseRunId && plan.resume.runAttempt === qualified.releaseRunAttempt - 1 &&
    plan.resume.sha === (external ? qualified.executorSha : qualified.sha) && options.receiptRows, 'RESUME_RECEIPT_REQUIRED');
  const partial = plan.partialRenderContinuation;
  const readyReuse = plan.readinessRenderContinuation;
  const acknowledged = plan.acknowledgedBackend;
  if (acknowledged) {
    validateReadinessStartingBackend(acknowledged, qualified);
    requireThat(!plan.baseline && !plan.resume && !partial && !options.receiptRows && qualified.releaseRunAttempt === 1 &&
      plan.historicalReconciliations?.some(r => r.runId === '41822854444' && r.originalConclusion === 'failure'),
    'READINESS_RELEASE_HISTORY_REQUIRED');
  }
  requireThat(!partial || (!plan.baseline && !plan.resume && !options.receiptRows), 'PARTIAL_CONTINUATION_CONFLICT');
  requireThat(!readyReuse || (!partial && !plan.baseline && !plan.resume && !options.receiptRows && acknowledged),
    'READINESS_CONTINUATION_CONFLICT');
  const prior = readyReuse ? readinessRenderReuse(readyReuse, qualified) : partial ? partialRenderReuse(partial, qualified, targets) :
    options.receiptRows ? validateResumeReceipt(options.receiptRows, qualified) : {};
  const schemaProof = await verifySchemaFirst(api, qualified, policy, readSource,
    options.schemaReadback ?? approvedSchemaReadback, !!plan.baseline, options.now);
  const firstRecovery = !plan.baseline ? validateFirstReleaseRecovery(
    options.recoveryReadback ?? approvedRecoveryReadback, qualified, policy, options.now, schemaProof) : null;
  requireThat(plan.firstReleaseRecoveryEvidenceSha256 === (firstRecovery?.evidenceSha256 ?? null),
    'FIRST_RELEASE_RECOVERY_PLAN_MISMATCH');
  requireThat(!firstRecovery || plan.verifiedReleases.length === 0, 'FIRST_RELEASE_RECOVERY_ALREADY_CONSUMED');
  const githubGuard = guard;
  guard = async () => {
    await githubGuard();
    await verifySchemaFirst(api, qualified, policy, readSource,
      options.schemaReadback ?? approvedSchemaReadback, !!plan.baseline, options.now);
    if (firstRecovery) validateFirstReleaseRecovery(
      options.recoveryReadback ?? approvedRecoveryReadback, qualified, policy, options.now, schemaProof);
  };
  report({ phase: 'evidence-selected', authorizationId: options.admissionReceipt.authorizationId,
    evidenceSha256: options.admissionReceipt.evidenceSha256, inventorySha256: evidence.inventorySha256,
    evidenceArtifactId: evidence.artifact.id, ...(partial || readyReuse ? prior : {}), ...(schemaProof ? {
      schemaFirstEvidenceSha256: schemaProof.evidenceSha256, recoveryMode: schemaProof.recoveryMode } : {}) });
  const frontend = prepareFrontend(options.frontendArchive, qualified.sha, targets.vercel, policy.scope.frontend.publicBuildInputs);
  requireThat(!prior.vercelSourceProof || objectDigest(prior.vercelSourceProof) === objectDigest(frontend.proof), 'CONTRADICTORY_RESUME_RECEIPT');
  const servicePath = `/services/${targets.render.id}`;
  const projectPath = `/v9/projects/${targets.vercel.id}`;
  const legacyDomainPath = `${projectPath}/domains/${legacyRecoveryPair.productionDomain}`;
  const checkRecoveryPair = async (baseline, web, project) => {
    const replacement = prior.vercelDeployId;
    const aliasId = replacement && project.targets?.production?.id === replacement ?
      replacement : firstRecovery.vercelDeployId;
    readScope('vercel-aliases');
    const mapping = await api.vercel(`/v2/deployments/${aliasId}/aliases`);
    validateLegacyProviderPair(firstRecovery, baseline, web, project,
      await api.vercel(legacyDomainPath), replacement, { deploymentId: aliasId, aliases: mapping?.aliases });
  };
  // Record direct deployment read families using fixed, non-sensitive scopes.
  // Admission/guard evidence reads retain their existing error contract.
  const readScope = scope => report({ phase: 'provider-read', scope });
  readScope('github-repository');
  const repository = await api.gh('');
  const readRender = async () => {
    const cleanStart = isCleanStartSchemaKind(policy.schemaFirst?.kind);
    const expected = cleanStart ? cleanStartRuntimeSettings : runtimeSettings;
    readScope('render-service');
    const service = await api.render(servicePath);
    const rows = [];
    readScope('render-env');
    for (const key of Object.keys(expected)) {
      const envVar = await api.render(`${servicePath}/env-vars/${key}`);
      requireThat(envVar?.key === key, 'NORMAL_RUNTIME_CONFIGURATION_UNVERIFIED');
      rows.push({ envVar });
    }
    validateRender(service, rows, cleanStart);
    if (qualified.sha === rootUnboundCandidateSha)
      requireThat(rows.some(r => r.envVar.key === 'Yoco__Mode' && r.envVar.value === 'live'), 'OWNER_RENDER_LIVE_CONFIGURATION_CHANGED');
  };
  await readRender();
  readScope('vercel-project');
  let project = await api.vercel(projectPath);
  validateVercel(project, repository.id);
  const readVercelVariables = async () => {
    readScope('vercel-env');
    const rows = (await api.vercel(`/v10/projects/${targets.vercel.id}/env?decrypt=false`)).envs;
    requireThat(Array.isArray(rows) && !rows.some(row =>
      /(?:BIRDAPIKEY|YOCOSECRETKEY|YOCOWEBHOOKSECRET|APPAQGREENV2COMMISSIONING(?:DECISION|VERIFIEDAUTHORITY|CLEANSTARTEVIDENCE)JSONBASE64|APPYOCOCUTOVERRECONCILIATIONJSONBASE64)$/.test(String(row.key).replace(/[^A-Za-z0-9]/g, '').toUpperCase())),
    'RUNTIME_CREDENTIAL_IN_FRONTEND_CONFIGURATION');
    for (const [key, expected] of Object.entries(frontend.proof.publicBuildInputs)) {
      const selected = rows.filter(row => row.key === key && row.target?.includes('production'));
      requireThat(selected.length === 1 && !selected[0].gitBranch, 'VERCEL_PUBLIC_BUILD_CONFIGURATION_UNVERIFIED');
      // Sensitive/encrypted project values intentionally remain unreadable. The
      // explicit request build.env takes precedence and its effective echo is checked.
      if (['plain', 'system'].includes(selected[0].type) && selected[0].value !== undefined)
        requireThat(selected[0].value === expected, 'VERCEL_PUBLIC_BUILD_CONFIGURATION_UNVERIFIED');
    }
  };
  let nativeBindings = prior.d10RuntimeBindings;
  const readProtectedReadiness = async sha => {
    try {
      readScope('readiness'); const response = await api.readiness(sha); validateReadiness(response, sha);
      requireThat(sha !== qualified.sha || ![postResetCandidateSha,minimumLiveCandidateSha,d10OneTimeCandidateSha,verifiedHoldCandidateSha,unusedExpiryCandidateSha].includes(qualified.sha) || response.body.version === 2, 'D10_NATIVE_READINESS_REQUIRED');
      if (sha === qualified.sha && response.body.version === 2) {
        requireThat(!nativeBindings || objectDigest(nativeBindings) === objectDigest(response.body.d10Bindings), 'D10_RUNTIME_BINDINGS_CHANGED');
        nativeBindings = response.body.d10Bindings;
        report({ phase: 'provider-read', scope: 'readiness-bindings', d10RuntimeBindings: nativeBindings });
      }
    }
    catch { throw new ReleaseFailure('PROTECTED_RUNTIME_READINESS_FAILED'); }
  };
  await readVercelVariables();
  const verifyFrontend = async (web, proof, meta, root) => {
    requireThat(root === targets.vercel.rootDirectory, 'VERCEL_SOURCE_PROVENANCE_MISMATCH');
    readScope('web-readiness');
    return verifyObservedFileDeployment(api, web, proof, targets.vercel, meta, options.publicFetch);
  };
  // A verified predecessor remains authoritative after the first rollout. On the
  // first rollout, select the current exact provider pair automatically. On a
  // partial retry use the original immutable baseline, never the advanced live SHA.
  let baselineProof;
  if (plan.baseline) baselineProof = validateBaselineReceipt(options.baselineRows, plan.baseline, qualified);
  else {
    const baselineRow = options.receiptRows?.find(row => row.phase === 'baseline-selected') ?? partial?.baseline ?? acknowledged?.recoveryBaseline;
    requireThat(!prior.renderDeployId || baselineRow, 'RESUME_BASELINE_RECEIPT_REQUIRED');
    if (baselineRow) {
      baselineProof = { renderDeployId: baselineRow.baselineRenderDeployId, renderSha: baselineRow.baselineRenderSha,
        vercelDeployId: baselineRow.baselineVercelDeployId, vercelSha: baselineRow.baselineVercelSha,
        vercelSourceProvenance: baselineRow.baselineVercelSourceProvenance };
      requireThat(baselineRow.firstReleaseRecoveryEvidenceSha256 === firstRecovery.evidenceSha256,
        'FIRST_RELEASE_RECOVERY_RESUME_MISMATCH');
    } else {
      readScope('render-deploy-history');
      const live = (await deploymentHistory(api, 'render')).filter(row => row.status === 'live');
      requireThat(live.length === 1, 'AUTOMATIC_RENDER_BASELINE_UNVERIFIABLE');
      const webId = project.targets?.production?.id;
      requireThat(/^dpl_[A-Za-z0-9]+$/.test(webId), 'AUTOMATIC_VERCEL_BASELINE_UNVERIFIABLE');
      readScope('vercel-deployment');
      const web = await api.vercel(`/v13/deployments/${webId}`);
      baselineProof = { renderDeployId: live[0].id, renderSha: live[0].commit?.id,
        vercelDeployId: webId, vercelSha: web.gitSource?.sha,
        vercelSourceProvenance: web.gitSource?.sha ? 'GIT_SOURCE' : 'UNVERIFIED_LEGACY' };
      if (firstRecovery.kind === nativeRecoveryPolicyKind) {
        requireThat(validNativeHeldFrontend(firstRecovery, web), 'NATIVE_RECOVERY_FRONTEND_PROVENANCE_UNVERIFIED');
        baselineProof.vercelSha = firstRecovery.vercelSha;
        baselineProof.vercelSourceProvenance = firstRecovery.frontendSourceProvenance;
      }
    }
    requireThat(baselineProof.renderDeployId === firstRecovery.renderDeployId &&
      baselineProof.renderSha === firstRecovery.renderSha && baselineProof.vercelDeployId === firstRecovery.vercelDeployId,
      'FIRST_RELEASE_RECOVERY_IDENTITY_MISMATCH');
    requireThat(/^dep-[a-z0-9]+$/.test(baselineProof.renderDeployId) &&
      /^dpl_[A-Za-z0-9]+$/.test(baselineProof.vercelDeployId) &&
      shaPattern.test(baselineProof.renderSha ?? '') && (shaPattern.test(baselineProof.vercelSha ?? '') ||
        (baselineProof.vercelSha === undefined && baselineProof.vercelSourceProvenance === 'UNVERIFIED_LEGACY')),
    'AUTOMATIC_BASELINE_PROVENANCE_UNVERIFIABLE');
  }
  const ownerBackend = qualified.sha === rootUnboundCandidateSha
    ? await verifyOwnerRenderRedeployment(api, qualified, baselineProof) : qualified.sha===unusedExpiryCandidateSha
      ? await verifyHeldRecovery(api,qualified,baselineProof) : null;
  const baselineFields = { baselineRenderDeployId: baselineProof.renderDeployId,
    baselineVercelDeployId: baselineProof.vercelDeployId, baselineRenderSha: baselineProof.renderSha,
    ...(baselineProof.vercelSha !== undefined ? { baselineVercelSha: baselineProof.vercelSha } : {}),
    ...(firstRecovery ? { baselineVercelSourceProvenance: baselineProof.vercelSourceProvenance,
      firstReleaseRecoveryEvidenceSha256: firstRecovery.evidenceSha256 } : {}) };
  report({ phase: 'baseline-selected', ...baselineFields,
    ...(ownerBackend ? { ownerRenderRedeploy: ownerBackend } : {}), ...(acknowledged ? {
    startingRenderDeployId: readyReuse ? prior.renderDeployId : acknowledged.renderDeployId,
    startingRenderSha: readyReuse ? qualified.sha : acknowledged.renderSha,
    startingBackendBindingSha256: readyReuse ? readyReuse.continuationBindingSha256 : acknowledged.bindingSha256 } : {}) });
  requireThat(baselineProof.renderSha !== qualified.sha && baselineProof.vercelSha !== qualified.sha,
    'SOURCE_ALREADY_DEPLOYED_RETAIN_ORIGINAL_CI_PROVENANCE');
  for (const key of Object.keys(baselineFields))
    requireThat(!options.receiptRows || options.receiptRows.every(row => row[key] === undefined ||
      row[key] === baselineFields[key]), 'RESUME_BASELINE_MISMATCH');
  readScope('render-deploy');
  const baseline = await api.render(`${servicePath}/deploys/${baselineProof.renderDeployId}`);
  requireThat(baseline.id === baselineProof.renderDeployId && baseline.commit?.id === baselineProof.renderSha &&
    ['live', 'deactivated'].includes(baseline.status), 'ROLLBACK_BASELINE_REVISION_UNAVAILABLE');
  readScope('vercel-deployment');
  const oldWeb = await api.vercel(`/v13/deployments/${baselineProof.vercelDeployId}`);
  if (firstRecovery) await checkRecoveryPair(baseline, oldWeb, project);
  requireThat(oldWeb.id === baselineProof.vercelDeployId && oldWeb.projectId === targets.vercel.id &&
    oldWeb.target === 'production' && oldWeb.readyState === 'READY' && !oldWeb.aliasError &&
    (firstRecovery?.kind === nativeRecoveryPolicyKind ? validNativeHeldFrontend(firstRecovery, oldWeb) :
      firstRecovery && baselineProof.vercelSourceProvenance === 'UNVERIFIED_LEGACY' ?
      oldWeb.gitSource === undefined || oldWeb.gitSource === null : baselineProof.origin?.vercelSourceProof ? true :
      oldWeb.gitSource?.sha === baselineProof.vercelSha && String(oldWeb.gitSource?.repoId) === String(repository.id)),
    'ROLLBACK_FRONTEND_PROVENANCE_UNVERIFIED');
  if (baselineProof.origin) {
    const origin = { ...baselineProof.origin, releaseRunAttempt: baselineProof.origin.vercelReleaseRunAttempt };
    if (origin.vercelSourceProof) {
      const meta = { aquaCiRunId: origin.ciRunId, aquaCiRunAttempt: String(origin.ciRunAttempt),
        aquaSourceSha: origin.sha, aquaReleaseIdentity: releaseKey(origin) };
      // A retained readable artifact need not still own the alias after an
      // acknowledged replacement. Never read that replacement's assets as proof
      // of a names-only predecessor; the observed verifier requires exact binding.
      if (Array.isArray(oldWeb.env) && Array.isArray(oldWeb.build?.env))
        await verifyFrontend(oldWeb, origin.vercelSourceProof, meta, project.rootDirectory);
      else validateFileDeployment(oldWeb, origin.vercelSourceProof, targets.vercel, meta, project.rootDirectory);
    }
    requireThat(oldWeb.meta?.aquaReleaseIdentity === releaseKey(origin) &&
      oldWeb.meta?.aquaCiRunId === origin.ciRunId && oldWeb.meta?.aquaCiRunAttempt === String(origin.ciRunAttempt),
    'ROLLBACK_FRONTEND_PROVENANCE_UNVERIFIED');
  }
  readScope('github-compare');
  const compare = await api.gh(`/compare/${baseline.commit.id}...${qualified.sha}`);
  requireThat(compare.status === 'ahead' || compare.status === 'identical', 'SOURCE_NOT_BASELINE_DESCENDANT');
  validateMigrationDelta(compare, !!schemaProof);
  readScope('render-deploy-history');
  const renderDeploys = await deploymentHistory(api, 'render');
  const live = renderDeploys.filter(x => x.status === 'live');
  const startingRenderId = ownerBackend?.renderDeployId ?? acknowledged?.renderDeployId ?? baselineProof.renderDeployId;
  const startingRenderSha = ownerBackend?.renderSha ?? acknowledged?.renderSha ?? baselineProof.renderSha;
  requireThat(live.length === 1 && (live[0].id === startingRenderId && live[0].commit?.id === startingRenderSha ||
    (live[0].id === prior.renderDeployId && live[0].commit?.id === qualified.sha)), 'RENDER_BASELINE_DRIFT');
  requireThat(!(partial || readyReuse) || (live[0].id === prior.renderDeployId && live[0].commit?.id === qualified.sha),
    'RECONCILED_RENDER_NOT_UNIQUELY_LIVE');
  readScope('health');
  validateHealth(await api.health(), live[0].commit.id);
  // First release: the legacy baseline has no readiness route. Its exact healthy
  // revision, normal configuration and verified rollback pair are still required.
  // Never interpret a failed/404 readiness response as bootstrap authorization.
  // Once a verified production predecessor exists, require readiness pre-mutation.
  if (plan.baseline) await readProtectedReadiness(live[0].commit.id);
  requireThat(renderDeploys.every(x => !activeRender.has(x.status) || x.id === prior.renderDeployId),
    'CONCURRENT_RENDER_DEPLOYMENT');
  let render = prior.renderDeployId ? renderDeploys.find(x => x.id === prior.renderDeployId) : undefined;
  requireThat(!prior.renderDeployId || (render && render.commit?.id === qualified.sha),
    'RENDER_RECEIPT_DEPLOYMENT_MISMATCH');
  requireThat(renderDeploys.every(x => x.commit?.id !== qualified.sha || x.id === prior.renderDeployId),
    'RENDER_PROVENANCE_RECEIPT_REQUIRED');
  readScope('vercel-deploy-history');
  const vercelDeploys = await deploymentHistory(api, 'vercel');
  requireThat(vercelDeploys.every(x => !activeVercel.has(x.state ?? x.readyState) ||
    x.uid === prior.vercelDeployId), 'CONCURRENT_VERCEL_DEPLOYMENT');
  requireThat(vercelDeploys.every(x =>
    (x.meta?.aquaCiRunId !== qualified.ciRunId && x.meta?.aquaSourceSha !== qualified.sha) ||
    x.uid === prior.vercelDeployId), 'VERCEL_PROVENANCE_RECEIPT_REQUIRED');
  const origin = { ...qualified, releaseRunAttempt: prior.vercelReleaseRunAttempt ?? qualified.releaseRunAttempt };
  let vercelPublicInputsObservation;
  const isOurs = async (x, pending = false) => {
    const meta = { aquaCiRunId: qualified.ciRunId, aquaCiRunAttempt: String(qualified.ciRunAttempt),
      aquaSourceSha: qualified.sha, aquaReleaseIdentity: releaseKey(origin) };
    // Only an exact acknowledged same-run operation can be pending here. Prove
    // its source before polling; effective inputs must still pass once READY.
    if (pending && activeVercel.has(x.readyState)) {
      validateFileDeploymentSource(x, frontend.proof, targets.vercel, meta);
      if (!Array.isArray(x.env) || !Array.isArray(x.build?.env))
        validateFileDeployment(x, frontend.proof, targets.vercel, meta, project.rootDirectory);
    } else vercelPublicInputsObservation = await verifyFrontend(x, frontend.proof, meta, project.rootDirectory);
    return x.projectId === targets.vercel.id &&
    x.meta?.aquaCiRunId === qualified.ciRunId && x.meta?.aquaCiRunAttempt === String(qualified.ciRunAttempt) &&
    x.meta?.aquaReleaseIdentity === releaseKey(origin) && x.target === 'production';
  };
  let existingVercel;
  for (const d of vercelDeploys.filter(x => x.uid === prior.vercelDeployId)) {
    requireThat(/^dpl_[A-Za-z0-9]+$/.test(d.uid), 'VERCEL_DEPLOYMENT_ID_UNAVAILABLE');
    readScope('vercel-deployment');
    const full = await api.vercel(`/v13/deployments/${d.uid}`);
    requireThat(await isOurs(full, true), 'VERCEL_SOURCE_PROVENANCE_MISMATCH');
    requireThat(full.readyState === 'READY' || activeVercel.has(full.readyState), 'PRIOR_VERCEL_FAILURE_REQUIRES_OPERATOR');
    requireThat(!existingVercel, 'AMBIGUOUS_VERCEL_DEPLOYMENTS');
    existingVercel = full;
  }
  requireThat(!prior.vercelDeployId || existingVercel, 'VERCEL_RECEIPT_DEPLOYMENT_MISMATCH');
  requireThat(project.targets?.production?.id === baselineProof.vercelDeployId ||
    (existingVercel && project.targets?.production?.id === existingVercel.id), 'VERCEL_BASELINE_DRIFT');

  report({ phase: 'admitted', sha: qualified.sha, ciRunId: qualified.ciRunId,
    ...baselineFields, ...prior });
  if (partial || readyReuse) report({ phase: 'render-reconciled', ...prior });
  if (render) requireThat(render.status === 'live' || activeRender.has(render.status), 'PRIOR_RENDER_FAILURE_REQUIRES_OPERATOR');
  else {
    // Recheck freshness immediately before the irreversible provider request.
    await guard();
    await readRender();
    readScope('render-deploy-history');
    const latestRender = await deploymentHistory(api, 'render');
    requireThat(latestRender.filter(x => x.status === 'live').length === 1 &&
      latestRender.some(x => x.id === startingRenderId && x.status === 'live' &&
        x.commit?.id === startingRenderSha) && latestRender.every(x => !activeRender.has(x.status)) &&
      latestRender.every(x => x.commit?.id !== qualified.sha), 'RENDER_CHANGED_BEFORE_REQUEST');
    if (firstRecovery) {
      readScope('render-deploy');
      const baseline = await api.render(`${servicePath}/deploys/${firstRecovery.renderDeployId}`);
      readScope('vercel-deployment');
      const web = await api.vercel(`/v13/deployments/${firstRecovery.vercelDeployId}`);
      await checkRecoveryPair(baseline, web, project);
    }
    report({ phase: 'render-requesting' });
    render = await api.render(`${servicePath}/deploys`, { commitId: qualified.sha, clearCache: 'do_not_clear' });
  }
  requireThat(/^dep-[a-z0-9]+$/.test(render.id), 'RENDER_DEPLOYMENT_ID_UNAVAILABLE');
  if (!partial && !readyReuse) report({ phase: 'render-requested', renderDeployId: render.id,
    renderReleaseRunAttempt: prior.renderReleaseRunAttempt ?? qualified.releaseRunAttempt });
  readScope('render-deploy');
  render = await waitFor(() => api.render(`${servicePath}/deploys/${render.id}`),
    x => x.status, 'live', activeRender, options);
  requireThat(render.commit?.id === qualified.sha, 'RENDER_SOURCE_PROVENANCE_MISMATCH');
  await readRender();
  readScope('health');
  validateHealth(await api.health(), qualified.sha);
  await readProtectedReadiness(qualified.sha);
  report({ phase: 'render-ready', renderDeployId: render.id, sha: render.commit.id });

  await guard();
  readScope('render-deploy-history');
  const currentRender = await deploymentHistory(api, 'render');
  requireThat(currentRender.filter(x => x.status === 'live').length === 1 &&
    currentRender.some(x => x.status === 'live' && x.id === render.id && x.commit?.id === qualified.sha) &&
    currentRender.every(x => !activeRender.has(x.status) || x.id === render.id), 'RENDER_CHANGED_AFTER_READINESS');
  readScope('vercel-project');
  project = await api.vercel(projectPath);
  validateVercel(project, repository.id);
  await readVercelVariables();
  requireThat(project.targets?.production?.id === baselineProof.vercelDeployId ||
    (existingVercel && project.targets?.production?.id === existingVercel.id), 'VERCEL_BASELINE_DRIFT');
  if (!existingVercel) {
    if (firstRecovery) {
      readScope('render-deploy');
      const baseline = await api.render(`${servicePath}/deploys/${firstRecovery.renderDeployId}`);
      readScope('vercel-deployment');
      const web = await api.vercel(`/v13/deployments/${firstRecovery.vercelDeployId}`);
      await checkRecoveryPair(baseline, web, project);
    }
    await guard();
    await readRender();
    readScope('vercel-deploy-history');
    const latestVercel = await deploymentHistory(api, 'vercel');
    requireThat(latestVercel.every(x => !activeVercel.has(x.state ?? x.readyState) &&
      x.meta?.aquaCiRunId !== qualified.ciRunId && x.meta?.aquaSourceSha !== qualified.sha),
    'VERCEL_CHANGED_BEFORE_REQUEST');
    report({ phase: 'vercel-files-requesting', vercelSourceProof: frontend.proof });
    const uploaded = new Set();
    for (const file of frontend.files) {
      if (uploaded.has(file.sha)) continue;
      // Uploads store inert, content-addressed files, not a live deployment.
      // Bound full GitHub rechecks to avoid exhausting the evidence token's API
      // quota for hundreds of files; every file still checks receipt expiry.
      if (uploaded.size % 32 === 0) await guard();
      validateGitHubAdmission(options.admissionReceipt, qualified, policy, evidence, options.now);
      requireThat(createHash('sha256').update(file.data).digest('hex') === file.sha256,
        'VERCEL_UPLOAD_HASH_MISMATCH');
      await api.uploadVercel(file.data, file.sha);
      uploaded.add(file.sha);
    }
    report({ phase: 'vercel-files-uploaded' });
    // Uploads are provider operations: recheck admission and live identities again.
    await guard();
    readScope('vercel-deploy-history');
    const afterUploads = await deploymentHistory(api, 'vercel');
    requireThat(afterUploads.every(x => !activeVercel.has(x.state ?? x.readyState) &&
      x.meta?.aquaCiRunId !== qualified.ciRunId && x.meta?.aquaSourceSha !== qualified.sha),
      'VERCEL_CHANGED_BEFORE_REQUEST');
    readScope('render-deploy-history');
    const afterUploadRender = await deploymentHistory(api, 'render');
    requireThat(afterUploadRender.filter(x => x.status === 'live').length === 1 &&
      afterUploadRender.some(x => x.id === render.id && x.status === 'live' && x.commit?.id === qualified.sha) &&
      afterUploadRender.every(x => !activeRender.has(x.status)), 'RENDER_CHANGED_AFTER_READINESS');
    readScope('vercel-project');
    project = await api.vercel(projectPath);
    validateVercel(project, repository.id);
    requireThat(project.targets?.production?.id === baselineProof.vercelDeployId, 'VERCEL_BASELINE_DRIFT');
    if (firstRecovery) {
      readScope('render-deploy');
      const baseline = await api.render(`${servicePath}/deploys/${firstRecovery.renderDeployId}`);
      readScope('vercel-deployment');
      const web = await api.vercel(`/v13/deployments/${firstRecovery.vercelDeployId}`);
      await checkRecoveryPair(baseline, web, project);
    }
    await readVercelVariables();
    await readProtectedReadiness(qualified.sha);
    await guard();
    report({ phase: 'vercel-requesting' });
    existingVercel = await api.vercel('/v13/deployments', fileDeploymentBody(frontend, targets.vercel, {
      aquaCiRunId: qualified.ciRunId, aquaCiRunAttempt: String(qualified.ciRunAttempt),
      aquaSourceSha: qualified.sha, aquaReleaseIdentity: releaseKey(qualified) }));
  }
  requireThat(/^dpl_[A-Za-z0-9]+$/.test(existingVercel.id), 'VERCEL_DEPLOYMENT_ID_UNAVAILABLE');
  report({ phase: 'vercel-requested', vercelDeployId: existingVercel.id,
    vercelReleaseRunAttempt: prior.vercelReleaseRunAttempt ?? qualified.releaseRunAttempt });
  readScope('vercel-deployment');
  const vercel = await waitFor(() => api.vercel(`/v13/deployments/${existingVercel.id}`),
    x => x.readyState, 'READY', activeVercel, options);
  requireThat(await isOurs(vercel) && vercel.projectId === targets.vercel.id && !vercel.aliasError,
    'VERCEL_SOURCE_PROVENANCE_MISMATCH');
  readScope('vercel-project');
  project = await api.vercel(projectPath);
  requireThat(project.targets?.production?.id === vercel.id, 'VERCEL_PRODUCTION_ALIAS_NOT_ASSIGNED');
  readScope('web-readiness');
  await api.web();
  await guard();
  await readRender();
  readScope('health');
  validateHealth(await api.health(), qualified.sha);
  await readProtectedReadiness(qualified.sha);
  readScope('render-deploy-history');
  const finalRender = await deploymentHistory(api, 'render');
  requireThat(finalRender.filter(x => x.status === 'live').length === 1 &&
    finalRender.some(x => x.id === render.id && x.status === 'live' && x.commit?.id === qualified.sha) &&
    finalRender.every(x => !activeRender.has(x.status)), 'RENDER_CHANGED_BEFORE_VERIFICATION');
  readScope('vercel-project');
  project = await api.vercel(projectPath);
  validateVercel(project, repository.id);
  await readVercelVariables();
  readScope('vercel-deployment');
  const finalWeb = await api.vercel(`/v13/deployments/${vercel.id}`);
  requireThat(project.targets?.production?.id === vercel.id && finalWeb.readyState === 'READY' &&
    await isOurs(finalWeb) && !finalWeb.aliasError, 'VERCEL_CHANGED_BEFORE_VERIFICATION');
  readScope('vercel-deploy-history');
  const finalVercel = await deploymentHistory(api, 'vercel');
  requireThat(finalVercel.every(x => !activeVercel.has(x.state ?? x.readyState) || x.uid === vercel.id),
    'CONCURRENT_VERCEL_BEFORE_VERIFICATION');
  report({ phase: 'verified', sha: qualified.sha, renderSha: render.commit.id, vercelSha: qualified.sha,
    renderDeployId: render.id, vercelDeployId: vercel.id,
    ...(vercelPublicInputsObservation ? { vercelPublicInputsObservation } : {}) });
}

// Inactive signed-attestation prototype, retained for its existing contract tests.
// The v3 deployment path never invokes it or falls back to it.
export async function requireDeploymentAttestation(authorization, qualified, { reserveReplay = true } = {}) {
  requireThat(authorization && typeof authorization === 'object', 'INDEPENDENT_ATTESTATION_REQUIRED');
  const { expected, trustRoot } = authorization;
  requireThat(expected?.audience === `${targets.executor.repository}:${targets.environment}` &&
    expected?.source?.repository === qualified.repository && expected.source.commitSha === qualified.sha &&
    expected.source.ciRunId === qualified.ciRunId && expected.source.ciRunAttempt === qualified.ciRunAttempt &&
    expected.policyDigest === qualified.policySha256 &&
    Array.isArray(expected.mandatoryChecks) && expected.mandatoryChecks.length === requiredJobs.length &&
    requiredJobs.every(context => expected.mandatoryChecks.filter(x => x.context === context &&
      x.integrationId === 15368).length === 1), 'ATTESTATION_RELEASE_CONTEXT_MISMATCH');
  try { return await verifyPrototypeAttestation({ ...authorization, reserveReplay }); }
  catch (error) {
    if (error instanceof AttestationDenied) throw new ReleaseFailure(error.code);
    throw new ReleaseFailure('ATTESTATION_UNVERIFIABLE');
  }
}

export async function validateAdmissionJob(api, qualified) {
  const page = await api.executor(`/actions/runs/${qualified.releaseRunId}/attempts/${qualified.releaseRunAttempt}/jobs?per_page=100`);
  requireThat(page.total_count === page.jobs?.length && page.jobs.length === 3 &&
    new Set(page.jobs.map(job => job.name)).size === 3 &&
    page.jobs.every(job => job.run_id === Number(qualified.releaseRunId) &&
      job.run_attempt === qualified.releaseRunAttempt), 'ADMISSION_JOB_EVIDENCE_UNVERIFIABLE');
  const candidate = page.jobs.find(job => job.name === 'Qualify immutable source candidate');
  const admission = page.jobs.find(job => job.name === admissionJobName);
  const production = page.jobs.find(job => job.name === 'Unattended recovery release');
  requireThat(candidate?.status === 'completed' && candidate.conclusion === 'success' &&
    admission?.status === 'completed' && admission.conclusion === 'success' &&
    production?.status === 'in_progress', 'ADMISSION_JOB_NOT_SUCCESSFUL');
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
    const inputs = validateDispatchInputs(event.inputs);
    const qualified = await qualify(api, inputs.ci_run_id);
    requireThat(qualified.sha === inputs.sha && String(qualified.ciRunAttempt) === inputs.ci_run_attempt,
      'CI_EVENT_PROVENANCE_MISMATCH');
    q = freezeCandidate(qualified, env, policy, inputs.qualificationOnly, inputs.releaseMode);
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
  if (q.memberRelease !== undefined) {
    verifyMemberSource(env.SOURCE_DIR, q);
    await verifyMemberAuthority(api, q, env, options.now);
  }
  if (mode === 'candidate') {
    // Detect accidental reviewer/wait gates before entering the environment job.
    await validateInfrastructure(api, q, policy);
    await validateCandidateProvenance(api, q);
    const archive = sourceArchive(q.sha);
    writeFileSync(`${env.CANDIDATE_DIR}/source.tar`, archive);
    writeFileSync(`${env.CANDIDATE_DIR}/candidate.json`, JSON.stringify({ ...q,
      sourceSha256: createHash('sha256').update(archive).digest('hex') }, null, 2) + '\n');
    appendFileSync(env.GITHUB_OUTPUT, `sha=${q.sha}\nqualification_only=${q.qualificationOnly}\n`);
    return;
  }
  requireThat(mode === 'deploy' || mode === 'admit', 'RELEASE_MODE_INVALID');
  requireThat(mode !== 'deploy' || q.qualificationOnly === false, 'QUALIFICATION_ONLY_CANNOT_DEPLOY');
  const trustedSourceArchive = sourceArchive(q.sha);
  verifyCandidate(JSON.parse(readFileSync(`${env.CANDIDATE_DIR}/candidate.json`)), q,
    readFileSync(`${env.CANDIDATE_DIR}/source.tar`),
    trustedSourceArchive);
  policyDigest(policy);
  const readSource = options.readSourceDigest ?? (path => gitSourceDigest(env.SOURCE_DIR, q.sha, path));
  const evidence = await verifyGitHubEvidence(api, q, policy, readSource, options.now);
  const report = createAuditWriter(q, row => appendFileSync(env.RELEASE_REPORT, JSON.stringify(row) + '\n'));
  failureReport = code => report({ phase: 'failed', code });
  if (mode === 'admit') {
    // GitHub-only admission. No provider or replay-database credentials are read.
    await validateInfrastructure(api, q, policy);
    await validateCandidateProvenance(api, q);
    const plan = await evidencePlan(api, q, policy);
    const schemaProof = q.memberRelease === undefined ? await verifySchemaFirst(api, q, policy, readSource,
      options.schemaReadback ?? approvedSchemaReadback, !!plan.baseline, options.now) : null;
    // Provider credentials remain unavailable here. The named operator's original
    // eligibility/compatibility readback must be approved with this executor SHA.
    // Qualification-only execution never constitutes production authorization.
    if (q.memberRelease === undefined && !q.qualificationOnly && !plan.baseline)
      validateFirstReleaseRecovery(options.recoveryReadback ?? approvedRecoveryReadback, q, policy, options.now, schemaProof);
    const receipt = createGitHubAdmission(q, policy, evidence, options.now);
    requireThat(typeof env.AQUA_ADMISSION_RECEIPT_OUTPUT === 'string', 'ADMISSION_OUTPUT_REQUIRED');
    writeFileSync(env.AQUA_ADMISSION_RECEIPT_OUTPUT, JSON.stringify(receipt) + '\n', { flag: 'wx', mode: 0o600 });
    writeFileSync(`${env.CANDIDATE_DIR}/evidence-plan.json`, JSON.stringify(plan) + '\n');
    report({ phase: 'admitted', authorizationId: receipt.authorizationId, evidenceSha256: receipt.evidenceSha256,
      inventorySha256: evidence.inventorySha256, evidenceArtifactId: evidence.artifact.id });
    appendFileSync(env.GITHUB_OUTPUT, `baseline-artifact-id=${plan.baseline?.artifactId ?? ''}\n` +
      `baseline-run-id=${plan.baseline?.runId ?? ''}\nreceipt-artifact-id=${plan.resumeChain.map(x => x.artifactId).join(',')}\n`);
    return;
  }
  let admissionReceipt;
  try { admissionReceipt = JSON.parse(readFileSync(env.AQUA_ADMISSION_RECEIPT_FILE, 'utf8')); }
  catch { throw new ReleaseFailure('ADMISSION_RECEIPT_MISMATCH'); }
  validateGitHubAdmission(admissionReceipt, q, policy, evidence, options.now);
  await validateAdmissionJob(api, q);
  validatePolicy(q, env, policy);
  await validateInfrastructure(api, q, policy);
  await validateCandidateProvenance(api, q);
  const plan = await evidencePlan(api, q, policy);
  let admittedPlan;
  try { admittedPlan = JSON.parse(readFileSync(`${env.CANDIDATE_DIR}/evidence-plan.json`, 'utf8')); }
  catch { throw new ReleaseFailure('FROZEN_EVIDENCE_PLAN_REQUIRED'); }
  requireThat(objectDigest(admittedPlan) === objectDigest(plan), 'RELEASE_EVIDENCE_PLAN_CHANGED');
  await deploy(api, q, policy, report, { env, evidencePlan: plan, admissionReceipt,
    readSourceDigest: readSource, now: options.now,
    schemaReadback: options.schemaReadback,
    recoveryReadback: options.recoveryReadback,
    ...options.deploymentOptions, frontendArchive: trustedSourceArchive,
    baselineRows: plan.baseline ? readAuditFile(env.BASELINE_RECEIPT_FILE) : undefined,
    receiptRows: plan.resume ? plan.resumeChain.flatMap(d => readAuditFile(plan.resumeChain.length === 1 ?
      `${env.RESUME_RECEIPT_DIR}/release-report.jsonl` :
      `${env.RESUME_RECEIPT_DIR}/production-release-audit-${d.runId}-${d.runAttempt}/release-report.jsonl`)) : undefined });
}

export async function run(env, options = {}) {
  try { await main(env, options); return 0; }
  catch (error) {
    const code = (error instanceof ReleaseFailure || error instanceof GitHubEvidenceDenied ||
      error instanceof VercelSourceDenied ||
      error instanceof FirstReleaseRecoveryDenied || error instanceof SchemaFirstDenied ||
      error instanceof MemberReleaseDenied || error instanceof HistoricalReconciliationDenied ||
      error instanceof PriorRunNotRecognized || error instanceof ReadinessReleaseDenied) ? error.message : 'UNEXPECTED_RELEASE_ERROR';
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
