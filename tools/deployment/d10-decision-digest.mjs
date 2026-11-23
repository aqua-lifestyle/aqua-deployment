// A reviewed, executor-owned .NET helper uses the application's exact canonical
// writer and typed decision schema. Never execute code fetched from the candidate.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dll = fileURLToPath(new URL('./d10-decision-digest/bin/Release/net8.0/D10DecisionDigest.dll', import.meta.url));
const root = 'AqualLifeStyle/9.4.2/aspnet-core/src/AqualLifeStyle.Core/Domain/AQGreen/';
const core = 'AqualLifeStyle/9.4.2/aspnet-core/src/AqualLifeStyle.Core/Configuration/';
export const decisionContractBlobs = Object.freeze({
  [`${root}AQGreenB6CanonicalEvidence.cs`]: 'ccdda0caf232db8fd72835b96b6d4320c248fc0e',
  [`${root}AQGreenD10Commissioning.cs`]: '073b646821edfb81370432fe2ee43cf0d2f48fbc',
  [`${core}AppConfigurations.cs`]: '7307193815cd4c09591813873fbd912c977af5cb',
  [`${core}PrivateOperatorJson.cs`]: '45511dcf3b57cc3766c6ed3ae52a4dc555f9d61d',
  'AqualLifeStyle/9.4.2/aspnet-core/src/AqualLifeStyle.Web.Host/Startup/AQGreenD10OperatorEvidenceSource.cs':
    'ba7e6883254f6542dab073cb2d5bc554293e8a37',
  'AqualLifeStyle/9.4.2/aspnet-core/src/AqualLifeStyle.Application/ProgrammeParticipations/AQGreenD10BackendSuccessor.cs':
    'c52b44be9dd1b722fd366eb3b4103b3ae3c39f84'
});

export function verifyDecisionContract(sourceDir, candidateSha) {
  if (typeof sourceDir !== 'string' || !sourceDir || !/^[a-f0-9]{40}$/.test(candidateSha ?? ''))
    throw Error('BACKEND_DECISION_CANONICAL_CONTRACT_UNVERIFIED');
  for (const [path, expected] of Object.entries(decisionContractBlobs)) {
    try {
      const actual = execFileSync('git', ['-C', sourceDir, 'rev-parse', `${candidateSha}:${path}`],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000 }).trim();
      if (actual !== expected) throw Error();
    } catch { throw Error('BACKEND_DECISION_CANONICAL_CONTRACT_UNVERIFIED'); }
  }
}

export function canonicalDecisionDigest(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > 65536)
    throw Error('BACKEND_DECISION_CANONICAL_DIGEST_UNAVAILABLE');
  try {
    const output = execFileSync('dotnet', [dll], { input: bytes, encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000, maxBuffer: 256 });
    const digest = output.trim();
    if (/^[a-f0-9]{64}$/.test(digest)) return digest;
  } catch { /* Never propagate stderr, argv, paths or parser exceptions. */ }
  throw Error('BACKEND_DECISION_CANONICAL_DIGEST_UNAVAILABLE');
}
