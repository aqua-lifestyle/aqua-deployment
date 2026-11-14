// Exact, read-only recognition of the acknowledged Vercel effect from the
// failed run. Neither the original run nor this record is a success receipt.
import { readFileSync } from 'node:fs';
import { sha256, objectDigest } from './github-evidence.mjs';
import { validateFrontendProof, fileDeploymentBody, verifyObservedFileDeployment } from './vercel-source.mjs';
import { normalRuntimeSettings } from './runtime-readiness.mjs';
import { validateFrontendSuccessorIdentity } from './aqgreen-frontend-source-successor.mjs';

export class FailedFrontendReleaseDenied extends Error {}
const check = (ok, code) => { if (!ok) throw new FailedFrontendReleaseDenied(code); };
const same = (a, b) => objectDigest(a) === objectDigest(b);
const recordUrl = new URL('../../governance/aqgreen-frontend-failed-release-43630374712.json', import.meta.url);
export const failedFrontendRunId = '43630374712';
export const failedFrontendRecordDigest = 'eb8e7c97a815e0e5181983bf26adf098af3193b2885b41268f3c6563549c09f0';
const phases = ['evidence-selected', 'frontend-baseline-selected', 'frontend-classified',
  'frontend-vercel-files-requesting', 'frontend-vercel-files-uploaded',
  'frontend-vercel-requesting', 'frontend-vercel-requested', 'failed'];

export function validateFailedFrontendRecord(bytes = readFileSync(recordUrl)) {
  check(Buffer.isBuffer(bytes) && sha256(bytes) === failedFrontendRecordDigest,
    'FAILED_FRONTEND_RECONCILIATION_RECORD_CHANGED');
  const r = JSON.parse(bytes), e = r.originalExecution, a = r.originalAudit,
    s = r.qualifiedSource, v = r.observedVercel, b = r.observedBackend, scope = r.scope;
  check(r.contract === 'aqua.frontend-failed-release-read-only-reconciliation' && r.version === 1 &&
    e.repository === 'aqua-lifestyle/aqua-deployment' && e.runId === failedFrontendRunId &&
    e.runNumber === 82 && e.runAttempt === 1 &&
    e.executorSha === '085808bd918309592d372388889fda80401a1b46' &&
    e.actor.login === 'Xolani-M' && e.actor.id === 86495928 &&
    e.conclusion === 'failure' && e.productionJobId === '132555880732' &&
    e.productionJobConclusion === 'failure' &&
    e.failedStep === 'Revalidate policy, provenance, providers and recovery before automatic deployment' &&
    a.artifactId === '14128261978' && a.artifactName ===
      'production-release-audit-43630374712-1' &&
    a.archiveSha256 === 'c471733ef4d2bd47f006a38339ee4f377e283f155f40e41271afec72077baf43' &&
    a.reportSha256 === '14adb3dd0f7a4c22d4a0908db26a3fbdeffe285736e9cfd2c0171730d290c746' &&
    a.rowsSha256 === 'f42bcd7bbe44d67b8797360d2b1350092360ec6609560d6c592605c8c4016bfe' &&
    same(a.phases, phases) && a.terminalFailureCode === 'VERCEL_EFFECTIVE_BUILD_INPUTS_UNVERIFIABLE' &&
    s.repository === 'aqua-lifestyle/aqua-lifestyle' &&
    s.sha === 'fb4d7e509db2f5c8de68df44ea978995a5c455fb' &&
    s.ciRunId === '43597833117' && s.ciRunAttempt === 1 &&
    s.policySha256 === '717b071718a7032c49055673092c1aa62114055c3d5ab22a8708ef5ca509f840' &&
    s.frontendRelease === '6b2d9aaeaf30adab12b16f1b0b4d4e9a073987ca195fac8df7ddb7ce006732b7' &&
    v.deploymentId === 'dpl_EXC25PZxFuuWzeV3Vud5F3PgkmfE' &&
    v.originalBaselineDeploymentId === 'dpl_9gLkJk4TBHxcjK6LkKVE14eZ533x' &&
    v.projectId === 'prj_6qL1e43KhsWrRshY5GxdmGl3HGMz' &&
    v.teamId === 'team_Hc3BWfhTLfwLzwbgbtaasBUY' &&
    v.target === 'production' && v.state === 'READY' && v.aliasStable === true &&
    v.productionUrl === 'https://www.aqualifestyleclub.co.za' &&
    v.providerEnvironmentShape === 'names-only arrays' &&
    v.configurationEvidence === 'compiled-literals-from-frozen-public-env-module' &&
    same(v.publicBuildInputs, { NEXT_PUBLIC_ABP_API_URL: 'https://aqualifestyle-api.onrender.com',
      NEXT_PUBLIC_DEFAULT_TENANT_NAME: 'Default' }) &&
    Array.isArray(v.compiledAssets) && v.compiledAssets.length === 1 &&
    v.compiledAssets[0].path === '/_next/static/immutable/chunks/0s12mk07bw_o6.js' &&
    v.compiledAssets[0].sha256 === '3921ea950a90dec02d2dcc14669d7eba78718c982ff601309905bb8fab928cc3' &&
    v.compiledAssets[0].bytes === 21285 &&
    b.renderDeployId === 'dep-dbru710n74is738ah8bg' &&
    b.renderSha === 'b8d86e5e60997483423b273d5f426c08b411f573' &&
    b.health === 'Healthy' && b.paymentAvailability === 'Available' &&
    b.commissioningEnabled === true && b.weeklyCommissionsEnabled === true &&
    b.financialOperationsEnabled === true && b.backgroundJobsEnabled === false &&
    b.automaticPayoutsEnabled === false && b.entryMonthlyObligationsEnabled === false &&
    scope.kind === 'read-only-original-provider-effect' && scope.originalRunRemainsFailed === true &&
    ['successfulReleaseReceiptCreated', 'newVercelDeploymentAuthorized', 'renderMutationAuthorized',
      'financialOrD10ChangeAuthorized', 'realCustomerPaymentVerified'].every(key => scope[key] === false),
  'FAILED_FRONTEND_RECONCILIATION_SCOPE_CHANGED');
  return r;
}

export function validateFailedFrontendContext(run, past, attempt, production, candidate, targets) {
  const r = validateFailedFrontendRecord(), e = r.originalExecution;
  check(String(run?.id) === e.runId && run.run_number === e.runNumber && run.run_attempt === 1 &&
    run.head_sha === e.executorSha && run.actor?.login === e.actor.login && run.actor?.id === e.actor.id &&
    run.status === 'completed' && run.conclusion === 'failure' && past?.conclusion === 'failure' &&
    attempt === e.runAttempt && production?.id === Number(e.productionJobId) &&
    production?.name === 'Unattended recovery release' && production.conclusion === 'failure' &&
    production.steps?.filter(step => step.name === e.failedStep && step.conclusion === 'failure').length === 1 &&
    candidate?.sha !== r.qualifiedSource.sha && candidate?.memberRelease === undefined &&
    candidate?.policySha256 === r.qualifiedSource.policySha256 &&
    candidate.repository === r.qualifiedSource.repository &&
    candidate.executorRepository === e.repository && candidate.environment === targets.environment &&
    candidate.profile === targets.profile && candidate.renderServiceId === targets.render.id &&
    candidate.vercelProjectId === targets.vercel.id && candidate.vercelTeamId === targets.vercel.teamId,
  'FAILED_FRONTEND_RUN_NOT_RECONCILABLE');
  return r;
}

export function validateFailedFrontendAudit(rows, descriptor, targets, r = validateFailedFrontendRecord()) {
  const e = r.originalExecution, a = r.originalAudit, s = r.qualifiedSource, v = r.observedVercel,
    b = r.observedBackend;
  check(descriptor.runId === e.runId && descriptor.runAttempt === e.runAttempt &&
    descriptor.sha === e.executorSha && descriptor.artifactId === a.artifactId &&
    Array.isArray(rows) && rows.length === phases.length &&
    same(rows.map(row => row.phase), phases) && objectDigest(rows) === a.rowsSha256,
  'FAILED_FRONTEND_ORIGINAL_AUDIT_CHANGED');
  const first = rows[0], baseline = rows[1], requested = rows[6], last = rows[7];
  validateFrontendSuccessorIdentity({ ...first, qualificationOnly: false });
  const identity = ['version', 'repository', 'sha', 'ciRunId', 'ciRunAttempt', 'releaseRunId',
    'releaseRunAttempt', 'policySha256', 'environment', 'profile', 'renderServiceId',
    'vercelProjectId', 'vercelTeamId', 'executorRepository', 'executorSha', 'frontendRelease'];
  check(first.releaseRunId === e.runId && first.releaseRunAttempt === e.runAttempt &&
    first.executorSha === e.executorSha && first.sha === s.sha && first.ciRunId === s.ciRunId &&
    first.ciRunAttempt === s.ciRunAttempt && first.policySha256 === s.policySha256 &&
    first.frontendRelease === s.frontendRelease && first.repository === targets.repository &&
    rows.every(row => identity.every(key => row[key] === first[key])) &&
    baseline.baselineRenderSha === b.renderSha && baseline.servingRenderSha === b.renderSha &&
    baseline.servingRenderDeployId === b.renderDeployId && baseline.paymentAvailability === 'Available' &&
    baseline.baselineVercelDeployId === v.originalBaselineDeploymentId &&
    requested.vercelDeployId === v.deploymentId && last.vercelDeployId === v.deploymentId &&
    last.code === a.terminalFailureCode &&
    rows.every(row => row.vercelDeployId === undefined || row.vercelDeployId === v.deploymentId) &&
    !rows.some(row => row.renderDeployId !== undefined || row.phase === 'frontend-deployed'),
  'FAILED_FRONTEND_AUDIT_IDENTITY_CHANGED');
  const proof = rows[3].vercelSourceProof;
  validateFrontendProof(proof, s.sha, targets.vercel);
  check(proof.manifestSha256 === s.sourceManifestSha256 &&
    objectDigest(proof) === s.fileSourceProofSha256 &&
    same(proof.publicBuildInputs, v.publicBuildInputs) &&
    rows.every(row => row.vercelSourceProof === undefined || same(row.vercelSourceProof, proof)),
  'FAILED_FRONTEND_SOURCE_PROOF_CHANGED');
  return { originalRunId: e.runId, originalRunAttempt: e.runAttempt, originalConclusion: 'failure',
    artifactId: a.artifactId, rowsSha256: a.rowsSha256, deploymentId: v.deploymentId,
    sourceProofSha256: s.fileSourceProofSha256, reconciliationRecordSha256: failedFrontendRecordDigest,
    successfulFullReleasePredecessor: false, automaticResumeAuthorized: false };
}

// Re-observe the *existing* provider effect. Only authenticated GETs and public
// requests are performed; the historical failure remains failed throughout.
export async function verifyFailedFrontendLiveEffect(api, rows, descriptor, options) {
  return observeFailedFrontendEffect(api, rows, descriptor, validateFailedFrontendRecord(), options);
}

// Injectable observation primitive for controlled provider tests. The released
// entry above always supplies the whole-file-pinned record, never caller data.
export async function observeFailedFrontendEffect(api, rows, descriptor, r, options) {
  const { targets, validateRender, validateVercel, validateHealth, deploymentHistory, releaseKey } = options;
  const receipt = validateFailedFrontendAudit(rows, descriptor, targets, r);
  const s = r.qualifiedSource, v = r.observedVercel, b = r.observedBackend, first = rows[0];
  const meta = { aquaCiRunId: s.ciRunId, aquaCiRunAttempt: String(s.ciRunAttempt),
    aquaSourceSha: s.sha, aquaReleaseIdentity: releaseKey({ ...first, qualificationOnly: false }),
    aquaFrontendRelease: s.frontendRelease };
  check(meta.aquaReleaseIdentity === s.releaseIdentity, 'FAILED_FRONTEND_RELEASE_IDENTITY_CHANGED');
  const request = fileDeploymentBody({ proof: rows[3].vercelSourceProof }, targets.vercel, meta);
  check(request.project === v.projectId && request.target === 'production' &&
    same(request.env, v.publicBuildInputs) && same(request.build.env, v.publicBuildInputs) &&
    request.meta.aquaFileSourceSha256 === s.fileSourceProofSha256,
  'FAILED_FRONTEND_ORIGINAL_REQUEST_CHANGED');
  const projectPath = `/v9/projects/${v.projectId}`, servicePath = `/services/${targets.render.id}`;
  const observeWeb = async () => {
    const web = await api.vercel(`/v13/deployments/${v.deploymentId}`);
    check(web.id === v.deploymentId && web.readyState === 'READY' && !web.aliasError &&
      web.projectId === v.projectId && web.target === v.target && !web.gitSource &&
      Array.isArray(web.env) && Array.isArray(web.build?.env), 'FAILED_FRONTEND_DEPLOYMENT_DRIFT');
    const project = await api.vercel(projectPath);
    validateVercel(project);
    check(project.targets?.production?.id === v.deploymentId, 'FAILED_FRONTEND_ALIAS_DRIFT');
    const observed = await verifyObservedFileDeployment(api, web, rows[3].vercelSourceProof,
      targets.vercel, meta, options.publicFetch);
    check(observed.deploymentId === v.deploymentId && observed.sourceSha === s.sha &&
      observed.sourceProofSha256 === s.fileSourceProofSha256 && observed.aliasStable === true &&
      observed.configurationEvidence === v.configurationEvidence &&
      same(observed.observedPublicInputs, v.publicBuildInputs) &&
      same(observed.compiledAssets, v.compiledAssets) && observed.secretsRead === false,
    'FAILED_FRONTEND_COMPILED_INPUTS_CHANGED');
    const domain = await api.vercel(`${projectPath}/domains/${new URL(v.productionUrl).hostname}`);
    check(domain.name === new URL(v.productionUrl).hostname && domain.projectId === v.projectId &&
      domain.verified === true, 'FAILED_FRONTEND_DOMAIN_DRIFT');
    return observed;
  };
  const observeBackend = async () => {
    const service = await api.render(servicePath), settings = [];
    for (const key of Object.keys(normalRuntimeSettings)) {
      const value = await api.render(`${servicePath}/env-vars/${key}`);
      check(value?.key === key, 'FAILED_FRONTEND_BACKEND_SETTINGS_DRIFT');
      settings.push({ envVar: value });
    }
    validateRender(service, settings, false, normalRuntimeSettings);
    const details = service.serviceDetails;
    check(details.plan === 'starter' && details.buildPlan === 'starter' && details.numInstances === 1 &&
      details.region === 'frankfurt' && details.maintenanceMode?.enabled === false &&
      !details.disk && !service.disk, 'FAILED_FRONTEND_RENDER_DRIFT');
    const deployments = await deploymentHistory(api, 'render');
    check(deployments.filter(row => row.status === 'live').length === 1 &&
      deployments.some(row => row.id === b.renderDeployId && row.status === 'live' &&
        row.commit?.id === b.renderSha) && !deployments.some(row =>
          ['created', 'queued', 'build_in_progress', 'pre_deploy_in_progress', 'update_in_progress'].includes(row.status)),
    'FAILED_FRONTEND_RENDER_DRIFT');
    const health = await api.health();
    validateHealth(health, b.renderSha);
    check((health.body.result ?? health.body).paymentAvailability === b.paymentAvailability,
      'FAILED_FRONTEND_BACKEND_HEALTH_DRIFT');
  };
  await observeWeb(); await observeBackend();
  check(await api.web() === 200, 'FAILED_FRONTEND_WEB_UNAVAILABLE');
  const proxy = await api.webHealth(b.renderSha, b.paymentAvailability);
  check(proxy?.status === 'Healthy' && proxy.buildId === b.renderSha &&
    proxy.paymentAvailability === b.paymentAvailability, 'FAILED_FRONTEND_PROXY_DRIFT');
  const history = await deploymentHistory(api, 'vercel');
  check(history.filter(row => row.meta?.aquaSourceSha === s.sha || row.meta?.aquaCiRunId === s.ciRunId).length === 1 &&
    history.some(row => (row.uid ?? row.id) === v.deploymentId && row.meta?.aquaReleaseIdentity === s.releaseIdentity &&
      (row.state ?? row.readyState) === 'READY') &&
    !history.some(row => ['QUEUED', 'INITIALIZING', 'BUILDING'].includes(row.state ?? row.readyState)),
  'FAILED_FRONTEND_PROVIDER_HISTORY_DRIFT');
  await observeWeb(); await observeBackend();
  return Object.freeze({ ...receipt, outcome: 'existing-provider-effect-observed',
    originalRunStillFailed: true, successfulReleaseReceiptCreated: false,
    deploymentState: 'READY', productionAlias: v.productionUrl,
    publicBuildInputsVerified: true, backendUnchanged: true });
}
