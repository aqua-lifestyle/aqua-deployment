// An explicit, purpose-bound exception for ONE already accepted source pair.
// No DDL, database credential, retirement, D10, replay or configuration writer.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { objectDigest, sha256 } from './github-evidence.mjs';
import { runtimeSettings } from './runtime-readiness.mjs';
import { prepareFrontend, fileDeploymentBody, validateFileDeployment, validateFrontendProof } from './vercel-source.mjs';

export const memberPolicy = JSON.parse(readFileSync(new URL('./member-release.json', import.meta.url)));
export const memberPolicyDigest = objectDigest(memberPolicy);
export const memberContinuation = JSON.parse(readFileSync(new URL('./member-continuation.json', import.meta.url)));
export class MemberReleaseDenied extends Error {}
const check = (ok, code) => { if (!ok) throw new MemberReleaseDenied(code); };
export const memberRuntimeSettings = Object.freeze({
  ...Object.fromEntries(Object.entries(runtimeSettings).filter(([key]) => key !== 'App__AQGreenV2__Commissioning__Enabled')),
  App__YocoCutover__Enabled: ['true'], App__AutomaticPayouts__Enabled: ['false']
});

export function validateMemberIdentity(q) {
  check(q.memberRelease === memberPolicyDigest && q.sha === memberPolicy.frontendSha &&
    q.repository === 'aqua-lifestyle/aqua-lifestyle' && q.profile === 'normal-integrated' &&
    q.renderServiceId === 'srv-d9f0k8e1a83c73d8n1b0' &&
    q.vercelProjectId === 'prj_6qL1e43KhsWrRshY5GxdmGl3HGMz' &&
    q.vercelTeamId === 'team_Hc3BWfhTLfwLzwbgbtaasBUY', 'MEMBER_SOURCE_PAIR_OR_TARGET_MISMATCH');
}

export function verifyMemberSource(directory, q) {
  validateMemberIdentity(q);
  try {
    const git = args => execFileSync('git', ['-C', directory, ...args],
      { maxBuffer: 4096, stdio: ['ignore', 'pipe', 'pipe'] });
    check(sha256(git(['show', `${q.sha}:tools/operations/yoco-receiver54.json`])) === memberPolicy.receiverManifestSha256,
      'MEMBER_RECEIVER_MANIFEST_CHANGED');
    check(git(['rev-parse', `${memberPolicy.receiverSha}^{tree}`]).toString().trim() === memberPolicy.receiverTree,
      'MEMBER_RECEIVER_TREE_MISMATCH');
  } catch (e) {
    if (e instanceof MemberReleaseDenied) throw e;
    throw new MemberReleaseDenied('MEMBER_SOURCE_UNAVAILABLE');
  }
}

export function validateMemberContinuation(rows, descriptor) {
  check(descriptor.runId === memberContinuation.runId && descriptor.runAttempt === 1 &&
    descriptor.sha === memberContinuation.executorSha && descriptor.artifactId === memberContinuation.artifactId &&
    objectDigest(rows) === memberContinuation.receiptSha256, 'MEMBER_CONTINUATION_RECEIPT_MISMATCH');
  const first = rows[0], last = rows.at(-1);
  validateMemberIdentity(first);
  check(first.releaseRunId === memberContinuation.runId && first.releaseRunAttempt === 1 &&
    first.executorSha === memberContinuation.executorSha && first.sha === memberPolicy.frontendSha &&
    rows.every(x => x.renderDeployId === undefined || x.renderDeployId === memberContinuation.renderDeployId) &&
    rows.filter(x => x.phase === 'member-render-requested').length === 1 &&
    !rows.some(x => x.phase.startsWith('member-vercel') || x.vercelDeployId !== undefined) &&
    last.phase === 'failed' && last.code === 'API_REVISION_OR_RECOVERY_READINESS_FAILED',
  'MEMBER_CONTINUATION_OUTCOME_NOT_RECONCILABLE');
  return { ...memberContinuation, receiverSha: memberPolicy.receiverSha, frontendSha: memberPolicy.frontendSha };
}

// A verified member deployment resolves its own provider history, never supplies
// conservation/schema evidence or becomes a same-SHA full-release predecessor.
export function validateMemberReceipt(rows, descriptor, targets) {
  check(Array.isArray(rows) && rows.length > 0 && rows.length <= 500, 'MEMBER_AUDIT_INVALID');
  const first = rows[0], last = rows.at(-1);
  validateMemberIdentity(first);
  const identity = ['version', 'repository', 'sha', 'ciRunId', 'ciRunAttempt', 'releaseRunId', 'releaseRunAttempt',
    'policySha256', 'environment', 'profile', 'renderServiceId', 'vercelProjectId', 'vercelTeamId',
    'executorRepository', 'executorSha', 'memberRelease'];
  check(first.releaseRunId === descriptor.runId && first.releaseRunAttempt === descriptor.runAttempt &&
    first.releaseRunAttempt === 1 && first.executorSha === descriptor.sha &&
    first.executorRepository === 'aqua-lifestyle/aqua-deployment', 'MEMBER_AUDIT_IDENTITY_MISMATCH');
  for (const row of rows) check(identity.every(k => row[k] === first[k]), 'MEMBER_AUDIT_IDENTITY_MISMATCH');
  const reconciled = rows.some(x => x.phase === 'member-render-reconciled');
  const expected = ['member-baseline-selected', ...(reconciled ? ['member-render-reconciled'] : ['member-render-requesting', 'member-render-requested']),
    'member-render-ready', 'member-vercel-files-requesting', 'member-vercel-files-uploaded',
    'member-vercel-requesting', 'member-vercel-requested', 'member-deployed'];
  check(rows.filter(x => !['member-handoff-sample', 'member-readiness'].includes(x.phase)).map(x => x.phase).join() === expected.join(),
    'MEMBER_AUDIT_SEQUENCE_INVALID');
  const readyAt = rows.findIndex(x => x.phase === 'member-render-ready');
  check(rows.every((x, i) => x.phase !== 'member-handoff-sample' ||
    (i > 2 && i < readyAt && [memberPolicy.baselineRenderSha, memberPolicy.receiverSha].includes(x.observedRevision))),
    'MEMBER_AUDIT_HANDOFF_INVALID');
  check(first.baselineRenderDeployId === (reconciled ? memberContinuation.renderDeployId : memberPolicy.baselineRenderDeployId) &&
    first.baselineRenderSha === (reconciled ? memberPolicy.receiverSha : memberPolicy.baselineRenderSha) &&
    (!reconciled || objectDigest(rows.find(x => x.phase === 'member-render-reconciled').continuation) ===
      objectDigest({ ...memberContinuation, receiverSha: memberPolicy.receiverSha, frontendSha: memberPolicy.frontendSha })) &&
    first.baselineVercelDeployId === memberPolicy.baselineVercelDeployId &&
    last.renderSha === memberPolicy.receiverSha && last.vercelSha === memberPolicy.frontendSha &&
    /^dep-[a-z0-9]+$/.test(last.renderDeployId) && /^dpl_[A-Za-z0-9]+$/.test(last.vercelDeployId) &&
    rows.every(x => (x.renderDeployId === undefined || x.renderDeployId === last.renderDeployId) &&
      (x.vercelDeployId === undefined || x.vercelDeployId === last.vercelDeployId)), 'MEMBER_AUDIT_PROVIDER_IDENTITY_MISMATCH');
  const proof = rows.find(x => x.phase === 'member-vercel-files-requesting').vercelSourceProof;
  validateFrontendProof(proof, memberPolicy.frontendSha, targets.vercel);
  check(rows.every(x => x.vercelSourceProof === undefined || objectDigest(x.vercelSourceProof) === objectDigest(proof)),
    'MEMBER_AUDIT_SOURCE_MISMATCH');
  return { ...descriptor, receiverSha: memberPolicy.receiverSha, frontendSha: memberPolicy.frontendSha,
    renderDeployId: last.renderDeployId, vercelDeployId: last.vercelDeployId,
    receiptSha256: objectDigest(rows) };
}

export async function verifyMemberAuthority(api, q, env, now = Date.now) {
  validateMemberIdentity(q);
  check(env.GITHUB_ACTOR === memberPolicy.operator.login && env.GITHUB_ACTOR_ID === String(memberPolicy.operator.id) &&
    (!env.GITHUB_TRIGGERING_ACTOR || env.GITHUB_TRIGGERING_ACTOR === memberPolicy.operator.login),
  'MEMBER_AUTHORIZED_OPERATOR_REQUIRED');
  const prs = await api.executor(`/commits/${q.executorSha}/pulls?per_page=100`);
  check(Array.isArray(prs) && prs.length < 100, 'MEMBER_REVIEW_UNVERIFIABLE');
  const matches = prs.filter(p => p.merged_at && p.merge_commit_sha === q.executorSha &&
    p.base?.ref === 'main' && p.base.repo?.full_name === q.executorRepository);
  check(matches.length === 1, 'MEMBER_PROTECTED_MERGE_REQUIRED');
  const pr = await api.executor(`/pulls/${matches[0].number}`);
  check(pr.merged === true && pr.merge_commit_sha === q.executorSha && /^[a-f0-9]{40}$/.test(pr.head?.sha),
    'MEMBER_PROTECTED_MERGE_REQUIRED');
  let acceptedPr = pr;
  // Owner-authorized parser correction / recorded-state reconciliation only.
  // These exact protected PRs cannot grant ancestor-review admission to any
  // unrelated source, policy, target, financial or full-release change.
  if ([13, 14].includes(pr.number)) {
    const base = pr.number === 13 ? '051bf90f7ba037657c9e9d244a6e6ffc81b9c7f1' : memberContinuation.executorSha;
    const diff = await api.executor(`/compare/${base}...${q.executorSha}`);
    const allowed = ['tools/deployment/member-release.mjs', 'tools/deployment/member-release.test.mjs',
      'docs/schema54-member-release.md', ...(pr.number === 14 ? ['tools/deployment/release-control.mjs',
        'tools/deployment/member-continuation.json', 'tools/deployment/fixtures/member-interrupted-audit.zip'] : [])];
    const added = ['tools/deployment/member-continuation.json', 'tools/deployment/fixtures/member-interrupted-audit.zip'];
    check(diff.status === 'ahead' && diff.base_commit?.sha === base &&
      diff.total_commits === 2 && Array.isArray(diff.files) && diff.files.length === allowed.length &&
      diff.files.every(x => allowed.includes(x.filename) && x.status === (added.includes(x.filename) ? 'added' : 'modified')) &&
      new Set(diff.files.map(x => x.filename)).size === allowed.length, 'MEMBER_PARSER_CORRECTION_SCOPE_CHANGED');
    acceptedPr = await api.executor('/pulls/12');
    check(acceptedPr.number === 12 && acceptedPr.merged === true &&
      acceptedPr.merge_commit_sha === '051bf90f7ba037657c9e9d244a6e6ffc81b9c7f1' &&
      acceptedPr.head?.sha === '0dbbf1d36e29d52d7f8c59f3efad06898389b3d5' &&
      acceptedPr.base?.ref === 'main' && acceptedPr.base.repo?.full_name === q.executorRepository,
    'MEMBER_ACCEPTED_SOURCE_BINDING_CHANGED');
    const currentReviews = await api.executor(`/pulls/${pr.number}/reviews?per_page=100`);
    check(Array.isArray(currentReviews) && currentReviews.length < 100 && !currentReviews.some(x =>
      x.user?.login === memberPolicy.reviewer.login && x.user?.id === memberPolicy.reviewer.id &&
      x.commit_id === pr.head.sha && (['CHANGES_REQUESTED', 'DISMISSED'].includes(x.state) ||
        /^(?:REJECT|REJECTED)[.!]?$/i.test(String(x.body ?? '').trim().split('\n')[0].trim()))),
    'MEMBER_EXACT_EXECUTOR_ACCEPTANCE_REQUIRED');
  }
  const reviews = await api.executor(`/pulls/${acceptedPr.number}/reviews?per_page=100`);
  const comments = await api.executor(`/issues/${pr.number}/comments?per_page=100`);
  const acceptanceComments = acceptedPr.number === pr.number ? comments :
    await api.executor(`/issues/${acceptedPr.number}/comments?per_page=100`);
  check(Array.isArray(reviews) && reviews.length < 100 && Array.isArray(comments) && comments.length < 100 &&
    Array.isArray(acceptanceComments) && acceptanceComments.length < 100,
    'MEMBER_REVIEW_UNVERIFIABLE');
  const reviewer = x => x.user?.login === memberPolicy.reviewer.login && x.user?.id === memberPolicy.reviewer.id;
  const explicit = text => /^(?:ACCEPT|ACCEPTED|APPROVED)[.!]?$/i.test(String(text ?? '').trim().split('\n')[0].trim()) ||
    String(text ?? '').trim() === 'Review and Accepted';
  const decision = text => explicit(text) || /^(?:REJECT|REJECTED)[.!]?$/i.test(String(text ?? '').trim().split('\n')[0].trim());
  const decisions = [...reviews.filter(x => reviewer(x) && x.commit_id === acceptedPr.head.sha &&
    ['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED'].includes(x.state) &&
    (x.state !== 'COMMENTED' || decision(x.body))).map(x => ({
      accepted: x.state === 'APPROVED' || (x.state === 'COMMENTED' && explicit(x.body)), time: Date.parse(x.submitted_at) })),
    ...acceptanceComments.filter(x => reviewer(x) && String(x.body).includes(acceptedPr.head.sha) &&
      /^(?:ACCEPT|ACCEPTED|APPROVED|REJECT|REJECTED)[.!]?$/i.test(String(x.body).trim().split('\n')[0].trim()))
      .map(x => ({ accepted: explicit(x.body), time: Date.parse(x.updated_at) }))];
  check(decisions.length > 0 && decisions.every(x => Number.isFinite(x.time)), 'MEMBER_EXACT_EXECUTOR_ACCEPTANCE_REQUIRED');
  decisions.sort((a, b) => b.time - a.time);
  check(decisions[0].accepted && !decisions.some(x => x.time === decisions[0].time && !x.accepted),
    'MEMBER_EXACT_EXECUTOR_ACCEPTANCE_REQUIRED');
  // A provider header is not a migration readback. The named operator records
  // the actual bounded TLS/read-only metadata observation on this existing PR.
  // This is explicitly operator-verified evidence, not independent DB proof.
  const schemaChecks = comments.filter(x => x.user?.login === memberPolicy.operator.login &&
    x.user?.id === memberPolicy.operator.id && String(x.body).startsWith('SCHEMA54_SOURCE_VERIFIED\n'));
  check(schemaChecks.some(x => {
    try {
      const evidence = JSON.parse(x.body.slice('SCHEMA54_SOURCE_VERIFIED\n'.length));
      const observed = Date.parse(evidence.observedAt), posted = Date.parse(x.created_at), time = now();
      return objectDigest({ ...evidence, observedAt: undefined }) === objectDigest({
        executorSha: q.executorSha, frontendSha: memberPolicy.frontendSha, receiverSha: memberPolicy.receiverSha,
        databaseResource: memberPolicy.databaseResource, databaseName: memberPolicy.databaseName,
        tenantId: 1, migrationCount: 54, migration55Absent: true, identityTlsReadOnlyVerified: true }) &&
        Number.isFinite(observed) && Number.isFinite(posted) && Number.isFinite(time) &&
        observed <= posted && posted <= observed + 60000 && observed <= time && time - observed < 3600000;
    } catch { return false; }
  }), 'MEMBER_CURRENT_SCHEMA54_OPERATOR_READBACK_REQUIRED');
  const runs = await api.executor(`/actions/workflows/test.yml/runs?branch=main&event=push&head_sha=${q.executorSha}&per_page=100`);
  check(runs.total_count === runs.workflow_runs?.length && runs.total_count > 0 && runs.total_count < 100,
    'MEMBER_EXECUTOR_MAIN_CI_REQUIRED');
  const run = runs.workflow_runs.filter(x => x.head_sha === q.executorSha && x.head_branch === 'main' &&
    x.event === 'push' && x.path === '.github/workflows/test.yml' && x.name === 'Executor safety tests')
    .sort((a, b) => b.id - a.id)[0];
  check(run?.status === 'completed' && run.conclusion === 'success', 'MEMBER_EXECUTOR_MAIN_CI_REQUIRED');
  const page = await api.executor(`/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`);
  check(page.total_count === 1 && page.jobs?.length === 1 && page.jobs[0].name === 'Executor safety tests' &&
    page.jobs[0].run_id === run.id && page.jobs[0].run_attempt === run.run_attempt &&
    page.jobs[0].status === 'completed' && page.jobs[0].conclusion === 'success', 'MEMBER_EXECUTOR_MAIN_CI_REQUIRED');
}

// Existing provider primitives and exact archive authentication are supplied by
// release-control's admitted production entry. This function is not a CLI.
export async function deployMemberRelease(api, q, report, options) {
  validateMemberIdentity(q);
  check(q.qualificationOnly === false && q.releaseRunAttempt === 1 && !options.receiptRows &&
    !options.evidencePlan.baseline && !options.evidencePlan.resume, 'MEMBER_NO_AUTOMATIC_RESUME');
  const { targets, guard, validateRender, validateVercel, validateHealth, deploymentHistory, waitFor, releaseKey } = options;
  const continuation = options.evidencePlan.memberContinuation;
  if (continuation) check(objectDigest(continuation) === objectDigest({ ...memberContinuation,
    receiverSha: memberPolicy.receiverSha, frontendSha: memberPolicy.frontendSha }), 'MEMBER_CONTINUATION_PLAN_MISMATCH');
  const baselineRenderId = continuation ? memberContinuation.renderDeployId : memberPolicy.baselineRenderDeployId;
  const baselineRenderSha = continuation ? memberPolicy.receiverSha : memberPolicy.baselineRenderSha;
  const start = (options.now ?? Date.now)(), end = start + 40 * 60 * 1000;
  const clock = () => check((options.now ?? Date.now)() < end, 'MEMBER_EXECUTION_WINDOW_EXPIRED');
  const audit = row => report({ ...row, memberRelease: memberPolicyDigest,
    receiverSha: memberPolicy.receiverSha, executionStartedAt: new Date(start).toISOString(),
    executionDeadline: new Date(end).toISOString(), operator: memberPolicy.operator.login });
  const servicePath = `/services/${targets.render.id}`, projectPath = `/v9/projects/${targets.vercel.id}`;
  const activeRender = new Set(['created', 'queued', 'build_in_progress', 'pre_deploy_in_progress', 'update_in_progress']);
  const activeWeb = new Set(['QUEUED', 'INITIALIZING', 'BUILDING']);
  const frontend = prepareFrontend(options.frontendArchive, q.sha, targets.vercel,
    { NEXT_PUBLIC_ABP_API_URL: targets.vercel.publicApiUrl, NEXT_PUBLIC_DEFAULT_TENANT_NAME: targets.vercel.defaultTenantName });
  const readRender = async () => {
    clock();
    const service = await api.render(servicePath), rows = [];
    for (const key of Object.keys(memberRuntimeSettings)) {
      const envVar = await api.render(`${servicePath}/env-vars/${key}`);
      check(envVar?.key === key, 'MEMBER_RUNTIME_FENCE_UNVERIFIED'); rows.push({ envVar });
    }
    validateRender(service, rows, false, memberRuntimeSettings);
    const d = service.serviceDetails;
    check(d.plan === 'starter' && d.buildPlan === 'starter' && d.numInstances === 1 &&
      d.region === 'frankfurt' && d.maintenanceMode?.enabled === false && !d.disk && !service.disk,
      'MEMBER_EXISTING_SERVICE_OR_CONTINUITY_CHANGED');
  };
  const readWeb = async expected => {
    const project = await api.vercel(projectPath); validateVercel(project);
    check(project.targets?.production?.id === expected, 'MEMBER_FRONTEND_ALIAS_DRIFT');
    const rows = (await api.vercel(`/v10/projects/${targets.vercel.id}/env?decrypt=false`)).envs;
    check(Array.isArray(rows) && !rows.some(x => /(?:BIRDAPIKEY|YOCOSECRETKEY|YOCOWEBHOOKSECRET)$/.test(
      String(x.key).replace(/[^A-Za-z0-9]/g, '').toUpperCase())), 'MEMBER_FRONTEND_CONFIGURATION_UNVERIFIED');
    for (const [key, value] of Object.entries(frontend.proof.publicBuildInputs)) {
      const selected = rows.filter(x => x.key === key && x.target?.includes('production'));
      check(selected.length === 1 && !selected[0].gitBranch &&
        (!['plain', 'system'].includes(selected[0].type) || selected[0].value === undefined || selected[0].value === value),
      'MEMBER_FRONTEND_CONFIGURATION_UNVERIFIED');
    }
    return project;
  };
  const checkDomain = async id => {
    const domain = await api.vercel(`${projectPath}/domains/www.aqualifestyleclub.co.za`);
    const mapping = await api.vercel(`/v2/deployments/${id}/aliases`);
    check(domain.name === 'www.aqualifestyleclub.co.za' && domain.projectId === targets.vercel.id &&
      domain.verified === true && Array.isArray(mapping.aliases) &&
      mapping.aliases.some(x => x.alias === 'www.aqualifestyleclub.co.za'), 'MEMBER_PRODUCTION_DOMAIN_DRIFT');
  };
  const checkRender = async (id, sha) => {
    const rows = await deploymentHistory(api, 'render');
    check(rows.filter(x => x.status === 'live').length === 1 && rows.some(x => x.id === id &&
      x.status === 'live' && x.commit?.id === sha) && rows.every(x => !activeRender.has(x.status)),
    'MEMBER_RENDER_DRIFT_OR_NOT_DRAINED');
  };
  const checkWeb = async () => {
    const rows = await deploymentHistory(api, 'vercel');
    check(rows.every(x => !activeWeb.has(x.state ?? x.readyState) && x.meta?.aquaMemberRelease !== memberPolicyDigest),
      'MEMBER_CONCURRENT_OR_PREVIOUS_FRONTEND_REQUEST');
  };
  let baselineRecorded = false, readinessRecorded = false;
  const receiverHealth = async (sha, capabilities = false) => {
    const health = await api.health(), j = health.body.result ?? health.body;
    const expected = { httpStatus: 200, status: 'Healthy', buildId: sha, environment: 'Production',
      databaseStatus: 'Healthy', redisStatus: 'Healthy', dataProtectionKeyStoreStatus: 'Healthy', recovery: null };
    const actual = { httpStatus: health.status, status: j.status, buildId: j.buildId, environment: j.environment,
      databaseStatus: j.databaseStatus, redisStatus: j.redisStatus,
      dataProtectionKeyStoreStatus: j.dataProtectionKeyStoreStatus, recovery: health.recovery };
    const failedFields = Object.keys(expected).filter(k => actual[k] !== expected[k]);
    if (baselineRecorded && (!readinessRecorded || failedFields.length)) {
      audit({ phase: 'member-readiness', expected, actual, failedFields,
        observedAt: new Date((options.now ?? Date.now)()).toISOString() }); readinessRecorded = true;
    }
    validateHealth(health, sha);
    check(health.receiver === 'Schema54', 'MEMBER_COMPATIBILITY_RECEIVER_REQUIRED');
    if (capabilities) {
      const caps = (health.body.result ?? health.body).contractCapabilities;
      check(Array.isArray(caps) && !['aqgreen-flexible-joining-v1', 'programme-approval-queue-v1', 'direct-onyx-checkout-v1']
        .some(x => caps.includes(x)), 'MEMBER_WRITE_CAPABILITY_ADVERTISED');
      const probe = await api.memberProbe();
      check(probe.capability === 200 && probe.unauthenticatedRead === 401 && probe.write === 503 &&
        probe.invalidSignature === 403, 'MEMBER_READ_AUTH_OR_WRITE_FENCE_FAILED');
    }
  };
  await guard(); await readRender(); await readWeb(memberPolicy.baselineVercelDeployId);
  await checkDomain(memberPolicy.baselineVercelDeployId);
  await checkRender(baselineRenderId, baselineRenderSha);
  await checkWeb(); await receiverHealth(baselineRenderSha);
  const oldWeb = await api.vercel(`/v13/deployments/${memberPolicy.baselineVercelDeployId}`);
  check(oldWeb.id === memberPolicy.baselineVercelDeployId && oldWeb.projectId === targets.vercel.id &&
    oldWeb.target === 'production' && oldWeb.readyState === 'READY' && !oldWeb.aliasError,
    'MEMBER_BASELINE_FRONTEND_UNAVAILABLE');
  audit({ phase: 'member-baseline-selected', baselineRenderDeployId: baselineRenderId,
    baselineRenderSha, baselineVercelDeployId: memberPolicy.baselineVercelDeployId }); baselineRecorded = true;
  let render;
  if (continuation) {
    // Existing acknowledged deployment only. No Render POST, retry or rollback.
    await guard(); await readRender(); await checkRender(baselineRenderId, baselineRenderSha);
    await receiverHealth(memberPolicy.receiverSha, true);
    render = await api.render(`${servicePath}/deploys/${memberContinuation.renderDeployId}`);
    check(render.id === memberContinuation.renderDeployId && render.status === 'live' &&
      render.commit?.id === memberPolicy.receiverSha, 'MEMBER_RECONCILED_RENDER_CHANGED');
    audit({ phase: 'member-render-reconciled', renderDeployId: render.id, continuation });
  } else {
    await guard(); await readRender(); await checkRender(baselineRenderId, baselineRenderSha);
    await readWeb(memberPolicy.baselineVercelDeployId); await checkWeb(); clock();
    audit({ phase: 'member-render-requesting' });
    render = await api.render(`${servicePath}/deploys`, { commitId: memberPolicy.receiverSha, clearCache: 'do_not_clear' });
    check(/^dep-[a-z0-9]+$/.test(render.id), 'MEMBER_RENDER_ID_UNAVAILABLE');
    audit({ phase: 'member-render-requested', renderDeployId: render.id });
    render = await waitFor(async () => {
      clock(); await readRender();
      const sample = await api.health();
      const sha = (sample.body.result ?? sample.body).buildId;
      check([memberPolicy.baselineRenderSha, memberPolicy.receiverSha].includes(sha), 'MEMBER_HANDOFF_REVISION_DRIFT');
      validateHealth(sample, sha); check(sample.receiver === 'Schema54', 'MEMBER_HANDOFF_RECEIVER_UNAVAILABLE');
      audit({ phase: 'member-handoff-sample', observedRevision: sha });
      return api.render(`${servicePath}/deploys/${render.id}`);
    }, x => x.status, 'live', activeRender, options);
    check(render.commit?.id === memberPolicy.receiverSha, 'MEMBER_RENDER_SOURCE_MISMATCH');
  }
  await checkRender(render.id, memberPolicy.receiverSha); await receiverHealth(memberPolicy.receiverSha, true);
  audit({ phase: 'member-render-ready', renderDeployId: render.id });
  await guard(); await readRender(); await readWeb(memberPolicy.baselineVercelDeployId); await checkWeb();
  audit({ phase: 'member-vercel-files-requesting', vercelSourceProof: frontend.proof });
  const uploaded = new Set();
  for (const file of frontend.files) {
    if (uploaded.has(file.sha)) continue;
    clock();
    if (uploaded.size % 32 === 0) await guard();
    options.validateAdmission();
    check(sha256(file.data) === file.sha256, 'MEMBER_FRONTEND_UPLOAD_MISMATCH');
    await api.uploadVercel(file.data, file.sha); uploaded.add(file.sha);
  }
  audit({ phase: 'member-vercel-files-uploaded' });
  await guard(); await readRender(); await checkRender(render.id, memberPolicy.receiverSha);
  await receiverHealth(memberPolicy.receiverSha, true);
  await readWeb(memberPolicy.baselineVercelDeployId); await checkWeb(); clock();
  const meta = { aquaCiRunId: q.ciRunId, aquaCiRunAttempt: String(q.ciRunAttempt), aquaSourceSha: q.sha,
    aquaReleaseIdentity: releaseKey(q), aquaMemberRelease: memberPolicyDigest, aquaReceiverSha: memberPolicy.receiverSha };
  audit({ phase: 'member-vercel-requesting' });
  const requested = await api.vercel('/v13/deployments', fileDeploymentBody(frontend, targets.vercel, meta));
  check(/^dpl_[A-Za-z0-9]+$/.test(requested.id), 'MEMBER_VERCEL_ID_UNAVAILABLE');
  audit({ phase: 'member-vercel-requested', vercelDeployId: requested.id });
  const web = await waitFor(async () => {
    clock(); await receiverHealth(memberPolicy.receiverSha, true);
    return api.vercel(`/v13/deployments/${requested.id}`);
  }, x => x.readyState, 'READY', activeWeb, options);
  const project = await readWeb(web.id);
  await checkDomain(web.id);
  check(!web.aliasError && web.readyState === 'READY', 'MEMBER_FRONTEND_DEPLOYMENT_FAILED');
  validateFileDeployment(web, frontend.proof, targets.vercel, meta, project.rootDirectory);
  await guard(); await readRender(); await checkRender(render.id, memberPolicy.receiverSha);
  await receiverHealth(memberPolicy.receiverSha, true); await api.web();
  const finalWeb = await api.vercel(`/v13/deployments/${web.id}`);
  validateFileDeployment(finalWeb, frontend.proof, targets.vercel, meta, (await readWeb(web.id)).rootDirectory);
  check(finalWeb.readyState === 'READY' && !finalWeb.aliasError, 'MEMBER_FRONTEND_CHANGED');
  check((await deploymentHistory(api, 'vercel')).every(x => !activeWeb.has(x.state ?? x.readyState)),
    'MEMBER_CONCURRENT_FRONTEND_BEFORE_COMPLETION');
  // This is deployment evidence, NOT authenticated member/browser or Yoco proof.
  audit({ phase: 'member-deployed', renderDeployId: render.id, vercelDeployId: web.id,
    renderSha: memberPolicy.receiverSha, vercelSha: q.sha, completedAt: new Date((options.now ?? Date.now)()).toISOString(),
    signedInMemberVerification: 'REQUIRED', genuineYocoVerification: 'NOT_ESTABLISHED' });
}
