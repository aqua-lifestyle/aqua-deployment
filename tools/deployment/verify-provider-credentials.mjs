// One-off GET capability check. Not release admission, readiness or write proof.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { clients, targets, standingPolicy, validateRender, deploymentHistory } from './release-control.mjs';
import { validateFailedRenderReconciliation } from './historical-release-reconciliation.mjs';
import { runtimeSettings, cleanStartRuntimeSettings } from './runtime-readiness.mjs';
import { memberRuntimeSettings } from './member-release.mjs';
const nativeSource = JSON.parse(readFileSync(new URL('./native-recovery-source.json', import.meta.url)));
const heldFrontend = JSON.parse(readFileSync(new URL('../../governance/held-frontend-source-evidence-20261029.json', import.meta.url)));

const approvedRenderUser = 'usr-d9f04o3tqb8s73bbhjbg';
const executor = targets.executor.repository;
const denied = () => { throw Error('PROVIDER_CHECK_CONTEXT_DENIED'); };

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
  if (!['verify', 'native-recovery-readback', 'render-env-diagnostic'].includes(mode)) denied();
  if (mode === 'render-env-diagnostic' &&
    (!/^[1-9]\d*$/.test(env.GITHUB_RUN_ID ?? '') || env.GITHUB_RUN_ATTEMPT !== '1')) denied();
  return mode;
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
      const operation = mode === 'render-env-diagnostic' ? diagnoseRenderEnvironment :
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
