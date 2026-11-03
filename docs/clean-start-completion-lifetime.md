# CLEAN_START historical completion and current safety evidence

Version: 1. Base executor: `bf4b2c920940fc5422c1d2009d0ad2fb4f82423e`.
Branch: `fix/clean-start-completion-lifetime-20261103`.

## Owner scope and exact diagnosis

The owner's **“Remove Obsolete B6 Dependency From CLEAN_START”** direction
authorizes the smallest correction removing historical B6 requirements and a
rolling expiry on the already-completed migration, while preserving original
facts and necessary current safety/financial/recovery checks. It authorizes no
production deployment, B6 work, migration rerun, database change, infrastructure,
replacement evidence machinery or unrelated engineering. This worklog records
execution, not independent business authority.

The selected policy is `commission-invalidation-clean-start-completed-m55-v1`.
It already selects `observation.cleanStart`, not `observation.b6`. The rejected
production attempt `41732525966/1` did not execute a B6 acquisition path. Its shared
predicate combined migration chronology with `maxCiAgeSeconds` applied to the
historical observation, then emitted a B6-prefixed error. Thus the error name was
legacy, and the misplaced rolling historical-completion expiry was real.

## Exact correction

Only the strongly pinned completed-migration variant stops applying the CI-age
window to historical completion. It still verifies original authority and actual
operation bytes, source/SQL/database/Tenant/target bindings, observation integrity,
approval-to-application chronology, non-future time, history/audit results, holds,
guard sources and the bounded accepted-candidate carry-forward. Original operation
SHA, observation times and unavailable historical fingerprints remain unchanged.

Invalid completed chronology is now `COMPLETED_M55_CHRONOLOGY_INVALID`.
Non-completed CLEAN_START readbacks use CLEAN_START-specific chronology/freshness
errors. Explicitly selected non-CLEAN_START legacy behavior remains isolated; no
CLEAN_START failure falls back to B6 or requests new B6 evidence. The preserved
authorization is the original completed migration's provenance, not a new B6
acquisition or permission to rerun it.

No new evidence record, credential, workflow or policy epoch is introduced.
Current CI freshness, purpose-bound admission, live Render/financial/worker/payout
holds, receive-only readiness, Vercel verification, recovery evidence and prior
provider-operation reconciliation are not changed or bypassed.

## Validation and production-readiness result

Focused completed-evidence/schema suites: **35 passed, 0 failed, 0 skipped**.
Tests accept the unchanged completed operation after 30 days, fail if CLEAN_START
reads a `b6` acquisition, reject invalid/future chronology and mutated historical
facts, and prove that current recovery evidence still expires independently.

A local, read-only evaluation using the actual pinned records and current clock
passed historical completion with the original source/time, then stopped at
**FIRST_RELEASE_RECOVERY_EVIDENCE_EXPIRED**. The existing recovery observation is
`2026-11-02T14:08:02.802Z`, expiring `2026-11-03T14:08:02.802Z`. This evaluation
executed no workflow, provider request, database operation or deployment. It is
metadata/validator evidence, not a claim of live readiness. Recovery freshness and
all other production-purpose checks remain enforced; production admission is not
reported ready merely because the obsolete historical expiry is removed.

## Protected completion plan

1. Make only the lifetime/error-category correction and focused regression changes.
2. Run existing mandatory safety CI and inspect the complete diff and original
   evidence files for unintended changes.
3. Obtain exact-head protected review and normal merge under owner authorization.
4. Report the corrected historical prerequisite and actual remaining current-safety
   requirement. Do not dispatch production or amend/renew recovery evidence here.

Full current-head test/CI results and protected review/merge outcomes are recorded
on the PR. The older evidence and readbacks are not edited or re-dated.

Local full existing suite `node --test tools/deployment/*.test.mjs`:
**266 tests, 265 passed, 0 failed, 1 skipped** on Node 26.6.0. The sole skip is the
existing disposable PostgreSQL prototype test without a local test URL; required
hosted CI supplies its existing service. `git diff --check` passed. The original
completion, authority, operation, schema/readback, policy and recovery files have
no diff. Status: **IMPLEMENTED**, **TESTED** locally with the explicit existing skip.
