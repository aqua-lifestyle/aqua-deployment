import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { Worker } from 'node:worker_threads';
import { fetchSource, runSourceFetch } from './fetch-source.mjs';
import { targets, main, qualify } from './release-control.mjs';
import { memberPolicy } from './member-release.mjs';
import { source, previous, run, jobs } from './fixtures/provider.mjs';

const token = 'source-read-canary';
const authorization = `Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;
const sourceUrl = `https://github.com/${targets.repository}.git`;
function fixture(inputs = { ci_run_id: '123', ci_run_attempt: '1', sha: source }) {
  const dir = mkdtempSync(join(tmpdir(), 'aqua-private-fetch-'));
  const path = join(dir, 'event.json'); writeFileSync(path, JSON.stringify({ inputs }));
  const env = { GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_EVENT_PATH: path, SOURCE_DIR: join(dir, 'objects'), RUNNER_TEMP: dir,
    GITHUB_WORKSPACE: join(dir, 'executor'), AQGREEN_EVIDENCE_READ_TOKEN: token };
  const calls = [], reports = [];
  const execute = (command, args, options) => {
    calls.push({ command, args, options }); return args.includes('rev-parse') ? inputs.sha + '\n' : '';
  };
  const check = (executor = execute) => runSourceFetch(env, executor, line => reports.push(line));
  return { dir, path, env, calls, reports, execute, check, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('only fixed-origin SHA fetch receives ephemeral read authentication; inherited secrets/config and trace are stripped', () => {
  const f = fixture();
  try {
    Object.assign(f.env, { RENDER_API_KEY: 'render-canary', VERCEL_TOKEN: 'vercel-canary', GH_TOKEN: 'job-canary',
      GITHUB_TOKEN: 'other-job-canary', GIT_CONFIG_COUNT: '9', GIT_CONFIG_KEY_0: 'unsafe',
      GIT_CONFIG_VALUE_0: 'inherited-config-canary', GIT_TRACE: '1', GIT_TRACE_CURL: '1',
      GIT_ASKPASS: '/untrusted/askpass', NODE_OPTIONS: '--require=/untrusted/code' });
    assert.equal(f.check(), 0); assert.deepEqual(f.reports, []);
    assert.equal(f.calls.length, 3);
    for (const { command, args, options } of f.calls) {
      assert.equal(command, 'git'); assert.equal(options.cwd, f.env.SOURCE_DIR);
      assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe']);
      assert.deepEqual(args.slice(0, 2), ['-c', 'core.hooksPath=/dev/null']);
      assert.equal(options.env.GIT_CONFIG_GLOBAL, '/dev/null'); assert.equal(options.env.GIT_CONFIG_NOSYSTEM, '1');
      assert.equal(options.env.GIT_TERMINAL_PROMPT, '0');
      for (const key of ['AQGREEN_EVIDENCE_READ_TOKEN', 'RENDER_API_KEY', 'VERCEL_TOKEN', 'GH_TOKEN',
        'GITHUB_TOKEN', 'GIT_TRACE', 'GIT_TRACE_CURL', 'GIT_ASKPASS', 'NODE_OPTIONS'])
        assert.equal(Object.hasOwn(options.env, key), false, key);
      assert.doesNotMatch(JSON.stringify(args), /canary|Authorization|checkout|submodule|npm|npx/);
    }
    const fetch = f.calls[1];
    assert.deepEqual(fetch.args.slice(2), ['-c', 'credential.helper=', '-c', 'http.followRedirects=false',
      'fetch', '--quiet', '--no-tags', '--depth=1', sourceUrl, source]);
    assert.equal(fetch.options.env.GIT_CONFIG_COUNT, '1');
    assert.equal(fetch.options.env.GIT_CONFIG_KEY_0, `http.${sourceUrl}.extraHeader`);
    assert.equal(fetch.options.env.GIT_CONFIG_VALUE_0, authorization);
    assert.ok(!JSON.stringify(f.calls).includes('inherited-config-canary'));
    for (const call of [f.calls[0], f.calls[2]]) assert.equal(call.options.env.GIT_CONFIG_COUNT, undefined);
    assert.deepEqual(readdirSync(f.env.SOURCE_DIR), []);
  } finally { f.cleanup(); }
});

test('real Git URL matching scopes the header to the exact HTTPS repository and its smart-fetch endpoints', () => {
  const f = fixture();
  try {
    fetchSource(f.env, f.execute); const env = f.calls[1].options.env;
    for (const url of [sourceUrl, sourceUrl + '/info/refs', sourceUrl + '/git-upload-pack']) {
      assert.equal(execFileSync('git', ['config', '--get-urlmatch', 'http.extraHeader', url],
        { env, encoding: 'utf8' }).trim(), authorization);
    }
    for (const url of ['https://github.com/other/repo.git', 'https://attacker.invalid/aqua-lifestyle/aqua-lifestyle.git',
      'http://github.com/aqua-lifestyle/aqua-lifestyle.git', sourceUrl + '-other/info/refs'])
      assert.throws(() => execFileSync('git', ['config', '--get-urlmatch', 'http.extraHeader', url],
        { env, stdio: 'pipe' }), error => error.status === 1);
  } finally { f.cleanup(); }
});

test('missing or malformed read credential denies before Git or directory creation without fallback', () => {
  for (const value of [undefined, '', ' ', 'token\nheader', 'token\0suffix']) {
    const f = fixture();
    try {
      Object.assign(f.env, { AQGREEN_EVIDENCE_READ_TOKEN: value, GH_TOKEN: 'job-canary',
        GITHUB_TOKEN: 'other-job-canary', RENDER_API_KEY: 'render-canary', VERCEL_TOKEN: 'vercel-canary' });
      assert.equal(f.check(), 1); assert.equal(f.calls.length, 0);
      assert.equal(existsSync(f.env.SOURCE_DIR), false);
      assert.match(f.reports[0], /::error::GITHUB_EVIDENCE_READ_CREDENTIAL_REQUIRED\./);
      assert.doesNotMatch(f.reports[0], /canary|header|suffix/);
    } finally { f.cleanup(); }
  }
});

test('invalid dispatch, unreadable event and unsafe source directory retain safe distinct failures before Git', () => {
  for (const [change, code] of [
    [f => writeFileSync(f.path, JSON.stringify({ inputs: { sha: 'main' } })), 'EXECUTOR_INPUT_INVALID'],
    [f => writeFileSync(f.path, 'private-invalid-event-canary'), 'SOURCE_FETCH_EVENT_UNREADABLE'],
    [f => f.env.GITHUB_EVENT_PATH = join(f.dir, 'missing'), 'SOURCE_FETCH_EVENT_UNREADABLE'],
    [f => f.env.SOURCE_DIR = f.env.GITHUB_WORKSPACE, 'INERT_SOURCE_DIRECTORY_REQUIRED'],
    [f => { writeFileSync(join(f.dir, 'file'), 'private-directory-canary'); f.env.SOURCE_DIR = join(f.dir, 'file', 'objects'); },
      'SOURCE_FETCH_DIRECTORY_UNAVAILABLE']]) {
    const f = fixture();
    try {
      change(f); assert.equal(f.check(), 1); assert.equal(f.calls.length, 0);
      assert.match(f.reports[0], new RegExp(`::error::${code}\\.`));
      assert.doesNotMatch(f.reports[0], /canary|\/tmp/);
    } finally { f.cleanup(); }
  }
});

test('Git failures report only fixed stages, discard sensitive subprocess output and stop without retry', () => {
  for (const [stage, code, count] of [['init', 'SOURCE_FETCH_INIT_FAILED', 1],
    ['fetch', 'SOURCE_FETCH_REMOTE_FAILED', 2], ['rev-parse', 'SOURCE_FETCH_IDENTITY_UNREADABLE', 3]]) {
    const f = fixture();
    try {
      assert.equal(f.check((command, args, options) => {
        const result = f.execute(command, args, options);
        if (args.includes(stage)) throw Object.assign(Error(token + authorization),
          { stdout: 'private-response-canary', stderr: 'private-stderr-canary', status: 128 });
        return result;
      }), 1);
      assert.equal(f.calls.length, count);
      assert.deepEqual(f.reports, [`::error::${code}. Exact source fetch failed; no application code was executed.`]);
    } finally { f.cleanup(); }
  }
  const mismatch = fixture();
  try {
    assert.equal(mismatch.check((command, args, options) => {
      const result = mismatch.execute(command, args, options); return args.includes('rev-parse') ? previous : result;
    }), 1);
    assert.equal(mismatch.calls.length, 3); assert.match(mismatch.reports[0], /::error::FETCHED_SOURCE_MISMATCH\./);
  } finally { mismatch.cleanup(); }
});

test('the existing selected member path authenticates both exact fetches and never accepts a substituted receiver', () => {
  for (const wrongReceiver of [false, true]) {
    const f = fixture({ ci_run_id: '123', ci_run_attempt: '1', sha: memberPolicy.frontendSha, release_mode: memberPolicy.mode });
    let identities = 0;
    try {
      assert.equal(f.check((command, args, options) => {
        const result = f.execute(command, args, options);
        return args.includes('rev-parse') && ++identities === 2 ? (wrongReceiver ? previous : memberPolicy.receiverSha) : result;
      }), wrongReceiver ? 1 : 0);
      assert.equal(f.calls.length, 5);
      assert.deepEqual([f.calls[1], f.calls[3]].map(c => c.args.at(-1)), [memberPolicy.frontendSha, memberPolicy.receiverSha]);
      assert.ok([f.calls[1], f.calls[3]].every(c => c.options.env.GIT_CONFIG_VALUE_0 === authorization));
      if (wrongReceiver) assert.match(f.reports[0], /::error::FETCHED_RECEIVER_MISMATCH\./);
    } finally { f.cleanup(); }
  }
});

// A separate thread serves real smart-HTTP Git while the production function's
// synchronous child process runs. No external endpoint or real credential is used.
async function httpFixture(root, status) {
  const worker = new Worker(String.raw`
    const { parentPort, workerData: data } = require('node:worker_threads');
    const { createServer } = require('node:http');
    const { spawn } = require('node:child_process');
    const requests = [];
    const server = createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const authenticated = req.headers.authorization === data.authorization;
      requests.push({ method: req.method, path: url.pathname, authenticated });
      if (data.status || !authenticated) {
        res.writeHead(data.status || 401, { 'WWW-Authenticate': 'Basic realm="fixture"', Location: '/redirected' });
        return res.end('private-response-canary');
      }
      const backend = spawn('git', ['http-backend'], { env: { ...process.env,
        GIT_PROJECT_ROOT: data.root, GIT_HTTP_EXPORT_ALL: '1', PATH_INFO: url.pathname,
        REQUEST_METHOD: req.method, QUERY_STRING: url.search.slice(1), REMOTE_USER: 'fixture',
        CONTENT_TYPE: req.headers['content-type'] || '', CONTENT_LENGTH: req.headers['content-length'] || '' } });
      const chunks = []; backend.stdout.on('data', c => chunks.push(c));
      backend.stderr.resume(); req.pipe(backend.stdin);
      backend.on('close', () => {
        const bytes = Buffer.concat(chunks), split = bytes.indexOf('\r\n\r\n');
        if (split < 0) { res.writeHead(500); return res.end(); }
        const headers = {}; let status = 200;
        for (const line of bytes.subarray(0, split).toString().split('\r\n')) {
          const colon = line.indexOf(':'); const key = line.slice(0, colon), value = line.slice(colon + 1).trim();
          if (key.toLowerCase() === 'status') status = Number(value.split(' ')[0]); else headers[key] = value;
        }
        res.writeHead(status, headers); res.end(bytes.subarray(split + 4));
      });
    });
    server.listen(0, '127.0.0.1', () => parentPort.postMessage(server.address().port));
    parentPort.on('message', () => parentPort.postMessage(requests));
  `, { eval: true, workerData: { root, status, authorization: authorization.slice('Authorization: '.length) } });
  const [port] = await once(worker, 'message');
  return { worker, url: `http://127.0.0.1:${port}/application.git`, requests: async () => {
    const response = once(worker, 'message'); worker.postMessage('requests'); return (await response)[0];
  } };
}

test('real authenticated smart-HTTP fetch stores only exact inert Git objects and never persists authentication', async () => {
  const f = fixture(); let server;
  try {
    const seed = join(f.dir, 'seed'); mkdirSync(seed);
    const git = args => execFileSync('git', args, { cwd: seed, encoding: 'utf8', stdio: 'pipe' }).trim();
    git(['init', '-q']);
    writeFileSync(join(seed, 'application.mjs'), "throw Error('APPLICATION_MUST_NOT_EXECUTE');\n");
    writeFileSync(join(seed, 'package.json'), '{"scripts":{"install":"exit 99"}}');
    git(['add', '.']); git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'inert source']);
    const sha = git(['rev-parse', 'HEAD']);
    git(['clone', '--bare', '-q', seed, join(f.dir, 'application.git')]);
    writeFileSync(f.path, JSON.stringify({ inputs: { ci_run_id: '123', ci_run_attempt: '1', sha } }));
    server = await httpFixture(f.dir);
    assert.equal(f.check((command, args, options) => execFileSync(command,
      args.map(a => a === sourceUrl ? server.url : a), { ...options,
        env: { ...options.env, ...(options.env.GIT_CONFIG_KEY_0 ? { GIT_CONFIG_KEY_0: `http.${server.url}.extraHeader` } : {}) } })), 0);
    const requests = await server.requests();
    assert.ok(requests.length >= 2); assert.ok(requests.every(r => r.authenticated));
    assert.ok(requests.every(r => r.path === '/application.git/info/refs' || r.path === '/application.git/git-upload-pack'));
    assert.deepEqual(readdirSync(f.env.SOURCE_DIR), ['.git']);
    assert.equal(execFileSync('git', ['-C', f.env.SOURCE_DIR, 'rev-parse', 'FETCH_HEAD'], { encoding: 'utf8' }).trim(), sha);
    assert.match(execFileSync('git', ['-C', f.env.SOURCE_DIR, 'show', sha + ':application.mjs'],
      { encoding: 'utf8' }), /APPLICATION_MUST_NOT_EXECUTE/);
    const config = readFileSync(join(f.env.SOURCE_DIR, '.git/config'), 'utf8');
    assert.doesNotMatch(config, /Authorization|extraHeader|canary|remote/);
    assert.ok(!config.includes(authorization)); assert.deepEqual(f.reports, []);
  } finally { if (server) await server.worker.terminate(); f.cleanup(); }
});

test('real Git HTTP rejection and redirects fail closed with no credential fallback, retry or sensitive diagnostic', async () => {
  for (const status of [401, 403, 404, 503, 302]) {
    const f = fixture(); let server;
    try {
      server = await httpFixture(f.dir, status);
      assert.equal(f.check((command, args, options) => execFileSync(command,
        args.map(a => a === sourceUrl ? server.url : a), { ...options,
          env: { ...options.env, ...(options.env.GIT_CONFIG_KEY_0 ? { GIT_CONFIG_KEY_0: `http.${server.url}.extraHeader` } : {}) } })), 1);
      const requests = await server.requests();
      assert.deepEqual(requests, [{ method: 'GET', path: '/application.git/info/refs', authenticated: true }]);
      assert.deepEqual(f.reports, ['::error::SOURCE_FETCH_REMOTE_FAILED. Exact source fetch failed; no application code was executed.']);
    } finally { if (server) await server.worker.terminate(); f.cleanup(); }
  }
});

test('the authorized application/CI pair qualifies; the outdated SHA and wrong attempt still deny before candidate creation', async () => {
  const sha = '1b748dfdaf3b63fb9dcc42f781ab79d5c39ca503', id = 41601901625;
  const ci = { ...run(), id, head_sha: sha }, checks = jobs().map(j => ({ ...j, run_id: id }));
  const api = { gh: async path => {
    if (path === `/actions/runs/${id}`) return structuredClone(ci);
    if (path === `/actions/runs/${id}/attempts/1/jobs?per_page=100`) return { total_count: checks.length, jobs: checks };
    if (path === '/git/ref/heads/main') return { object: { sha } };
    const job = checks.find(j => j.check_run_url === `https://api.github.com/repos/${targets.repository}${path}`);
    if (job) return { id: Number(path.split('/').at(-1)), app: { id: 15368 }, head_sha: sha,
      name: job.name, status: 'completed', conclusion: 'success' };
    assert.fail('unexpected API route');
  } };
  const q = await qualify(api, id); assert.equal(q.sha, sha); assert.equal(q.ciRunId, String(id)); assert.equal(q.ciRunAttempt, 1);
  for (const inputs of [
    { ci_run_id: String(id), ci_run_attempt: '1', sha: 'a4755801ce89868d7791422f3c983363ab76bf30' },
    { ci_run_id: String(id), ci_run_attempt: '2', sha }]) {
    const f = fixture(inputs);
    try { await assert.rejects(main(f.env, { mode: 'candidate', api }), /CI_EVENT_PROVENANCE_MISMATCH/);
      assert.equal(existsSync(f.env.SOURCE_DIR), false);
    } finally { f.cleanup(); }
  }
});

test('all source-fetch workflow steps receive only the read token, while ordinary PR tests remain secret-free', () => {
  const yaml = readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  const steps = yaml.split(/\n      - /).filter(step => step.includes('node tools/deployment/fetch-source.mjs'));
  assert.equal(steps.length, 3);
  for (const step of steps) {
    assert.deepEqual([...step.matchAll(/secrets\.(\w+)/g)].map(m => m[1]), ['AQGREEN_EVIDENCE_READ_TOKEN']);
    assert.doesNotMatch(step, /RENDER_API_KEY|VERCEL_TOKEN|npm|npx|checkout/);
  }
  const tests = readFileSync(new URL('../../.github/workflows/test.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(tests, /secrets\.|production-release|fetch-source\.mjs/);
});
