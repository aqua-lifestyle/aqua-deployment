// Purpose-bound Vercel-only continuation after commissioning. Render is read
// and fenced throughout; this route has no Render POST or automatic resume.
import { objectDigest, sha256 } from './github-evidence.mjs';
import { normalRuntimeSettings, cleanStartRuntimeSettings } from './runtime-readiness.mjs';
import { approvedPublicInputs, prepareFrontend, fileDeploymentBody,
  validateFileDeployment, validateFrontendProof, verifyObservedFileDeployment } from './vercel-source.mjs';
import { frontendReleaseRecordDigest, frontendSuccessorCandidateSha,
  validateAqGreenFrontendSuccessor, validateFrontendSuccessorIdentity } from './aqgreen-frontend-source-successor.mjs';

export class FrontendReleaseDenied extends Error {}
const check = (ok, code) => { if (!ok) throw new FrontendReleaseDenied(code); };
const activeRender = new Set(['created', 'queued', 'build_in_progress', 'pre_deploy_in_progress', 'update_in_progress']);
const activeWeb = new Set(['QUEUED', 'INITIALIZING', 'BUILDING']);
const identityKeys = ['version', 'repository', 'sha', 'ciRunId', 'ciRunAttempt', 'releaseRunId',
  'releaseRunAttempt', 'policySha256', 'environment', 'profile', 'renderServiceId',
  'vercelProjectId', 'vercelTeamId', 'executorRepository', 'executorSha', 'frontendRelease'];

export function validateFrontendReceipt(rows, descriptor, targets) {
  check(Array.isArray(rows) && rows.length === 8 &&
    rows.map(x => x.phase).join() === ['evidence-selected', 'frontend-baseline-selected',
      'frontend-classified', 'frontend-vercel-files-requesting', 'frontend-vercel-files-uploaded',
      'frontend-vercel-requesting', 'frontend-vercel-requested', 'frontend-deployed'].join(),
  'FRONTEND_AUDIT_SEQUENCE_INVALID');
  const first = rows[0], baseline = rows[1], last = rows.at(-1);
  validateFrontendSuccessorIdentity({ ...first, qualificationOnly: false });
  check(first.frontendRelease === frontendReleaseRecordDigest && first.sha === frontendSuccessorCandidateSha &&
    first.memberRelease === undefined && first.releaseRunAttempt === 1 &&
    first.releaseRunId === descriptor.runId && first.releaseRunAttempt === descriptor.runAttempt &&
    first.executorSha === descriptor.sha && rows.every(row =>
      identityKeys.every(key => row[key] === first[key]) && row.renderMutationAuthorized === undefined),
  'FRONTEND_AUDIT_IDENTITY_MISMATCH');
  check(/^[a-f0-9]{64}$/.test(first.authorizationId ?? '') &&
    /^[a-f0-9]{64}$/.test(first.evidenceSha256 ?? '') &&
    /^[a-f0-9]{64}$/.test(first.inventorySha256 ?? '') &&
    /^[a-f0-9]{64}$/.test(first.schemaFirstEvidenceSha256 ?? '') &&
    /^\d+$/.test(String(first.evidenceArtifactId ?? '')) &&
    /^dep-[a-z0-9]+$/.test(baseline.baselineRenderDeployId) &&
    /^dpl_[A-Za-z0-9]+$/.test(baseline.baselineVercelDeployId) &&
    baseline.baselineRenderSha === 'b8d86e5e60997483423b273d5f426c08b411f573' &&
    baseline.baselineRenderSha === baseline.servingRenderSha &&
    baseline.baselineRenderSha === last.renderSha &&
    baseline.servingRenderDeployId === last.renderDeployId && last.renderReused === true &&
    ['Held', 'Available'].includes(baseline.paymentAvailability) &&
    baseline.paymentAvailability === last.paymentAvailability &&
    last.vercelSha === first.sha && last.vercelDeployId !== baseline.baselineVercelDeployId &&
    /^dpl_[A-Za-z0-9]+$/.test(last.vercelDeployId) &&
    rows.every(row => row.renderDeployId === undefined || row.renderDeployId === last.renderDeployId) &&
    rows.every(row => row.vercelDeployId === undefined || row.vercelDeployId === last.vercelDeployId),
  'FRONTEND_AUDIT_PROVIDER_IDENTITY_MISMATCH');
  const proof = rows[3].vercelSourceProof;
  validateFrontendProof(proof, first.sha, targets.vercel);
  check(rows.every(row => row.vercelSourceProof === undefined ||
    objectDigest(row.vercelSourceProof) === objectDigest(proof)), 'FRONTEND_AUDIT_SOURCE_MISMATCH');
  return { ...descriptor, sha: first.sha, ciRunId: first.ciRunId, ciRunAttempt: first.ciRunAttempt,
    renderDeployId: last.renderDeployId, renderSha: last.renderSha,
    vercelDeployId: last.vercelDeployId, frontendRelease: first.frontendRelease,
    receiptSha256: objectDigest(rows) };
}

export async function deployFrontendRelease(api, q, report, options) {
  validateAqGreenFrontendSuccessor(q);
  check(q.qualificationOnly === false && q.releaseRunAttempt === 1 && !options.receiptRows && options.evidencePlan?.baseline &&
    !options.evidencePlan.resume && Array.isArray(options.baselineRows) &&
    !options.evidencePlan.partialRenderContinuation && !options.evidencePlan.readinessRenderContinuation &&
    !options.evidencePlan.acknowledgedBackend, 'FRONTEND_RELEASE_NO_RESUME');
  const { targets, guard, validateRender, validateVercel, validateHealth,
    validateBaselineReceipt, deploymentHistory, waitFor, releaseKey, policy } = options;
  const proof = validateBaselineReceipt(options.baselineRows, options.evidencePlan.baseline, q);
  check(proof.renderSha === 'b8d86e5e60997483423b273d5f426c08b411f573' &&
    proof.origin.sha === proof.renderSha, 'FRONTEND_BASELINE_PROVENANCE_MISMATCH');
  const start = (options.now ?? Date.now)(), end = start + 40 * 60 * 1000;
  const clock = () => check((options.now ?? Date.now)() < end, 'FRONTEND_EXECUTION_WINDOW_EXPIRED');
  const servicePath = `/services/${targets.render.id}`, projectPath = `/v9/projects/${targets.vercel.id}`;
  const host = new URL(targets.vercel.productionUrl).hostname;
  const frontend = prepareFrontend(options.frontendArchive, q.sha, targets.vercel,
    policy.scope.frontend.publicBuildInputs);
  let servingRenderId;
  const audit = row => report({ ...row, executionStartedAt: new Date(start).toISOString(),
    executionDeadline: new Date(end).toISOString() });
  const compare = await api.gh(`/compare/${proof.renderSha}...${q.sha}`);
  const prefix = `${targets.vercel.rootDirectory}/`;
  check(compare.status === 'ahead' && compare.base_commit?.sha === proof.renderSha &&
    compare.merge_base_commit?.sha === proof.renderSha && Array.isArray(compare.files) &&
    compare.files.length > 0 && compare.files.length < 300 &&
    compare.files.some(file => file.filename.startsWith(prefix)) &&
    compare.files.every(file => ['added', 'modified', 'removed'].includes(file.status) &&
      (file.filename.startsWith(prefix) || file.filename.startsWith('AqualLifeStyle/9.4.2/aspnet-core/test/') ||
        file.filename.startsWith('docs/')) && !file.previous_filename),
  'FRONTEND_ONLY_RELEASE_REQUIRES_SEPARATE_BACKEND_AUTHORIZATION');
  const readBackend = async expected => {
    clock();
    const service = await api.render(servicePath), rows = [];
    const settings = expected === 'Available' ? normalRuntimeSettings : cleanStartRuntimeSettings;
    for (const key of Object.keys(settings)) {
      const envVar = await api.render(`${servicePath}/env-vars/${key}`);
      check(envVar?.key === key, 'FRONTEND_BACKEND_SETTINGS_CHANGED'); rows.push({ envVar });
    }
    try { validateRender(service, rows, expected === 'Held', settings); }
    catch { throw new FrontendReleaseDenied('FRONTEND_BACKEND_SETTINGS_CHANGED'); }
    const details = service.serviceDetails;
    check(details.plan === 'starter' && details.buildPlan === 'starter' && details.numInstances === 1 &&
      details.region === 'frankfurt' && details.maintenanceMode?.enabled === false &&
      !details.disk && !service.disk, 'FRONTEND_RENDER_DRIFT');
    if (expected === 'Held') {
      const payout = await api.render(`${servicePath}/env-vars/App__AutomaticPayouts__Enabled`);
      check(payout?.key === 'App__AutomaticPayouts__Enabled' && payout.value === 'false',
        'FRONTEND_BACKEND_SETTINGS_CHANGED');
    }
    const deploys = await deploymentHistory(api, 'render');
    const live = deploys.filter(row => row.status === 'live');
    check(live.length === 1 && live[0].commit?.id === proof.renderSha &&
      deploys.every(row => !activeRender.has(row.status)) &&
      (!servingRenderId || live[0].id === servingRenderId),
    'FRONTEND_RENDER_DRIFT');
    const health = await api.health();
    try { validateHealth(health, proof.renderSha); }
    catch { throw new FrontendReleaseDenied('FRONTEND_BACKEND_STATE_CHANGED'); }
    const state = (health.body.result ?? health.body).paymentAvailability;
    check(['Held', 'Available'].includes(state) && (expected === undefined || state === expected),
      'FRONTEND_BACKEND_STATE_CHANGED');
    return { id: live[0].id, state };
  };
  const readProject = async expected => {
    clock();
    const project = await api.vercel(projectPath);
    try { validateVercel(project); }
    catch { throw new FrontendReleaseDenied('FRONTEND_CONFIGURATION_UNVERIFIED'); }
    check(project.targets?.production?.id === expected, 'FRONTEND_INCUMBENT_ALIAS_DRIFT');
    const env = (await api.vercel(`/v10/projects/${targets.vercel.id}/env?decrypt=false`)).envs;
    check(Array.isArray(env) && !env.some(row =>
      /(?:BIRDAPIKEY|YOCOSECRETKEY|YOCOWEBHOOKSECRET|APPAQGREENV2COMMISSIONING(?:DECISION|VERIFIEDAUTHORITY|CLEANSTARTEVIDENCE)JSONBASE64|APPYOCOCUTOVERRECONCILIATIONJSONBASE64)$/.test(
        String(row.key).replace(/[^A-Za-z0-9]/g, '').toUpperCase())), 'FRONTEND_CONFIGURATION_UNVERIFIED');
    for (const [key, value] of Object.entries(approvedPublicInputs(targets.vercel))) {
      const selected = env.filter(row => row.key === key && row.target?.includes('production'));
      check(selected.length === 1 && !selected[0].gitBranch &&
        (!['plain', 'system'].includes(selected[0].type) ||
          selected[0].value === undefined || selected[0].value === value),
      'FRONTEND_CONFIGURATION_UNVERIFIED');
    }
    const domain = await api.vercel(`${projectPath}/domains/${host}`);
    const mapping = await api.vercel(`/v2/deployments/${expected}/aliases`);
    check(domain.name === host && domain.projectId === targets.vercel.id && domain.verified === true &&
      Array.isArray(mapping.aliases) && mapping.aliases.filter(row => row.alias === host && !row.redirect &&
        (row.deploymentId === undefined || row.deploymentId === expected) &&
        (row.projectId === undefined || row.projectId === targets.vercel.id)).length === 1,
    'FRONTEND_INCUMBENT_ALIAS_DRIFT');
    return project;
  };
  const readHistory = async () => {
    const rows = await deploymentHistory(api, 'vercel');
    check(rows.every(row => !activeWeb.has(row.state ?? row.readyState) &&
      row.meta?.aquaCiRunId !== q.ciRunId && row.meta?.aquaSourceSha !== q.sha),
    'FRONTEND_SOURCE_ALREADY_DEPLOYED');
  };
  await guard();
  const initialHealth = await api.health();
  try { validateHealth(initialHealth, proof.renderSha); }
  catch { throw new FrontendReleaseDenied('FRONTEND_BACKEND_STATE_CHANGED'); }
  const state = (initialHealth.body.result ?? initialHealth.body).paymentAvailability;
  check(['Held', 'Available'].includes(state), 'FRONTEND_BACKEND_STATE_CHANGED');
  const serving = await readBackend(state);
  servingRenderId = serving.id;
  const incumbent = await api.vercel(`/v13/deployments/${proof.vercelDeployId}`);
  check(incumbent.id === proof.vercelDeployId && incumbent.projectId === targets.vercel.id &&
    incumbent.target === 'production' && incumbent.readyState === 'READY' && !incumbent.aliasError &&
    (proof.vercelSourceProvenance === 'UNVERIFIED_LEGACY' ? !incumbent.gitSource :
      incumbent.gitSource?.sha === proof.vercelSha), 'FRONTEND_BASELINE_PROVENANCE_MISMATCH');
  await readProject(proof.vercelDeployId); await readHistory();
  audit({ phase: 'frontend-baseline-selected', baselineRenderDeployId: proof.renderDeployId,
    baselineRenderSha: proof.renderSha, baselineVercelDeployId: proof.vercelDeployId,
    baselineVercelSourceProvenance: proof.vercelSourceProvenance,
    servingRenderDeployId: serving.id, servingRenderSha: proof.renderSha, paymentAvailability: state });
  audit({ phase: 'frontend-classified', frontendOnly: true, renderReused: true });
  const verifyBackendUnchanged = async () => {
    await guard();
    const current = await readBackend(state);
    check(current.id === serving.id, 'FRONTEND_RENDER_DRIFT');
  };
  await verifyBackendUnchanged(); await readProject(proof.vercelDeployId); await readHistory();
  audit({ phase: 'frontend-vercel-files-requesting', vercelSourceProof: frontend.proof });
  const uploaded = new Set();
  for (const file of frontend.files) {
    if (uploaded.has(file.sha)) continue;
    if (uploaded.size % 32 === 0) await verifyBackendUnchanged();
    options.validateAdmission();
    check(sha256(file.data) === file.sha256, 'FRONTEND_UPLOAD_HASH_MISMATCH');
    await api.uploadVercel(file.data, file.sha); uploaded.add(file.sha);
  }
  audit({ phase: 'frontend-vercel-files-uploaded' });
  await verifyBackendUnchanged(); await readProject(proof.vercelDeployId); await readHistory();
  const meta = { aquaCiRunId: q.ciRunId, aquaCiRunAttempt: String(q.ciRunAttempt),
    aquaSourceSha: q.sha, aquaReleaseIdentity: releaseKey(q), aquaFrontendRelease: q.frontendRelease };
  options.validateAdmission();
  audit({ phase: 'frontend-vercel-requesting' });
  const requested = await api.vercel('/v13/deployments', fileDeploymentBody(frontend, targets.vercel, meta));
  check(/^dpl_[A-Za-z0-9]+$/.test(requested.id), 'FRONTEND_VERCEL_ID_UNAVAILABLE');
  audit({ phase: 'frontend-vercel-requested', vercelDeployId: requested.id });
  const web = await waitFor(async () => {
    await verifyBackendUnchanged();
    return api.vercel(`/v13/deployments/${requested.id}`);
  }, x => x.readyState, 'READY', activeWeb, options);
  check(web.id === requested.id && web.readyState === 'READY' && !web.aliasError,
    'FRONTEND_DEPLOYMENT_UNVERIFIABLE');
  const project = await readProject(web.id);
  validateFileDeployment(web, frontend.proof, targets.vercel, meta, project.rootDirectory);
  const observation = await verifyObservedFileDeployment(api, web, frontend.proof,
    targets.vercel, meta, options.publicFetch);
  await verifyBackendUnchanged();
  check(await api.web() === 200, 'WEB_READINESS_FAILED');
  const proxy = await api.webHealth(proof.renderSha, state);
  check(proxy?.status === 'Healthy' && proxy.buildId === proof.renderSha &&
    proxy.paymentAvailability === state, 'FRONTEND_BACKEND_STATE_CHANGED');
  const finalWeb = await api.vercel(`/v13/deployments/${web.id}`);
  validateFileDeployment(finalWeb, frontend.proof, targets.vercel, meta, (await readProject(web.id)).rootDirectory);
  check(finalWeb.readyState === 'READY' && !finalWeb.aliasError &&
    observation.deploymentId === web.id && observation.aliasStable === true,
  'FRONTEND_DEPLOYMENT_UNVERIFIABLE');
  const endHistory = await deploymentHistory(api, 'vercel');
  check(endHistory.every(row => !activeWeb.has(row.state ?? row.readyState)) &&
    endHistory.filter(row => row.meta?.aquaCiRunId === q.ciRunId || row.meta?.aquaSourceSha === q.sha).length === 1 &&
    endHistory.some(row => (row.uid ?? row.id) === web.id && row.meta?.aquaReleaseIdentity === releaseKey(q)),
    'FRONTEND_CONCURRENT_DEPLOYMENT');
  audit({ phase: 'frontend-deployed', renderReused: true, renderDeployId: serving.id,
    renderSha: proof.renderSha, vercelDeployId: web.id, vercelSha: q.sha, paymentAvailability: state });
}
