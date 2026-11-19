import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clients, ReleaseFailure, targets } from './release-control.mjs';

const token = 'github-private-artifact-token-canary';
const zipUrl = `https://api.github.com/repos/${targets.executor.repository}/actions/artifacts/14401816374/zip`;
const storageUrl = 'https://productionresultssa18.blob.core.windows.net/container/archive.zip?sig=private-signed-url-canary';

function api(fetcher) {
  return clients({ GH_TOKEN: token }, fetcher);
}

async function rejectedArtifact(client) {
  let error;
  try { await client.artifact('executor', '14401816374'); } catch (caught) { error = caught; }
  assert.ok(error instanceof ReleaseFailure);
  assert.equal(error.message, 'GITHUB_ARTIFACT_DOWNLOAD_UNAVAILABLE');
  return error;
}

test('GitHub ZIP HTTP failures report artifact, stage and status without response content', async () => {
  let calls = 0;
  const client = api(async (url, options) => {
    calls++;
    assert.equal(url, zipUrl);
    assert.equal(options.method ?? 'GET', 'GET');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    return new Response('confidential-response-body', { status: 403 });
  });
  const error = await rejectedArtifact(client);
  assert.deepEqual(error.artifactDownloadDiagnostic,
    { artifactId: '14401816374', stage: 'github_zip', category: 'HTTP_STATUS', httpStatus: 403 });
  assert.equal(calls, 1); // The helper does not retry.
  assert.ok(!JSON.stringify(error.artifactDownloadDiagnostic).includes(token));
  assert.ok(!JSON.stringify(error.artifactDownloadDiagnostic).includes('confidential-response-body'));
});

test('redirected storage HTTP failures report the storage stage and never forward GitHub credentials', async () => {
  let storageCalls = 0;
  const client = api(async (url, options) => {
    assert.equal(options.method ?? 'GET', 'GET');
    if (url === zipUrl) {
      assert.equal(options.redirect, 'manual');
      assert.equal(options.headers.Authorization, `Bearer ${token}`);
      return new Response(null, { status: 302, headers: { location: storageUrl } });
    }
    storageCalls++;
    assert.equal(url, storageUrl);
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers?.Authorization, undefined);
    return new Response('confidential-storage-body', { status: 503 });
  });
  const error = await rejectedArtifact(client);
  assert.deepEqual(error.artifactDownloadDiagnostic,
    { artifactId: '14401816374', stage: 'redirected_storage', category: 'HTTP_STATUS', httpStatus: 503 });
  assert.equal(storageCalls, 1);
  assert.ok(!JSON.stringify(error.artifactDownloadDiagnostic).includes('private-signed-url-canary'));
  assert.ok(!JSON.stringify(error.artifactDownloadDiagnostic).includes(token));
});

test('storage transport failures expose only a safe category, never the signed URL or transport message', async () => {
  const client = api(async (url, options) => {
    if (url === zipUrl) return new Response(null, { status: 302, headers: { location: storageUrl } });
    assert.equal(url, storageUrl);
    assert.equal(options.headers?.Authorization, undefined);
    throw new TypeError(`fetch failed for ${storageUrl} with ${token}`);
  });
  const error = await rejectedArtifact(client);
  assert.deepEqual(error.artifactDownloadDiagnostic,
    { artifactId: '14401816374', stage: 'redirected_storage', category: 'FETCH_TRANSPORT_ERROR' });
  assert.ok(!JSON.stringify(error).includes('private-signed-url-canary'));
  assert.ok(!JSON.stringify(error).includes(token));
});
