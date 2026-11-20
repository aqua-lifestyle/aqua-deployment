// One-off GET capability check. Not release admission, readiness or write proof.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { clients, targets, standingPolicy, policyDigest, validateRender, validateHealth,
  deploymentHistory, authenticateHistoricalPolicy, validateBaselineReceipt } from './release-control.mjs';
import { validateFailedRenderReconciliation } from './historical-release-reconciliation.mjs';
import { validateFailedFrontendRecord } from './failed-frontend-release.mjs';
import { readGitHubArtifact, readGitHubArtifactFiles, validateArtifact } from './github-evidence.mjs';
import { runtimeSettings, cleanStartRuntimeSettings, normalRuntimeSettings } from './runtime-readiness.mjs';
import { memberRuntimeSettings } from './member-release.mjs';
import { inspectCommissionedBuildIdentity, inspectCommissioningDecision, inspectCommissionedDeploymentHistory,
  inspectCommissionedDeploymentIdentity, inspectCommissionedHealth, inspectCommissionedRenderService,
  inspectHistoricalCommissioningBindings } from './backend-successor-release.mjs';
const nativeSource = JSON.parse(readFileSync(new URL('./native-recovery-source.json', import.meta.url)));
const heldFrontend = JSON.parse(readFileSync(new URL('../../governance/held-frontend-source-evidence-20261029.json', import.meta.url)));

const approvedRenderUser = 'usr-d9f04o3tqb8s73bbhjbg';
const executor = targets.executor.repository;
const denied = () => { throw Error('PROVIDER_CHECK_CONTEXT_DENIED'); };
const commissionedFailure = Object.freeze({ runId: '44245360791', sha: 'e25fa6ec5d604e1f616aece4ddc9741429549bd3',
  admissionArtifactId: '14401816374', admissionArtifactName: 'verified-admission-44245360791-1' });
const safeHash = value => /^[a-f0-9]{64}$/.test(value ?? '') ? value : 'UNVERIFIABLE';
const safeSha = value => /^[a-f0-9]{40}$/.test(value ?? '') ? value : 'UNVERIFIABLE';
const safeRenderId = value => /^dep-[a-z0-9]+$/.test(value ?? '') ? value : 'UNVERIFIABLE';
const passFailUnknown = value => value === undefined || value === null ? 'UNKNOWN' : value ? 'PASS' : 'FAIL';

export function providerCheckContext(env, checkoutSha) {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    env.GITHUB_REPOSITORY !== executor || env.GITHUB_REPOSITORY_ID !== '1423239668' ||
    env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_REF_PROTECTED !== 'true' ||
    env.GITHUB_WORKFLOW_REF !== `${executor}/.github/workflows/provider-credential-check.yml@refs/heads/main` ||
    !/^[a-f0-9]{40}$/.test(checkoutSha ?? '') || env.GITHUB_SHA !== checkoutSha ||
    env.GITHUB_WORKFLOW_SHA !== checkoutSha ||
    !standingPolicy.authorization.administrators.some(a =>
      a.login === env.GITHUB_ACTOR && String(a.id) === env.GITHUB_ACTOR_ID) ||
    !standingPolicy.authorization.administrators.some(a => a.login === env.GITHUB_TRIGGERING_ACTOR)) denied();
}

export function providerCheckMode(env) {
  const mode = env.PROVIDER_CHECK_MODE ?? 'verify';
  if (!['verify', 'native-recovery-readback', 'render-env-diagnostic', 'render-baseline-diagnostic',
    'render-commissioned-state-diagnostic'].includes(mode)) denied();
  if (['render-env-diagnostic', 'render-baseline-diagnostic', 'render-commissioned-state-diagnostic'].includes(mode) &&
    (!/^[1-9]\d*$/.test(env.GITHUB_RUN_ID ?? '') || env.GITHUB_RUN_ATTEMPT !== '1')) denied();
  return mode;
}

// Fixed-service GET-only comparison for the already failed combined release.
// The original full-release ID comes from authenticated audit 43429695806/1
// (artifact 14040001166, SHA-256 516c46ea49d444ed514c4d300adfe5c746c199727ca3ef8f4a972b8e60ba6a14).
// The later observation is independently digest-pinned in the failed-frontend
// reconciliation. Neither is promoted to a new release baseline by this read.
export async function diagnoseRenderBaseline(env, { checkoutSha, fetcher = fetch, emit = () => {} }) {
  providerCheckContext(env, checkoutSha);
  if (providerCheckMode(env) !== 'render-baseline-diagnostic') denied();
  const report = row => emit({ contract: 'aqua.render-baseline-drift-diagnostic', version: 1,
    executorSha: checkoutSha, runId: env.GITHUB_RUN_ID, runAttempt: 1,
    failedReleaseRunId: '43935894260', renderServiceId: targets.render.id, ...row });
  if (typeof env.RENDER_API_KEY !== 'string' || !env.RENDER_API_KEY.trim()) {
    report({ result: 'FAIL', classification: 'CREDENTIAL_MISSING' }); return false;
  }
  const servicePath = `/services/${targets.render.id}`;
  const historyPath = `${servicePath}/deploys?limit=100`;
  let active;
  const transport = async (url, options) => {
    if (!active || url !== active.url || options.method !== 'GET' || options.body !== undefined ||
      options.redirect !== 'error') throw Error('FIXED_GET_ONLY_REQUIRED');
    const response = await fetcher(url, options);
    active.httpStatus = response.status;
    return response;
  };
  const api = clients({ RENDER_API_KEY: env.RENDER_API_KEY }, transport);
  const read = async (check, path) => {
    const query = new URL(path, 'https://api.render.com');
    const history = query.pathname === `${servicePath}/deploys` && query.searchParams.get('limit') === '100' &&
      [...query.searchParams.keys()].sort().join() ===
        (query.searchParams.has('cursor') ? 'cursor,limit' : 'limit') &&
      (!query.searchParams.has('cursor') || (query.searchParams.get('cursor').length > 0 &&
        query.searchParams.get('cursor').length <= 256));
    if (path !== servicePath && (!history || !path.startsWith(historyPath))) throw Error('FIXED_GET_ONLY_REQUIRED');
    active = { check, url: 'https://api.render.com/v1' + path };
    return api.render(path);
  };
  const safeDeploy = row => ({ id: /^dep-[a-z0-9]+$/.test(row?.id ?? '') ? row.id : 'UNVERIFIABLE',
    status: row?.status, revision: /^[a-f0-9]{40}$/.test(row?.commit?.id ?? '') ? row.commit.id : 'UNVERIFIABLE' });
  try {
    const service = await read('service', servicePath);
    let targetMatch = false;
    try { validateRender(service, [], false, {}); targetMatch = true; } catch { /* report a predicate, never raw provider data */ }
    const d = service?.serviceDetails;
    const targetChecks = {
      id: service?.id === targets.render.id, name: service?.name === targets.render.name,
      repository: service?.repo?.replace(/\.git$/, '') === `https://github.com/${targets.repository}`,
      branch: service?.branch === 'main', unsuspended: service?.suspended === 'not_suspended',
      autoDeployTrigger: service?.autoDeployTrigger === 'off', autoDeploy: service?.autoDeploy === 'no',
      rootDirectory: !service?.rootDir, runtime: d?.runtime === 'docker',
      healthCheckPath: d?.healthCheckPath === '/api/health',
      dockerContext: d?.envSpecificDetails?.dockerContext === '.',
      dockerfilePath: d?.envSpecificDetails?.dockerfilePath === './docker/api/Dockerfile',
      preDeployCommand: d?.envSpecificDetails?.preDeployCommand === '',
      dockerCommand: d?.envSpecificDetails?.dockerCommand === ''
    };
    const profile = {
      plan: d?.plan === 'starter', buildPlan: d?.buildPlan === 'starter', instances: d?.numInstances === 1,
      region: d?.region === 'frankfurt', maintenance: d?.maintenanceMode?.enabled === false,
      noDisk: !!d && !d.disk && !service?.disk
    };
    const deployments = await deploymentHistory({ render: path => read('deployment-history', path) }, 'render');
    const live = deployments.filter(row => row.status === 'live');
    const activeStates = new Set(['created', 'queued', 'build_in_progress', 'pre_deploy_in_progress', 'update_in_progress']);
    const historyMatch = live.length === 1 && !deployments.some(row => activeStates.has(row.status));
    const original = { id: 'dep-dbrgkstbedkc73difujg', sha: 'b8d86e5e60997483423b273d5f426c08b411f573' };
    const observed = validateFailedFrontendRecord().observedBackend;
    const later = { id: observed.renderDeployId, sha: observed.renderSha };
    const current = live.map(safeDeploy);
    const originalMatch = historyMatch && current[0].id === original.id && current[0].revision === original.sha;
    const laterMatch = historyMatch && current[0].id === later.id && current[0].revision === later.sha;
    const statusCounts = Object.fromEntries([...new Set(deployments.map(row => row.status))].sort().map(status =>
      [status, deployments.filter(row => row.status === status).length]));
    const profileMatch = targetMatch && Object.values(profile).every(Boolean);
    report({ result: 'PASS', observedAt: new Date().toISOString(),
      expected: { serviceId: targets.render.id, fullReleaseRunId: '43429695806',
        fullReleaseDeployId: original.id, laterObservationRecordSha256: 'eb8e7c97a815e0e5181983bf26adf098af3193b2885b41268f3c6563549c09f0',
        laterObservedDeployId: later.id, revision: original.sha },
      observed: { serviceId: /^srv-[a-z0-9]+$/.test(service?.id ?? '') ? service.id : 'UNVERIFIABLE',
        serviceTargetMatch: targetMatch, serviceTargetChecks: targetChecks, serviceProfileChecks: profile,
        deploymentCount: deployments.length,
        deploymentStatuses: statusCounts, liveDeployments: current },
      predicates: { serviceTargetMatch: targetMatch, serviceProfileMatch: profileMatch,
        oneLiveNoActive: historyMatch, originalFullReceiptMatch: originalMatch,
        laterObservedBaselineMatch: laterMatch },
      classification: profileMatch && historyMatch && laterMatch && !originalMatch ?
        'OBSOLETE_FULL_RECEIPT_RENDER_ID' : profileMatch && historyMatch && originalMatch ?
          'NO_CURRENT_RENDER_DRIFT' : 'RENDER_DRIFT_REQUIRES_RECONCILIATION' });
    return true; // A completed diagnostic is not a release authorization.
  } catch {
    const status = active?.httpStatus;
    report({ result: 'FAIL', check: active?.check ?? 'context',
      ...(status === undefined ? {} : { httpStatus: status }),
      classification: status === undefined ? 'TRANSPORT_UNAVAILABLE' : status === 401 ?
        'AUTHENTICATION_REJECTED' : status === 403 ? 'PERMISSION_OR_POLICY_DENIED' : status === 404 ?
          'RESOURCE_UNAVAILABLE' : status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'RESPONSE_OR_HISTORY_UNVERIFIABLE' });
    return false;
  }
}

// One bounded, fixed-service diagnostic. No group/environment enumeration, secret
// value output, redirects, retries or provider operations other than these GETs.
export async function diagnoseRenderEnvironment(env, { checkoutSha, fetcher = fetch, emit = () => {} }) {
  providerCheckContext(env, checkoutSha);
  if (providerCheckMode(env) !== 'render-env-diagnostic') denied();
  const report = row => emit({ contract: 'aqua.render-environment-read-diagnostic', version: 1,
    executorSha: checkoutSha, runId: env.GITHUB_RUN_ID, runAttempt: 1,
    renderServiceId: targets.render.id, ...row });
  if (typeof env.RENDER_API_KEY !== 'string' || !env.RENDER_API_KEY.trim()) {
    report({ result: 'FAIL', classification: 'CREDENTIAL_MISSING' }); return false;
  }
  let active;
  const transport = async (url, options) => {
    if (!active || url !== active.url || options.method !== 'GET' || options.body !== undefined ||
      options.redirect !== 'error') throw Error('FIXED_GET_ONLY_REQUIRED');
    const response = await fetcher(url, options);
    active.httpStatus = response.status;
    return response;
  };
  const api = clients({ RENDER_API_KEY: env.RENDER_API_KEY }, transport);
  const read = async (check, key) => {
    const path = `/services/${targets.render.id}` + (key ? `/env-vars/${key}` : '');
    active = { check, ...(key ? { key } : {}), url: 'https://api.render.com/v1' + path };
    return api.render(path);
  };
  let valuesMatch = true;
  try {
    const service = await read('service-identity');
    if (active.httpStatus !== 200 || service?.id !== targets.render.id || service.name !== targets.render.name)
      throw Error('RESPONSE_IDENTITY_OR_SHAPE_UNVERIFIED');
    report({ check: active.check, httpStatus: active.httpStatus, result: 'PASS' });
    // Preserve the production validator's exact order, including CLEAN_START's
    // thirteenth setting. These identifiers are executor-owned, never inputs.
    for (const [key, allowed] of Object.entries(cleanStartRuntimeSettings)) {
      const variable = await read('environment-variable', key);
      if (active.httpStatus !== 200 || variable?.key !== key || typeof variable.value !== 'string')
        throw Error('RESPONSE_IDENTITY_OR_SHAPE_UNVERIFIED');
      const matches = allowed.includes(variable.value);
      valuesMatch &&= matches;
      report({ check: active.check, key, httpStatus: active.httpStatus,
        configurationSource: 'SERVICE_LEVEL', result: matches ? 'PASS' : 'FAIL',
        classification: matches ? 'ALLOWLISTED_CONFIGURATION_MATCH' : 'ALLOWLISTED_CONFIGURATION_MISMATCH' });
    }
    report({ check: 'complete', result: valuesMatch ? 'PASS' : 'FAIL' });
    return valuesMatch;
  } catch {
    const status = active?.httpStatus;
    const classification = status === undefined ? 'TRANSPORT_UNAVAILABLE' : status === 200 ?
      'RESPONSE_IDENTITY_OR_SHAPE_UNVERIFIED' : ({ 400: 'REQUEST_REJECTED', 401: 'AUTHENTICATION_REJECTED',
        403: 'PERMISSION_OR_POLICY_DENIED', 404: 'RESOURCE_OR_VARIABLE_UNAVAILABLE',
        429: 'RATE_LIMITED' })[status] ?? (status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'HTTP_REJECTED');
    report({ check: active?.check ?? 'context', ...(active?.key ? { key: active.key,
      configurationSource: 'NOT_ESTABLISHED', inheritedConfiguration: 'NOT_DETERMINED' } : {}),
      ...(status === undefined ? {} : { httpStatus: status }), result: 'FAIL', classification });
    return false;
  }
}

// Baseline evidence is read only through the diagnostic's authorised artifact
// readers, which own the pinned-download latch. Without them this path must
// fail closed rather than download outside that latch.
async function selectedCommissionedBaseline(api, { readArtifactFiles, readArtifact } = {}) {
  if (typeof readArtifactFiles !== 'function' || typeof readArtifact !== 'function')
    throw Error('GITHUB_ARTIFACT_RETRIEVAL_UNAVAILABLE');
  const failed = await api.executor(`/actions/runs/${commissionedFailure.runId}`);
  if (failed?.id !== Number(commissionedFailure.runId) || failed.run_attempt !== 1 ||
    failed.head_sha !== commissionedFailure.sha || failed.event !== 'workflow_dispatch' ||
    failed.head_branch !== 'main' || failed.path !== '.github/workflows/deploy.yml' ||
    failed.status !== 'completed' || failed.conclusion !== 'failure' ||
    failed.repository?.full_name !== executor || failed.head_repository?.full_name !== executor)
    throw Error('FAILED_RELEASE_PROVENANCE_UNVERIFIED');
  const repository = await api.executor('');
  if (repository?.full_name !== executor || !Number.isSafeInteger(repository.id))
    throw Error('EXECUTOR_REPOSITORY_UNVERIFIED');
  const runArtifacts = await api.executor(`/actions/runs/${commissionedFailure.runId}/artifacts?per_page=100`);
  if (!Array.isArray(runArtifacts?.artifacts) || runArtifacts.total_count !== runArtifacts.artifacts.length ||
    runArtifacts.total_count > 100) throw Error('FAILED_RELEASE_ARTIFACT_INVENTORY_UNVERIFIED');
  const admissionRows = runArtifacts.artifacts.filter(row => row.name === commissionedFailure.admissionArtifactName &&
    String(row.id) === commissionedFailure.admissionArtifactId);
  if (admissionRows.length !== 1) throw Error('FAILED_RELEASE_ADMISSION_ARTIFACT_UNVERIFIED');
  const admissionDescriptor = validateArtifact(admissionRows[0], commissionedFailure.runId,
    commissionedFailure.sha, commissionedFailure.admissionArtifactName, repository.id);
  const admissionFiles = await readArtifactFiles(admissionDescriptor,
    ['admission-receipt.json', 'evidence-plan.json']);
  let admission, plan;
  try {
    admission = JSON.parse(admissionFiles['admission-receipt.json'].toString('utf8'));
    plan = JSON.parse(admissionFiles['evidence-plan.json'].toString('utf8'));
  } catch { throw Error('FAILED_RELEASE_ADMISSION_CONTENT_UNVERIFIED'); }
  if (admission?.contract !== 'aqua.github-evidence-admission' ||
    admission.releaseRunId !== Number(commissionedFailure.runId) || admission.releaseRunAttempt !== 1 ||
    admission.executorRepository !== executor || admission.executorSha !== commissionedFailure.sha ||
    admission.qualificationOnly !== false || admission.combinedRelease !== 'post-normal-backend-frontend-v1' ||
    plan?.policySha256 !== admission.policySha256 || !plan.baseline || !plan.baselinePolicyProof ||
    plan.baselinePolicyProof.executorSha !== plan.baseline.sha ||
    plan.policySha256 !== policyDigest(standingPolicy))
    throw Error('FAILED_RELEASE_BASELINE_SELECTION_UNVERIFIED');

  const baseline = plan.baseline;
  const baselineRun = await api.executor(`/actions/runs/${baseline.runId}`);
  if (baselineRun?.id !== Number(baseline.runId) || baselineRun.run_attempt !== baseline.runAttempt ||
    baselineRun.head_sha !== baseline.sha || baselineRun.event !== 'workflow_dispatch' ||
    baselineRun.head_branch !== 'main' || baselineRun.path !== '.github/workflows/deploy.yml' ||
    baselineRun.status !== 'completed' || baselineRun.conclusion !== 'success' ||
    baselineRun.repository?.full_name !== executor || baselineRun.head_repository?.full_name !== executor)
    throw Error('SELECTED_BASELINE_RUN_UNVERIFIED');
  const baselineArtifacts = await api.executor(`/actions/runs/${baseline.runId}/artifacts?per_page=100`);
  if (!Array.isArray(baselineArtifacts?.artifacts) || baselineArtifacts.total_count !== baselineArtifacts.artifacts.length ||
    baselineArtifacts.total_count > 100) throw Error('SELECTED_BASELINE_ARTIFACT_INVENTORY_UNVERIFIED');
  const auditName = `production-release-audit-${baseline.runId}-${baseline.runAttempt}`;
  const selectedAudit = baselineArtifacts.artifacts.filter(row => String(row.id) === baseline.artifactId && row.name === auditName);
  if (selectedAudit.length !== 1) throw Error('SELECTED_BASELINE_ARTIFACT_SUBSTITUTED');
  const auditDescriptor = validateArtifact(selectedAudit[0], baseline.runId, baseline.sha, auditName, repository.id);
  const auditBytes = await readArtifact(auditDescriptor, 'release-report.jsonl');
  let rows;
  try {
    const lines = auditBytes.toString('utf8').trim().split('\n');
    if (!lines.length || lines.length > 100) throw Error('INVALID_AUDIT_SIZE');
    rows = lines.map(line => JSON.parse(line));
  } catch { throw Error('SELECTED_BASELINE_AUDIT_UNVERIFIABLE'); }
  const historicalPolicy = await authenticateHistoricalPolicy(api, auditDescriptor,
    plan.baselinePolicyProof.policySha256);
  const proof = validateBaselineReceipt(rows, { artifactId: baseline.artifactId, runId: baseline.runId,
    runAttempt: baseline.runAttempt, sha: baseline.sha }, { policySha256: plan.policySha256 }, historicalPolicy);
  if (!proof.origin?.d10RuntimeBindings) throw Error('SELECTED_BASELINE_D10_BINDINGS_UNAVAILABLE');
  return { proof, baseline, selectedByReleaseRunId: Number(commissionedFailure.runId) };
}

// GET-only diagnostic for the exact failed combined release. All D10 checks
// below call the same pure inspectors and assertions used by the release path.
export async function diagnoseRenderCommissionedState(env, { checkoutSha, fetcher = fetch, emit = () => {},
  loadBaseline = selectedCommissionedBaseline } = {}) {
  providerCheckContext(env, checkoutSha);
  if (providerCheckMode(env) !== 'render-commissioned-state-diagnostic') denied();
  const report = row => emit({ contract: 'aqua.commissioned-state-read-diagnostic', version: 1,
    executorSha: checkoutSha, runId: env.GITHUB_RUN_ID, runAttempt: 1,
    failedReleaseRunId: commissionedFailure.runId, renderServiceId: targets.render.id, ...row });
  if (typeof env.RENDER_API_KEY !== 'string' || !env.RENDER_API_KEY.trim() ||
    typeof env.GH_TOKEN !== 'string' || !env.GH_TOKEN.trim()) {
    report({ diagnosticStatus: 'INCOMPLETE', credentials: 'UNAVAILABLE', predicates: {} });
    return false;
  }

  let artifactDownload = false, lastHttpStatus;
  const servicePath = `/services/${targets.render.id}`;
  const renderKeys = new Set([...Object.keys(normalRuntimeSettings),
    'App__AQGreenV2__Commissioning__DecisionJsonBase64',
    'App__AQGreenV2__Commissioning__DecisionSha256', 'Deployment__BuildId']);
  const githubApiPathAllowed = (pathname, search) => {
    if (pathname === `/repos/${executor}` && !search) return true;
    if (pathname === `/repos/${executor}/actions/runs/${commissionedFailure.runId}` && !search) return true;
    if (pathname === `/repos/${executor}/actions/runs/${commissionedFailure.runId}/artifacts` && search === '?per_page=100') return true;
    if (pathname === `/repos/${executor}/actions/artifacts/${commissionedFailure.admissionArtifactId}` && !search) return true;
    if (pathname === `/repos/${executor}/actions/artifacts/${commissionedFailure.admissionArtifactId}/zip` && !search) return true;
    if (/^\/repos\/aqua-lifestyle\/aqua-deployment\/actions\/runs\/43429695806$/.test(pathname) && !search) return true;
    if (pathname === `/repos/${executor}/actions/runs/43429695806/artifacts` && search === '?per_page=100') return true;
    if (/^\/repos\/aqua-lifestyle\/aqua-deployment\/actions\/artifacts\/14040001166(?:\/zip)?$/.test(pathname) && !search) return true;
    return /^\/repos\/aqua-lifestyle\/aqua-deployment\/contents\/tools\/deployment\/(?:approved-security-tests|unattended-policy)\.json$/.test(pathname) &&
      search === '?ref=e42e5288502085368eb1c7c9017643f63f9d2b19';
  };
  const getOnlyFetch = async (url, options = {}) => {
    const method = options.method ?? 'GET';
    if (method !== 'GET' || options.body !== undefined) throw Error('GET_ONLY_REQUIRED');
    const parsed = new URL(url);
    if (parsed.origin === 'https://api.render.com') {
      const renderPath = parsed.pathname.replace(/^\/v1(?=\/)/, '');
      const envMatch = renderPath.match(new RegExp(`^${servicePath}/env-vars/([^/]+)$`));
      const history = renderPath === `${servicePath}/deploys` && parsed.searchParams.get('limit') === '100' &&
        [...parsed.searchParams.keys()].sort().join() === (parsed.searchParams.has('cursor') ? 'cursor,limit' : 'limit') &&
        (!parsed.searchParams.has('cursor') || /^[A-Za-z0-9_-]{1,256}$/.test(parsed.searchParams.get('cursor')));
      if (options.redirect !== 'error' ||
        (renderPath !== servicePath && !history && !(envMatch && renderKeys.has(decodeURIComponent(envMatch[1])))))
        throw Error('FIXED_RENDER_GET_REQUIRED');
    } else if (url === targets.render.healthUrl) {
      if (options.redirect !== 'error' || options.headers?.Authorization !== undefined)
        throw Error('UNAUTHENTICATED_HEALTH_GET_REQUIRED');
    } else if (parsed.origin === 'https://api.github.com') {
      if (!githubApiPathAllowed(parsed.pathname, parsed.search) ||
        !['error', 'manual'].includes(options.redirect)) throw Error('FIXED_GITHUB_GET_REQUIRED');
      if (parsed.pathname.endsWith('/zip') && (!artifactDownload || options.redirect !== 'manual'))
        throw Error('PINNED_ARTIFACT_DOWNLOAD_REQUIRED');
    } else if (artifactDownload && parsed.protocol === 'https:' &&
      (parsed.hostname.endsWith('.blob.core.windows.net') || parsed.hostname === 'pipelines.actions.githubusercontent.com')) {
      if (options.redirect !== 'error' || options.headers?.Authorization !== undefined)
        throw Error('UNAUTHENTICATED_ARTIFACT_GET_REQUIRED');
    } else throw Error('FIXED_GET_DESTINATION_REQUIRED');
    const response = await fetcher(url, options);
    lastHttpStatus = response.status;
    return response;
  };
  const api = clients({ RENDER_API_KEY: env.RENDER_API_KEY, GH_TOKEN: env.GH_TOKEN }, getOnlyFetch);
  const readArtifactFiles = async (descriptor, names) => {
    artifactDownload = true;
    try { return await readGitHubArtifactFiles(api, 'executor', descriptor, names); }
    finally { artifactDownload = false; }
  };
  const readArtifact = async (descriptor, name) => {
    artifactDownload = true;
    try { return await readGitHubArtifact(api, 'executor', descriptor, name); }
    finally { artifactDownload = false; }
  };
  let baselineSelection, baselineError, baselineDownloadFailure;
  try { baselineSelection = await loadBaseline(api, { readArtifactFiles, readArtifact }); }
  catch (error) {
    // Only fixed machine codes can cross the diagnostic boundary. Native/API
    // errors can contain request details or signed provider data.
    baselineError = /^[A-Z][A-Z0-9_]{0,127}$/.test(error?.message ?? '') ? error.message :
      'SELECTED_BASELINE_UNAVAILABLE';
    const detail = error?.artifactDownloadDiagnostic;
    if (/^[1-9]\d*$/.test(detail?.artifactId ?? '') &&
      ['github_zip', 'redirected_storage'].includes(detail.stage) &&
      ['HTTP_STATUS', 'EMPTY_BODY', 'REQUEST_ABORTED', 'REQUEST_TIMEOUT', 'FETCH_TRANSPORT_ERROR',
        'DESTINATION_POLICY_REJECTED', 'TRANSPORT_ERROR'].includes(detail.category) &&
      (detail.httpStatus === undefined || (Number.isInteger(detail.httpStatus) && detail.httpStatus >= 100 && detail.httpStatus <= 599))) {
      baselineDownloadFailure = { artifactId: detail.artifactId, stage: detail.stage, category: detail.category,
        ...(detail.httpStatus === undefined ? {} : { httpStatus: detail.httpStatus }) };
    }
  }

  const safeRenderRead = async (check, path) => {
    lastHttpStatus = undefined;
    try {
      const value = await api.render(path);
      return { known: true, value, httpStatus: lastHttpStatus };
    } catch {
      return { known: false, httpStatus: lastHttpStatus, check };
    }
  };
  let serviceRead;
  try { serviceRead = await safeRenderRead('service', servicePath); }
  catch { serviceRead = { known: false, check: 'service' }; }
  const serviceInspection = serviceRead.known ? inspectCommissionedRenderService(serviceRead.value, validateRender) : null;
  const serviceProfileChecks = serviceInspection ? Object.fromEntries(Object.entries(serviceInspection.checks)
    .map(([key, value]) => [key, passFailUnknown(value)])) : { status: 'UNKNOWN' };

  const normalSettings = {};
  for (const [key, allowed] of Object.entries(normalRuntimeSettings)) {
    const value = await safeRenderRead(key, `${servicePath}/env-vars/${key}`);
    const matches = value.known && value.value?.key === key && typeof value.value.value === 'string' && allowed.includes(value.value.value);
    const safeObserved = value.known && typeof value.value?.value === 'string' &&
      [...new Set([...Object.values(normalRuntimeSettings), ...Object.values(cleanStartRuntimeSettings)].flat())]
        .includes(value.value.value) ? value.value.value : 'OTHER_OR_UNVERIFIABLE';
    normalSettings[key] = { result: value.known ? passFailUnknown(matches) : 'UNKNOWN',
      expected: allowed, observed: value.known ? safeObserved : 'UNKNOWN',
      httpStatus: value.httpStatus ?? null };
  }

  const decisionValue = await safeRenderRead('commissioning-decision',
    `${servicePath}/env-vars/App__AQGreenV2__Commissioning__DecisionJsonBase64`);
  const pinValue = await safeRenderRead('commissioning-decision-pin',
    `${servicePath}/env-vars/App__AQGreenV2__Commissioning__DecisionSha256`);
  const buildValue = await safeRenderRead('deployment-build-id', `${servicePath}/env-vars/Deployment__BuildId`);
  const decisionBytes = decisionValue.known && typeof decisionValue.value?.value === 'string' ?
    Buffer.from(decisionValue.value.value, 'base64') : null;
  const decisionPin = pinValue.known && typeof pinValue.value?.value === 'string' ? pinValue.value.value : null;
  const decisionInspection = decisionBytes ? inspectCommissioningDecision(decisionBytes, decisionPin) : null;

  let historyRead;
  try { historyRead = { known: true, deployments: await deploymentHistory(api, 'render') }; }
  catch { historyRead = { known: false }; }
  const historyInspection = historyRead.known ? inspectCommissionedDeploymentHistory(historyRead.deployments) : null;
  const live = historyInspection?.live?.length === 1 ? historyInspection.live[0] : null;
  const liveId = live && /^dep-[a-z0-9]+$/.test(live.id ?? '') ? live.id : 'UNVERIFIABLE';
  const liveSha = safeSha(live?.commit?.id);
  const predecessorBuildId = buildValue.known && typeof buildValue.value?.value === 'string' ? buildValue.value.value : null;
  const buildIdentity = live && buildValue.known ? inspectCommissionedBuildIdentity(predecessorBuildId, live.commit?.id) : null;

  const decision = decisionInspection?.decision;
  const historicalBindings = baselineSelection?.proof?.origin?.d10RuntimeBindings;
  const bindingInspection = decision && historicalBindings ?
    inspectHistoricalCommissioningBindings(historicalBindings, decision) : null;
  let deploymentIdentity = null;
  if (live && baselineSelection) {
    try { deploymentIdentity = inspectCommissionedDeploymentIdentity(live, baselineSelection.proof,
      validateFailedFrontendRecord().observedBackend); } catch { /* pinned later observation unavailable */ }
  }

  let healthRead;
  try { healthRead = { known: true, value: await api.health() }; }
  catch { healthRead = { known: false }; }
  const healthInspection = healthRead.known && live ?
    inspectCommissionedHealth(healthRead.value, live.commit?.id, validateHealth) : null;
  const healthResults = healthInspection ? Object.fromEntries(Object.entries(healthInspection.checks)
    .map(([key, value]) => [key, passFailUnknown(value)])) : { status: 'UNKNOWN' };
  const outputBindings = bindingInspection ? Object.fromEntries(bindingInspection.rows.map(row => [row.key, {
    result: passFailUnknown(row.pass), expected: safeHash(row.expected), observed: safeHash(row.observed)
  }])) : { status: 'UNKNOWN' };
  const d10Decision = decisionInspection ? {
    length: { result: passFailUnknown(decisionInspection.lengthValid), expected: '1..65536 bytes', observed: decisionInspection.byteLength },
    sha256Pin: { result: passFailUnknown(decisionInspection.pinMatches), expected: safeHash(decisionPin), observed: safeHash(decisionInspection.decisionSha256) },
    jsonObject: passFailUnknown(decisionInspection.objectValid),
    contract: passFailUnknown(decisionInspection.contractValid),
    decisionIdValidity: passFailUnknown(decisionInspection.decisionIdValid),
    requiredDigestFields: passFailUnknown(decisionInspection.digestFieldsValid)
  } : { length: 'UNKNOWN', sha256Pin: 'UNKNOWN', jsonObject: 'UNKNOWN', contract: 'UNKNOWN',
    decisionIdValidity: 'UNKNOWN', requiredDigestFields: 'UNKNOWN' };
  const currentFailures = [];
  if (decisionInspection) {
    if (!decisionInspection.lengthValid) currentFailures.push('decision-length');
    if (!decisionInspection.pinMatches) currentFailures.push('decision-sha256-pin');
    if (!decisionInspection.jsonValid) currentFailures.push('decision-json');
    if (!decisionInspection.structureValid) currentFailures.push('decision-structure');
  }
  if (buildIdentity && !(buildIdentity.validSha && buildIdentity.buildMatches))
    currentFailures.push('deployment-build-identity');
  if (bindingInspection) for (const comparison of bindingInspection.rows)
    if (!comparison.pass) currentFailures.push(`historical-d10-bindings:${comparison.key}`);
  if (healthInspection && !healthInspection.healthPass) currentFailures.push('backend-health');
  if (healthInspection && !healthInspection.paymentPass) currentFailures.push('payment-availability');
  const hasUnknown = !baselineSelection || !serviceInspection || Object.values(normalSettings).some(x => x.result === 'UNKNOWN') ||
    !historyInspection || !decisionInspection || !buildIdentity || !deploymentIdentity || !bindingInspection || !healthInspection;
  report({ diagnosticStatus: hasUnknown ? 'COMPLETE_WITH_UNKNOWN' : 'COMPLETE', observedAt: new Date().toISOString(),
    historicalFailurePredicate: 'UNKNOWN_NOT_RETAINED_IN_FAILED_RUN_AUDIT',
    baselineEvidence: baselineSelection ? { result: 'PASS', selectedByReleaseRunId: baselineSelection.selectedByReleaseRunId,
      runId: baselineSelection.baseline.runId, runAttempt: baselineSelection.baseline.runAttempt,
      executorSha: safeSha(baselineSelection.baseline.sha), renderDeployId: safeRenderId(baselineSelection.proof.renderDeployId),
      renderSha: safeSha(baselineSelection.proof.renderSha), d10Bindings: Object.fromEntries(
        ['currentConfigurationDigest','requiredAssemblyDigest','requiredRuntimeAssemblyDigest'].map(key =>
          [key, safeHash(historicalBindings?.[key])])) } : { result: 'UNKNOWN', code: baselineError ?? 'SELECTED_BASELINE_UNAVAILABLE',
            ...(baselineDownloadFailure ? { downloadFailure: baselineDownloadFailure } : {}) },
    service: { result: serviceInspection ? passFailUnknown(serviceInspection.pass) : 'UNKNOWN', checks: serviceProfileChecks },
    normalRuntimeSettings: normalSettings,
    deploymentHistory: historyInspection ? { observedCount: historyRead.deployments.length,
      oneLive: passFailUnknown(historyInspection.oneLive), noActiveDeployments: passFailUnknown(historyInspection.noActive),
      deployments: historyRead.deployments.map(row => ({ id: safeRenderId(row?.id), status: row?.status,
        commitSha: safeSha(row?.commit?.id) })), liveDeployment: live ? { id: liveId, commitSha: liveSha } : null
    } : { result: 'UNKNOWN' },
    deploymentIdentity: { liveCommitSha: liveSha, deploymentBuildId: safeSha(predecessorBuildId),
      shaValid: buildIdentity ? passFailUnknown(buildIdentity.validSha) : 'UNKNOWN',
      buildIdMatchesLiveCommit: buildIdentity ? passFailUnknown(buildIdentity.buildMatches) : 'UNKNOWN',
      selectedReceiptOrReconciliation: deploymentIdentity ? {
        result: passFailUnknown(deploymentIdentity.pass), originalReceiptMatch: passFailUnknown(deploymentIdentity.original),
        laterAuthenticatedObservationMatch: passFailUnknown(deploymentIdentity.reconciled),
        expectedOriginal: { id: safeRenderId(baselineSelection?.proof?.renderDeployId),
          commitSha: safeSha(baselineSelection?.proof?.renderSha) },
        expectedLaterAuthenticated: { id: safeRenderId(validateFailedFrontendRecord().observedBackend.renderDeployId),
          commitSha: safeSha(validateFailedFrontendRecord().observedBackend.renderSha) },
        observed: { id: liveId, commitSha: liveSha }
      } : 'UNKNOWN' },
    commissioningDecision: d10Decision, historicalD10Comparisons: outputBindings,
    backendHealth: healthResults,
    paymentAvailability: healthRead?.known ? {
      expected: 'Available', observed: ['Available','Unavailable','Held'].includes(
        (healthRead.value.body?.result ?? healthRead.value.body)?.paymentAvailability) ?
        (healthRead.value.body?.result ?? healthRead.value.body).paymentAvailability : 'UNVERIFIABLE',
      result: healthInspection ? passFailUnknown(healthInspection.paymentPass) : 'UNKNOWN'
    } : { expected: 'Available', observed: 'UNKNOWN', result: 'UNKNOWN' },
    currentFailingPredicates: currentFailures,
    exactCurrentFailingPredicate: currentFailures[0] ?? (hasUnknown ? 'UNKNOWN' : 'NOT_ESTABLISHED') });
  return true; // Diagnostic results never authorize or block a release by themselves.
}

export async function verifyProviderCredentials(env, { checkoutSha, fetcher = fetch, emit = () => {} }) {
  providerCheckContext(env, checkoutSha);
  // Missing credentials deny before any network access; never substitute a CLI session.
  for (const name of ['RENDER_API_KEY', 'VERCEL_TOKEN']) {
    if (typeof env[name] !== 'string' || !env[name].trim()) {
      emit({ check: name, result: 'FAIL', code: 'CREDENTIAL_MISSING' });
      return false;
    }
  }
  let active;
  const transport = async (url, options) => {
    // The fixed read plan is the only transport authority, including destinations.
    if (!active || url !== active.url || options.method !== 'GET' || options.body !== undefined ||
      options.redirect !== 'error') throw Error('GET_ONLY_CHECK_DENIED');
    let response;
    try { response = await fetcher(url, options); }
    catch { active.failureCategory = 'NETWORK_UNAVAILABLE'; throw Error('GET_UNAVAILABLE'); }
    emit({ provider: active.provider, check: active.check, httpStatus: response.status });
    if (active.provider === 'Vercel' && !response.ok) {
      active.httpStatus = response.status;
      active.failureCategory = ({ 400: 'REQUEST_CONTEXT_REJECTED', 401: 'AUTHENTICATION_REJECTED',
        402: 'PAYMENT_REQUIRED', 403: 'PERMISSION_OR_POLICY_DENIED',
        404: 'RESOURCE_OR_CONTEXT_NOT_FOUND', 429: 'RATE_LIMITED' })[response.status] ??
        (response.status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'UNEXPECTED_HTTP_STATUS');
      // Provider messages and arbitrary codes can contain sensitive data. Retain
      // only documented generic enum codes; never echo messages or raw bodies.
      try {
        const code = (await response.clone().json())?.error?.code;
        if (['forbidden', 'not_found', 'bad_request', 'rate_limited',
          'internal_server_error', 'method_unknown'].includes(code)) active.providerErrorCode = code;
      } catch { /* HTTP status remains authoritative when error JSON is absent. */ }
    }
    return response;
  };
  const api = clients(env, transport);
  // Team identity is a path parameter, not deployment-client team query context.
  // No personal user endpoint/permission is required to authenticate fixed scope.
  const readTeam = async url => {
    const response = await transport(url, { method: 'GET', redirect: 'error',
      signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}`, Accept: 'application/json' } });
    if (!response.ok) throw Error('TEAM_GET_REJECTED');
    return response.json();
  };
  const baseline = standingPolicy.firstReleaseRecovery.baseline;
  const plans = [
    ['Render', api.render, 'https://api.render.com/v1', '', [
      ['identity', '/users', j => j.id === approvedRenderUser],
      ['service', `/services/${targets.render.id}`, j => j.id === targets.render.id && j.name === targets.render.name],
      ['history', `/services/${targets.render.id}/deploys?limit=1`, Array.isArray],
      ['baseline', `/services/${targets.render.id}/deploys/${baseline.renderDeployId}`,
        j => j.id === baseline.renderDeployId && j.commit?.id === baseline.renderSha],
      ...Object.keys(runtimeSettings).map(key => [`setting-${key}`, `/services/${targets.render.id}/env-vars/${key}`,
        j => j.key === key && typeof j.value === 'string'])
    ]],
    ['Vercel', api.vercel, 'https://api.vercel.com', `teamId=${targets.vercel.teamId}`, [
      ['team', `/v2/teams/${targets.vercel.teamId}`, j => j.id === targets.vercel.teamId],
      ['project', `/v9/projects/${targets.vercel.id}`,
        j => j.id === targets.vercel.id && j.accountId === targets.vercel.teamId],
      ['environment-metadata', `/v10/projects/${targets.vercel.id}/env?decrypt=false`, j => Array.isArray(j.envs)],
      ['history', `/v6/deployments?projectId=${targets.vercel.id}&limit=1`, j => Array.isArray(j.deployments)],
      ['baseline', `/v13/deployments/${baseline.vercelDeployId}`,
        j => j.id === baseline.vercelDeployId && j.projectId === targets.vercel.id],
      ['aliases', `/v2/deployments/${baseline.vercelDeployId}/aliases`, j => Array.isArray(j.aliases)],
      ['domain', `/v9/projects/${targets.vercel.id}/domains/${baseline.productionDomain}`,
        j => j.name === baseline.productionDomain && j.projectId === targets.vercel.id]
    ]]
  ];
  let passed = true;
  for (const [provider, read, origin, query, checks] of plans) {
    let authentication = 'NOT_VERIFIED';
    try {
      for (const [check, path, validate] of checks) {
        const teamRead = provider === 'Vercel' && check === 'team';
        active = { provider, check, url: origin + path +
          (query && !teamRead ? (path.includes('?') ? '&' : '?') + query : '') };
        const result = teamRead ? await readTeam(active.url) : await read(path);
        if (!result || !validate(result)) throw Error('READ_IDENTITY_OR_SHAPE_MISMATCH');
        if (check === 'identity' || teamRead) authentication = 'PASS';
      }
      emit({ provider, result: 'PASS', authentication, requiredReads: 'PASS' });
    } catch {
      // Raw errors/bodies may contain secrets; only fixed phases/statuses escape.
      emit({ provider, check: active.check, result: 'FAIL', authentication,
        requiredReads: 'FAIL', code: 'REQUIRED_GET_OR_IDENTITY_FAILED',
        ...(provider === 'Vercel' ? {
          failureCategory: active.failureCategory ?? 'RESPONSE_IDENTITY_OR_FORMAT_UNVERIFIED',
          ...(active.httpStatus === undefined ? {} : { httpStatus: active.httpStatus }),
          ...(active.providerErrorCode ? { providerErrorCode: active.providerErrorCode } : {})
        } : {}) });
      passed = false;
    }
  }
  return passed;
}

// A separate fixed-target GET purpose in the existing protected workflow. It
// observes the current held pair; it never deploys, rolls back or reads a secret.
export async function observeNativeRecoveryBaseline(env, { checkoutSha, fetcher = fetch, emit = () => {} }) {
  providerCheckContext(env, checkoutSha);
  if (!/^[1-9]\d*$/.test(env.GITHUB_RUN_ID ?? '') || !/^[1-9]\d*$/.test(env.GITHUB_RUN_ATTEMPT ?? '')) {
    emit({ contract: 'aqua.native-recovery-baseline-observation', version: 1, status: 'UNVERIFIED', code: 'RUN_PROVENANCE_REQUIRED' }); return false;
  }
  for (const name of ['RENDER_API_KEY', 'VERCEL_TOKEN']) if (!env[name]?.trim()) {
    emit({ contract: 'aqua.native-recovery-baseline-observation', version: 1, status: 'UNVERIFIED', code: 'CREDENTIAL_MISSING' }); return false;
  }
  const p = nativeSource.heldPair, evidence = [];
  let active;
  const check = (ok, code) => { if (!ok) throw Error(code); };
  const transport = async (url, options) => {
    check(active && url === active.url && (options.method ?? 'GET') === 'GET' && options.body === undefined && options.redirect === 'error', 'FIXED_GET_ONLY_REQUIRED');
    check(active.provider !== 'health' || options.headers?.Authorization === undefined, 'HEALTH_CREDENTIAL_FORBIDDEN');
    const response = await fetcher(url, options);
    evidence.push({ provider: active.provider, check: active.check, httpStatus: response.status });
    return response;
  };
  const api = clients(env, transport);
  const read = async (provider, name, path) => {
    active = { provider, check: name, url: (provider === 'render' ? 'https://api.render.com/v1' : 'https://api.vercel.com') + path +
      (provider === 'vercel' ? (path.includes('?') ? '&' : '?') + `teamId=${p.vercelTeamId}` : '') };
    return api[provider](path);
  };
  const renderHistory = async name => {
    const deployments = await deploymentHistory({ render: path => read('render', name, path) }, 'render');
    const validId = value => typeof value === 'string' && /^dep-[a-z0-9]+$/.test(value);
    const summary = deploy => ({ id: deploy.id, status: deploy.status,
      ...(/^[a-f0-9]{40}$/.test(deploy.commit?.id ?? '') ? { revision: deploy.commit.id } : { revisionState: 'NOT_DETERMINED' }) });
    check(deployments.length > 0 && deployments.every(deploy => validId(deploy.id)) &&
      new Set(deployments.map(deploy => deploy.id)).size === deployments.length, 'NATIVE_RENDER_HISTORY_UNVERIFIED');
    const live = deployments.filter(deploy => deploy.status === 'live');
    emit({ provider: 'render', check: name, liveDeployments: live.map(summary) });
    check(live.length === 1 && live[0].id === p.renderDeployId && live[0].commit?.id === p.renderSha,
      'NATIVE_RENDER_BASELINE_CHANGED');
    const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
    check(deployments.every(deploy => typeof deploy.createdAt === 'string' && timestamp.test(deploy.createdAt) &&
      Number.isFinite(Date.parse(deploy.createdAt)) && Date.parse(deploy.createdAt) <= Date.now() + 30_000),
      'NATIVE_RENDER_HISTORY_UNVERIFIED');
    const pending = new Set(['created', 'queued', 'build_in_progress', 'pre_deploy_in_progress', 'update_in_progress']);
    check(!deployments.some(deploy => pending.has(deploy.status)), 'NATIVE_RENDER_OPERATION_UNACCOUNTED');
    const later = deployments.filter(deploy => deploy.id !== live[0].id && Date.parse(deploy.createdAt) >= Date.parse(live[0].createdAt));
    emit({ provider: 'render', check: name, laterAttempts: later.map(summary) });
    const reconciled = validateFailedRenderReconciliation(), failed = new Set(['build_failed', 'pre_deploy_failed', 'update_failed', 'canceled']);
    check(reconciled.originalIdentity.renderServiceId === p.renderServiceId && later.every(deploy =>
      deploy.id === reconciled.renderOperation.deployId && deploy.commit?.id === reconciled.originalIdentity.sha && failed.has(deploy.status)),
    'NATIVE_RENDER_OPERATION_UNACCOUNTED');
    return { live: summary(live[0]), accountedLaterAttempts: later.map(summary) };
  };
  try {
    check(p.renderServiceId === targets.render.id && p.vercelProjectId === targets.vercel.id && p.vercelTeamId === targets.vercel.teamId &&
      p.rootDirectory === targets.vercel.rootDirectory, 'NATIVE_TARGET_DEFINITION_MISMATCH');
    const service = await read('render', 'service', `/services/${p.renderServiceId}`), rows = [];
    for (const name of Object.keys(memberRuntimeSettings)) rows.push({ envVar: await read('render', 'hold-' + name, `/services/${p.renderServiceId}/env-vars/${name}`) });
    validateRender(service, rows, false, memberRuntimeSettings);
    const d = service.serviceDetails;
    check(service.type === 'web_service' && d.runtime === 'docker' && d.plan === 'starter' && d.numInstances === 1 &&
      d.healthCheckPath === '/api/health' && d.maintenanceMode?.enabled === false && !d.disk && !service.disk, 'NATIVE_SERVICE_PROFILE_UNVERIFIED');
    const disks = await read('render', 'disks', `/disks?serviceId=${p.renderServiceId}&limit=100`);
    check(Array.isArray(disks) && disks.length === 0, 'NATIVE_NO_DISK_PROFILE_UNVERIFIED');
    const renderState = await renderHistory('deployment-history');
    const render = await read('render', 'held-deploy', `/services/${p.renderServiceId}/deploys/${p.renderDeployId}`);
    check(render.id === p.renderDeployId && render.status === 'live' && render.commit?.id === p.renderSha, 'NATIVE_RENDER_BASELINE_CHANGED');
    const project = await read('vercel', 'project', `/v9/projects/${p.vercelProjectId}`);
    check(project.id === p.vercelProjectId && project.accountId === p.vercelTeamId && project.rootDirectory === p.rootDirectory &&
      project.targets?.production?.id === p.vercelDeployId, 'NATIVE_FRONTEND_BASELINE_CHANGED');
    const web = await read('vercel', 'held-deploy', `/v13/deployments/${p.vercelDeployId}`);
    check(web.id === p.vercelDeployId && web.projectId === p.vercelProjectId && web.target === 'production' && web.readyState === 'READY' &&
      !web.aliasError && (!web.gitSource || web.gitSource.sha === p.vercelSha), 'NATIVE_FRONTEND_DEPLOY_UNVERIFIED');
    check(heldFrontend.qualificationResult === 'PASS' && heldFrontend.deploymentId === web.id && heldFrontend.sourceSha === p.vercelSha &&
      heldFrontend.renderReceiverSha === p.renderSha, 'NATIVE_FRONTEND_SOURCE_AUDIT_MISMATCH');
    const readMapping = async () => {
      const aliases = await read('vercel', 'aliases', `/v2/deployments/${p.vercelDeployId}/aliases`);
      const domain = await read('vercel', 'domain', `/v9/projects/${p.vercelProjectId}/domains/${p.productionDomain}`);
      const matches = aliases.aliases?.filter(x => x.alias === p.productionDomain);
      check(Array.isArray(matches) && matches.length === 1 && !matches[0].redirect &&
        (matches[0].deploymentId === undefined || matches[0].deploymentId === p.vercelDeployId) &&
        (matches[0].projectId === undefined || matches[0].projectId === p.vercelProjectId) &&
        domain.name === p.productionDomain && domain.projectId === p.vercelProjectId && domain.verified === true && !domain.redirect,
      'NATIVE_DOMAIN_MAPPING_UNVERIFIED');
    };
    await readMapping();
    active = { provider: 'health', check: 'held-receiver-health', url: targets.render.healthUrl };
    const health = await api.health(), body = health.body?.result ?? health.body;
    check(health.status === 200 && body?.status === 'Healthy' && body.buildId === p.renderSha && health.receiver === 'Schema54' &&
      body.environment === 'Production' && body.databaseStatus === 'Healthy', 'NATIVE_RECEIVER_HEALTH_UNVERIFIED');
    const finalProject = await read('vercel', 'project-recheck', `/v9/projects/${p.vercelProjectId}`);
    check(finalProject.id === project.id && finalProject.accountId === project.accountId && finalProject.targets?.production?.id === web.id &&
      finalProject.rootDirectory === p.rootDirectory, 'NATIVE_FRONTEND_CHANGED_DURING_OBSERVATION');
    await readMapping();
    const finalRenderState = await renderHistory('deployment-history-recheck');
    check(JSON.stringify(finalRenderState) === JSON.stringify(renderState), 'NATIVE_RENDER_CHANGED_DURING_OBSERVATION');
    const finalRender = await read('render', 'held-deploy-recheck', `/services/${p.renderServiceId}/deploys/${p.renderDeployId}`);
    check(finalRender.id === p.renderDeployId && finalRender.status === 'live' && finalRender.commit?.id === p.renderSha,
      'NATIVE_RENDER_CHANGED_DURING_OBSERVATION');
    emit({ contract: 'aqua.native-recovery-baseline-observation', version: 1, status: 'VERIFIED', observedAt: new Date().toISOString(),
      producer: { executorSha: checkoutSha, runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT,
        actor: env.GITHUB_ACTOR, actorId: env.GITHUB_ACTOR_ID, workflow: 'provider-credential-check.yml', mode: 'native-recovery-readback' },
      baseline: { renderServiceId: service.id, renderDeployId: render.id, renderSha: render.commit.id,
        vercelTeamId: project.accountId, vercelProjectId: project.id, vercelDeployId: web.id,
        productionDomain: p.productionDomain, rootDirectory: project.rootDirectory },
      frontendSource: { sha: heldFrontend.sourceSha, provenance: 'EXISTING_AUTHENTICATED_MEMBER_QUALIFICATION',
        qualificationRecordSha256: heldFrontend.protectedQualificationRecordSha256, sourceProofSha256: heldFrontend.sourceProofSha256 },
      serviceProfile: { type: 'web_service', runtime: 'docker', plan: 'starter', instances: 1, attachedPersistentDisk: false,
        healthCheckPath: '/api/health', autoDeploy: 'off', maintenance: false, operationalHoldsVerified: true },
      applicability: { nativeHealthGatedDeploy: 'DOCUMENTED_APPLICABLE_TO_VERIFIED_PROFILE',
        cachedArtifactEligibility: 'NOT_VERIFIED', recoveryRehearsalPerformed: false },
      renderDeploymentState: finalRenderState,
      authenticatedReads: evidence,
      readStatusSha256: createHash('sha256').update(JSON.stringify(evidence)).digest('hex') });
    return true;
  } catch (error) {
    const reasons = ['NATIVE_RENDER_HISTORY_UNVERIFIED', 'NATIVE_RENDER_BASELINE_CHANGED', 'NATIVE_RENDER_OPERATION_UNACCOUNTED',
      'NATIVE_RENDER_CHANGED_DURING_OBSERVATION', 'UNKNOWN_RENDER_DEPLOYMENT_STATE', 'PROVIDER_HISTORY_INVENTORY_TOO_LARGE'];
    emit({ contract: 'aqua.native-recovery-baseline-observation', version: 1, status: 'UNVERIFIED',
      code: 'NATIVE_RECOVERY_READ_OR_IDENTITY_UNVERIFIED', provider: active?.provider ?? 'context', check: active?.check ?? 'definition',
      ...(reasons.includes(error?.message) ? { reason: error.message } : {}),
      authenticatedReads: evidence }); return false;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const checkoutSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    providerCheckContext(process.env, checkoutSha);
    const mode = providerCheckMode(process.env);
    if (process.argv[2] === 'context') console.log(JSON.stringify({ check: 'trusted-main-context', result: 'PASS' }));
    else if (process.argv[2] === 'verify') {
      const operation = mode === 'render-baseline-diagnostic' ? diagnoseRenderBaseline :
        mode === 'render-commissioned-state-diagnostic' ? diagnoseRenderCommissionedState :
        mode === 'render-env-diagnostic' ? diagnoseRenderEnvironment :
        mode === 'native-recovery-readback' ? observeNativeRecoveryBaseline : verifyProviderCredentials;
      if (!await operation(process.env, { checkoutSha, emit: row => console.log(JSON.stringify(row)) })) process.exitCode = 1;
    } else if (process.argv[2] === 'native-recovery-readback') {
      if (!await observeNativeRecoveryBaseline(process.env, { checkoutSha, emit: row => console.log(JSON.stringify(row)) })) process.exitCode = 1;
    } else throw Error('INVALID_MODE');
  } catch {
    console.log(JSON.stringify({ check: 'provider-credentials', result: 'FAIL', code: 'CHECK_CONTEXT_OR_EXECUTION_FAILED' }));
    process.exitCode = 1;
  }
}
