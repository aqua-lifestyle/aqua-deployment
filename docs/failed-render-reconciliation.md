# Exact acknowledged Render-failure reconciliation

Version: 1. Base executor: `1a1cc2de3e28799be4cc945480ea75386c31b372`.
Branch: `fix/exact-failed-render-reconciliation-20261103`.

## Owner scope and proven blocker

The owner's current **“Resolve Existing Deployment Reconciliation”** instruction
authorizes factual reconciliation of the existing failed operation and only a
necessary executor correction, then one qualification-only attempt. It authorizes
no production deployment, database change, credential/permission change, financial
activation, infrastructure or unrelated engineering. This is an execution record,
not independent business-policy authority.

The blocking prior operation is production run **41527223264/1**, run number 16,
executor `dcaaabe578b14355699ecc715a7aef6d30e38740`, source
`a4755801ce89868d7791422f3c983363ab76bf30`. It acknowledged Render deployment
**dep-dbkftrcipgvc73asn0lg** before failing. The current generic no-mutation route
first rejects the old producer workflow fingerprint; even after recognizing that
producer, its mutation phases correctly require factual reconciliation. The old
exact-history route recognized only two earlier attempts and their prior candidate.

## Authenticated retained evidence

- Original audit artifact **13180373119**, ZIP SHA-256
  `be5586f2f54401d9bc699b1f7c2df7f0699917769249292d36578d5c79860794`,
  is available and bound to the exact executor repository/run/revision.
- The original 27-row audit records one `render-requesting`, one matching
  `render-requested`, no Render-ready/success row, no Vercel mutation request or
  deployment ID, and terminal `PROVIDER_DEPLOYMENT_FAILED_INSPECT_RELEASE_REPORT`.
- Render GitHub App **14658 / render** created deployment record **7503709845**
  for that source and service environment. Status **21203919981** was
  `in_progress` at `2026-11-02T21:21:50Z`; **21204067912** reported `failure` at
  `2026-11-02T21:24:05Z`. Both link the exact Render deployment ID. These are
  authenticated provider-relayed facts, not a guessed Render-specific state/cause.
- A bounded public observation at **2026-11-03T19:04:08.659Z** found the API HTTP
  200/Healthy on held baseline `4eba3799fc3ece12b4de00b5e3019738f1e159c6`, receiver
  Schema54, with healthy database/Redis/data-protection checks; the frontend HEAD
  returned HTTP 200/HTML. This observation establishes those facts at that time,
  not absence of database writes or current authenticated frontend deployment ID.
- The pre-attempt authenticated baseline and existing qualified frontend record
  are reused without changing their original observation times.

The pinned record is `governance/render-failure-reconciliation-20261103.json`.
The test fixture retains the **original ZIP bytes** as base64, not a regenerated
archive. Runtime still retrieves the original artifact by authenticated ID and
validates availability, repository/run/source ownership, ZIP digest and exact
canonical audit digest; there is no offline fallback.

## Smallest recognition correction

The existing `historicalReconciliations` path now recognizes only that failed run,
attempt, source/CI, producer, provider IDs, terminal failure and original audit.
It is restricted to accepted candidate
`1b748dfdaf3b63fb9dcc42f781ab79d5c39ca503`, the unchanged policy and exact targets.
It also carries the two already-settled immutable historical facts forward to
that accepted candidate, without rewriting their original identities or outcomes.

The actual November-2 producer workflow fingerprint is retained for the existing
general **no-mutation** classifier. Its controller bytes were already supported;
this repairs producer-version recognition without allowing mutation phases into
that classifier. The Render failure remains an acknowledged provider effect and
is recorded separately from unexecuted/read-only failures.

Nothing grants a successful predecessor, same-run continuation, replay or deployment
authority. Unknown/unrelated/changed attempts, missing/expired/substituted evidence
and unexplained additional mutations still deny. Database-write absence and
financial eligibility are explicitly not established by failure or health.
Existing schema/recovery freshness, financial restrictions and live provider guards
remain separate requirements; no historical observation is re-dated.

## Validation and execution plan

1. Authenticate the existing failed audit and provider-relayed outcome once.
2. Add the fixed record/recognition correction and focused negative coverage.
3. Run existing required safety CI; obtain protected exact-head review and merge.
4. Execute one qualification-only admission for the accepted source and current
   protected executor. Return the actual result and stop on any remaining blocker.

A read-only evaluation of the complete retained GitHub history made 75 existing
record reads and accounted for the three exact failed attempts, zero verified full
releases, 22 other recognized failed attempts, and no baseline or retry receipt.
It dispatched no qualification/deployment and called no provider API. This proves
history recognition with the correction under the CLI's read identity, not actual
protected admission or a fresh production-state/financial qualification.

Initial focused validation had 25 passes and four failures: the new record used
plain JSON serialization rather than the existing sorted-key canonical audit
digest, and two negatives expected a later rejection category than the guard that
correctly denied them. The prepared digest and exact rejection expectations were
corrected without changing original bytes or weakening rejection behavior. The
focused reconciliation/history suites then passed **29/29**, with no skips.
Final full/current-head CI, protected merge and actual admission results are
recorded on the PR at exact revisions.

Final local existing suite `node --test tools/deployment/*.test.mjs`:
**258 tests, 257 passed, 0 failed, 1 skipped** on Node 26.6.0. The sole skip is the
existing disposable PostgreSQL prototype test without a local test URL; required
hosted safety CI supplies that existing service. `git diff --check` passed.
Status: **IMPLEMENTED**, **TESTED** locally with the explicit existing skip.
