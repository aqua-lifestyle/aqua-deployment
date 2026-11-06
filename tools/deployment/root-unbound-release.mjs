// One exact reviewed successor; no descendant, migration or financial grant.
import { readFileSync } from 'node:fs';
import { sha256 } from './github-evidence.mjs';
import { firstAccountCandidateSha, firstAccountRecordDigest, validateFirstAccountCandidate } from './first-account-release.mjs';
import { ReadinessReleaseDenied } from './readiness-release.mjs';

const recordUrl = new URL('../../governance/root-unbound-release-20261106.json', import.meta.url);
export const rootUnboundCandidateSha = JSON.parse(readFileSync(recordUrl)).candidateSha;
export const rootUnboundRecordDigest = '279977d49ffa7af25415648078e77a27d1f6e3dfdc0e083478534c349d6466b1';
const reviewedPaths = [
  'AqualLifeStyle/9.4.2/aspnet-core/src/AqualLifeStyle.Application/ProgrammeParticipations/AQGreenCleanStartRootAppService.cs',
  'AqualLifeStyle/9.4.2/aspnet-core/src/AqualLifeStyle.Application/ProgrammeParticipations/AQGreenD10ProductionSelectors.cs',
  'AqualLifeStyle/9.4.2/aspnet-core/src/AqualLifeStyle.Core/Domain/AQGreen/AQGreenD10Commissioning.cs'
];

export function validateRootUnboundCandidate(q, bytes = readFileSync(recordUrl)) {
  const check = (ok, code) => { if (!ok) throw new ReadinessReleaseDenied(code); };
  check(Buffer.isBuffer(bytes) && sha256(bytes) === rootUnboundRecordDigest, 'ROOT_UNBOUND_RELEASE_RECORD_CHANGED');
  const r = JSON.parse(bytes);
  const previousBytes = readFileSync(new URL('../../governance/first-account-release-20261105.json', import.meta.url));
  check(sha256(previousBytes) === firstAccountRecordDigest, 'FIRST_ACCOUNT_RELEASE_RECORD_CHANGED');
  const previous = JSON.parse(previousBytes);
  check(r.contract === 'aqua.root-unbound-exact-release' && r.version === 1 && r.applicationPr === 123 &&
    /^[a-f0-9]{40}$/.test(r.candidateSha) && q.sha === r.candidateSha &&
    q.ciRunId === r.ciRunId && q.ciRunAttempt === r.ciRunAttempt && q.policySha256 === r.policySha256 &&
    r.previousCandidateSha === firstAccountCandidateSha && r.previousBindingSha256 === firstAccountRecordDigest &&
    r.policySha256 === previous.policySha256 && r.scope === 'code-only-held-deployment' &&
    q.qualificationOnly === false && q.memberRelease === undefined,
  'ROOT_UNBOUND_RELEASE_EXACT_SCOPE_REQUIRED');
  // Revalidate the retained predecessor's purpose and fixed provider targets.
  const carry = validateFirstAccountCandidate({ ...q, sha: previous.candidateSha,
    ciRunId: previous.ciRunId, ciRunAttempt: previous.ciRunAttempt }).completedCarry;
  const schema = JSON.parse(readFileSync(new URL('./commission-schema-source.json', import.meta.url)));
  check(Array.isArray(r.sourceOverrides) && r.sourceOverrides.length === reviewedPaths.length &&
    reviewedPaths.every(path => {
      const found = r.sourceOverrides.filter(pin => pin.path === path);
      return found.length === 1 && found[0].operationSourceSha256 === schema.cleanStartSources.find(pin => pin.path === path)?.sha256 &&
        /^[a-f0-9]{64}$/.test(found[0].candidateSha256) && found[0].candidateSha256 !== found[0].operationSourceSha256;
    }), 'ROOT_UNBOUND_REVIEWED_SOURCES_REQUIRED');
  return { ...r, completedCarry: { ...carry, candidateSha: r.candidateSha, sourceOverrides: r.sourceOverrides } };
}
