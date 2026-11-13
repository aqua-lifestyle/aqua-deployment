# Controlled exact-source CI refresh — 13 November 2026

Base executor: `695ac05ec345df9238e58a673fcd59e2f4ab62e4` (merged PR #59).
Its required main safety run `43412763256` passed all 413 tests without skips.
Application main remained `b8d86e5e60997483423b273d5f426c08b411f573`.

## Approved procedure and restoration

The owner explicitly approved temporarily disabling only the application's
`release.yml`, one full rerun of CI `43191377577`, prompt restoration even on
failure, and preparation of the related binding PR. No merge, baseline capture or
release dispatch was authorized.

The complete preflight inventories showed 29 completed application release-trigger
runs and 79 completed executor release runs, with no competing release execution.
Both application workflows were originally `active`.

- GitHub workflow-state control disabled release workflow `386747295`; its
  `disabled_manually` state was confirmed at **11:19:14.032Z**.
- CI workflow `314866230` remained `active` throughout.
- One full rerun was requested using `gh run rerun 43191377577`. No failed-jobs-only
  flag, application commit, manual CI dispatch or provenance exception was used.
- Attempt **3** completed successfully at **11:34:14Z**.
- Release workflow restoration to `active` was confirmed at **11:34:31.593Z**;
  CI was also confirmed `active`. Restoration ran independently of this session's
  interruption and was verified again on resume.
- Application release and executor run inventories remained exactly unchanged
  across the procedure and on subsequent verification: **29 and 79** respectively.
  No automatic release dispatch was initiated.

The operational readback, exact before/after inventory digests and retained
control-log digest are in `governance/aqgreen-ci-refresh-43191377577-3.json`.
These are authenticated operator records, not independent provider attestation.
No application workflow file was edited.

## Actual qualifying evidence

`43191377577/3` retains **push/main** provenance at the exact unchanged application
SHA. All **17 required jobs** completed successfully with matching run/attempt and
canonical check identities. The executor's existing `qualify()` and strict
`verifyGitHubEvidence()` were executed against authenticated GitHub responses:

- Exact security artifact: **14030649357**.
- Archive SHA-256:
  `8377131fec82bcb719296b2bf0c06147d1bc219e751f9d090d955b84aa828074`.
- Report SHA-256:
  `2d11870a49a2ea68c5f64df6635b85e1a04b15df0f5b63a24a990fabcb5fb339`.
- **240 mandatory security executions** verified; all 26 approved definition/
  inventory reads matched the executor pins.
- With this proposed binding, authenticated source reads also verified all
  **25** migration/hold/Clean Start pins and the unchanged M55 ancestry/readback.
  This is GitHub/source and historical-evidence validation, not a production or
  database operation.

The unchanged 24-hour CI bound expires at **2026-11-14T11:34:14Z**, derived from
the current-run API's actual completion timestamp. The runtime still re-reads
GitHub; this record cannot renew an expired, replaced, unsuccessful or non-push CI.

## Minimal binding correction and tests

One append-only, digest-pinned refresh chains the original exact source-successor
record. It accepts only this same run at attempt 3; a future attempt, different run,
source, policy or target remains inadmissible. The original attempt-2 binding and
all historical M55/source/recovery/failure records remain byte-for-byte unchanged.
Historical attempt 2 still cannot qualify against GitHub's current attempt 3.

Four regressions cover exact refresh/source preservation, substitution rejection,
live freshness/attempt/push enforcement, and the real `main("admit")` path issuing
an attempt-3 purpose-bound receipt with fixture inputs. Focused suites: **76 passed,
0 failed, 0 skipped**. Full local suite: **417 tests, 416 passed, 0 failed, 1 existing
PostgreSQL-environment skip**, Node **26.6.0**. Protected CI supplies its existing
PostgreSQL service; no infrastructure was created locally.

The binding becomes operational only after protected owner review/merge and
normal executor approval. No baseline or release was run, no provider credentials
were read or refreshed, and Render/Vercel, application code, D10 and financial
controls were not touched. Stop before merge; a later baseline must bind the
then-current merged executor and still-fresh exact CI.
