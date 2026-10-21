// GitHub authenticates the approved workflow's reported execution. This policy
// trusts the designated administrators; it is not independent verification.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyReport, validateInventory } from './mandatory-security.mjs';

export class GitHubEvidenceDenied extends Error {}
const check = (ok, code) => { if (!ok) throw new GitHubEvidenceDenied(code); };
export const canonical = value => value && typeof value === 'object' ?
  (Array.isArray(value) ? value.map(canonical) :
    Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]))) : value;
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const objectDigest = value => sha256(JSON.stringify(canonical(value)));
const positive = n => Number.isSafeInteger(n) && n > 0;
export const approvedInventoryBytes = readFileSync(new URL('./approved-security-tests.json', import.meta.url));
export const approvedInventory = validateInventory(JSON.parse(approvedInventoryBytes));
export const inventoryDigest = sha256(approvedInventoryBytes);
export const maxArtifactBytes = 4 * 1024 * 1024;
const schemaPins = JSON.parse(readFileSync(new URL('./commission-schema-source.json', import.meta.url)));
const schemaPaths = [...schemaPins.migrationFiles, ...schemaPins.holdSources].map(p => p.path);

// Never check out or execute application code to inspect definitions.
export function gitSourceDigest(directory, sha, path) {
  check(typeof directory === 'string' && /^[a-f0-9]{40}$/.test(sha) &&
    (approvedInventory.sources.some(s => s.path === path) || path === 'tools/deployment/mandatory-security-tests.json' ||
      schemaPaths.includes(path)),
  'APPROVED_SOURCE_PATH_REQUIRED');
  try {
    const entry = execFileSync('git', ['-C', directory, 'ls-tree', '-z', sha, '--', path], { encoding: 'utf8', maxBuffer: 4096 });
    check(/^100(?:644|755) blob [a-f0-9]{40}\t/.test(entry) &&
      entry.slice(entry.indexOf('\t') + 1) === path + '\0', 'MANDATORY_SOURCE_NOT_REGULAR');
    return sha256(execFileSync('git', ['-C', directory, 'show', `${sha}:${path}`], { maxBuffer: 2 * 1024 * 1024 }));
  } catch (error) {
    if (error instanceof GitHubEvidenceDenied) throw error;
    throw new GitHubEvidenceDenied('MANDATORY_SOURCE_UNAVAILABLE');
  }
}

export async function verifyApprovedDefinitions(policy, readSourceDigest) {
  check(policy.authorization?.kind === 'github-evidence-v1' &&
    policy.authorization.inventorySha256 === inventoryDigest && typeof readSourceDigest === 'function',
  'APPROVED_SECURITY_INVENTORY_REQUIRED');
  for (const source of [...approvedInventory.sources,
    { path: 'tools/deployment/mandatory-security-tests.json', sha256: inventoryDigest }]) {
    check(await readSourceDigest(source.path) === source.sha256, 'MANDATORY_SOURCE_CHANGED');
  }
}

export function validateArtifact(metadata, runId, sha, name, repositoryId) {
  check(metadata && positive(metadata.id) && metadata.name === name && metadata.expired === false &&
    positive(metadata.size_in_bytes) && metadata.size_in_bytes <= maxArtifactBytes &&
    /^sha256:[a-f0-9]{64}$/.test(metadata.digest ?? '') &&
    metadata.workflow_run?.id === Number(runId) && metadata.workflow_run.head_sha === sha &&
    metadata.workflow_run.head_branch === 'main' && positive(repositoryId) &&
    metadata.workflow_run.repository_id === repositoryId && metadata.workflow_run.head_repository_id === repositoryId,
  'GITHUB_ARTIFACT_PROVENANCE_INVALID');
  return { id: String(metadata.id), name: metadata.name, digest: metadata.digest,
    runId: String(runId), sha, repositoryId };
}

// Download only by authenticated numeric ID. Candidate archive URLs are ignored.
// unzip streams one bounded file; it never extracts into the executor worktree.
export async function readGitHubArtifact(api, owner, descriptor, filename) {
  check(['source', 'executor'].includes(owner) && /^[1-9]\d*$/.test(descriptor.id) &&
    ['report.json', 'release-report.jsonl'].includes(filename), 'GITHUB_ARTIFACT_INPUT_INVALID');
  const gh = owner === 'source' ? api.gh : api.executor;
  check(typeof gh === 'function' && typeof api.artifact === 'function', 'GITHUB_ARTIFACT_RETRIEVAL_UNAVAILABLE');
  const metadata = await gh(`/actions/artifacts/${descriptor.id}`);
  const fresh = validateArtifact(metadata, descriptor.runId, descriptor.sha, descriptor.name, descriptor.repositoryId);
  check(JSON.stringify(fresh) === JSON.stringify(descriptor), 'GITHUB_ARTIFACT_SUBSTITUTED');
  const bytes = await api.artifact(owner, descriptor.id);
  check(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= maxArtifactBytes &&
    `sha256:${sha256(bytes)}` === descriptor.digest, 'GITHUB_ARTIFACT_DIGEST_MISMATCH');
  const dir = mkdtempSync(join(tmpdir(), 'aqua-evidence-'));
  try {
    const zip = join(dir, 'artifact.zip');
    writeFileSync(zip, bytes, { mode: 0o600, flag: 'wx' });
    const names = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8', maxBuffer: 4096, stdio: ['ignore', 'pipe', 'pipe'] });
    check(names === `${filename}\n`, 'GITHUB_ARTIFACT_CONTENTS_INVALID');
    return execFileSync('unzip', ['-p', zip, filename], { maxBuffer: 2 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    if (error instanceof GitHubEvidenceDenied) throw error;
    throw new GitHubEvidenceDenied('GITHUB_ARTIFACT_ARCHIVE_INVALID');
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

export async function verifyGitHubEvidence(api, qualified, policy, readSourceDigest, now = Date.now) {
  await verifyApprovedDefinitions(policy, readSourceDigest);
  const run = await api.gh(`/actions/runs/${qualified.ciRunId}`);
  const time = now(), completed = Date.parse(run.updated_at);
  check(Number.isFinite(time) && Number.isFinite(completed) && completed <= time + 30_000 &&
    completed >= time - policy.authorization.maxCiAgeSeconds * 1000, 'CI_EVIDENCE_STALE_OR_UNDATED');
  check(run.id === Number(qualified.ciRunId) && run.run_attempt === qualified.ciRunAttempt &&
    run.head_sha === qualified.sha && run.status === 'completed' && run.conclusion === 'success' &&
    run.event === 'push' && run.head_branch === 'main' && run.path === '.github/workflows/ci.yml' &&
    run.repository?.full_name === qualified.repository && run.head_repository?.full_name === qualified.repository,
  'CI_EVIDENCE_CONTEXT_MISMATCH');
  const repository = await api.gh('');
  const page = await api.gh(`/actions/runs/${qualified.ciRunId}/artifacts?per_page=100`);
  check(Array.isArray(page.artifacts) && page.total_count === page.artifacts.length &&
    page.artifacts.length <= 100, 'CI_ARTIFACT_INVENTORY_INCOMPLETE');
  const name = `mandatory-security-${qualified.sha}-${qualified.ciRunId}-${qualified.ciRunAttempt}`;
  const selected = page.artifacts.filter(a => a.name === name);
  check(selected.length === 1, 'EXACT_SECURITY_REPORT_REQUIRED');
  const artifact = validateArtifact(selected[0], qualified.ciRunId, qualified.sha, name, repository.id);
  const bytes = await readGitHubArtifact(api, 'source', artifact, 'report.json');
  let result;
  try {
    result = classifyReport(JSON.parse(bytes.toString('utf8')), approvedInventory,
      { kind: 'ci', repository: qualified.repository, sha: qualified.sha,
        runId: qualified.ciRunId, runAttempt: qualified.ciRunAttempt }, approvedInventoryBytes);
  } catch { throw new GitHubEvidenceDenied('MANDATORY_EXECUTION_NOT_QUALIFIED'); }
  const current = await api.gh(`/actions/runs/${qualified.ciRunId}`);
  check(current.id === run.id && current.run_attempt === run.run_attempt && current.updated_at === run.updated_at &&
    current.head_sha === run.head_sha && current.status === 'completed' && current.conclusion === 'success',
  'CI_EVIDENCE_CHANGED');
  return { version: 1, mode: 'github-evidence-v1', repository: qualified.repository, sha: qualified.sha,
    ciRunId: qualified.ciRunId, ciRunAttempt: qualified.ciRunAttempt, completedAt: run.updated_at,
    policySha256: qualified.policySha256, inventorySha256: inventoryDigest,
    artifact, reportSha256: sha256(bytes), testsVerified: result.cases };
}

const receiptBindings = ['repository', 'sha', 'ciRunId', 'ciRunAttempt', 'executorRepository', 'executorSha',
  'releaseRunId', 'releaseRunAttempt', 'policySha256', 'environment', 'profile',
  'renderServiceId', 'vercelProjectId', 'vercelTeamId', 'qualificationOnly'];
export function createGitHubAdmission(qualified, policy, evidence, now = Date.now) {
  const time = now();
  check(Number.isFinite(time) && typeof qualified.qualificationOnly === 'boolean' && evidence.mode === 'github-evidence-v1' &&
    evidence.inventorySha256 === policy.authorization.inventorySha256 &&
    ['repository', 'sha', 'ciRunId', 'ciRunAttempt', 'policySha256'].every(k => evidence[k] === qualified[k]),
  'ADMISSION_EVIDENCE_MISMATCH');
  const evidenceSha256 = objectDigest(evidence);
  const binding = Object.fromEntries(receiptBindings.map(k => [k, qualified[k]]));
  check(receiptBindings.every(k => binding[k] !== undefined), 'ADMISSION_BINDING_INCOMPLETE');
  const expiry = Math.min(time + policy.authorization.maxAdmissionAgeSeconds * 1000,
    Date.parse(evidence.completedAt) + policy.authorization.maxCiAgeSeconds * 1000);
  check(expiry > time, 'ADMISSION_EVIDENCE_EXPIRED');
  return { contract: 'aqua.github-evidence-admission', version: 2, mode: 'github-evidence-v1', ...binding,
    evidenceSha256, inventorySha256: inventoryDigest,
    authorizationId: objectDigest({ ...binding, evidenceSha256 }),
    issuedAt: new Date(time).toISOString(), expiresAt: new Date(expiry).toISOString() };
}

export function validateGitHubAdmission(receipt, qualified, policy, evidence, now = Date.now) {
  check(receipt && typeof receipt === 'object' && !Array.isArray(receipt), 'ADMISSION_RECEIPT_REQUIRED');
  const issued = Date.parse(receipt.issuedAt), expiry = Date.parse(receipt.expiresAt), time = now();
  check(Number.isFinite(time) && Number.isFinite(issued) && Number.isFinite(expiry) &&
    issued <= time + 30_000 && expiry > time && issued >= time - policy.authorization.maxAdmissionAgeSeconds * 1000,
  'ADMISSION_RECEIPT_EXPIRED_OR_UNDATED');
  const expected = createGitHubAdmission(qualified, policy, evidence, () => issued);
  check(objectDigest(expected) === objectDigest(receipt), 'ADMISSION_RECEIPT_MISMATCH');
  return receipt;
}
