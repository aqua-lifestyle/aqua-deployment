// One fixed REST read using the existing Actions-held token. No Git fetch,
// credential fallback, application execution, provider access or admission.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const executor = 'aqua-lifestyle/aqua-deployment';
const repository = 'aqua-lifestyle/aqua-lifestyle';
const source = '1b748dfdaf3b63fb9dcc42f781ab79d5c39ca503';
const endpoint = `https://api.github.com/repos/${repository}/git/commits/${source}`;
const administrators = [{ login: 'Xolani-M', id: '86495928' },
  { login: 'aqualifestyleclub', id: '307076734' }];

export function diagnosticContext(env, checkoutSha) {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    env.GITHUB_REPOSITORY !== executor || env.GITHUB_REPOSITORY_ID !== '1423239668' ||
    env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_REF_PROTECTED !== 'true' ||
    env.GITHUB_WORKFLOW_REF !== `${executor}/.github/workflows/evidence-token-diagnostic.yml@refs/heads/main` ||
    !/^[a-f0-9]{40}$/.test(checkoutSha ?? '') || env.GITHUB_SHA !== checkoutSha ||
    env.GITHUB_WORKFLOW_SHA !== checkoutSha || env.GITHUB_RUN_ATTEMPT !== '1' ||
    !/^[1-9]\d*$/.test(env.GITHUB_RUN_ID ?? '') ||
    !administrators.some(a => a.login === env.GITHUB_ACTOR && a.id === env.GITHUB_ACTOR_ID) ||
    !administrators.some(a => a.login === env.GITHUB_TRIGGERING_ACTOR))
    throw Error('PROTECTED_CONTEXT_DENIED');
}

async function readObject(response) {
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024 * 1024) { await reader.cancel(); throw Error('RESPONSE_UNVERIFIABLE'); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { reader.releaseLock(); }
}

export async function diagnoseToken(env, { checkoutSha, fetcher = fetch }) {
  diagnosticContext(env, checkoutSha);
  const token = env.AQGREEN_EVIDENCE_READ_TOKEN;
  const result = (classification, httpStatus, objectMatch = 'NOT_DETERMINED', verdict = 'TOKEN ACCESS INDETERMINATE') =>
    ({ ...(httpStatus === undefined ? {} : { httpStatus }), classification, objectMatch, verdict });
  if (typeof token !== 'string' || token.length === 0 || /[\s\0]/.test(token)) return result('CREDENTIAL_MISSING_OR_INVALID');
  let response;
  try {
    response = await fetcher(endpoint, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28' } });
  } catch { return result('TRANSPORT_UNAVAILABLE'); }
  const status = response.status;
  if (status !== 200) {
    const classification = ({ 401: 'AUTHENTICATION_REJECTED', 403: 'ACCESS_OR_POLICY_DENIED',
      404: 'RESOURCE_OR_ACCESS_UNAVAILABLE', 429: 'RATE_LIMITED' })[status] ??
      (status >= 500 ? 'GITHUB_UNAVAILABLE' : status >= 300 && status < 400 ? 'REDIRECT_REJECTED' : 'HTTP_REJECTED');
    // Denied responses are never parsed or logged. A 404 does not prove which
    // repository authorization or object is missing; other failures stay unknown.
    return result(classification, status, 'NOT_DETERMINED',
      [401, 403].includes(status) ? 'TOKEN ACCESS DENIED' : 'TOKEN ACCESS INDETERMINATE');
  }
  let object;
  try { object = await readObject(response); }
  catch { return result('RESPONSE_UNVERIFIABLE', status); }
  const matches = object?.sha === source && object?.url === endpoint;
  return matches ? result('COMMIT_OBJECT_MATCH', status, 'MATCH', 'TOKEN ACCESS VERIFIED') :
    result('COMMIT_OBJECT_MISMATCH', status, 'MISMATCH');
}

export async function runDiagnostic(env, { mode, checkoutSha, fetcher = fetch, emit = console.log }) {
  try {
    diagnosticContext(env, checkoutSha);
    if (mode === 'context') return 0;
    if (mode !== 'verify') throw Error('DIAGNOSTIC_MODE_INVALID');
    const report = await diagnoseToken(env, { checkoutSha, fetcher });
    emit(JSON.stringify(report));
    return report.verdict === 'TOKEN ACCESS VERIFIED' ? 0 : 1;
  } catch (error) {
    const classification = ['PROTECTED_CONTEXT_DENIED', 'DIAGNOSTIC_MODE_INVALID'].includes(error?.message) ?
      error.message : 'DIAGNOSTIC_UNAVAILABLE';
    emit(JSON.stringify({ classification, objectMatch: 'NOT_DETERMINED', verdict: 'TOKEN ACCESS INDETERMINATE' }));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let checkoutSha;
  try {
    checkoutSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH,
        GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } }).trim();
  } catch { /* No raw subprocess error is emitted; the context gate fails closed. */ }
  process.exitCode = await runDiagnostic(process.env, { mode: process.argv[2], checkoutSha });
}
