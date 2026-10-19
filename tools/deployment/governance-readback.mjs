import { readFileSync } from 'node:fs';
import { objectDigest } from './github-evidence.mjs';

// This file is executor-owned policy, never a candidate or dispatch input.
// Its authority is the trusted administrator's merge of the exact executor SHA.
export const approvedReadbacks = JSON.parse(readFileSync(
  new URL('../../governance/ruleset-readbacks.json', import.meta.url)));
export class GovernanceReadbackDenied extends Error {}

export function approvedBypassReadback(live, repository, approvals = approvedReadbacks) {
  // An explicit live value is authoritative and is checked by the caller.
  // null/malformed/nonempty values must never fall back to a prior readback.
  if (live && Object.hasOwn(live, 'bypass_actors')) return live;
  const deny = code => { throw new GovernanceReadbackDenied(code); };
  if (approvals?.contract !== 'aqua.administrator-ruleset-readbacks' || approvals.version !== 1 ||
      !Array.isArray(approvals.rulesets)) deny('RULESET_ADMIN_READBACK_REQUIRED');
  const rows = approvals.rulesets.filter(r => r.repository === repository && r.ruleset?.id === live?.id);
  if (rows.length !== 1) deny('RULESET_ADMIN_READBACK_REQUIRED');
  const approved = rows[0].ruleset;
  if (approved.source !== repository || approved.source_type !== 'Repository' ||
      !Array.isArray(approved.bypass_actors) || approved.bypass_actors.length !== 0 ||
      !Number.isFinite(Date.parse(rows[0].observedAt)) ||
      !Number.isFinite(Date.parse(approved.updated_at)) || !Number.isFinite(Date.parse(live?.updated_at)))
    deny('RULESET_ADMIN_READBACK_REQUIRED');
  const fields = ['id', 'name', 'target', 'source_type', 'source', 'enforcement',
    'conditions', 'rules', 'updated_at'];
  const projection = value => Object.fromEntries(fields.map(k => [k, value[k]]));
  if (fields.some(k => approved[k] === undefined || live[k] === undefined) ||
      objectDigest(projection(live)) !== objectDigest(projection(approved)))
    deny('RULESET_ADMIN_READBACK_CHANGED');
  return { ...live, bypass_actors: approved.bypass_actors };
}
