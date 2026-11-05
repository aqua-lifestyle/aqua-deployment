// Exact approved code-only successor. Completed operation evidence and the old
// release record remain immutable; this does not grant general descendant use.
import { readFileSync } from 'node:fs';
import { sha256 } from './github-evidence.mjs';
import { readinessCandidateSha, readinessRecordDigest, readinessRelease, ReadinessReleaseDenied } from './readiness-release.mjs';

export const pr121CandidateSha = 'db4e6a667ecea228f903e209941eadc7f3002bb3';
export const pr121RecordDigest = 'f5c3d742512d41ac7715be41dbc66c605ccf8044cc24e0826d92da642cabefdf';
export function validatePr121Candidate(q, bytes = readFileSync(new URL('../../governance/pr121-release-20261105.json', import.meta.url))) {
  const check = (ok, code) => { if (!ok) throw new ReadinessReleaseDenied(code); };
  check(Buffer.isBuffer(bytes) && sha256(bytes) === pr121RecordDigest, 'PR121_RELEASE_RECORD_CHANGED');
  const r = JSON.parse(bytes), previous = readinessRelease();
  check(r.contract === 'aqua.pr121-exact-release' && r.version === 1 && r.applicationPr === 121 &&
    r.candidateSha === pr121CandidateSha && q.sha === r.candidateSha && q.ciRunId === r.ciRunId &&
    q.ciRunAttempt === r.ciRunAttempt && q.policySha256 === r.policySha256 &&
    r.previousCandidateSha === readinessCandidateSha && r.previousBindingSha256 === readinessRecordDigest &&
    r.policySha256 === previous.policySha256 && r.scope === 'code-only-held-deployment' &&
    q.memberRelease === undefined && q.qualificationOnly === false &&
    q.repository === 'aqua-lifestyle/aqua-lifestyle' && q.executorRepository === 'aqua-lifestyle/aqua-deployment' &&
    q.environment === 'production-release' && q.profile === 'normal-integrated' &&
    q.renderServiceId === 'srv-d9f0k8e1a83c73d8n1b0' && q.vercelProjectId === 'prj_6qL1e43KhsWrRshY5GxdmGl3HGMz' &&
    q.vercelTeamId === 'team_Hc3BWfhTLfwLzwbgbtaasBUY', 'PR121_RELEASE_EXACT_SCOPE_REQUIRED');
  return { ...r, completedCarry: { ...previous.completedCarry, candidateSha: r.candidateSha } };
}
