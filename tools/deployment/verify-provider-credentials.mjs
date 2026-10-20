// One-off GET capability check. Not release admission, readiness or write proof.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { clients, targets, standingPolicy } from './release-control.mjs';
import { runtimeSettings } from './runtime-readiness.mjs';

const approvedRenderUser = 'usr-d9f04o3tqb8s73bbhjbg';
const approvedVercelUser = 'PwdB234Akdmh3zLIxgLXgtBR';
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
  const api = clients(env, async (url, options) => {
    // The fixed read plan is the only transport authority, including destinations.
    if (!active || url !== active.url || options.method !== 'GET' || options.body !== undefined ||
      options.redirect !== 'error') throw Error('GET_ONLY_CHECK_DENIED');
    const response = await fetcher(url, options);
    emit({ provider: active.provider, check: active.check, httpStatus: response.status });
    return response;
  });
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
      ['identity', '/v2/user', j => j.user?.id === approvedVercelUser],
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
        active = { provider, check, url: origin + path +
          (query ? (path.includes('?') ? '&' : '?') + query : '') };
        const result = await read(path);
        if (!result || !validate(result)) throw Error('READ_IDENTITY_OR_SHAPE_MISMATCH');
        if (check === 'identity') authentication = 'PASS';
      }
      emit({ provider, result: 'PASS', authentication, requiredReads: 'PASS' });
    } catch {
      // Raw errors/bodies may contain secrets; only fixed phases/statuses escape.
      emit({ provider, check: active.check, result: 'FAIL', authentication,
        requiredReads: 'FAIL', code: 'REQUIRED_GET_OR_IDENTITY_FAILED' });
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
