// Fetch only Git objects from the fixed public application repository. Never
// checkout, install, build, import or execute application files on this runner.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { targets, requireThat } from './release-control.mjs';

export function fetchSource(env, execute = execFileSync) {
  const inputs = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH)).inputs;
  requireThat(inputs && Object.keys(inputs).sort().join(',') === 'ci_run_attempt,ci_run_id,sha' &&
    /^[a-f0-9]{40}$/.test(inputs.sha), 'EXECUTOR_INPUT_INVALID');
  requireThat(env.SOURCE_DIR && env.SOURCE_DIR !== env.GITHUB_WORKSPACE, 'INERT_SOURCE_DIRECTORY_REQUIRED');
  mkdirSync(env.SOURCE_DIR, { recursive: true });
  const gitEnv = { PATH: env.PATH ?? process.env.PATH, HOME: env.RUNNER_TEMP ?? env.SOURCE_DIR,
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' };
  const git = args => execute('git', ['-c', 'core.hooksPath=/dev/null', ...args],
    { cwd: env.SOURCE_DIR, env: gitEnv, encoding: 'utf8', timeout: 120000, stdio: ['ignore','pipe','pipe'] });
  git(['init', '--quiet']);
  git(['fetch', '--quiet', '--no-tags', '--depth=1', `https://github.com/${targets.repository}.git`, inputs.sha]);
  requireThat(git(['rev-parse', 'FETCH_HEAD']).trim() === inputs.sha, 'FETCHED_SOURCE_MISMATCH');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { fetchSource(process.env); }
  catch { console.error('::error::Exact source fetch failed; no application code was executed.'); process.exitCode = 1; }
}
