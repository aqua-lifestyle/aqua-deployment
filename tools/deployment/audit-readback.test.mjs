import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { zipFixture } from './fixtures/provider.mjs';
import { maxAuditBytes, readAuditFile, readGitHubArtifact, sha256 } from './github-evidence.mjs';

function artifact(bytes, filename = 'release-report.jsonl') {
  const archive = zipFixture(filename, bytes);
  const metadata = { id: 789, name: 'production-release-audit-456-1', expired: false,
    size_in_bytes: archive.length, digest: `sha256:${sha256(archive)}`,
    workflow_run: { id: 456, head_sha: 'a'.repeat(40), head_branch: 'main', repository_id: 987, head_repository_id: 987 } };
  const descriptor = { id: '789', name: metadata.name, digest: metadata.digest, runId: '456', sha: 'a'.repeat(40), repositoryId: 987 };
  return { metadata, archive, descriptor, api: { executor: async () => structuredClone(metadata), artifact: async () => archive } };
}

test('authenticated audits above the old 2MiB extraction and 1MiB file limits are read completely without truncation', async () => {
  const bytes = Buffer.from(JSON.stringify({ phase: 'synthetic-audit', evidence: 'x'.repeat(3_140_509) }) + '\n');
  const f = artifact(bytes);
  const observed = await readGitHubArtifact(f.api, 'executor', f.descriptor, 'release-report.jsonl');
  assert.deepEqual(observed, bytes); assert.equal(sha256(observed), sha256(bytes));
  const directory = mkdtempSync(join(tmpdir(), 'aqua-audit-test-'));
  try {
    const file = join(directory, 'release-report.jsonl'); writeFileSync(file, observed);
    assert.deepEqual(readAuditFile(file), [JSON.parse(bytes)]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('audit expansion stays bounded and mandatory execution reports retain the old smaller bound', async () => {
  for (const [filename, size] of [['release-report.jsonl', maxAuditBytes + 1], ['report.json', 2 * 1024 * 1024 + 1]]) {
    const f = artifact(Buffer.alloc(size, 32), filename);
    await assert.rejects(readGitHubArtifact(f.api, 'executor', f.descriptor, filename), /GITHUB_ARTIFACT_ARCHIVE_INVALID/);
  }
  const directory = mkdtempSync(join(tmpdir(), 'aqua-audit-test-'));
  try {
    const file = join(directory, 'release-report.jsonl'); writeFileSync(file, Buffer.alloc(maxAuditBytes + 1, 32));
    assert.throws(() => readAuditFile(file), /AUDIT_RECEIPT_UNVERIFIABLE/);
    writeFileSync(file, 'malformed\n'); assert.throws(() => readAuditFile(file), /AUDIT_RECEIPT_UNVERIFIABLE/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('larger audits retain archive digest, provenance and exact-content checks', async () => {
  const f = artifact(Buffer.alloc(3 * 1024 * 1024, 32));
  await assert.rejects(readGitHubArtifact({ ...f.api, artifact: async () => Buffer.from('substitute') }, 'executor', f.descriptor,
    'release-report.jsonl'), /GITHUB_ARTIFACT_DIGEST_MISMATCH/);
  f.metadata.expired = true;
  await assert.rejects(readGitHubArtifact(f.api, 'executor', f.descriptor, 'release-report.jsonl'), /GITHUB_ARTIFACT_PROVENANCE_INVALID/);
  const archive = zipFixture('release-report.jsonl', '{}\n', { 'extra.json': '{}' });
  f.metadata.expired = false; f.metadata.digest = `sha256:${sha256(archive)}`; f.descriptor.digest = f.metadata.digest;
  await assert.rejects(readGitHubArtifact({ ...f.api, artifact: async () => archive }, 'executor', f.descriptor,
    'release-report.jsonl'), /GITHUB_ARTIFACT_CONTENTS_INVALID/);
});
