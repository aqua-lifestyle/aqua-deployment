// Provider substitutes reused from PR106's controller tests, not live evidence.
import {readFileSync,mkdtempSync,writeFileSync,utimesSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {generateKeyPairSync, sign, randomUUID} from 'node:crypto';
import {deploy,createAuditWriter,freezeCandidate,validateRun,targets,standingPolicy,requiredJobs,admissionJobName} from '../release-control.mjs';
import {attestationContractVersion,mandatoryInventoryDigest} from '../authorization-attestation.mjs';
import {approvedInventory,inventoryDigest,sha256,validateArtifact,createGitHubAdmission} from '../github-evidence.mjs';
import {runtimeSettings} from '../runtime-readiness.mjs';
export const fixtureNow = Date.UTC(2026,9,19,8);
export function zipFixture(filename, bytes, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(),'aqua-zip-fixture-'));
  try {
    for (const [name, value] of Object.entries({[filename]:bytes,...extra})) {
      const path=join(dir,name);writeFileSync(path,value);utimesSync(path,946684800,946684800);
    }
    execFileSync('zip',['-X','-q',join(dir,'artifact.zip'),filename,...Object.keys(extra)],{cwd:dir,stdio:['ignore','pipe','pipe']});
    return readFileSync(join(dir,'artifact.zip'));
  } finally {rmSync(dir,{recursive:true,force:true});}
}
const source = 'c'.repeat(40), previous = 'b'.repeat(40);
const run = () => ({ id: 123, run_attempt: 1, repository: { full_name: targets.repository },
  head_repository: { full_name: targets.repository }, event: 'push', head_branch: 'main',
  head_sha: source, path: '.github/workflows/ci.yml', name: 'Continuous integration',
  status: 'completed', conclusion: 'success', updated_at:new Date(fixtureNow-1000).toISOString(),html_url: 'https://github.com/example/ci/123' });
const jobs = (attempt = 1) => requiredJobs.map((name,index) => ({ id:index+100,check_run_url:`https://api.github.com/repos/${targets.repository}/check-runs/${index+200}`, name, status: 'completed', conclusion: 'success',
  run_id: 123, run_attempt: attempt }));
const ciQualified = () => validateRun(run(), jobs(), source);
const qualified = () => freezeCandidate(ciQualified(), runnerEnv(), policy());
const environment = () => ({ name: targets.environment, can_admins_bypass: false,
  deployment_branch_policy: { custom_branch_policies: true, protected_branches: false },
  protection_rules: [{ type: 'branch_policy' }] });
const branches = () => [{ name: 'main', type: 'branch' }];
const runnerEnv = (attempt = 1) => ({ GITHUB_REPOSITORY: targets.executor.repository, GITHUB_SHA:'d'.repeat(40), GITHUB_WORKFLOW_SHA:'d'.repeat(40),
  GITHUB_RUN_ID: '456', GITHUB_RUN_ATTEMPT: String(attempt), GITHUB_REF: 'refs/heads/main',
  GITHUB_WORKFLOW_REF: `${targets.executor.repository}/.github/workflows/deploy.yml@refs/heads/main`,
  RENDER_API_KEY: 'synthetic-render-key', VERCEL_TOKEN: 'synthetic-vercel-token' });
const policy = () => ({ ...standingPolicy });
const installedGovernance = JSON.parse(readFileSync(new URL('./installed-main-governance.json', import.meta.url)));
const governance = () => structuredClone(installedGovernance.rules);
const service = () => ({ id: targets.render.id, name: targets.render.name,
  repo: 'https://github.com/' + targets.repository, branch: 'main', suspended: 'not_suspended',
  autoDeployTrigger: 'off', autoDeploy: 'no', rootDir: '', serviceDetails: {
    runtime: 'docker', healthCheckPath: '/api/health', envSpecificDetails: { dockerContext: '.',
      dockerfilePath: './docker/api/Dockerfile', preDeployCommand: '', dockerCommand: '' } } });
const heldKeys = ['App__WeeklyCommissions__Enabled', 'App__EntryMonthlyObligations__Enabled',
  'App__FinancialOperations__Enabled', 'App__BackgroundJobs__Enabled', 'AQGreenV2Demo__Enabled',
  'AQGreenV2Pilot__Enabled', 'App__AQGreenV2__Commissioning__Enabled', 'SEED_DEMO_DATA', 'Bird__Enabled'];
const variables = () => Object.entries(Object.fromEntries(Object.entries(runtimeSettings).map(([key,allowed])=>[key,allowed[0]])))
  .map(([key, value]) => ({ envVar: { key, value } }));
const project = () => ({ id: targets.vercel.id, name: targets.vercel.name, accountId: targets.vercel.teamId,
  rootDirectory: targets.vercel.rootDirectory, nodeVersion: '24.x', autoAssignCustomDomains: true,
  link: { type: 'github', repoId: '789', repo: 'aqua-lifestyle', org: 'aqua-lifestyle', productionBranch: 'main' },
  targets: { production: { id: 'dpl_Baseline' } } });
const publicVars = () => [
  { id: 'public-api', key: 'NEXT_PUBLIC_ABP_API_URL', value: targets.vercel.publicApiUrl, target: ['production'] },
  { id: 'public-tenant', key: 'NEXT_PUBLIC_DEFAULT_TENANT_NAME', value: 'Default', target: ['production'] }
];
const health = sha => ({ status: 200, recovery: null, body: { result: { status: 'Healthy',
  buildId: sha, environment: 'Production', databaseStatus: 'Healthy', redisStatus: 'Healthy',
  dataProtectionKeyStoreStatus: 'Healthy' } } });
const immediate = { attempts: 3, pause: async () => {} };
const signer = generateKeyPairSync('ed25519');
const verifier = { identity: 'fixture-verifier', repository: 'UNCONFIGURED', workflow: 'UNCONFIGURED', revision: 'e'.repeat(40) };
const testInventory = [
  { id: 'AQUA-SEC-0001', file: 'tools/deployment/release-control.test.mjs',
    name: 'successful full push inventory qualifies the exact current main source',
    definitionSha256: '66852c046d7f4de7e8411865559eb7ca6f0943228aea0f8c02bca62a24753e45', expectedExecutions: 1 },
  { id: 'AQUA-SEC-0002', file: 'tools/deployment/release-control.test.mjs',
    name: 'unqualified CI conclusion=failure cannot qualify a source candidate',
    definitionSha256: '66852c046d7f4de7e8411865559eb7ca6f0943228aea0f8c02bca62a24753e45', expectedExecutions: 1 }
];
class ReplayStore {
  ids = new Set(); keys = new Set();
  async consumeOnce({attestationId, replayKey}) {
    if (this.ids.has(attestationId) || this.keys.has(replayKey)) return false;
    this.ids.add(attestationId); this.keys.add(replayKey); return true;
  }
}
function authorizationFor(qualified, edit = x => x) {
  const policyVersion = 'fixture-policy-v1';
  const audience = `${targets.executor.repository}:${targets.environment}`;
  const publicKeyPem = signer.publicKey.export({type:'spki',format:'pem'});
  const mandatoryChecks=requiredJobs.map(context=>({context,integrationId:15368}));
  const expected = { audience, policyVersion, policyDigest: qualified.policySha256,
    source:{repository:qualified.repository,commitSha:qualified.sha,ciRunId:qualified.ciRunId,ciRunAttempt:qualified.ciRunAttempt},
    verifier, mandatoryChecks,
    tests:testInventory };
  const trustRoot = {version:1,audience,policy:{version:policyVersion,sha256:qualified.policySha256,status:'active',
    inventorySha256:mandatoryInventoryDigest(mandatoryChecks,testInventory)},
    maxLifetimeSeconds:300,clockSkewSeconds:30,revokedPolicies:[],revokedKeyIds:[],revokedAttestationIds:[],
    issuers:[{identity:'fixture-issuer',keyId:'fixture-key',status:'active',publicKeyPem,verifier}]};
  const now = Date.now();
  const claim = edit({contract:'aqua.deployment.authorization-attestation',version:attestationContractVersion,
    attestationId:randomUUID(),issuer:{identity:'fixture-issuer',keyId:'fixture-key'},verifier,audience,
    source:expected.source,policy:{version:policyVersion,sha256:qualified.policySha256},
    issuedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+60_000).toISOString(),
    mandatoryChecks:expected.mandatoryChecks.map(x=>({...x,status:'completed',conclusion:'success',
      commitSha:qualified.sha,ciRunId:qualified.ciRunId,ciRunAttempt:qualified.ciRunAttempt})),
    tests:testInventory.map(x=>({id:x.id,file:x.file,name:x.name,definitionSha256:x.definitionSha256,
      outcome:'passed',executions:x.expectedExecutions})),executionEvidenceSha256:'f'.repeat(64),verdict:'PASS'});
  const canonical = value => value && typeof value==='object' ? Array.isArray(value) ? value.map(canonical) :
    Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])) : value;
  const payload=Buffer.from(JSON.stringify(canonical(claim)));
  return {expected,trustRoot,replayStore:new ReplayStore(),now:()=>now,
    envelope:{keyId:'fixture-key',payload:payload.toString('base64url'),
      signature:sign(null,payload,signer.privateKey).toString('base64url')}};
}

function fixture() {
  const state = { service: service(), vars: variables(), project: project(),
    main: source, jobCount: requiredJobs.length, files: [], renderRows: [
      { id: 'dep-baseline', status: 'live', commit: { id: previous } }], vercelRows: [],
    candidate: qualified(), policy: policy(), env: runnerEnv(), receiptRows: undefined, baselineRows: undefined,
    rules: governance(), ruleset: structuredClone(installedGovernance.ruleset),
    environment: environment(), branches: branches(),
    pr: { number: 1, merged: true, state: 'closed', merge_commit_sha: source,
      base: { ref: 'main', repo: { full_name: targets.repository } }, head: { sha: 'd'.repeat(40) },
      user: { login: 'author', id: 1 }, merged_at: '2026-10-16T10:00:00Z' },
    publicVars: publicVars(), newRender: undefined, newVercel: undefined, renderReads: 0, vercelReads: 0,
    providerCalls: 0 };
  state.report={version:1,context:{kind:'ci',repository:targets.repository,sha:source,runId:'123',runAttempt:1},
    inventorySha256:inventoryDigest,exitCode:0,
    results:approvedInventory.tests.map(t=>({...t,outcome:'passed',executions:1})),
    summary:{tests:240,passed:240,failed:0,cancelled:0,skipped:0,todo:0,suites:0}};
  state.sourceDigests=new Map([...approvedInventory.sources.map(s=>[s.path,s.sha256]),
    ['tools/deployment/mandatory-security-tests.json',inventoryDigest]]);
  const readSourceDigest=async path=>state.sourceDigests.get(path);
  const reportZip=()=>zipFixture('report.json',JSON.stringify(state.report));
  const artifact=()=>({id:7890,name:`mandatory-security-${state.candidate.sha}-123-1`,expired:false,
    size_in_bytes:reportZip().length,digest:`sha256:${sha256(reportZip())}`,
    workflow_run:{id:123,repository_id:789,head_repository_id:789,head_sha:state.candidate.sha,head_branch:'main'}});
  // Freeze known-good admission before hostile mutations. Do not invoke the
  // verifier here: negatives must reach deploy(), not fail inside a test helper.
  const baselineEvidence={version:1,mode:'github-evidence-v1',repository:targets.repository,sha:source,
    ciRunId:'123',ciRunAttempt:1,completedAt:run().updated_at,policySha256:state.candidate.policySha256,
    inventorySha256:inventoryDigest,artifact:validateArtifact(artifact(),'123',source,artifact().name,789),
    reportSha256:sha256(JSON.stringify(state.report)),testsVerified:240};
  const initialAdmission=createGitHubAdmission(state.candidate,state.policy,baselineEvidence,()=>fixtureNow);
  const posts = [], reports = [];
  const api = {
    gh: async route => {
      if (route.startsWith('/check-runs/')) { const job=jobs().find(j=>j.check_run_url.endsWith(route)); return {id:Number(route.split('/').at(-1)),app:{id:15368},head_sha:source,name:job.name,status:'completed',conclusion:'success'}; }
      if (route === '') return { id: 789 };
      if (route === '/actions/runs/123') return run();
      if (route === '/actions/runs/123/artifacts?per_page=100') return {total_count:1,artifacts:[artifact()]};
      if (route === '/actions/artifacts/7890') return artifact();
      if (route.includes('/jobs?')) return { total_count: state.jobCount, jobs: jobs() };
      if (route === '/git/ref/heads/main') return { object: { sha: state.main } };
      if (route.startsWith('/compare/')) return { status: 'ahead', files: state.files };
      if (route === '/rules/branches/main?per_page=100') return state.rules;
      if (route === '/rulesets/25297647') return state.ruleset;
      if (route.endsWith('/deployment-branch-policies?per_page=100'))
        return { total_count: state.branches.length, branch_policies: state.branches };
      if (route === `/environments/${targets.environment}`) return state.environment;
      if (route.startsWith('/commits/') && route.endsWith('/pulls?per_page=100')) return [state.pr];
      if (route === '/pulls/1') return structuredClone(state.pr);
      throw new Error('Unexpected GitHub fixture route');
    },
    render: async (route, body) => {
      state.providerCalls++;
      if (body) { posts.push({ provider: 'render', route, body });
        state.newRender = { id: 'dep-new', status: 'build_in_progress', commit: { id: source } };
        state.renderRows.unshift(state.newRender);
        return structuredClone(state.newRender); }
      if (route.includes('/env-vars/')) return state.vars.find(x=>x.envVar.key===route.split('/env-vars/')[1])?.envVar;
      if (route.endsWith('/deploys?limit=100')) return state.renderRows.map(deploy => ({ deploy }));
      if (route.endsWith('/deploys/dep-baseline')) return state.renderRows.find(x => x.id === 'dep-baseline');
      if (route.endsWith('/deploys/dep-new')) {
        if (++state.renderReads > 1) {
          state.newRender.status = 'live';
          for (const row of state.renderRows) if (row.id !== state.newRender.id && row.status === 'live') row.status = 'deactivated';
        }
        return state.newRender;
      }
      return state.service;
    },
    vercel: async (route, body) => {
      state.providerCalls++;
      if (body) { posts.push({ provider: 'vercel', route, body });
        state.newVercel = { id: 'dpl_New', readyState: 'BUILDING', target: 'production',
          projectId: targets.vercel.id, gitSource: { sha: source, repoId: '789' }, meta: body.meta };
        return structuredClone(state.newVercel); }
      if (route.startsWith('/v9/')) return state.project;
      if (route.startsWith('/v10/')) return { envs: state.publicVars };
      if (route.startsWith('/v1/projects/')) return state.publicVars.find(row=>route.endsWith('/'+row.id));
      if (route.startsWith('/v6/')) return { deployments: state.vercelRows };
      if (route.endsWith('/dpl_Baseline')) return { id: 'dpl_Baseline', projectId: targets.vercel.id,
        target: 'production', readyState: 'READY', gitSource: { sha: previous, repoId: '789' } };
      if (route.endsWith('/dpl_New')) {
        if (++state.vercelReads > 1) {
          state.newVercel.readyState = 'READY'; state.project.targets.production.id = 'dpl_New';
        }
        return state.newVercel;
      }
      throw new Error('Unexpected Vercel fixture route');
    },
    health: async () => health(state.newRender?.status === 'live' ? source : previous),
    readiness: async sha => ({status:200,body:{contract:'aqua.production-readiness',version:1,status:'Ready',
      buildId:sha,birdConfiguration:'StartupValidated',yocoConfiguration:'StartupValidated',
      profile:'normal-integrated',restrictedOperations:'ConfigurationHeld'}}),
    web: async () => {}
  };
  const sourceApi=api.gh;
  api.artifact=async (owner,id)=>{
    if(owner==='source'&&id==='7890')return reportZip();
    throw Error('Unexpected fixture artifact');
  };
  api.gh=async(route,...args)=>route.startsWith('/actions/workflows/release.yml/runs?') ?
    {total_count:1,workflow_runs:[{id:38912818702,run_number:1,run_attempt:1,
      repository:{full_name:targets.repository},head_repository:{full_name:targets.repository},
      path:'.github/workflows/release.yml',head_branch:'main',event:'workflow_run',status:'completed',name:'Qualified production release'}]} :
    route.startsWith('/actions/runs/38912818702/') ? {total_count:2,jobs:[{name:'Qualify immutable source candidate'},
      {name:'Unattended recovery release',conclusion:'skipped'}]} : sourceApi(route,...args);
  api.executor=async route=>{
    if(route==='')return {id:987};
    if(route.startsWith('/commits/')&&route.endsWith('/pulls?per_page=100'))return [{number:1,
      merge_commit_sha:route.split('/')[2],merged_at:'2026-10-19T07:00:00Z',base:{ref:'main',repo:{full_name:targets.executor.repository}}}];
    if(route==='/pulls/1')return {number:1,merged:true,state:'closed',merge_commit_sha:state.candidate.executorSha,
      merged_at:'2026-10-19T07:00:00Z',base:{ref:'main',repo:{full_name:targets.executor.repository}},merged_by:{login:'Xolani-M',id:86495928}};
    if(route.startsWith('/actions/workflows/deploy.yml/runs?'))return {total_count:1,workflow_runs:[await api.executor(`/actions/runs/${state.candidate.releaseRunId}`)]};
    if(route==='/git/ref/heads/main')return {object:{sha:state.candidate.executorSha}};
    if(route===`/actions/runs/${state.candidate.releaseRunId}`)return {id:Number(state.candidate.releaseRunId),
      run_attempt:state.candidate.releaseRunAttempt,run_number:1,head_sha:state.candidate.executorSha,head_branch:'main',
      event:'workflow_dispatch',path:'.github/workflows/deploy.yml',name:'Qualified production executor',status:'in_progress',
      repository:{full_name:targets.executor.repository},head_repository:{full_name:targets.executor.repository}};
    if(route.startsWith(`/actions/runs/${state.candidate.releaseRunId}/attempts/${state.candidate.releaseRunAttempt}/jobs?`))
      return {total_count:3,jobs:[
        {name:'Qualify immutable source candidate',run_id:Number(state.candidate.releaseRunId),run_attempt:state.candidate.releaseRunAttempt,status:'completed',conclusion:'success'},
        {name:admissionJobName,run_id:Number(state.candidate.releaseRunId),run_attempt:state.candidate.releaseRunAttempt,status:'completed',conclusion:'success'},
        {name:'Unattended recovery release',run_id:Number(state.candidate.releaseRunId),run_attempt:state.candidate.releaseRunAttempt,status:'in_progress',conclusion:null}
      ]};
    if(route.startsWith('/environments/'))return sourceApi(route);
    if(route.startsWith('/rules/branches/main'))return ['deletion','non_fast_forward'].map(type=>({type,ruleset_id:99}));
    if(route==='/rulesets/99')return {enforcement:'active',source:targets.executor.repository,source_type:'Repository',target:'branch',bypass_actors:[],rules:[{type:'deletion'},{type:'non_fast_forward'}]};
    throw Error('Unexpected executor route '+route);
  };
  const execute = async (options = {}) => {
    const admissionReceipt=Object.hasOwn(options,'admissionReceipt')?options.admissionReceipt:
      structuredClone(initialAdmission);
    return deploy(api, state.candidate, state.policy,
      createAuditWriter(state.candidate, r => reports.push(r)), { ...immediate, env: state.env,
        admissionReceipt,readSourceDigest,now:()=>fixtureNow,
        evidencePlan: state.plan ?? {policySha256:state.candidate.policySha256,verifiedReleases:[],baseline:null,resume:null,resumeChain:[]},
        receiptRows: state.receiptRows, baselineRows: state.baselineRows });
  };
  return { state, api, posts, reports, execute, authorizationFor,readSourceDigest };
}


export {fixture,qualified,runnerEnv,source,previous,run,jobs};
