# Exact completed-migration55 candidate carry-forward

Version: 1. Base executor: `da5ad09008a42524abe298e31009bf5bef1c06d7`.
Branch: `fix/completed-m55-candidate-binding-20261103`.

The later [CLEAN_START completion-lifetime correction](clean-start-completion-lifetime.md)
removes the obsolete rolling expiry on this immutable completed operation. It does
not change the original facts/times, source compatibility or current recovery/live
safety requirements. Validation results below record the original implementation.

## Owner direction and preserved facts

The owner's **“Resolve Final Migration Evidence Binding”** direction authorizes one
narrow protected correction so the verified completed operation can satisfy the
accepted candidate's prerequisite after relevant SQL, scope and database safeguards
are confirmed compatible. It authorizes no migration rerun, data modification,
historical evidence fabrication, unrelated work, financial activation or production
deployment. This worklog records execution, not independent business authority.

The original operation remains bound to
`a4755801ce89868d7791422f3c983363ab76bf30`. Its completed bundle, original authority,
actual operation/audit, database identity, tenant, history digests, observations,
results and recovery source are not edited. The proof's `initialSourceSha` still
identifies that original operation, never the later code revision.

The accepted compatible candidate is exactly
`1b748dfdaf3b63fb9dcc42f781ab79d5c39ca503`. No other source or generic descendant is
added to this bounded completed-operation exception.

## Source and scope confirmation

Authenticated old-to-candidate comparison is `ahead`, three commits and nine
changed files, with no migration file change. Commit-specific blob verification
checked all **25** migration/hold/clean-start pins: **24 are byte-identical**,
including migration55's definition/designer/snapshot, reviewed SQL, payout guards,
financial selectors and preflight/reset/restore/state SQL.

The one changed pin is the already-approved `ApplicationRecoveryMiddleware.cs`:
it adds `!cutover.HasOperator` to the business-write fence. Its original digest
`0ebc961ae83640ad00a3e368ed6eb40fde413bf22c4623665f18967552b32322` remains in the
original operation manifest. The carry-forward pins only that candidate's stricter
file to `e39cacea3bec6fe765d794d053cb9d21019a8164302cf3a9a987bc3253e8b00f`.
It does not allow arbitrary guard changes or reinterpret the old source as new.

The original completed-bundle, source-manifest, policy-scope and target digests
match the unchanged executor records. Database identity and tenant match the
original readback. These are source/scope comparisons, not a database operation or
a newly observed production database state.

## Smallest runtime correction

The pinned `governance/completed-m55-candidate-carry-forward-20261103.json` record
selects that one source and one guard digest. Runtime still validates original
authority/operation bytes, all 25 candidate source pins, unchanged policy/targets,
exact additive schema delta from the held baseline, and ancestry from the original
operation with **no additional migration**. Unknown ancestry, changed SQL/guards,
another tenant/database/target or another candidate denies.

For production-purpose validation, the old observation may bind this verified
compatible source without changing its original SHA. The entire completed evidence
and original observation remain pinned; chronology/freshness, financial/worker/
payout holds and independent first-release recovery requirements are unchanged.
Missing historical schema fingerprints remain unavailable, not reconstructed.

Qualification-only executes source/scope/ancestry checks but retains its existing
purpose-bound behavior: no production migration proof or deployment authority is
created. Passing qualification is not proof of production freshness or readiness.

## Validation and completion plan

1. Confirm only the relevant source/scope compatibility using immutable GitHub data.
2. Add the fixed carry-forward and focused positive/negative tests.
3. Run mandatory safety CI and obtain exact-head protected acceptance/merge.
4. Execute one qualification-only admission for the accepted source/current
   protected executor, return the actual result and stop. No production operation.

Focused completed-evidence/schema suites: **33 passed, 0 failed, 0 skipped**.
Coverage includes preservation of the original operation identity/evidence,
all SQL and guard pins, qualification purpose, extra DDL/unknown ancestry denial,
scope/record tampering and unchanged original-evidence freshness rejection.
These are component tests with controlled clocks, not new production observations.
Full current-head CI and actual qualification results are recorded on the protected
PR. Original evidence files are not rewritten by this correction.

Full local existing suite `node --test tools/deployment/*.test.mjs`:
**264 tests, 263 passed, 0 failed, 1 skipped** on Node 26.6.0. The existing
disposable PostgreSQL prototype test has no local test URL; required hosted safety
CI supplies its existing service. `git diff --check` passed. Status:
**IMPLEMENTED**, **TESTED** locally with the explicit existing skip.
