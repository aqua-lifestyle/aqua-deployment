// Provider substitutes reused from PR106's controller tests, not live evidence.
import {readFileSync} from 'node:fs';
import {deploy,createAuditWriter,freezeCandidate,validateRun,targets,standingPolicy,requiredJobs} from '../release-control.mjs';
const source = 'c'.repeat(40), previous = 'b'.repeat(40);
const run = () => ({ id: 123, run_attempt: 1, repository: { full_name: targets.repository },
  head_repository: { full_name: targets.repository }, event: 'push', head_branch: 'main',
  head_sha: source, path: '.github/workflows/ci.yml', name: 'Continuous integration',
  status: 'completed', conclusion: 'success', html_url: 'https://github.com/example/ci/123' });
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
const variables = () => Object.entries({ ASPNETCORE_ENVIRONMENT: 'Production',
  App__Recovery__Enabled: 'true', ...Object.fromEntries(heldKeys.map(k => [k, 'false'])) })
  .map(([key, value]) => ({ envVar: { key, value } }));
const project = () => ({ id: targets.vercel.id, name: targets.vercel.name, accountId: targets.vercel.teamId,
  rootDirectory: targets.vercel.rootDirectory, nodeVersion: '24.x', autoAssignCustomDomains: true,
  link: { type: 'github', repoId: '789', repo: 'aqua-lifestyle', org: 'aqua-lifestyle', productionBranch: 'main' },
  targets: { production: { id: 'dpl_Baseline' } } });
const publicVars = () => [
  { key: 'NEXT_PUBLIC_ABP_API_URL', value: targets.vercel.publicApiUrl, target: ['production'] },
  { key: 'NEXT_PUBLIC_DEFAULT_TENANT_NAME', value: 'Default', target: ['production'] }
];
const health = sha => ({ status: 200, recovery: 'true', body: { result: { status: 'Healthy',
  buildId: sha, environment: 'Production', databaseStatus: 'Healthy', redisStatus: 'Healthy',
  dataProtectionKeyStoreStatus: 'Healthy' } } });
const immediate = { attempts: 3, pause: async () => {} };

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
    publicVars: publicVars(), newRender: undefined, newVercel: undefined, renderReads: 0, vercelReads: 0 };
  const posts = [], reports = [];
  const api = {
    gh: async route => {
      if (route.startsWith('/check-runs/')) { const job=jobs().find(j=>j.check_run_url.endsWith(route)); return {id:Number(route.split('/').at(-1)),app:{id:15368},head_sha:source,name:job.name,status:'completed',conclusion:'success'}; }
      if (route === '') return { id: 789 };
      if (route === '/actions/runs/123') return run();
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
      if (body) { posts.push({ provider: 'render', route, body });
        state.newRender = { id: 'dep-new', status: 'build_in_progress', commit: { id: source } };
        state.renderRows.unshift(state.newRender);
        return structuredClone(state.newRender); }
      if (route.endsWith('/env-vars?limit=100')) return state.vars;
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
      if (body) { posts.push({ provider: 'vercel', route, body });
        state.newVercel = { id: 'dpl_New', readyState: 'BUILDING', target: 'production',
          projectId: targets.vercel.id, gitSource: { sha: source, repoId: '789' }, meta: body.meta };
        return structuredClone(state.newVercel); }
      if (route.startsWith('/v9/')) return state.project;
      if (route.startsWith('/v10/')) return { envs: state.publicVars };
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
    web: async () => {}
  };
  const sourceApi=api.gh;
  api.gh=async(route,...args)=>route.startsWith('/actions/workflows/release.yml/runs?') ?
    {total_count:1,workflow_runs:[{id:38912818702,run_number:1,run_attempt:1,
      repository:{full_name:targets.repository},head_repository:{full_name:targets.repository},
      path:'.github/workflows/release.yml',head_branch:'main',event:'workflow_run',status:'completed',name:'Qualified production release'}]} :
    route.startsWith('/actions/runs/38912818702/') ? {total_count:2,jobs:[{name:'Qualify immutable source candidate'},
      {name:'Unattended recovery release',conclusion:'skipped'}]} : sourceApi(route,...args);
  api.executor=async route=>{
    if(route==='/git/ref/heads/main')return {object:{sha:state.candidate.executorSha}};
    if(route===`/actions/runs/${state.candidate.releaseRunId}`)return {id:Number(state.candidate.releaseRunId),
      run_attempt:state.candidate.releaseRunAttempt,run_number:1,head_sha:state.candidate.executorSha,head_branch:'main',
      event:'workflow_dispatch',path:'.github/workflows/deploy.yml',name:'Qualified production executor',status:'in_progress',
      repository:{full_name:targets.executor.repository},head_repository:{full_name:targets.executor.repository}};
    if(route.startsWith('/environments/'))return sourceApi(route);
    if(route.startsWith('/rules/branches/main'))return ['deletion','non_fast_forward'].map(type=>({type,ruleset_id:99}));
    if(route==='/rulesets/99')return {enforcement:'active',source:targets.executor.repository,source_type:'Repository',target:'branch',bypass_actors:[],rules:[{type:'deletion'},{type:'non_fast_forward'}]};
    throw Error('Unexpected executor route '+route);
  };
  const execute = async () => {
    return deploy(api, state.candidate, state.policy,
      createAuditWriter(state.candidate, r => reports.push(r)), { ...immediate, env: state.env,
        evidencePlan: state.plan ?? { policySha256: state.candidate.policySha256, baseline: null, resume: null },
        receiptRows: state.receiptRows, baselineRows: state.baselineRows });
  };
  return { state, api, posts, reports, execute };
}


export {fixture,qualified,runnerEnv,source,previous,run,jobs};
