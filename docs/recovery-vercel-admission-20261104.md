# Combined recovery acceptance and full-release Vercel correction

Version: 1. Base: `c804cbc40acdcc0253c5441e21268c0a2d88a6d0`.
This is the execution plan/worklog for the owner's explicitly authorized combined
implementation, required tests and one review PR. It records engineering state,
not a new business decision or permission to merge or deploy.

## Plan and scope

1. Preserve historical authority, migration, observation and failure records.
2. Bind the actual protected readback to the single accepted candidate through the
   existing exact completed-migration55 candidate carry-forward.
3. Reuse Vercel's existing observed-public-configuration verifier in the full release.
4. Run focused/full safety tests, inspect the complete diff and publish one PR.

## Recovery acceptance

`governance/native-held-baseline-observation-20261104.json` contains the actual
sanitized JSON emitted by [run 41782065591/1](https://github.com/aqua-lifestyle/aqua-deployment/actions/runs/41782065591),
at executor `c804cbc40acdcc0253c5441e21268c0a2d88a6d0`. Authenticated Actions
metadata confirms success, the protected-main manual workflow and the named actor.
The versioned record was compared with the exact job output; its byte digest and
complete job-log digest are pinned in `native-recovery-source.json`.

Actual observation: **2026-11-04T05:54:23.080Z**. The separately versioned recovery
readback expires **2026-11-05T05:54:23.080Z** under the existing 24-hour limit.
It does not renew itself. Original 2 November records and timestamps are unchanged.

The release candidate is `1b748dfdaf3b63fb9dcc42f781ab79d5c39ca503`; the completed
operation and original recovery authority retain source
`a4755801ce89868d7791422f3c983363ab76bf30`. Only the existing pinned exact candidate
carry-forward can bridge them, with the same database, Tenant, targets, policy
scope, schema proof and safeguard checks. No generic descendant or dispatch-selected
observation is accepted. Historical source/migration-comparison baselines stay fixed.

Renewing the evidence changes the policy digest. The three already-settled failed
attempts therefore have an exact accepted-candidate/new-policy mapping in the
existing reconciliation validator. Original records, policy hashes, audit archives,
artifact checks and failure outcomes remain unchanged. No new historical run,
successful predecessor, continuation, effectlessness or replay authority is granted.

The current observation records the serving Render deployment as `live` and the
known later attempt as `update_failed`. Existing current-provider checks still
execute during release; observation acceptance does not substitute for those checks.
Cached rollback remains unverified/unauthorized; database rollback, financial
activation and a recovery rehearsal are not authorized by this correction.

## Full-release Vercel verification

The full path reuses `verifyObservedFileDeployment` for completed file deployments,
including alias-bound names-only predecessors and same-run acknowledged completions. It checks
the exact source proof and metadata, READY state, approved project/root/build
settings, and authoritative production alias before and after verification.
Retained readable predecessor artifacts keep their original strict verification
when an acknowledged replacement already owns the alias. Current public assets
must never be used as evidence of a different, retained deployment.

Readable effective value maps keep their existing strict value checks. Names-only
responses select the existing bounded public login/chunk GETs and frozen-module
literal parser. There is no catch-and-fallback, requested-value substitution,
default inference, JavaScript evaluation, secret decryption or credential forwarding.
The candidate's public-env module was independently read from the exact application
SHA and matches the existing pin
`da0b258523ed6ee8d8ce5f00f874518e0a212adce7418807427c244d9f43921e`.

Pending same-run acknowledged deployments prove source before polling and must pass
effective-input verification once READY. A failed public read, conflict, malformed
provider shape or alias drift stops success recording while retaining acknowledged
operation IDs. The final audit includes the sanitized public-input observation.
Write-ahead intent/acknowledgement order, Render-first, OIDC readiness, admission
freshness, operational holds and reconciliation-before-retry remain in force.

## Validation and handoff

- Initial focused run: 28 passed, zero failed/skipped.
- Expanded focused run: 42 passed, one failed assertion expecting a later error
  category for missing schema proof. The validator correctly denied earlier;
  the test now requires that exact existing contract error.
- Initial full PostgreSQL-backed run: 269 passed, eight failed, zero skipped.
  This exposed the policy-digest dependency described above; no historical record
  or negative assertion was relaxed to resolve it.
- Focused regression run after the policy mapping: **43 passed, zero failed/skipped**.
- Final full suite: **279 passed, zero failed/skipped**, Node **26.6.0**, including
  the disposable PostgreSQL concurrency test against the same pinned image used by
  hosted safety CI. `git diff --check` passed.
- Hosted Node24/PostgreSQL results are recorded on the review PR at its exact head.
  A hosted pass must be observed before it is reported as passed.

Tests use controlled clocks and provider substitutes. The pinned recovery result
is prior actual GET-only provider evidence; tests do not establish a new production
admission, deployment, OIDC exchange, recovery execution or member/admin journey.
Merge and production execution remain separately authorized. Refresh application
CI only near an authorized release if its existing freshness window is insufficient;
the observation's actual timestamp and expiry must never be re-dated.
