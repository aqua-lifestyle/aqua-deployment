// Pure classification primitives. A caller must obtain policy, public key and
// expected context from separate trusted custody; candidate-supplied copies are
// NOT independent authority. This module alone cannot grant credential access.
import { createHash, createPublicKey, verify } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

const check = (ok, reason) => { if (!ok) throw Error(reason); };
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const pathOK = path => typeof path === 'string' && !isAbsolute(path) &&
  !/[\\\x00-\x1f\x7f:]/.test(path) && path.split('/').every(p => p && p !== '.' && p !== '..');
const hashOK = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const caseKey = row => JSON.stringify([row.file, row.name]);

export function validateInventory(policy) {
  check(policy?.version === 1 && Array.isArray(policy.tests) && policy.tests.length > 0 &&
    policy.tests.length <= 10000 && Array.isArray(policy.sources) && policy.sources.length > 0,
  'MANDATORY_INVENTORY_INVALID');
  check(new Set(policy.tests.map(t => t.id)).size === policy.tests.length &&
    new Set(policy.tests.map(caseKey)).size === policy.tests.length &&
    new Set(policy.sources.map(s => s.path)).size === policy.sources.length,
  'MANDATORY_INVENTORY_DUPLICATED');
  check(policy.sources.every(s => pathOK(s.path) && hashOK(s.sha256)) &&
    policy.tests.every(t => /^AQUA-SEC-\d{4}$/.test(t.id) && pathOK(t.file) &&
      typeof t.name === 'string' && t.name.length > 0 && t.name.length <= 1000 &&
      policy.sources.some(s => s.path === t.file)), 'MANDATORY_INVENTORY_INVALID');
  return policy;
}

// Compare against the separately retained approved policy, before candidate tests
// execute. Exact bytes protect assertions as well as names. Never auto-refresh the
// policy from candidate discovery or accept an approval flag supplied by a PR.
export function verifySourceFiles(root, policy) {
  validateInventory(policy);
  const realRoot = realpathSync(root);
  for (const source of policy.sources) {
    let current = realRoot;
    for (const segment of source.path.split('/')) {
      current = join(current, segment);
      check(!lstatSync(current).isSymbolicLink(), 'MANDATORY_SOURCE_SYMLINK');
    }
    check(lstatSync(current).isFile() && digest(readFileSync(current)) === source.sha256,
      'MANDATORY_SOURCE_CHANGED');
  }
}

export function validateContext(context) {
  check(context?.repository === 'aqua-lifestyle/aqua-lifestyle' &&
    /^[a-f0-9]{40}$/.test(context.sha ?? ''), 'SECURITY_CONTEXT_INVALID');
  check(context.kind === 'ci' ?
    typeof context.runId === 'string' && /^[1-9]\d*$/.test(context.runId) &&
      Number.isSafeInteger(context.runAttempt) && context.runAttempt > 0 :
    context.kind === 'local' && context.runId === null && context.runAttempt === null,
  'SECURITY_CONTEXT_INVALID');
}
function equalContext(actual, expected) {
  validateContext(actual); validateContext(expected);
  check(['kind', 'repository', 'sha', 'runId', 'runAttempt'].every(k => actual[k] === expected[k]),
    'SECURITY_CONTEXT_MISMATCH');
}

export function classifyReport(report, policy, expectedContext, policyBytes) {
  validateInventory(policy); equalContext(report?.context, expectedContext);
  check(report?.version === 1 && report.inventorySha256 === digest(policyBytes), 'SECURITY_POLICY_MISMATCH');
  check(report.exitCode === 0 && Array.isArray(report.results) &&
    report.results.length === policy.tests.length, 'MANDATORY_EXECUTION_COUNT_MISMATCH');
  const expected = new Map(policy.tests.map(t => [caseKey(t), t.id]));
  const seen = new Set();
  for (const row of report.results) {
    const key = caseKey(row);
    check(expected.has(key) && !seen.has(key) && row.id === expected.get(key), 'MANDATORY_IDENTITY_MISMATCH');
    check(row.outcome === 'passed' && row.executions === 1, 'MANDATORY_TEST_NOT_PASSED');
    seen.add(key);
  }
  const c = report.summary;
  check(c && c.tests === policy.tests.length && c.passed === policy.tests.length &&
    ['failed', 'cancelled', 'skipped', 'todo', 'suites'].every(k => c[k] === 0), 'MANDATORY_SUMMARY_NOT_PASSED');
  return Object.freeze({ verdict: 'PASS', cases: seen.size, context: expectedContext,
    inventorySha256: report.inventorySha256, independentEnforcement: 'UNVERIFIED' });
}

// Only a separately trusted executor may issue this signature, after executing
// protected tests in an isolated unprivileged worker and authenticating evidence.
// Signing candidate-uploaded JSON is NOT that executor. This is a consumer
// primitive with disposable-key tests, not a provisioned signer or credential gate.
export function verifyAttestedReport(envelope, publicKey, reportBytes, policyBytes, expectedContext) {
  check(expectedContext?.kind === 'ci', 'CI_SECURITY_CONTEXT_REQUIRED');
  const key = createPublicKey(publicKey);
  check(key.asymmetricKeyType === 'ed25519' && typeof envelope?.payload === 'string' &&
    typeof envelope.signature === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(envelope.signature) &&
    verify(null, Buffer.from(envelope.payload), key, Buffer.from(envelope.signature, 'base64')),
  'SECURITY_ATTESTATION_UNTRUSTED');
  const claim = JSON.parse(envelope.payload);
  equalContext(claim.context, expectedContext);
  check(claim.version === 1 && claim.verdict === 'PASS' &&
    claim.inventorySha256 === digest(policyBytes) && claim.reportSha256 === digest(reportBytes),
  'SECURITY_ATTESTATION_MISMATCH');
  return classifyReport(JSON.parse(reportBytes), JSON.parse(policyBytes), expectedContext, policyBytes);
}

// Input is a trusted reporter's stream, not evidence authenticity. We retain every
// terminal record; duplicate names, nested cases and incomplete summaries fail.
export function reportFromEvents(events, root, policy, context, policyBytes, exitCode) {
  const ids = new Map(policy.tests.map(t => [caseKey(t), t.id]));
  const results = [], summaries = [];
  for (const { type, data } of events) {
    if (type === 'test:summary' && !data.file) summaries.push(data);
    if (type !== 'test:pass' && type !== 'test:fail') continue;
    const file = relative(resolve(root), resolve(data.file ?? '')).split('\\').join('/');
    check(pathOK(file) && data.nesting === 0 && data.details?.type === 'test', 'SECURITY_RESULT_SHAPE_INVALID');
    const row = { file, name: data.name };
    results.push({ ...row, id: ids.get(caseKey(row)) ?? null, executions: data.skip || data.todo ? 0 : 1,
      outcome: data.skip ? 'skipped' : data.todo ? 'todo' : type === 'test:pass' ? 'passed' : 'failed' });
  }
  check(summaries.length === 1 && summaries[0].success === true, 'SECURITY_SUMMARY_MISSING_OR_FAILED');
  return { version: 1, context, inventorySha256: digest(policyBytes), exitCode,
    results, summary: summaries[0].counts };
}
