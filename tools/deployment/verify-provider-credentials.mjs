// One-off GET capability check. Not release admission, readiness or write proof.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { clients, targets, standingPolicy } from './release-control.mjs';
import { runtimeSettings } from './runtime-readiness.mjs';

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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const checkoutSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    providerCheckContext(process.env, checkoutSha);
    if (process.argv[2] === 'context') console.log(JSON.stringify({ check: 'trusted-main-context', result: 'PASS' }));
    else if (process.argv[2] === 'verify') {
      if (!await verifyProviderCredentials(process.env, { checkoutSha,
        emit: row => console.log(JSON.stringify(row)) })) process.exitCode = 1;
    } else throw Error('INVALID_MODE');
  } catch {
    console.log(JSON.stringify({ check: 'provider-credentials', result: 'FAIL', code: 'CHECK_CONTEXT_OR_EXECUTION_FAILED' }));
    process.exitCode = 1;
  }
}
