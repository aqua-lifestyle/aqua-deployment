# Deployment failure cycle corrective worklog

Version: 1. Scope: the owner's bounded 2026-11-02 corrective workstream.

This records engineering work and validation, not business authority. The
[decision record](../governance/general-pre-mutation-release-history-authority-20261102.json)
and [recognition contract](prior-run-pre-mutation-recognition.md) describe scope.

## Plan

1. Diagnose the existing rejected reads using retained evidence.
2. Implement general authenticated pre-mutation recognition and safe diagnostics.
3. Exercise real JSONL through authenticated-artifact substitutes and negative cases.
4. Run focused/full checks, publish the authorized PR and collect hosted CI.
5. Perform qualification-only admission only if the approved main revision and
   current evidence permit it; stop for the next owner decision.

## Implementation

- Base revision: `110ab4fb83bbf9291fcf23d6332b430de4390c6c`.
- Diagnosis bounded the failure windows but could not establish the exact rejected
  endpoint/status or a provider-side root cause. No provider operation was rerun.
- General recognition uses complete authenticated execution/artifact evidence,
  supported producer code and a strict read-failure vocabulary. Failed attempts
  remain failed and never become verified release predecessors or continuations.
- Added fixed read-scope audit rows; preserved mutation-intent ordering, full
  history, same-run recovery and the two exact historical reconciliations.
- Corrected integration field names and preserved successful qualification-only
  semantics. Attempt-specific outcomes are retained rather than replaced by a
  rerun's overall conclusion.

## Validation evidence

- Focused run: **30 passed, 0 failed, 0 skipped** before the additional
  earlier-attempt regression case was added.
- First full run after integration: **219 tests, 217 passed, 1 failed, 1 skipped**.
  Failure: an older negative history fixture did not model the new producer-source
  GET. Older negative fixtures now return explicitly unsupported source; their
  original fail-closed reconciliation assertions are retained. A new suite separately exercises supported
  source, authenticated ZIP retrieval and actual mutating/uncertain audit rejection.
- The skipped test is the disposable PostgreSQL replay-adapter test because local
  `AQUA_TEST_DATABASE_URL` is not configured. Hosted CI provides that service.
- Final local full run: **219 tests, 218 passed, 0 failed, 1 skipped** on Node
  26.6.0. `git diff --check` passed. This is component/mock and local Git/ZIP
  evidence, not live provider or production evidence.
- Hosted results and PR link: pending collection.

## Boundaries and handoff

No production dispatch, database mutation, provider operation, credential/config
change, financial activation or new schema/recovery observation is part of this
implementation. The held provider pair and readback observations are carried-forward
evidence, not newly verified here.

The retained schema observation's freshness deadline is
`2026-11-03T09:17:58.363Z`; recovery observation deadline is
`2026-11-03T14:08:02.802Z`; application CI 41322531293/2 freshness deadline is
`2026-11-03T17:17:58Z`. Do not change these times to keep admission working.
No failed qualification or production request should be retried just to collect
evidence. Production remains stopped for the owner's next decision.
