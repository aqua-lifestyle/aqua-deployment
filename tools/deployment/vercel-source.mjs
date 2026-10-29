import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { objectDigest } from './github-evidence.mjs';

export class VercelSourceDenied extends Error {}
const check = (ok, code) => { if (!ok) throw new VercelSourceDenied(code); };
const hash = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const same = (a, b) => objectDigest(a) === objectDigest(b);

export function approvedPublicInputs(target) {
  return { NEXT_PUBLIC_ABP_API_URL: target.publicApiUrl,
    NEXT_PUBLIC_DEFAULT_TENANT_NAME: target.defaultTenantName };
}

export function validatePublicInputs(inputs, target) {
  check(inputs && !Array.isArray(inputs) && same(inputs, approvedPublicInputs(target)),
    'VERCEL_APPROVED_PUBLIC_INPUTS_REQUIRED');
}

// Called only with the archive already compared byte-for-byte to independently
// fetched qualified Git objects by verifyCandidate. A tar comment/self-hash alone
// is NOT source authentication. Never extract or execute candidate files locally.
export function prepareFrontend(archive, sha, target, inputs) {
  validatePublicInputs(inputs, target);
  check(Buffer.isBuffer(archive) && archive.length > 0 && archive.length <= 100 * 1024 * 1024 &&
    /^[a-f0-9]{40}$/.test(sha), 'VERCEL_QUALIFIED_ARCHIVE_REQUIRED');
  const root = target.rootDirectory;
  check(root === 'AqualLifeStyle/9.4.2/aqua-frontend', 'VERCEL_FRONTEND_ROOT_CHANGED');
  const command = (cmd, args, limit = 2 * 1024 * 1024) => {
    try { return execFileSync(cmd, args, { input: cmd === 'git' ? archive.subarray(0, 1024) : archive,
      maxBuffer: limit, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch { throw new VercelSourceDenied('VERCEL_ARCHIVE_UNVERIFIABLE'); }
  };
  check(command('git', ['get-tar-commit-id']).toString().trim() === sha, 'VERCEL_ARCHIVE_COMMIT_MISMATCH');
  const args = ['--file=-', '--quoting-style=literal'];
  const nameBytes = command('tar', ['--list', ...args, '--', root + '/']);
  check(Buffer.from(nameBytes.toString('utf8')).equals(nameBytes), 'VERCEL_ARCHIVE_PATH_INVALID');
  const names = nameBytes.toString().replace(/\n$/, '').split('\n');
  const types = command('tar', ['--list', '--verbose', '--numeric-owner', ...args, '--', root + '/'])
    .toString().replace(/\n$/, '').split('\n');
  check(names.length === types.length && names.length <= 4000 && new Set(names).size === names.length,
    'VERCEL_ARCHIVE_INVENTORY_INVALID');
  // Validate all selected paths/types before streaming any file content. GNU tar
  // supplies sizes/order; no hand-written tar parser or filesystem extraction.
  for (let i = 0; i < names.length; i++) {
    check(names[i].startsWith(root + '/') && !/[\x00-\x1f\x7f\\]/.test(names[i]) &&
      names[i].split('/').every(x => x !== '.' && x !== '..' && x === x.trim()) && ['-', 'd'].includes(types[i][0]) &&
      (types[i][0] === 'd' || !types[i].slice(1, 10).includes('x')),
    'VERCEL_ARCHIVE_REGULAR_FILES_REQUIRED');
    check(!names[i].split('/').some(x => ['.git', '.vercel', '.next', 'node_modules'].includes(x)) &&
      !/\/\.env(?:\.|$)/.test(names[i].replace(/\/\.env\.example$/, '/approved-env-example')),
    'VERCEL_SOURCE_ENVIRONMENT_FILE_FORBIDDEN');
  }
  const sizes = types.map(line => Number(line.match(/^[-d]\S*\s+\d+\/\d+\s+(\d+)\s/)?.[1]));
  check(sizes.every(size => Number.isSafeInteger(size) && size >= 0 && size <= 10 * 1024 * 1024) &&
    sizes.reduce((a, b) => a + b, 0) <= 50 * 1024 * 1024, 'VERCEL_ARCHIVE_TOO_LARGE');
  const contents = command('tar', ['--extract', '--to-stdout', '--file=-', '--', root + '/'], 50 * 1024 * 1024);
  const files = [];
  let total = 0, offset = 0;
  for (let i = 0; i < names.length; i++) {
    const file = names[i];
    if (types[i][0] === 'd') continue;
    const data = contents.subarray(offset, offset + sizes[i]);
    check(data.length === sizes[i], 'VERCEL_ARCHIVE_INVENTORY_INVALID');
    offset += sizes[i];
    total += data.length;
    check(total <= 50 * 1024 * 1024 && files.length < 2000, 'VERCEL_ARCHIVE_TOO_LARGE');
    files.push({ file, sha: hash(data, 'sha1'), sha256: hash(data), size: data.length, data });
  }
  check(offset === contents.length, 'VERCEL_ARCHIVE_INVENTORY_INVALID');
  files.sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
  const text = path => files.find(x => x.file === `${root}/${path}`)?.data.toString('utf8');
  let pkg, config;
  try { pkg = JSON.parse(text('package.json')); config = JSON.parse(text('vercel.json')); }
  catch { throw new VercelSourceDenied('VERCEL_SOURCE_BUILD_CONFIGURATION_UNVERIFIABLE'); }
  // These existing build commands receive the explicit deployment build.env.
  // Do not permit candidate config to replace the input or build authority.
  check(pkg.scripts?.build === 'next build' && !pkg.scripts.prebuild && !pkg.scripts.postbuild &&
    config.framework === 'nextjs' && config.buildCommand === 'npm run build' && config.installCommand === 'npm ci' &&
    !config.env && !config.build && !config.builds && !config.rootDirectory && !config.outputDirectory &&
    files.some(x => x.file === `${root}/package-lock.json`) &&
    files.filter(x => /\/next\.config\.[^/]+$/.test(x.file))
      .every(x => !/NEXT_PUBLIC_ABP_API_URL|NEXT_PUBLIC_DEFAULT_TENANT_NAME/.test(x.data.toString('utf8'))),
  'VERCEL_SOURCE_BUILD_PRECEDENCE_CONFLICT');
  const manifest = files.map(({ file, sha, sha256, size }) => ({ file, sha, sha256, size }));
  check(manifest.every(x => !manifest.some(y => x.sha === y.sha && x.sha256 !== y.sha256)),
    'VERCEL_UPLOAD_HASH_COLLISION');
  const proof = { contract: 'aqua.vercel-files', version: 1, sourceSha: sha,
    sourceArchiveSha256: hash(archive), rootDirectory: root, manifest,
    manifestSha256: objectDigest(manifest), publicBuildInputs: { ...inputs },
    publicBuildInputsSha256: objectDigest(inputs), precedence: 'deployment-build-env-over-project-v1' };
  return { files, proof };
}

export function validateFrontendProof(proof, sha, target) {
  check(proof?.contract === 'aqua.vercel-files' && proof.version === 1 && proof.sourceSha === sha &&
    /^[a-f0-9]{64}$/.test(proof.sourceArchiveSha256 ?? '') && proof.rootDirectory === target.rootDirectory &&
    proof.precedence === 'deployment-build-env-over-project-v1', 'VERCEL_SOURCE_PROOF_INVALID');
  validatePublicInputs(proof.publicBuildInputs, target);
  check(proof.publicBuildInputsSha256 === objectDigest(proof.publicBuildInputs) &&
    Array.isArray(proof.manifest) && proof.manifest.length > 0 && proof.manifest.length <= 2000 &&
    new Set(proof.manifest.map(x => x.file)).size === proof.manifest.length &&
    proof.manifest.every(x => x.file.startsWith(target.rootDirectory + '/') &&
      !/[\x00-\x1f\x7f\\]/.test(x.file) && !x.file.split('/').some(p => p === '.' || p === '..') &&
      /^[a-f0-9]{40}$/.test(x.sha) && /^[a-f0-9]{64}$/.test(x.sha256) &&
      Number.isSafeInteger(x.size) && x.size >= 0 && x.size <= 10 * 1024 * 1024) &&
    proof.manifest.every(x => !proof.manifest.some(y => x.sha === y.sha && x.sha256 !== y.sha256)) &&
    proof.manifestSha256 === objectDigest(proof.manifest), 'VERCEL_SOURCE_PROOF_INVALID');
}

export function fileDeploymentBody(bundle, target, meta) {
  validateFrontendProof(bundle.proof, bundle.proof.sourceSha, target);
  const inputs = bundle.proof.publicBuildInputs;
  return { name: target.name, project: target.id, target: 'production',
    files: bundle.proof.manifest.map(({ file, sha, size }) => ({ file, sha, size })),
    env: { ...inputs }, build: { env: { ...inputs } },
    projectSettings: { rootDirectory: target.rootDirectory, nodeVersion: '24.x', framework: 'nextjs',
      buildCommand: 'npm run build', installCommand: 'npm ci' },
    meta: { ...meta, aquaFileSourceSha256: objectDigest(bundle.proof) } };
}

// Original authenticated upload/create acknowledgements + immutable same-run
// audit establish provenance. Echoed metadata by itself never grants adoption.
function validateFileDeploymentSource(deployment, proof, target, meta) {
  validateFrontendProof(proof, proof.sourceSha, target);
  check(deployment?.projectId === target.id && deployment.target === 'production' &&
    !deployment.gitSource && deployment.meta?.aquaFileSourceSha256 === objectDigest(proof) &&
    Object.entries(meta).every(([k, v]) => deployment.meta?.[k] === v), 'VERCEL_SOURCE_PROVENANCE_MISMATCH');
}

export function validateFileDeployment(deployment, proof, target, meta, verifiedProjectRoot, compiledReadback) {
  validateFileDeploymentSource(deployment, proof, target, meta);
  const inputs = proof.publicBuildInputs;
  const providerValues = Object.entries(inputs).every(([k, v]) => deployment.build?.env?.[k] === v && deployment.env?.[k] === v);
  let observedValues = false;
  if (compiledReadback) {
    const names = value => Array.isArray(value) && value.every(x => typeof x === 'string') &&
      new Set(value).size === value.length && Object.keys(inputs).every(k => value.includes(k));
    const source = proof.manifest.find(x => x.file === target.rootDirectory + '/src/shared/config/public-env.ts');
    check(names(deployment.build?.env) && names(deployment.env) &&
      source?.sha256 === 'da0b258523ed6ee8d8ce5f00f874518e0a212adce7418807427c244d9f43921e' &&
      compiledReadback.deploymentId === deployment.id && compiledReadback.sourceProofSha256 === objectDigest(proof) &&
      [compiledReadback.before, compiledReadback.after].every(p => p?.id === target.id && p.targets?.production?.id === deployment.id) &&
      compiledReadback.productionUrl === target.productionUrl, 'VERCEL_COMPILED_READBACK_BINDING_REQUIRED');
    observedValues = same(observeCompiledPublicInputs(compiledReadback.assets).values, inputs);
  }
  check((providerValues || observedValues) &&
    verifiedProjectRoot === target.rootDirectory &&
    (deployment.projectSettings?.rootDirectory === undefined || deployment.projectSettings.rootDirectory === target.rootDirectory) &&
    deployment.projectSettings?.buildCommand === 'npm run build' &&
    deployment.projectSettings?.installCommand === 'npm ci', 'VERCEL_EFFECTIVE_BUILD_INPUTS_UNVERIFIABLE');
}

// Parse only literal values in the frozen public-env module's compiled schema.
// Never evaluate fetched JavaScript or infer an absent value from its default.
export function observeCompiledPublicInputs(assets) {
  check(Array.isArray(assets) && assets.length > 0 && assets.length <= 30 &&
    new Set(assets.map(x => x.path)).size === assets.length, 'VERCEL_COMPILED_ASSET_INVENTORY_INVALID');
  const found = [], records = []; let total = 0;
  for (const asset of assets) {
    check(/^\/_next\/static\/(?:immutable\/)?chunks\/[A-Za-z0-9_.-]+\.js$/.test(asset.path) &&
      Buffer.isBuffer(asset.bytes) && asset.bytes.length > 0 && asset.bytes.length <= 3 * 1024 * 1024,
    'VERCEL_COMPILED_ASSET_INVALID');
    total += asset.bytes.length; check(total <= 15 * 1024 * 1024, 'VERCEL_COMPILED_ASSETS_TOO_LARGE');
    const code = asset.bytes.toString('utf8');
    const pattern = /\.parse\(\{NEXT_PUBLIC_ABP_API_URL:("(?:\\.|[^"\\])*"),NEXT_PUBLIC_DEFAULT_TENANT_NAME:("(?:\\.|[^"\\])*"),NEXT_PUBLIC_MONITORING_ENDPOINT:/g;
    for (const match of code.matchAll(pattern)) {
      found.push({ NEXT_PUBLIC_ABP_API_URL: JSON.parse(match[1]), NEXT_PUBLIC_DEFAULT_TENANT_NAME: JSON.parse(match[2]) });
      records.push({ path: asset.path, sha256: hash(asset.bytes), bytes: asset.bytes.length });
    }
  }
  check(found.length > 0 && found.every(x => same(x, found[0])), 'VERCEL_COMPILED_PUBLIC_VALUES_MISSING_OR_CONFLICTING');
  return { values: found[0], assets: records };
}

// Read-only post-deployment qualification. api is the existing authenticated
// GET-only provider reader; publicFetch never receives a provider credential.
// The caller must first authenticate the original upload/create audit/proof.
export async function verifyObservedFileDeployment(api, deployment, proof, target, meta, publicFetch = fetch) {
  validateFileDeploymentSource(deployment, proof, target, meta);
  check(deployment.readyState === 'READY', 'VERCEL_COMPLETED_DEPLOYMENT_REQUIRED');
  const projectPath = `/v9/projects/${target.id}`;
  const before = await api.vercel(projectPath);
  const mapping = await api.vercel(`/v2/deployments/${deployment.id}/aliases`);
  const host = new URL(target.productionUrl).hostname;
  check(before.id === target.id && before.targets?.production?.id === deployment.id &&
    mapping.aliases?.some(x => x.alias === host), 'VERCEL_PUBLIC_ALIAS_NOT_BOUND_TO_DEPLOYMENT');
  const read = async path => {
    try {
      const r = await publicFetch(new URL(path, target.productionUrl).href, { redirect: 'error',
        signal: AbortSignal.timeout(15000), headers: { 'Cache-Control': 'no-store' } });
      check(r.status === 200, 'VERCEL_PUBLIC_ASSET_UNAVAILABLE');
      const chunks = []; let size = 0;
      for await (const chunk of r.body) { size += chunk.length; check(size <= 3 * 1024 * 1024,
        'VERCEL_COMPILED_ASSET_INVALID'); chunks.push(Buffer.from(chunk)); }
      return Buffer.concat(chunks);
    } catch (e) { if (e instanceof VercelSourceDenied) throw e; throw new VercelSourceDenied('VERCEL_PUBLIC_ASSET_UNAVAILABLE'); }
  };
  const html = (await read('/login')).toString('utf8');
  const paths = [...new Set([...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(x => x[1]))];
  const selected = paths.filter(x => /^\/_next\/static\/(?:immutable\/)?chunks\/[A-Za-z0-9_.-]+\.js$/.test(x));
  check(selected.length > 0 && selected.length <= 30, 'VERCEL_COMPILED_ASSET_INVENTORY_INVALID');
  const assets = []; let total = 0;
  for (const path of selected) {
    const bytes = await read(path);
    total += bytes.length; check(total <= 15 * 1024 * 1024, 'VERCEL_COMPILED_ASSETS_TOO_LARGE');
    assets.push({ path, bytes });
  }
  const after = await api.vercel(projectPath);
  const observation = observeCompiledPublicInputs(assets);
  const readback = { deploymentId: deployment.id, sourceProofSha256: objectDigest(proof), before, after,
    productionUrl: target.productionUrl, assets };
  validateFileDeployment(deployment, proof, target, meta, after.rootDirectory, readback);
  return { contract: 'aqua.observed-next-public-configuration-v1', deploymentId: deployment.id,
    sourceSha: proof.sourceSha, sourceProofSha256: objectDigest(proof), productionUrl: target.productionUrl,
    observedAt: new Date().toISOString(), aliasStable: true, observedPublicInputs: observation.values,
    compiledAssets: observation.assets, provenance: 'original-authenticated-upload-and-create-audit',
    configurationEvidence: 'compiled-literals-from-frozen-public-env-module', secretsRead: false };
}
