// Only non-secret Render settings may cross this boundary. Never enumerate env
// values or request a Bird/Yoco key, webhook secret, connection string or key file.
export const runtimeSettings = Object.freeze({
  ASPNETCORE_ENVIRONMENT: ['Production'], App__Recovery__Enabled: ['false'],
  Bird__Enabled: ['true'], Yoco__Mode: ['test', 'live'],
  App__WeeklyCommissions__Enabled: ['false'], App__EntryMonthlyObligations__Enabled: ['false'],
  App__FinancialOperations__Enabled: ['false'], App__BackgroundJobs__Enabled: ['false'],
  AQGreenV2Demo__Enabled: ['false'], AQGreenV2Pilot__Enabled: ['false'],
  App__AQGreenV2__Commissioning__Enabled: ['false'], SEED_DEMO_DATA: ['false']
});
export const readinessUrl = 'https://aqualifestyle-api.onrender.com/api/deployment-readiness';
const deny = code => { throw Error(code); };

export function validateReadiness(response, sha) {
  const body = response?.body;
  const keys = ['contract', 'version', 'status', 'buildId', 'birdConfiguration',
    'yocoConfiguration', 'profile', 'restrictedOperations'];
  if (response?.status !== 200 || !body || Object.keys(body).sort().join() !== keys.sort().join() ||
    body.contract !== 'aqua.production-readiness' || body.version !== 1 || body.status !== 'Ready' ||
    body.buildId !== sha || body.birdConfiguration !== 'StartupValidated' ||
    body.yocoConfiguration !== 'StartupValidated' || body.profile !== 'normal-integrated' ||
    body.restrictedOperations !== 'ConfigurationHeld') deny('PROTECTED_RUNTIME_READINESS_FAILED');
}

export async function protectedReadiness(env, sha, fetcher = fetch) {
  // No token fallback, persistent API credential, token output or redirect.
  try {
    if (!/^[a-f0-9]{40}$/.test(sha ?? '') || env.GITHUB_REPOSITORY !== 'aqua-lifestyle/aqua-deployment' ||
      env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN || !env.ACTIONS_ID_TOKEN_REQUEST_URL)
      deny('READINESS_OIDC_CONTEXT_UNAVAILABLE');
    const url = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.actions.githubusercontent.com') ||
      url.username || url.password || url.hash || (url.port && url.port !== '443'))
      deny('READINESS_OIDC_CONTEXT_UNAVAILABLE');
    url.searchParams.set('audience', readinessUrl);
    const issued = await fetcher(url.href, { redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` } });
    if (!issued.ok) deny('READINESS_OIDC_UNAVAILABLE');
    const token = await issued.json();
    if (typeof token.value !== 'string' || !token.value || token.value.length > 16384)
      deny('READINESS_OIDC_UNAVAILABLE');
    const response = await fetcher(`${readinessUrl}?expectedRevision=${sha}`, {
      redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token.value}`, 'Cache-Control': 'no-store' } });
    if (response.status !== 200) deny('PROTECTED_RUNTIME_READINESS_FAILED');
    const result = { status: response.status, body: await response.json() };
    validateReadiness(result, sha);
    return result;
  } catch {
    // Fetch/parse exceptions can contain signed URLs or tokens; never propagate.
    deny('PROTECTED_RUNTIME_READINESS_FAILED');
  }
}
