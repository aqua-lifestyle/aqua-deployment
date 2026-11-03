// Fetch only Git objects from the fixed private application repository. Never
// checkout, install, build, import or execute application files on this runner.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { targets, requireThat, validateDispatchInputs } from './release-control.mjs';
import { memberPolicy } from './member-release.mjs';

class SourceFetchFailure extends Error {}
const safeFailureCodes = new Set(['EXECUTOR_INPUT_INVALID', 'INERT_SOURCE_DIRECTORY_REQUIRED',
  'GITHUB_EVIDENCE_READ_CREDENTIAL_REQUIRED', 'SOURCE_FETCH_EVENT_UNREADABLE',
  'SOURCE_FETCH_DIRECTORY_UNAVAILABLE', 'SOURCE_FETCH_INIT_FAILED', 'SOURCE_FETCH_REMOTE_FAILED',
  'SOURCE_FETCH_IDENTITY_UNREADABLE', 'FETCHED_SOURCE_MISMATCH', 'FETCHED_RECEIVER_MISMATCH']);
const attempt = (code, action) => {
  try { return action(); }
  catch { throw new SourceFetchFailure(code); }
};

export function fetchSource(env, execute = execFileSync) {
  const event = attempt('SOURCE_FETCH_EVENT_UNREADABLE', () => JSON.parse(readFileSync(env.GITHUB_EVENT_PATH)));
  const inputs = validateDispatchInputs(event?.inputs);
  requireThat(env.SOURCE_DIR && env.SOURCE_DIR !== env.GITHUB_WORKSPACE, 'INERT_SOURCE_DIRECTORY_REQUIRED');
  const token = env.AQGREEN_EVIDENCE_READ_TOKEN;
  requireThat(typeof token === 'string' && token.length > 0 && !/[\s\0]/.test(token),
    'GITHUB_EVIDENCE_READ_CREDENTIAL_REQUIRED');
  attempt('SOURCE_FETCH_DIRECTORY_UNAVAILABLE', () => mkdirSync(env.SOURCE_DIR, { recursive: true }));
  const gitEnv = { PATH: env.PATH ?? process.env.PATH, HOME: env.RUNNER_TEMP ?? env.SOURCE_DIR,
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' };
  const sourceUrl = `https://github.com/${targets.repository}.git`;
  const git = (args, code, authEnv = {}) => attempt(code, () => execute('git',
    ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: env.SOURCE_DIR, env: { ...gitEnv, ...authEnv },
      encoding: 'utf8', timeout: 120000, stdio: ['ignore','pipe','pipe'] }));
  // Only fetch's process environment receives the header. No token in argv,
  // remote URLs, persistent config, init/rev-parse or provider-bearing steps.
  const fetch = sha => git(['-c', 'credential.helper=', '-c', 'http.followRedirects=false',
    'fetch', '--quiet', '--no-tags', '--depth=1', sourceUrl, sha], 'SOURCE_FETCH_REMOTE_FAILED', {
    GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: `http.${sourceUrl}.extraHeader`,
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}` });
  const fetchedSha = () => git(['rev-parse', 'FETCH_HEAD'], 'SOURCE_FETCH_IDENTITY_UNREADABLE').trim();
  git(['init', '--quiet'], 'SOURCE_FETCH_INIT_FAILED');
  fetch(inputs.sha);
  requireThat(fetchedSha() === inputs.sha, 'FETCHED_SOURCE_MISMATCH');
  if (inputs.releaseMode === memberPolicy.mode) {
    fetch(memberPolicy.receiverSha);
    requireThat(fetchedSha() === memberPolicy.receiverSha, 'FETCHED_RECEIVER_MISMATCH');
  }
}

export function runSourceFetch(env, execute = execFileSync, emit = message => console.error(message)) {
  try { fetchSource(env, execute); return 0; }
  catch (error) {
    const code = safeFailureCodes.has(error?.message) ? error.message : 'SOURCE_FETCH_UNEXPECTED_FAILURE';
    // Never log subprocess errors, stdout/stderr, credentials or HTTP bodies.
    emit(`::error::${code}. Exact source fetch failed; no application code was executed.`);
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runSourceFetch(process.env);
}
