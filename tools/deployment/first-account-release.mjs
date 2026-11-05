// One exact reviewed first-account correction, not general descendant authority.
import { readFileSync } from 'node:fs';
import { sha256 } from './github-evidence.mjs';
import { pr121CandidateSha, pr121RecordDigest } from './pr121-release.mjs';
import { readinessRelease, ReadinessReleaseDenied } from './readiness-release.mjs';

export const firstAccountCandidateSha = 'f3490e76628f0b01159bb995bbb7c3bddb479601';
export const firstAccountRecordDigest = '8034825088571991480d6563749268ab477828d23a85c63c34508def1dae6b56';
export function validateFirstAccountCandidate(q, bytes = readFileSync(new URL('../../governance/first-account-release-20261105.json', import.meta.url))) {
  const check = (ok, code) => { if (!ok) throw new ReadinessReleaseDenied(code); };
  check(Buffer.isBuffer(bytes) && sha256(bytes) === firstAccountRecordDigest, 'FIRST_ACCOUNT_RELEASE_RECORD_CHANGED');
  const r = JSON.parse(bytes), carry = readinessRelease().completedCarry;
  const previousBytes = readFileSync(new URL('../../governance/pr121-release-20261105.json', import.meta.url));
  check(sha256(previousBytes) === pr121RecordDigest, 'PR121_RELEASE_RECORD_CHANGED');
  const previous = JSON.parse(previousBytes);
  check(r.contract === 'aqua.first-account-exact-release' && r.version === 1 && r.applicationPr === 122 &&
    r.candidateSha === firstAccountCandidateSha && q.sha === r.candidateSha &&
    q.ciRunId === r.ciRunId && q.ciRunAttempt === r.ciRunAttempt && q.policySha256 === r.policySha256 &&
    r.previousCandidateSha === pr121CandidateSha && r.previousCandidateSha === previous.candidateSha &&
    r.previousBindingSha256 === pr121RecordDigest && r.policySha256 === previous.policySha256 &&
    r.scope === 'code-only-held-deployment' && r.guardPath === carry.guardOverride.path &&
    r.previousGuardSha256 === carry.guardOverride.candidateSha256 &&
    /^[a-f0-9]{64}$/.test(r.candidateGuardSha256) && r.candidateGuardSha256 !== r.previousGuardSha256 &&
    q.memberRelease === undefined && q.qualificationOnly === false &&
    q.repository === 'aqua-lifestyle/aqua-lifestyle' && q.executorRepository === 'aqua-lifestyle/aqua-deployment' &&
    q.environment === 'production-release' && q.profile === 'normal-integrated' &&
    q.renderServiceId === 'srv-d9f0k8e1a83c73d8n1b0' && q.vercelProjectId === 'prj_6qL1e43KhsWrRshY5GxdmGl3HGMz' &&
    q.vercelTeamId === 'team_Hc3BWfhTLfwLzwbgbtaasBUY', 'FIRST_ACCOUNT_RELEASE_EXACT_SCOPE_REQUIRED');
  return { ...r, completedCarry: { ...carry, candidateSha: r.candidateSha,
    guardOverride: { ...carry.guardOverride, candidateSha256: r.candidateGuardSha256 } } };
}
