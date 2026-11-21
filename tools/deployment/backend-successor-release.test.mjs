// Ordinary post-Normal backend successor release tests: identity purpose
// separation, the staged-input contract, the no-schema and additive schema
// flows with a real migration source, drift and delta denials, audit receipt
// authentication and the Render client's read/write allowlist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { backendSuccessorMode, backendSuccessorPayloadKey, backendSuccessorPinKey,
  combinedMode, deployBackendSuccessorRelease, validateBackendSuccessorIdentity,
  validateBackendSuccessorReceipt, validateCombinedReceipt } from './backend-successor-release.mjs';
import { freezeCandidate, validateDispatchInputs, verifyCandidate, createAuditWriter, releaseKey,
  standingPolicy, targets, clients, validateRender, validateVercel, validateHealth,
  validateBaselineReceipt, deploymentHistory, waitFor, deploy, evidencePlan } from './release-control.mjs';
import { normalRuntimeSettings, validateReadiness } from './runtime-readiness.mjs';
import { runnerEnv, fixture as controllerFixture, fixtureNow, zipFixture,
  frontendFixtureArchive } from './fixtures/provider.mjs';
import { sha256, verifyGitHubEvidence, createGitHubAdmission } from './github-evidence.mjs';
import { validateFailedFrontendRecord } from './failed-frontend-release.mjs';
import { schemaSource } from './commission-schema-first.mjs';

const baselineSha = 'b8d86e5e60997483423b273d5f426c08b411f573';
const executorSha = 'd'.repeat(40);
const now = () => Date.UTC(2026, 10, 15, 10);
const migrationsDir = 'AqualLifeStyle/9.4.2/aspnet-core/src/AqualLifeStyle.EntityFrameworkCore/Migrations';
const migrationPath = `${migrationsDir}/20261115_MembershipNote.cs`;
const designerPath = migrationPath.replace(/\.cs$/, '.Designer.cs');
const snapshotPath = `${migrationsDir}/AqualLifeStyleDbContextModelSnapshot.cs`;
const backendModifiedPath =
  'AqualLifeStyle/9.4.2/aspnet-core/src/AqualLifeStyle.Application/ProgrammeParticipations/AQGreenD10BackendSuccessor.cs';
const additiveMigrationSource = `using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AqualLifeStyle.Migrations
{
    public partial class MembershipNote : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "MembershipNote",
                table: "ClubMembers",
                type: "nvarchar(max)",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "MembershipNote",
                table: "ClubMembers");
        }
    }
}
`;
const destructiveMigrationSource = additiveMigrationSource.replace(
  'migrationBuilder.AddColumn<string>(',
  'migrationBuilder.DropTable(\n                name: "ClubMembers");\n            migrationBuilder.AddColumn<string>(');

function sourceRepository(content = additiveMigrationSource, migrationFilePath = migrationPath) {
  const dir = mkdtempSync(join(tmpdir(), 'aqua-backend-successor-'));
  const git = (...args) => execFileSync('git', ['-C', dir, ...args],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_AUTHOR_DATE: '2026-11-15T10:00:00Z', GIT_COMMITTER_DATE: '2026-11-15T10:00:00Z' } });
  git('init', '-q');
  const sourceFile = join(dir, migrationFilePath);
  const generatedDesignerPath = migrationFilePath.replace(/\.cs$/, '.Designer.cs');
  mkdirSync(join(sourceFile, '..'), { recursive: true });
  writeFileSync(sourceFile, content);
  writeFileSync(join(dir, generatedDesignerPath), 'namespace AqualLifeStyle.Migrations { public partial class MembershipNote { } }\n');
  git('add', '.');
  git('-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false',
    'commit', '-qm', 'Additive successor migration');
  const sha = git('rev-parse', 'HEAD').trim();
  return { dir, sha, migrationFilePath, designerPath: generatedDesignerPath,
    close: () => rmSync(dir, { recursive: true, force: true }) };
}

function fixture({ files = [{ filename: backendModifiedPath, status: 'modified' }], repo = null,
  vars = {}, deployFails = false, jobFails = false, serviceId = null, compareStatus = 'ahead',
  integrityOverrides = {}, omitIntegrity = false, paymentAvailability = 'Available',
  decisionOverrides = {} } = {}) {
  const s = { vars: { ...Object.fromEntries(Object.entries(normalRuntimeSettings).map(([key, allowed]) =>
      [key, allowed[0]])), ...vars }, deployFails, jobFails, posts: [], puts: [], audit: [], readinessCalls: 0 };
  const candidateSha = repo ? repo.sha : 'a'.repeat(40);
  const q = freezeCandidate({ repository: targets.repository, sha: candidateSha,
    ciRunId: '43597833117', ciRunAttempt: 1 }, runnerEnv(), standingPolicy, false, backendSuccessorMode);
  const integrityName = `backend-successor-integrity-${q.sha}-${q.ciRunId}-${q.ciRunAttempt}`;
  const integrity = { contract: 'aqua.backend-successor-integrity-v1', repository: q.repository,
    sha: q.sha, ciRunId: q.ciRunId, ciRunAttempt: q.ciRunAttempt,
    successorSchemaSha256: files.some(file => file.filename === migrationPath && file.status === 'added') ?
      '9'.repeat(64) : '1'.repeat(64),
    successorAssemblySha256: 'b'.repeat(64), successorApplicationSha256: 'd'.repeat(64),
    successorCoreSha256: 'e'.repeat(64), ...integrityOverrides };
  const archive = zipFixture('backend-successor-integrity.json', JSON.stringify(integrity));
  const artifact = { id: 7891, name: integrityName, expired: false,
    size_in_bytes: archive.length, digest: `sha256:${sha256(archive)}`,
    workflow_run: { id: Number(q.ciRunId), repository_id: 789, head_repository_id: 789,
      head_sha: q.sha, head_branch: 'main' } };
  const decision = { contractVersion: 'AQGreenD10CutoverV2', decisionId: 'D10-TEST-DECISION-1',
    requiredSchemaDigest: '1'.repeat(64), requiredAssemblyDigest: '2'.repeat(64),
    requiredRuntimeAssemblyDigest: '3'.repeat(64), requiredDatabaseIdentityDigest: '4'.repeat(64),
    requiredConfigurationDigest: '6'.repeat(64), ...decisionOverrides };
  const decisionBytes = Buffer.from(JSON.stringify(decision), 'utf8');
  s.vars = { ...s.vars, Deployment__BuildId: baselineSha,
    App__AQGreenV2__Commissioning__DecisionJsonBase64: decisionBytes.toString('base64'),
    App__AQGreenV2__Commissioning__DecisionSha256: sha256(decisionBytes), ...vars };
  s.deploys = [{ id: 'dep-commissioned', status: 'live', commit: { id: baselineSha } }];
  s.jobReads = 0;
  s.deployReads = {};
  const servicePath = `/services/${targets.render.id}`;
  const service = { id: serviceId ?? targets.render.id, name: targets.render.name,
    repo: `https://github.com/${targets.repository}`, branch: 'main', suspended: 'not_suspended',
    autoDeploy: 'no', autoDeployTrigger: 'off', rootDir: '',
    serviceDetails: { runtime: 'docker', plan: 'starter', buildPlan: 'starter', numInstances: 1,
      region: 'frankfurt', maintenanceMode: { enabled: false }, healthCheckPath: '/api/health',
      envSpecificDetails: { dockerContext: '.', dockerfilePath: './docker/api/Dockerfile',
        preDeployCommand: '', dockerCommand: '' } } };
  const prefix = `${servicePath}/env-vars/`;
  const api = {
    gh: async route => {
      if (route === '') return { id: 789 };
      if (route === `/actions/runs/${q.ciRunId}/artifacts?per_page=100`)
        return { total_count: omitIntegrity ? 0 : 1, artifacts: omitIntegrity ? [] : [artifact] };
      if (route === '/actions/artifacts/7891') return artifact;
      assert.equal(route, `/compare/${baselineSha}...${candidateSha}`);
      return { status: compareStatus, base_commit: { sha: baselineSha },
        merge_base_commit: { sha: baselineSha }, files };
    },
    artifact: async (owner, id) => {
      assert.equal(owner, 'source'); assert.equal(id, '7891'); return archive;
    },
    render: async (route, body) => {
      if (body !== undefined && route.startsWith(prefix)) {
        const key = route.slice(prefix.length);
        s.vars[key] = body.value;
        s.puts.push({ key, value: body.value });
        return { key, value: body.value };
      }
      if (route.startsWith(prefix)) {
        const key = route.slice(prefix.length);
        return { key, value: s.vars[key] };
      }
      if (route === servicePath) return structuredClone(service);
      if (route.endsWith('/deploys?limit=100')) return s.deploys.map(row => ({ deploy: row }));
      if (route === `${servicePath}/deploys`) {
        const id = s.deploys.some(row => row.id === 'dep-new') ? 'dep-restart' : 'dep-new';
        s.posts.push({ body, id });
        s.deploys = s.deploys.map(row => row.id === 'dep-commissioned' ?
          { ...row, status: 'deactivated' } : row);
        s.deploys.unshift({ id, status: 'created', commit: { id: candidateSha } });
        return { id, status: 'created', commit: { id: candidateSha } };
      }
      if (route === `${servicePath}/jobs`) {
        s.posts.push({ body, id: 'job-a'.padEnd(24, '0') });
        return { id: 'job-a'.padEnd(24, '0'), status: 'pending' };
      }
      if (route.includes('/jobs/job-')) {
        s.jobReads++;
        return { id: 'job-a'.padEnd(24, '0'), status: s.jobReads > 1 && !s.jobFails ? 'succeeded' :
          s.jobReads > 1 ? 'failed' : 'pending' };
      }
      const deploy = s.deploys.find(row => route.endsWith(`/deploys/${row.id}`));
      if (deploy) {
        s.deployReads[deploy.id] = (s.deployReads[deploy.id] ?? 0) + 1;
        if (s.deployFails) return { ...deploy, status: 'build_failed' };
        if (s.deployReads[deploy.id] > 1) {
          deploy.status = 'live';
          for (const row of s.deploys) if (row.id !== deploy.id && row.status === 'live')
            row.status = 'deactivated';
        }
        return deploy;
      }
      throw new Error('Unexpected Render route ' + route);
    },
    health: async () => ({ status: 200, recovery: null, body: { result: { status: 'Healthy',
      buildId: s.deploys.find(row => row.status === 'live')?.commit.id ?? baselineSha,
      environment: 'Production', databaseStatus: 'Healthy', redisStatus: 'Healthy',
      dataProtectionKeyStoreStatus: 'Healthy', paymentAvailability } } }),
    readiness: async () => {
      s.readinessCalls = (s.readinessCalls ?? 0) + 1;
      return { status: 503, body: { status: 'Unavailable', birdConfiguration: 'Unavailable',
        yocoConfiguration: 'Unavailable', restrictedOperations: 'Unavailable' } };
    },
    web: async () => 200,
    webHealth: async (sha, expected) => {
      assert.equal(expected, 'Available');
      return { status: 'Healthy', buildId: sha, paymentAvailability: 'Available' };
    }
  };
  const options = { targets, policy: standingPolicy, validateRender, validateHealth,
    deploymentHistory, waitFor, releaseKey, evidencePlan: { policySha256: q.policySha256,
      verifiedReleases: [], priorFailedRuns: [], baseline: null, resume: null, resumeChain: [],
      backendReleases: [] }, attempts: 3, pause: async () => {},
    guard: async () => {}, validateAdmission: () => {},
    env: repo ? { SOURCE_DIR: repo.dir } : undefined, now };
  const report = createAuditWriter(q, row => s.audit.push(row));
  report({ phase: 'evidence-selected', authorizationId: 'a'.repeat(64), evidenceSha256: 'b'.repeat(64),
    inventorySha256: 'c'.repeat(64), evidenceArtifactId: '123' });
  return { s, q, api, options, candidateSha, decisionBytes,
    execute: () => deployBackendSuccessorRelease(api, q, report, options) };
}

function assertNoProviderWrites(f) {
  assert.equal(f.s.puts.length, 0, 'no Render environment writes');
  assert.equal(f.s.posts.length, 0, 'no Render deployment or job posts');
  assert.equal(f.s.vercelPosts?.length ?? 0, 0, 'no Vercel deployment posts');
  assert.equal(f.s.uploads ?? 0, 0, 'no Vercel file uploads');
}

test('ordinary backend dispatch accepts the merged main sha and freezes a distinct purpose', () => {
  const dispatch = { sha: 'b'.repeat(40), ci_run_id: '43597833117', ci_run_attempt: '1',
    release_mode: backendSuccessorMode };
  assert.equal(validateDispatchInputs(dispatch).releaseMode, backendSuccessorMode);
  assert.throws(() => validateDispatchInputs({ ...dispatch, release_mode: 'other' }));
  assert.throws(() => validateDispatchInputs({ ...dispatch, sha: 'nothex' }));
  const { q } = fixture();
  assert.equal(q.backendSuccessor, backendSuccessorMode);
  assert.equal(q.memberRelease, undefined);
  assert.equal(q.frontendRelease, undefined);
  validateBackendSuccessorIdentity(q);
  const plain = { ...q };
  delete plain.backendSuccessor;
  assert.notEqual(releaseKey(q), releaseKey(plain));
  assert.throws(() => validateBackendSuccessorIdentity({ ...q, backendSuccessor: 'other' }),
    /BACKEND_RELEASE_IDENTITY_MISMATCH/);
  assert.throws(() => validateBackendSuccessorIdentity({ ...q, frontendRelease: 'x'.repeat(64) }));
  assert.throws(() => validateBackendSuccessorIdentity({ ...q, memberRelease: 'x'.repeat(64) }));
  const bytes = Buffer.from('inert');
  verifyCandidate({ ...q, sourceSha256: sha256(bytes) }, q, bytes, bytes);
  const admissionEvidence = { mode: 'github-evidence-v1', inventorySha256: standingPolicy.authorization.inventorySha256,
    repository: q.repository, sha: q.sha, ciRunId: q.ciRunId, ciRunAttempt: q.ciRunAttempt,
    policySha256: q.policySha256, completedAt: new Date(now()).toISOString() };
  const admission = createGitHubAdmission(q, standingPolicy, admissionEvidence, now);
  assert.equal(admission.backendSuccessor, backendSuccessorMode);
  assert.notEqual(admission.authorizationId, createGitHubAdmission(plain, standingPolicy,
    admissionEvidence, now).authorizationId);
  assert.throws(() => verifyCandidate({ ...q, sourceSha256: sha256(bytes) },
    { ...plain, sourceSha256: sha256(bytes) }, bytes, bytes), /CANDIDATE_PURPOSE_MISMATCH/);
});

test('deploy dispatch bypasses the one-time commissioning source gate for ordinary backend revisions', async () => {
  const f = controllerFixture();
  f.state.policy = structuredClone(standingPolicy);
  f.state.candidate = freezeCandidate(f.state.candidate, f.state.env, f.state.policy,
    false, backendSuccessorMode);
  const q = f.state.candidate;
  const evidence = await verifyGitHubEvidence(f.api, q, f.state.policy,
    f.readSourceDigest, () => fixtureNow);
  const admissionReceipt = createGitHubAdmission(q, f.state.policy, evidence, () => fixtureNow);
  const plan = await evidencePlan(f.api, q, f.state.policy);
  const report = createAuditWriter(q, row => f.reports.push(row));
  const commissioningPaths = new Set([...schemaSource.migrationFiles, ...schemaSource.holdSources,
    ...(schemaSource.cleanStartSources ?? [])].map(pin => pin.path));
  const sourceReads = new Map();
  // The controller fixture has no commissioned backend runtime. Reaching its
  // backend baseline rejection proves dispatch did not run the M55-only gate.
  await assert.rejects(deploy(f.api, q, f.state.policy, report, {
    admissionReceipt, evidencePlan: plan, env: f.state.env,
    readSourceDigest: async path => {
      const count = (sourceReads.get(path) ?? 0) + 1;
      sourceReads.set(path, count);
      if (commissioningPaths.has(path) && count > 1) throw Error('commissioning source pin was reread');
      return f.readSourceDigest(path);
    },
    now: () => fixtureNow, attempts: 2, pause: async () => {}
  }), /BACKEND_RENDER_DRIFT|BACKEND_RUNTIME_CONFIGURATION_CHANGED/);
  assert.equal(f.reports[0].phase, 'evidence-selected');
  assert.equal(f.posts.length, 0);
});

test('no-schema successor stages the pinned input, deploys the candidate once and binds the receipt', async () => {
  const f = fixture();
  await f.execute();
  assert.equal(f.s.posts.length, 1, 'exactly one Render deploy POST');
  assert.equal(f.s.posts[0].body.commitId, f.candidateSha);
  assert.equal(f.s.posts[0].body.clearCache, 'do_not_clear');
  assert.equal(f.s.puts.length, 2, 'payload and pin staged exactly once');
  assert.equal(f.s.puts[0].key, backendSuccessorPayloadKey);
  assert.equal(f.s.puts[1].key, backendSuccessorPinKey);
  const payload = JSON.parse(Buffer.from(f.s.puts[0].value, 'base64').toString('utf8'));
  assert.deepEqual(Object.keys(payload).sort(), ['ciRunAttempt', 'ciRunId', 'contractVersion',
    'executorSha256', 'predecessorAssemblySha256', 'predecessorBuildId',
    'predecessorDatabaseIdentitySha256', 'predecessorDecisionSha256',
    'predecessorRuntimeAssemblySha256', 'predecessorSchemaSha256', 'releaseRunAttempt',
    'releaseRunId', 'schemaTransition', 'successorRevisionSha256', 'successorSchemaSha256',
    'successorAssemblySha256', 'successorApplicationSha256', 'successorCoreSha256'].sort());
  assert.equal(payload.contractVersion, 'AQGreenD10BackendSuccessorV1');
  assert.equal(payload.predecessorDecisionSha256, sha256(f.decisionBytes));
  assert.equal(payload.predecessorSchemaSha256, '1'.repeat(64));
  assert.equal(payload.predecessorAssemblySha256, '2'.repeat(64));
  assert.equal(payload.predecessorRuntimeAssemblySha256, '3'.repeat(64));
  assert.equal(payload.predecessorDatabaseIdentitySha256, '4'.repeat(64));
  assert.equal(payload.predecessorBuildId, baselineSha);
  assert.equal(payload.successorRevisionSha256, f.candidateSha);
  assert.equal(payload.schemaTransition, 'none');
  assert.equal(payload.successorSchemaSha256, '1'.repeat(64));
  assert.equal(payload.successorAssemblySha256, 'b'.repeat(64));
  assert.equal(typeof payload.releaseRunId, 'number');
  assert.equal(payload.executorSha256, sha256(Buffer.from(executorSha, 'utf8')));
  assert.equal(f.s.puts[1].value, sha256(Buffer.from(f.s.puts[0].value, 'base64')));
  assert.equal(f.s.audit.length, 10);
  assert.equal(f.s.audit.at(-1).phase, 'backend-deployed');
  assert.equal(f.s.audit.at(-1).renderSha, f.candidateSha);
  assert.equal(f.s.readinessCalls, 0, 'Normal runtime verification does not call the Held-only endpoint');
  const descriptor = { runId: f.q.releaseRunId, runAttempt: 1, sha: f.q.executorSha };
  const receipt = validateBackendSuccessorReceipt(f.s.audit, descriptor, targets);
  assert.equal(receipt.sha, f.candidateSha);
  assert.equal(receipt.schemaTransition, 'none');
  assert.equal(receipt.renderSha, f.candidateSha);
  assert.equal(receipt.payloadPinSha256, f.s.puts[1].value);
  assert.equal(f.s.deploys.filter(row => row.status === 'live').length, 1);
});

test('additive successor runs the candidate migrator once-off and restarts on the additive input', async () => {
  const repo = sourceRepository();
  try {
    const f = fixture({ repo, files: [{ filename: migrationPath, status: 'added' },
      { filename: designerPath, status: 'added' },
      { filename: snapshotPath, status: 'modified' },
      { filename: backendModifiedPath, status: 'modified' }] });
    await f.execute();
    assert.equal(f.s.posts.length, 3, 'deploy, one-off job and deploy_only restart');
    assert.equal(f.s.posts[0].body.commitId, f.candidateSha);
    assert.equal(f.s.posts[1].body.startCommand, 'dotnet migrator/AqualLifeStyle.Migrator.dll');
    assert.deepEqual(f.s.posts[2].body, { deployMode: 'deploy_only' });
    assert.equal(f.s.puts.length, 4, 'two staging rounds overwrite payload and pin');
    const firstPayload = JSON.parse(Buffer.from(f.s.puts[0].value, 'base64').toString('utf8'));
    const finalPayload = JSON.parse(Buffer.from(f.s.puts[2].value, 'base64').toString('utf8'));
    assert.equal(firstPayload.schemaTransition, 'none');
    assert.equal(finalPayload.schemaTransition, 'additive');
    assert.equal(firstPayload.successorSchemaSha256, '1'.repeat(64));
    assert.equal(finalPayload.successorSchemaSha256, '9'.repeat(64));
    assert.equal(f.s.puts[3].value, sha256(Buffer.from(f.s.puts[2].value, 'base64')),
      'pin tracks the staged additive payload');
    assert.notEqual(f.s.puts[1].value, f.s.puts[3].value);
    assert.equal(f.s.audit.length, 18);
    assert.equal(f.s.audit[3].migrationFiles, 3);
    assert.deepEqual(f.s.audit.map(row => row.phase), ['evidence-selected', 'backend-baseline-selected',
      'backend-decision-verified', 'backend-classified', 'backend-successor-staging',
      'backend-successor-staged', 'backend-render-requesting', 'backend-render-requested',
      'backend-render-ready', 'backend-schema-job-requesting', 'backend-schema-job-created',
      'backend-schema-job-succeeded', 'backend-successor-restart-staging',
      'backend-successor-restart-staged', 'backend-restart-requesting', 'backend-restart-requested',
      'backend-restart-ready', 'backend-deployed']);
    const descriptor = { runId: f.q.releaseRunId, runAttempt: 1, sha: f.q.executorSha };
    const receipt = validateBackendSuccessorReceipt(f.s.audit, descriptor, targets);
    assert.equal(receipt.schemaTransition, 'additive');
    assert.equal(receipt.renderDeployId, 'dep-restart');
    assert.notEqual(receipt.payloadPinSha256, f.s.audit[4].payloadPinSha256);
    const liveRows = f.s.deploys.filter(row => row.status === 'live');
    assert.equal(liveRows.length, 1);
    assert.equal(liveRows[0].id, 'dep-restart');
  } finally { repo.close(); }
});

test('runtime and commissioned-state drift denies before any provider write', async () => {
  const stoppedPayments = fixture({ paymentAvailability: 'Held' });
  await assert.rejects(stoppedPayments.execute(), /BACKEND_COMMISSIONED_STATE_CHANGED/);
  assertNoProviderWrites(stoppedPayments);
  const unavailablePayments = fixture({ paymentAvailability: 'Unavailable' });
  await assert.rejects(unavailablePayments.execute(), /BACKEND_COMMISSIONED_STATE_CHANGED/);
  assertNoProviderWrites(unavailablePayments);
  const settings = fixture({ vars: { App__AQGreenV2__Commissioning__Enabled: 'false' } });
  await assert.rejects(settings.execute(), /BACKEND_RUNTIME_CONFIGURATION_CHANGED/);
  assertNoProviderWrites(settings);
  const pin = fixture({ vars: { App__AQGreenV2__Commissioning__DecisionSha256: sha256(Buffer.from('other')) } });
  await assert.rejects(pin.execute(), /BACKEND_COMMISSIONED_STATE_CHANGED/);
  assertNoProviderWrites(pin);
  const payload = fixture();
  payload.s.vars.App__AQGreenV2__Commissioning__DecisionJsonBase64 =
    Buffer.from(JSON.stringify({ contractVersion: 'AQGreenD10CutoverV1' })).toString('base64');
  await assert.rejects(payload.execute(), /BACKEND_COMMISSIONED_STATE_CHANGED/);
  const buildId = fixture({ vars: { Deployment__BuildId: '9'.repeat(40) } });
  await assert.rejects(buildId.execute(), /BACKEND_COMMISSIONED_STATE_CHANGED/);
  assertNoProviderWrites(buildId);
  const competing = fixture();
  competing.s.deploys.push({ id: 'dep-second', status: 'live', commit: { id: 'c'.repeat(40) } });
  await assert.rejects(competing.execute(), /BACKEND_RENDER_DRIFT/);
  const foreign = fixture({ serviceId: 'srv-foreign' });
  await assert.rejects(foreign.execute(), /BACKEND_RENDER_DRIFT/);
  assert.equal(foreign.s.puts.length, 0);
});

test('Normal/Committed evidence accepts the commissioned baseline while the legacy Held endpoint remains unavailable', async () => {
  const f = fixture();
  await f.execute();
  assert.equal(f.s.readinessCalls, 0);
  assert.deepEqual(f.s.audit[1].healthObservation, {
    status: 'Healthy', buildId: baselineSha, environment: 'Production', databaseStatus: 'Healthy',
    redisStatus: 'Healthy', dataProtectionKeyStoreStatus: 'Healthy', paymentAvailability: 'Available'
  });
  assert.match(f.s.audit[1].providerConfigurationSha256, /^[a-f0-9]{64}$/);
  assert.equal(f.s.audit.at(-1).successorEvidence.commissioningDecisionSha256, sha256(f.decisionBytes));
  assert.equal(f.s.audit.at(-1).successorEvidence.qualifiedBuildSha, f.candidateSha);
  assert.equal(f.s.audit.at(-1).successorEvidence.successorAssemblyArtifactSha256, 'b'.repeat(64));
  assert.equal(f.s.audit.at(-1).successorEvidence.requiredAssemblyDigest, undefined,
    'qualified artifact evidence is not labeled runtime attestation');
  assert.throws(() => validateReadiness({ status: 503, body: { status: 'Unavailable' } }, baselineSha),
    /PROTECTED_RUNTIME_READINESS_FAILED/);
});

test('invalid D10 decision bindings, Normal settings, and operational holds deny before any provider write', async () => {
  const invalidDecision = fixture({ decisionOverrides: { requiredConfigurationDigest: '0'.repeat(64) } });
  await assert.rejects(invalidDecision.execute(), /BACKEND_COMMISSIONED_STATE_CHANGED/);
  assertNoProviderWrites(invalidDecision);

  for (const decisionOverrides of [{ requiredAssemblyDigest: 'invalid' },
    { requiredRuntimeAssemblyDigest: '0'.repeat(64) }]) {
    const f = fixture({ decisionOverrides });
    await assert.rejects(f.execute(), /BACKEND_COMMISSIONED_STATE_CHANGED/);
    assertNoProviderWrites(f);
  }

  for (const [key, allowed] of Object.entries(normalRuntimeSettings)) {
    const invalid = ['false', 'true', 'invalid'].find(value => !allowed.includes(value));
    const f = fixture({ vars: { [key]: invalid } });
    await assert.rejects(f.execute(), /BACKEND_RUNTIME_CONFIGURATION_CHANGED/);
    assertNoProviderWrites(f);
  }
});

test('unhealthy commissioned backend and Render service drift deny before provider writes', async () => {
  for (const mutate of [body => { body.status = 'Degraded'; },
    body => { body.databaseStatus = 'Unavailable'; }, body => { body.redisStatus = 'Unavailable'; },
    body => { body.dataProtectionKeyStoreStatus = 'Unavailable'; }]) {
    const f = fixture();
    f.api.health = async () => {
      const result = { status: 'Healthy', buildId: baselineSha, environment: 'Production',
        databaseStatus: 'Healthy', redisStatus: 'Healthy', dataProtectionKeyStoreStatus: 'Healthy',
        paymentAvailability: 'Available' };
      mutate(result);
      return { status: 200, recovery: null, body: { result } };
    };
    await assert.rejects(f.execute(), /BACKEND_COMMISSIONED_STATE_CHANGED/);
    assertNoProviderWrites(f);
  }

  const f = fixture();
  const render = f.api.render;
  f.api.render = async (route, body) => {
    const result = await render(route, body);
    if (route === `/services/${targets.render.id}`) result.serviceDetails.plan = 'pro';
    return result;
  };
  await assert.rejects(f.execute(), /BACKEND_RENDER_DRIFT/);
  assertNoProviderWrites(f);
});

test('missing or substituted qualified assembly/schema artifact denies before provider mutation', async () => {
  for (const f of [fixture({ omitIntegrity: true }),
    fixture({ integrityOverrides: { successorAssemblySha256: 'invalid' } }),
    fixture({ integrityOverrides: { sha: 'f'.repeat(40) } }),
    fixture({ integrityOverrides: { successorSchemaSha256: '9'.repeat(64) } })]) {
    await assert.rejects(f.execute(), /BACKEND_INTEGRITY_EVIDENCE_UNAVAILABLE|BACKEND_INTEGRITY_EVIDENCE_MISMATCH/);
    assert.equal(f.s.puts.length, 0);
    assert.equal(f.s.posts.length, 0);
  }
});

test('backend successor releases accept a mixed delta and deny unauthorized source deltas', async () => {
  const frontend = fixture({ files: [
    { filename: `${targets.vercel.rootDirectory}/app/page.tsx`, status: 'modified' },
    { filename: backendModifiedPath, status: 'modified' }] });
  await frontend.execute();
  assert.equal(frontend.s.puts.length, 2);
  assert.equal(frontend.s.audit[3].phase, 'backend-classified');
  assert.equal(frontend.s.audit[3].frontendFiles, 1);
  assert.equal(frontend.s.audit[3].backendFiles, 1);
  assert.match(frontend.s.audit[3].sourceDeltaSha256, /^[a-f0-9]{64}$/);
  const descriptor = { runId: frontend.q.releaseRunId, runAttempt: 1, sha: frontend.q.executorSha };
  const receipt = validateBackendSuccessorReceipt(frontend.s.audit, descriptor, targets);
  assert.equal(receipt.schemaTransition, 'none');
  const none = fixture({ files: [{ filename: 'README.md', status: 'modified' }] });
  await assert.rejects(none.execute(), /BACKEND_SOURCE_DELTA_UNAUTHORIZED/);
  assertNoProviderWrites(none);
  const behind = fixture({ compareStatus: 'behind' });
  await assert.rejects(behind.execute(), /BACKEND_SOURCE_DELTA_UNAUTHORIZED/);
  assertNoProviderWrites(behind);
  const destructive = sourceRepository(destructiveMigrationSource);
  try {
    const f = fixture({ repo: destructive, files: [{ filename: migrationPath, status: 'added' },
      { filename: backendModifiedPath, status: 'modified' }] });
    await assert.rejects(f.execute(), /BACKEND_SCHEMA_DELTA_UNAUTHORIZED/);
    assertNoProviderWrites(f);
  } finally { destructive.close(); }
  const nonstandard = sourceRepository(destructiveMigrationSource.replace('void Up(', 'void Up ('));
  try {
    const f = fixture({ repo: nonstandard, files: [{ filename: migrationPath, status: 'added' },
      { filename: backendModifiedPath, status: 'modified' }] });
    await assert.rejects(f.execute(), /BACKEND_SCHEMA_DELTA_UNAUTHORIZED/);
    assertNoProviderWrites(f);
  } finally { nonstandard.close(); }
  const spacedCall = sourceRepository(additiveMigrationSource.replace(
    'migrationBuilder.AddColumn<string>(', 'migrationBuilder .DropTable(\n                name: "ClubMembers");\n            migrationBuilder.AddColumn<string>('));
  try {
    const f = fixture({ repo: spacedCall, files: [{ filename: migrationPath, status: 'added' },
      { filename: backendModifiedPath, status: 'modified' }] });
    await assert.rejects(f.execute(), /BACKEND_SCHEMA_DELTA_UNAUTHORIZED/);
    assertNoProviderWrites(f);
  } finally { spacedCall.close(); }
  const missingUp = sourceRepository(additiveMigrationSource.replace('void Up(', 'void Apply('));
  try {
    const f = fixture({ repo: missingUp, files: [{ filename: migrationPath, status: 'added' },
      { filename: backendModifiedPath, status: 'modified' }] });
    await assert.rejects(f.execute(), /BACKEND_SCHEMA_DELTA_UNAUTHORIZED/);
    assertNoProviderWrites(f);
    const orphan = fixture({ repo: missingUp, files: [{ filename: designerPath, status: 'added' },
      { filename: backendModifiedPath, status: 'modified' }] });
    await assert.rejects(orphan.execute(), /BACKEND_SCHEMA_DELTA_UNAUTHORIZED/);
    assertNoProviderWrites(orphan);
  } finally { missingUp.close(); }
  const renamed = fixture({ repo: sourceRepository(), files: [
    { filename: migrationPath, status: 'modified', previous_filename: `${migrationsDir}/Earlier.cs` },
    { filename: backendModifiedPath, status: 'modified' }] });
  await assert.rejects(renamed.execute(), /BACKEND_SCHEMA_DELTA_UNAUTHORIZED/);
  assertNoProviderWrites(renamed);
  const removed = fixture({ repo: sourceRepository(), files: [
    { filename: migrationPath, status: 'removed' },
    { filename: backendModifiedPath, status: 'modified' }] });
  await assert.rejects(removed.execute(), /BACKEND_SCHEMA_DELTA_UNAUTHORIZED/);
  assertNoProviderWrites(removed);
  const pathed = fixture({ repo: sourceRepository(), files: [
    { filename: `${migrationsDir}/sub/../X.cs`, status: 'added' },
    { filename: backendModifiedPath, status: 'modified' }] });
  await assert.rejects(pathed.execute(), /BACKEND_SOURCE_DELTA_UNAUTHORIZED/);
  assertNoProviderWrites(pathed);
});

test('deployment failure after staging leaves the write-ahead audit and never finalizes', async () => {
  const f = fixture({ deployFails: true });
  await assert.rejects(f.execute(), /PROVIDER_DEPLOYMENT_FAILED_INSPECT_RELEASE_REPORT/);
  assert.ok(f.s.audit.some(row => row.phase === 'backend-successor-staged'));
  assert.equal(f.s.audit.some(row => row.phase === 'backend-deployed'), false);
  const repo = sourceRepository();
  try {
    const job = fixture({ jobFails: true, repo, files: [{ filename: migrationPath, status: 'added' },
      { filename: backendModifiedPath, status: 'modified' }] });
    await assert.rejects(job.execute(), /PROVIDER_DEPLOYMENT_FAILED_INSPECT_RELEASE_REPORT/);
    assert.equal(job.s.audit.some(row => row.phase === 'backend-schema-job-succeeded'), false);
    assert.equal(job.s.puts.length, 2, 'the additive restage never happens after a failed job');
  } finally { repo.close(); }
});

test('audit receipts authenticate exact sequences and reject tampering', async () => {
  const f = fixture();
  await f.execute();
  const descriptor = { runId: f.q.releaseRunId, runAttempt: 1, sha: f.q.executorSha };
  const receipt = validateBackendSuccessorReceipt(f.s.audit, descriptor, targets);
  assert.equal(receipt.receiptSha256.length, 64);
  for (const mutate of [rows => rows.splice(2, 1), rows => rows[0].backendSuccessor = 'other',
    rows => rows[4].payloadPinSha256 = 'x'.repeat(64),
    rows => rows[2].baselineRenderSha = 'e'.repeat(40),
    rows => { rows.at(-1).successorEvidence.providerConfigurationSha256 = '0'.repeat(64); },
    rows => { rows.at(-1).successorEvidence.successorAssemblyArtifactSha256 = '0'.repeat(64); },
    rows => { rows.at(-1).payloadPinSha256 = 'x'.repeat(64); },
    rows => { rows[3].schemaTransition = 'additive'; },
    rows => { rows[3].successorAssemblySha256 = 'f'.repeat(64); }]) {
    const rows = structuredClone(f.s.audit);
    mutate(rows);
    assert.throws(() => validateBackendSuccessorReceipt(rows, descriptor, targets));
  }
  assert.throws(() => validateBackendSuccessorReceipt(f.s.audit,
    { ...descriptor, sha: 'e'.repeat(40) }, targets));
});

test('render client restricts env access to the settings and successor allowlists', async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body });
    return new Response(JSON.stringify({ key: 'k', value: 'v' }),
      { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const env = { RENDER_API_KEY: 'synthetic-render-key', GH_TOKEN: 't',
    AQGREEN_EVIDENCE_READ_TOKEN: 't', VERCEL_TOKEN: 't' };
  const api = clients(env, fetcher);
  const servicePath = `/services/${targets.render.id}`;
  await api.render(servicePath);
  await api.render(`${servicePath}/env-vars/App__AQGreenV2__Commissioning__DecisionJsonBase64`);
  await api.render(`${servicePath}/env-vars/App__AQGreenV2__Commissioning__DecisionSha256`);
  await api.render(`${servicePath}/env-vars/Deployment__BuildId`);
  await api.render(`${servicePath}/env-vars/App__AutomaticPayouts__Enabled`);
  await api.render(`${servicePath}/deploys`, { commitId: 'b'.repeat(40), clearCache: 'do_not_clear' });
  await api.render(`${servicePath}/env-vars/${backendSuccessorPayloadKey}`, { value: 'payload' });
  await api.render(`${servicePath}/env-vars/${backendSuccessorPinKey}`, { value: 'p'.repeat(64) });
  assert.deepEqual(calls.filter(row => row.method === 'PUT').map(row => row.url),
    [`${servicePath}/env-vars/${backendSuccessorPayloadKey}`,
      `${servicePath}/env-vars/${backendSuccessorPinKey}`].map(url =>
      `https://api.render.com/v1${url}`));
  assert.equal(calls.filter(row => row.method === 'POST').length, 1);
  for (const [route, body] of [
    [`${servicePath}/env-vars/App__AQGreenV2__Commissioning__VerifiedAuthorityJsonBase64`, undefined],
    [`${servicePath}/env-vars/SomeForeignKey`, undefined],
    [`${servicePath}/secret-files/keyfile`, undefined],
    [`${servicePath}/env-vars/App__Recovery__Enabled`, { value: 'true' }],
    [`${servicePath}/env-vars/${backendSuccessorPayloadKey}Extra`, { value: 'x' }]])
    await assert.rejects(async () => api.render(route, body),
      /SECRET_BEARING_RENDER_READ_FORBIDDEN|RENDER_ENV_WRITE_FORBIDDEN/);
});

// Combined releases: one qualified revision released as a backend successor on
// Render first and only then as the frontend phase on Vercel, with a single
// authenticated audit receipt spanning both providers.
function combinedFixture({ files = [
    { filename: `${targets.vercel.rootDirectory}/app/page.tsx`, status: 'modified' },
    { filename: backendModifiedPath, status: 'modified' }], failedVercel = false, repo = null } = {}) {
  const s = { vars: Object.fromEntries(Object.entries(normalRuntimeSettings).map(([key, allowed]) =>
      [key, allowed[0]])), posts: [], puts: [], audit: [], uploads: 0, vercelPosts: [],
    deployed: null, failedVercel, alias: 'dpl_Legacy', jobReads: 0, deployReads: {}, readinessCalls: 0 };
  const candidateSha = repo?.sha ?? 'a'.repeat(40);
  const q = freezeCandidate({ repository: targets.repository, sha: candidateSha,
    ciRunId: '43597833118', ciRunAttempt: 1 }, runnerEnv(), standingPolicy, false, combinedMode);
  assert.equal(q.backendSuccessor, backendSuccessorMode);
  assert.equal(q.combinedRelease, combinedMode);
  const integrityName = `backend-successor-integrity-${q.sha}-${q.ciRunId}-${q.ciRunAttempt}`;
  const integrity = { contract: 'aqua.backend-successor-integrity-v1', repository: q.repository,
    sha: q.sha, ciRunId: q.ciRunId, ciRunAttempt: q.ciRunAttempt,
    successorSchemaSha256: files.some(file => file.filename.startsWith(`${migrationsDir}/`) &&
      file.status === 'added' && !file.filename.endsWith('.Designer.cs')) ? '9'.repeat(64) : '1'.repeat(64),
    successorAssemblySha256: 'b'.repeat(64),
    successorApplicationSha256: 'd'.repeat(64), successorCoreSha256: 'e'.repeat(64) };
  const archive = zipFixture('backend-successor-integrity.json', JSON.stringify(integrity));
  const artifact = { id: 7891, name: integrityName, expired: false,
    size_in_bytes: archive.length, digest: `sha256:${sha256(archive)}`,
    workflow_run: { id: Number(q.ciRunId), repository_id: 789, head_repository_id: 789,
      head_sha: q.sha, head_branch: 'main' } };
  const decision = { contractVersion: 'AQGreenD10CutoverV2', decisionId: 'D10-TEST-DECISION-1',
    requiredSchemaDigest: '1'.repeat(64), requiredAssemblyDigest: '2'.repeat(64),
    requiredRuntimeAssemblyDigest: '3'.repeat(64), requiredDatabaseIdentityDigest: '4'.repeat(64),
    requiredConfigurationDigest: '6'.repeat(64) };
  const decisionBytes = Buffer.from(JSON.stringify(decision), 'utf8');
  s.vars = { ...s.vars, Deployment__BuildId: baselineSha,
    App__AQGreenV2__Commissioning__DecisionJsonBase64: decisionBytes.toString('base64'),
    App__AQGreenV2__Commissioning__DecisionSha256: sha256(decisionBytes) };
  s.deploys = [{ id: 'dep-commissioned', status: 'live', commit: { id: baselineSha } }];
  const record = validateFailedFrontendRecord();
  const incumbentId = record.observedVercel.deploymentId;
  s.alias = incumbentId;
  const incumbentMeta = { aquaCiRunId: '43597833117', aquaSourceSha: record.qualifiedSource.sha,
    aquaFileSourceSha256: record.qualifiedSource.fileSourceProofSha256,
    aquaFrontendRelease: record.qualifiedSource.frontendRelease,
    aquaReleaseIdentity: record.qualifiedSource.releaseIdentity };
  const frontendSource = frontendFixtureArchive();
  const frontendArchive = Buffer.from(frontendSource.archive);
  const frontendOffset = frontendArchive.indexOf(Buffer.from(frontendSource.sha));
  assert.ok(frontendOffset >= 0);
  frontendArchive.write(candidateSha, frontendOffset, 40, 'ascii');
  const servicePath = `/services/${targets.render.id}`;
  const service = { id: targets.render.id, name: targets.render.name,
    repo: `https://github.com/${targets.repository}`, branch: 'main', suspended: 'not_suspended',
    autoDeploy: 'no', autoDeployTrigger: 'off', rootDir: '',
    serviceDetails: { runtime: 'docker', plan: 'starter', buildPlan: 'starter', numInstances: 1,
      region: 'frankfurt', maintenanceMode: { enabled: false }, healthCheckPath: '/api/health',
      envSpecificDetails: { dockerContext: '.', dockerfilePath: './docker/api/Dockerfile',
        preDeployCommand: '', dockerCommand: '' } } };
  const prefix = `${servicePath}/env-vars/`;
  const project = () => ({ id: targets.vercel.id, name: targets.vercel.name, accountId: targets.vercel.teamId,
    rootDirectory: targets.vercel.rootDirectory, nodeVersion: '24.x', autoAssignCustomDomains: true,
    link: null, targets: { production: { id: s.alias } } });
  const inputRows = () => Object.entries({ NEXT_PUBLIC_ABP_API_URL: targets.vercel.publicApiUrl,
    NEXT_PUBLIC_DEFAULT_TENANT_NAME: targets.vercel.defaultTenantName }).map(([key, value]) =>
    ({ key, value, type: 'plain', target: ['production'] }));
  const api = {
    gh: async route => {
      if (route === '') return { id: 789 };
      if (route === `/actions/runs/${q.ciRunId}/artifacts?per_page=100`)
        return { total_count: 1, artifacts: [artifact] };
      if (route === '/actions/artifacts/7891') return artifact;
      assert.equal(route, `/compare/${baselineSha}...${candidateSha}`);
      return { status: 'ahead', base_commit: { sha: baselineSha },
        merge_base_commit: { sha: baselineSha }, files };
    },
    artifact: async (owner, id) => {
      assert.equal(owner, 'source'); assert.equal(id, '7891'); return archive;
    },
    render: async (route, body) => {
      if (body !== undefined && route.startsWith(prefix)) {
        const key = route.slice(prefix.length);
        s.vars[key] = body.value;
        s.puts.push({ key, value: body.value });
        return { key, value: body.value };
      }
      if (route.startsWith(prefix)) {
        const key = route.slice(prefix.length);
        return { key, value: s.vars[key] };
      }
      if (route === servicePath) return structuredClone(service);
      if (route.endsWith('/deploys?limit=100')) return s.deploys.map(row => ({ deploy: row }));
      if (route === `${servicePath}/deploys`) {
        s.posts.push({ body });
        const id = s.deploys.some(row => row.id === 'dep-new') ? 'dep-restart' : 'dep-new';
        s.deploys = s.deploys.map(row => row.status === 'live' ? { ...row, status: 'deactivated' } : row);
        s.deploys.unshift({ id, status: 'created', commit: { id: candidateSha } });
        return { id, status: 'created', commit: { id: candidateSha } };
      }
      if (route === `${servicePath}/jobs`) {
        s.posts.push({ body });
        return { id: 'job-a'.padEnd(24, '0'), status: 'pending' };
      }
      if (route.includes('/jobs/job-')) {
        s.jobReads++;
        return { id: 'job-a'.padEnd(24, '0'), status: s.jobReads > 1 ? 'succeeded' : 'pending' };
      }
      const deploy = s.deploys.find(row => route.endsWith(`/deploys/${row.id}`));
      if (deploy) {
        s.deployReads[deploy.id] = (s.deployReads[deploy.id] ?? 0) + 1;
        if (s.deployReads[deploy.id] > 1) {
          deploy.status = 'live';
          for (const row of s.deploys) if (row.id !== deploy.id && row.status === 'live')
            row.status = 'deactivated';
        }
        return deploy;
      }
      throw new Error('Unexpected Render route ' + route);
    },
    vercel: async (path, body) => {
      if (body) {
        assert.equal(path, '/v13/deployments'); s.vercelPosts.push(body);
        s.deployed = { ...body, id: 'dpl_New', projectId: targets.vercel.id,
          target: 'production', readyState: 'BUILDING' };
        return s.deployed;
      }
      if (path.startsWith('/v6/')) return { deployments: [
        { uid: s.alias, state: 'READY', meta: incumbentMeta },
        ...(s.deployed ? [{ uid: 'dpl_New', state: s.deployed.readyState, meta: s.deployed.meta }] : [])] };
      if (path.startsWith('/v10/')) return { envs: inputRows() };
      if (path.includes('/domains/')) return { name: 'www.aqualifestyleclub.co.za',
        projectId: targets.vercel.id, verified: true };
      if (path.endsWith('/aliases')) return { aliases: [{ alias: 'www.aqualifestyleclub.co.za' }] };
      if (path.endsWith(`/v13/deployments/${incumbentId}`)) return { id: incumbentId,
        projectId: targets.vercel.id, target: 'production', readyState: 'READY', meta: incumbentMeta };
      if (path.endsWith('/dpl_New')) {
        s.deployed.readyState = s.failedVercel ? 'ERROR' : 'READY';
        if (!s.failedVercel) s.alias = 'dpl_New';
        return s.deployed;
      }
      assert.equal(path, `/v9/projects/${targets.vercel.id}`); return project();
    },
    health: async () => ({ status: 200, recovery: null, body: { result: { status: 'Healthy',
      buildId: s.deploys.find(row => row.status === 'live')?.commit.id ?? baselineSha,
      environment: 'Production', databaseStatus: 'Healthy', redisStatus: 'Healthy',
      dataProtectionKeyStoreStatus: 'Healthy', paymentAvailability: 'Available' } } }),
    readiness: async () => {
      s.readinessCalls++;
      return { status: 503, body: { status: 'Unavailable', birdConfiguration: 'Unavailable',
        yocoConfiguration: 'Unavailable', restrictedOperations: 'Unavailable' } };
    },
    web: async () => 200,
    webHealth: async (sha, expected) => {
      assert.equal(expected, 'Available');
      return { status: 'Healthy', buildId: sha, paymentAvailability: 'Available' };
    },
    uploadVercel: async () => { s.uploads++; },
    publicFetch: async url => {
      const path = new URL(url);
      assert.equal(path.origin, targets.vercel.productionUrl);
      if (path.pathname === '/login')
        return new Response('<script src="/_next/static/chunks/public-env.js"></script>');
      return new Response(`schema.parse({NEXT_PUBLIC_ABP_API_URL:${JSON.stringify(targets.vercel.publicApiUrl)},NEXT_PUBLIC_DEFAULT_TENANT_NAME:'Default',NEXT_PUBLIC_MONITORING_ENDPOINT:undefined})`);
    }
  };
  const options = { targets, policy: standingPolicy, validateRender, validateVercel, validateHealth,
    deploymentHistory, waitFor, releaseKey, frontendArchive,
    evidencePlan: { policySha256: q.policySha256, verifiedReleases: [], priorFailedRuns: [],
      baseline: null, resume: null, resumeChain: [], backendReleases: [],
      frontendReleases: [], combinedReleases: [] }, attempts: 3, pause: async () => {},
    guard: async () => {}, validateAdmission: () => {},
    ...(repo ? { env: { SOURCE_DIR: repo.dir } } : {}), now };
  const report = createAuditWriter(q, row => s.audit.push(row));
  report({ phase: 'evidence-selected', authorizationId: 'a'.repeat(64), evidenceSha256: 'b'.repeat(64),
    inventorySha256: 'c'.repeat(64), evidenceArtifactId: '123' });
  return { s, q, api, options, candidateSha, repo, execute: () =>
    deployBackendSuccessorRelease(api, q, report, options) };
}

test('combined release verifies the backend on Render then continues with the frontend phase', async () => {
  const f = combinedFixture();
  const providerEvents = [], render = f.api.render, vercel = f.api.vercel, upload = f.api.uploadVercel;
  f.api.render = async (path, body) => {
    if (body !== undefined) providerEvents.push('render-write');
    return render(path, body);
  };
  f.api.vercel = async (path, body) => {
    providerEvents.push(`${body === undefined ? 'vercel-read' : 'vercel-write'}:${path}`);
    return vercel(path, body);
  };
  f.api.uploadVercel = async (...args) => { providerEvents.push('vercel-write:upload'); return upload(...args); };
  await f.execute();
  assert.equal(f.s.readinessCalls, 0, 'backend and frontend phases do not call the Held-only endpoint');
  const firstWrite = providerEvents.indexOf('render-write');
  const beforeWrite = providerEvents.slice(0, firstWrite);
  assert.ok(firstWrite > 0 && [
    `/v9/projects/${targets.vercel.id}`,
    `/v13/deployments/${validateFailedFrontendRecord().observedVercel.deploymentId}`,
    `/v10/projects/${targets.vercel.id}/env?decrypt=false`,
    `/v9/projects/${targets.vercel.id}/domains/www.aqualifestyleclub.co.za`,
    `/v2/deployments/${validateFailedFrontendRecord().observedVercel.deploymentId}/aliases`
  ].every(path => beforeWrite.includes(`vercel-read:${path}`)) &&
    beforeWrite.some(row => row.startsWith('vercel-read:/v6/')),
  'current Vercel project, deployment, env, alias and history precede the first Render write');
  assert.ok(providerEvents.findIndex(row => row === 'vercel-write:upload') >
    providerEvents.lastIndexOf('render-write'), 'frontend upload follows verified backend transition');
  assert.ok(providerEvents.filter(row => row === `vercel-read:/v9/projects/${targets.vercel.id}`).length >= 4,
    'Vercel project is rechecked after the backend transition');
  assert.equal(f.s.posts.length, 1, 'exactly one Render deploy POST');
  assert.equal(f.s.puts.length, 2, 'payload and pin staged exactly once');
  assert.equal(f.s.vercelPosts.length, 1, 'exactly one Vercel deploy POST');
  assert.equal(f.s.vercelPosts[0].meta.aquaSourceSha, f.candidateSha);
  assert.equal(f.s.vercelPosts[0].meta.aquaFrontendRelease, undefined);
  assert.equal(f.s.vercelPosts[0].meta.aquaReleaseIdentity, releaseKey(f.q));
  assert.ok(f.s.uploads > 0);
  assert.deepEqual(f.s.audit.map(row => row.phase),
    ['evidence-selected', 'backend-baseline-selected', 'backend-decision-verified',
      'backend-classified', 'backend-successor-staging', 'backend-successor-staged',
      'backend-render-requesting', 'backend-render-requested', 'backend-render-ready',
      'backend-deployed', 'frontend-baseline-selected', 'frontend-classified',
      'frontend-vercel-files-requesting', 'frontend-vercel-files-uploaded',
      'frontend-vercel-requesting', 'frontend-vercel-requested', 'frontend-deployed']);
  assert.equal(f.s.audit[9].renderSha, f.candidateSha);
  assert.equal(f.s.audit[10].baselineRenderSha, baselineSha);
  assert.equal(f.s.audit[10].baselineRenderDeployId, 'dep-commissioned');
  assert.equal(f.s.audit[10].baselineVercelSourceProvenance, 'RECONCILED_FRONTEND_EFFECT');
  assert.equal(f.s.audit[10].servingRenderSha, f.candidateSha);
  assert.equal(f.s.audit[11].frontendFiles, 1);
  assert.equal(f.s.audit[11].backendFiles, 1);
  assert.equal(f.s.audit.at(-1).vercelDeployId, 'dpl_New');
  assert.equal(f.s.audit.at(-1).renderSha, f.candidateSha);
  assert.equal(f.s.audit.at(-1).webStatus, 200);
  assert.equal(f.s.deploys.filter(row => row.status === 'live').length, 1);
  assert.equal(f.s.readinessCalls, 0);
  const descriptor = { runId: f.q.releaseRunId, runAttempt: 1, sha: f.q.executorSha };
  const receipt = validateCombinedReceipt(f.s.audit, descriptor, targets);
  assert.equal(receipt.sha, f.candidateSha);
  assert.equal(receipt.combinedRelease, combinedMode);
  assert.equal(receipt.backendSuccessor, backendSuccessorMode);
  assert.equal(receipt.vercelDeployId, 'dpl_New');
  assert.equal(receipt.renderSha, f.candidateSha);
  assert.equal(receipt.renderDeployId, 'dep-new');
  assert.equal(receipt.schemaTransition, 'none');
  assert.equal(receipt.payloadPinSha256, f.s.puts[1].value);
  for (const mutate of [rows => rows.splice(12, 1),
    rows => rows[0].combinedRelease = 'other',
    rows => rows[10].baselineVercelSourceProvenance = 'BACKEND_VERIFIED_RENDER',
    rows => rows[11].frontendFiles = 0,
    rows => rows.at(-1).vercelSha = '0'.repeat(40)]) {
    const rows = structuredClone(f.s.audit); mutate(rows);
    assert.throws(() => validateCombinedReceipt(rows, descriptor, targets));
  }
});

test('combined release crosses additive migration 56, restart, backend verification and frontend deployment with legacy readiness unavailable', async () => {
  const migration56 = `${migrationsDir}/20261115113914_AddAQGreenIndependentRootRequests.cs`;
  const repo = sourceRepository(additiveMigrationSource.replaceAll('MembershipNote',
    'AddAQGreenIndependentRootRequests'), migration56);
  try {
    const f = combinedFixture({ repo, files: [
      { filename: `${targets.vercel.rootDirectory}/app/page.tsx`, status: 'modified' },
      { filename: migration56, status: 'added' },
      { filename: repo.designerPath.replace(`${repo.dir}/`, ''), status: 'added' },
      { filename: snapshotPath, status: 'modified' },
      { filename: backendModifiedPath, status: 'modified' }
    ] });
    fullReleaseBaselinePlan(f);
    f.s.deploys[0].id = 'dep-dbrgkstbedkc73difujg';
    await f.execute();
    assert.equal(f.s.readinessCalls, 0);
    assert.equal(f.s.posts.length, 3, 'candidate deploy, migration job, additive restart');
    assert.equal(f.s.posts[0].body.commitId, f.candidateSha);
    assert.equal(f.s.posts[1].body.startCommand, 'dotnet migrator/AqualLifeStyle.Migrator.dll');
    assert.deepEqual(f.s.posts[2].body, { deployMode: 'deploy_only' });
    assert.equal(f.s.puts.length, 4, 'initial and additive successor payloads are pinned');
    assert.equal(f.s.audit[3].schemaTransition, 'additive');
    assert.equal(f.s.audit[3].migrationFiles, 3);
    assert.deepEqual(f.s.audit.slice(9, 18).map(row => row.phase), [
      'backend-schema-job-requesting', 'backend-schema-job-created', 'backend-schema-job-succeeded',
      'backend-successor-restart-staging', 'backend-successor-restart-staged',
      'backend-restart-requesting', 'backend-restart-requested', 'backend-restart-ready', 'backend-deployed'
    ]);
    assert.equal(f.s.audit[17].renderDeployId, 'dep-restart');
    assert.equal(f.s.audit[17].successorEvidence.healthObservation.buildId, f.candidateSha);
    assert.equal(f.s.audit[17].successorEvidence.healthObservation.paymentAvailability, 'Available');
    assert.equal(f.s.audit[1].historicalD10Bindings.currentConfigurationDigest, '5'.repeat(64));
    assert.equal(f.s.vercelPosts.length, 1, 'frontend deployment follows backend verification');
    assert.ok(f.s.uploads > 0);
    const descriptor = { runId: f.q.releaseRunId, runAttempt: 1, sha: f.q.executorSha };
    const receipt = validateCombinedReceipt(f.s.audit, descriptor, targets);
    assert.equal(receipt.schemaTransition, 'additive');
    assert.equal(receipt.renderDeployId, 'dep-restart');
    assert.equal(receipt.vercelDeployId, 'dpl_New');
  } finally { repo.close(); }
});

test('combined release requires frontend changes in the delta', async () => {
  const f = combinedFixture({ files: [{ filename: backendModifiedPath, status: 'modified' }] });
  await assert.rejects(f.execute(), /COMBINED_RELEASE_REQUIRES_FRONTEND_DELTA/);
  assertNoProviderWrites(f);
});

test('combined release denies missing Vercel credentials and missing or drifted aliases before any provider write', async () => {
  const noCredential = combinedFixture();
  noCredential.api.vercel = async () => { throw Error('PROVIDER_READ_REJECTED'); };
  await assert.rejects(noCredential.execute(), /PROVIDER_READ_REJECTED/);
  assertNoProviderWrites(noCredential);

  for (const aliases of [[], [{ alias: 'unrelated.example' }]]) {
    const f = combinedFixture(), vercel = f.api.vercel;
    f.api.vercel = (path, body) => path.endsWith('/aliases') ? { aliases } : vercel(path, body);
    await assert.rejects(f.execute(), /FRONTEND_INCUMBENT_ALIAS_DRIFT/);
    assertNoProviderWrites(f);
  }

  const wrongProject = combinedFixture(), projectRead = wrongProject.api.vercel;
  wrongProject.api.vercel = async (path, body) => path === `/v9/projects/${targets.vercel.id}` ?
    { ...await projectRead(path, body), id: 'prj_foreign' } : projectRead(path, body);
  await assert.rejects(wrongProject.execute(), /FRONTEND_CONFIGURATION_UNVERIFIED/);
  assertNoProviderWrites(wrongProject);

  const wrongInputs = combinedFixture(), envRead = wrongInputs.api.vercel;
  wrongInputs.api.vercel = async (path, body) => {
    const response = await envRead(path, body);
    if (path.startsWith('/v10/'))
      response.envs.find(row => row.key === 'NEXT_PUBLIC_ABP_API_URL').value = 'https://foreign.example';
    return response;
  };
  await assert.rejects(wrongInputs.execute(), /FRONTEND_CONFIGURATION_UNVERIFIED/);
  assertNoProviderWrites(wrongInputs);
});

const fullReleaseBaselinePlan = f => {
  const { backendSuccessor, combinedRelease, ...originalIdentity } = f.q;
  f.options.evidencePlan.baseline = { runId: '123', runAttempt: 1, sha: f.q.executorSha };
  const identity = { ...originalIdentity, sha: baselineSha, ciRunId: '123',
    releaseRunId: '123', phase: 'verified', renderSha: baselineSha, vercelSha: baselineSha,
    renderDeployId: 'dep-dbrgkstbedkc73difujg', vercelDeployId: 'dpl_Old',
    renderReleaseRunAttempt: 1, vercelReleaseRunAttempt: 1 };
  const d10RuntimeBindings = { requiredAssemblyDigest: '2'.repeat(64),
    requiredRuntimeAssemblyDigest: '3'.repeat(64), currentConfigurationDigest: '5'.repeat(64),
    intendedConfigurationDigest: '6'.repeat(64), intendedEnvironmentId: 'production-release',
    intendedBuildId: baselineSha };
  f.options.baselineRows = [
    { ...identity, phase: 'provider-read', scope: 'readiness-bindings', d10RuntimeBindings },
    { ...identity, d10RuntimeBindings }
  ];
  f.options.validateBaselineReceipt = validateBaselineReceipt;
};

test('combined release binds the live Render deployment to its authenticated full-release baseline', async () => {
  const f = combinedFixture();
  fullReleaseBaselinePlan(f);
  f.s.deploys[0].id = 'dep-foreign'; // Same source SHA, different unreceipted deployment.
  await assert.rejects(f.execute(), /BACKEND_RENDER_DRIFT/);
  assertNoProviderWrites(f);
  assert.equal(f.s.audit.some(row => row.phase === 'backend-baseline-selected'), false);
});

test('combined admission accepts the live deployment matching the full-release receipt identity', async () => {
  const f = combinedFixture();
  fullReleaseBaselinePlan(f);
  f.s.deploys[0].id = 'dep-dbrgkstbedkc73difujg';
  await f.execute();
  assert.equal(f.s.audit[1].baselineRenderDeployId, 'dep-dbrgkstbedkc73difujg');
  assert.equal(f.s.audit[1].baselineRenderProvenance, 'FULL_RELEASE_RECEIPT');
  assert.equal(f.s.puts.length, 2);
  assert.equal(f.s.posts.length, 1);
  const descriptor = { runId: f.q.releaseRunId, runAttempt: 1, sha: f.q.executorSha };
  const receipt = validateCombinedReceipt(f.s.audit, descriptor, targets);
  assert.equal(receipt.renderDeployId, 'dep-new');
  assert.equal(receipt.sha, f.candidateSha);
});

test('combined baseline rejects historical D10 binding mismatch before provider writes', async () => {
  const f = combinedFixture();
  fullReleaseBaselinePlan(f);
  f.options.baselineRows[0].d10RuntimeBindings.intendedConfigurationDigest = '8'.repeat(64);
  f.options.baselineRows[1].d10RuntimeBindings.intendedConfigurationDigest = '8'.repeat(64);
  await assert.rejects(f.execute(), /BACKEND_COMMISSIONED_STATE_CHANGED/);
  assertNoProviderWrites(f);
});

test('combined successor rejects changed Normal provider configuration after additive restart', async () => {
  const migration56 = `${migrationsDir}/20261115113914_AddAQGreenIndependentRootRequests.cs`;
  const repo = sourceRepository(additiveMigrationSource.replaceAll('MembershipNote',
    'AddAQGreenIndependentRootRequests'), migration56);
  try {
    const f = combinedFixture({ repo, files: [
      { filename: `${targets.vercel.rootDirectory}/app/page.tsx`, status: 'modified' },
      { filename: migration56, status: 'added' },
      { filename: repo.designerPath.replace(`${repo.dir}/`, ''), status: 'added' },
      { filename: snapshotPath, status: 'modified' },
      { filename: backendModifiedPath, status: 'modified' }
    ] });
    const render = f.api.render;
    const seen = new Map();
    f.api.render = async (route, body) => {
      const result = await render(route, body);
      if (route.startsWith(`/services/${targets.render.id}/env-vars/`) && body === undefined &&
        normalRuntimeSettings[result.key]) {
        const count = (seen.get(result.key) ?? 0) + 1;
        seen.set(result.key, count);
        if (count === 2) return { ...result, value: 'false' };
      }
      return result;
    };
    await assert.rejects(f.execute(), /BACKEND_DEPLOYMENT_UNVERIFIABLE/);
    assert.equal(f.s.posts.length, 3, 'candidate, migration job, and additive restart occurred');
    assert.equal(f.s.audit.at(-1).phase, 'backend-restart-ready');
    assert.equal(f.s.vercelPosts.length, 0, 'frontend is blocked by successor configuration drift');
  } finally { repo.close(); }
});

test('combined admission accepts the later same-SHA deployment authenticated by the pinned reconciliation', async () => {
  const f = combinedFixture();
  fullReleaseBaselinePlan(f);
  const pinned = validateFailedFrontendRecord().observedBackend;
  assert.equal(pinned.renderSha, baselineSha);
  f.s.deploys[0] = { id: pinned.renderDeployId, status: 'live', commit: { id: baselineSha } };
  await f.execute();
  assert.equal(f.s.audit[1].baselineRenderDeployId, pinned.renderDeployId);
  assert.equal(f.s.audit[1].baselineRenderProvenance, 'RECONCILED_LATER_OBSERVATION');
  assert.equal(f.s.puts.length, 2);
  assert.equal(f.s.posts.length, 1);
  const descriptor = { runId: f.q.releaseRunId, runAttempt: 1, sha: f.q.executorSha };
  const receipt = validateCombinedReceipt(f.s.audit, descriptor, targets);
  assert.equal(receipt.renderDeployId, 'dep-new');
  assert.equal(receipt.renderSha, f.candidateSha);
  assert.equal(receipt.schemaTransition, 'none');
});

test('combined admission rejects the reconciled observation once the commissioned receipt names another build', async () => {
  const f = combinedFixture();
  fullReleaseBaselinePlan(f);
  const pinned = validateFailedFrontendRecord().observedBackend;
  f.s.deploys[0] = { id: pinned.renderDeployId, status: 'live', commit: { id: baselineSha } };
  f.options.baselineRows = f.options.baselineRows.map(row => ({ ...row, sha: 'c'.repeat(40),
    renderSha: 'c'.repeat(40), vercelSha: 'c'.repeat(40),
    d10RuntimeBindings: { ...row.d10RuntimeBindings, intendedBuildId: 'c'.repeat(40) } }));
  await assert.rejects(f.execute(), /BACKEND_RENDER_DRIFT/);
  assert.equal(f.s.puts.length, 0);
  assert.equal(f.s.posts.length, 0);
  assert.equal(f.s.vercelPosts.length, 0);
});

test('combined admission rejects the reconciled deployment identity on a different source revision', async () => {
  const f = combinedFixture();
  fullReleaseBaselinePlan(f);
  const pinned = validateFailedFrontendRecord().observedBackend;
  f.s.deploys[0] = { id: pinned.renderDeployId, status: 'live', commit: { id: 'c'.repeat(40) } };
  f.s.vars.Deployment__BuildId = 'c'.repeat(40);
  await assert.rejects(f.execute(), /BACKEND_RENDER_DRIFT/);
  assert.equal(f.s.puts.length, 0);
  assert.equal(f.s.posts.length, 0);
  assert.equal(f.s.vercelPosts.length, 0);
});

test('combined receipt authentication re-derives the reconciled Render baseline from the pinned record', async () => {
  const f = combinedFixture();
  fullReleaseBaselinePlan(f);
  const pinned = validateFailedFrontendRecord().observedBackend;
  f.s.deploys[0] = { id: pinned.renderDeployId, status: 'live', commit: { id: baselineSha } };
  await f.execute();
  const descriptor = { runId: f.q.releaseRunId, runAttempt: 1, sha: f.q.executorSha };
  validateCombinedReceipt(structuredClone(f.s.audit), descriptor, targets);
  for (const mutate of [
    rows => rows[1].baselineRenderProvenance = 'UNKNOWN_PROVENANCE',
    rows => { rows[1].baselineRenderProvenance = 'RECONCILED_LATER_OBSERVATION';
      rows[1].baselineRenderDeployId = 'dep-foreign'; },
    rows => { rows[1].baselineRenderProvenance = 'RECONCILED_LATER_OBSERVATION';
      rows[1].baselineRenderSha = 'c'.repeat(40); }]) {
    const rows = structuredClone(f.s.audit);
    mutate(rows);
    assert.throws(() => validateCombinedReceipt(rows, descriptor, targets));
  }
});

test('combined release rechecks the initial Vercel incumbent after Render and never uploads on alias drift', async () => {
  const f = combinedFixture(), render = f.api.render;
  f.api.render = async (path, body) => {
    const response = await render(path, body);
    if (path === `/services/${targets.render.id}/deploys` && body?.commitId === f.candidateSha)
      f.s.alias = 'dpl_Foreign';
    return response;
  };
  await assert.rejects(f.execute(), /FRONTEND_INCUMBENT_ALIAS_DRIFT/);
  assert.equal(f.s.puts.length, 2);
  assert.equal(f.s.posts.length, 1);
  assert.equal(f.s.deploys.filter(row => row.status === 'live')[0].commit.id, f.candidateSha);
  assert.ok(f.s.audit.some(row => row.phase === 'backend-deployed'));
  assert.equal(f.s.audit.some(row => row.phase === 'frontend-deployed'), false);
  assert.equal(f.s.vercelPosts.length, 0);
  assert.equal(f.s.uploads, 0);
  const descriptor = { runId: f.q.releaseRunId, runAttempt: 1, sha: f.q.executorSha };
  assert.throws(() => validateCombinedReceipt(f.s.audit, descriptor, targets));
});

test('combined release failure in the frontend phase leaves the released backend intact', async () => {
  const f = combinedFixture({ failedVercel: true });
  await assert.rejects(f.execute(), /PROVIDER_DEPLOYMENT_FAILED_INSPECT_RELEASE_REPORT/);
  assert.equal(f.s.puts.length, 2, 'backend staging already happened');
  assert.equal(f.s.posts.length, 1, 'backend deployed exactly once');
  const live = f.s.deploys.filter(row => row.status === 'live');
  assert.equal(live.length, 1);
  assert.equal(live[0].commit.id, f.candidateSha);
  assert.equal(f.s.audit.some(row => row.phase === 'frontend-deployed'), false);
  const descriptor = { runId: f.q.releaseRunId, runAttempt: 1, sha: f.q.executorSha };
  assert.throws(() => validateCombinedReceipt(f.s.audit, descriptor, targets));
});
