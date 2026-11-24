# Interrupted successor staging: bounded readback

The existing `provider-credential-check.yml` commissioned-state diagnostic can
also observe the failed combined release `45006063824/1`. It does not run on a
pull request or authorize a release, retry, rollback, provider write or history
reclassification. Owner approval is required before a protected-main GET-only
diagnostic is dispatched.

The executor authenticates the exact failed run, four-job inventory, audit
artifact `14747883309` and its immutable ZIP/report digests. Only the six-row
`evidence-selected` through `backend-successor-staging` to `failed` sequence
selects the original intended payload SHA-256 and byte count. The archived
intent is **not** treated as a successful Render PUT or proof of a stored value.

Using the existing protected Render credential and fixed service, the diagnostic
GETs only `App__AQGreenV2__D10__BackendSuccessorJsonBase64` and
`App__AQGreenV2__D10__BackendSuccessorSha256`. It compares the first value's
decoded canonical bytes and the second value against the authenticated intent
in memory. Neither raw value, signed artifact URL, credential nor provider
response enters logs, errors or artifacts. A missing or masked response that
cannot distinguish absent from inaccessible is `UNVERIFIED`, never a fabricated
zero or `MISSING`. Other secret-bearing reads remain denied.

The same existing Render deployment-history GETs report the observed live ID,
status and revision and, only when provider creation timestamps are usable,
deployments recorded since the failed run. Unavailable timestamps produce
`UNVERIFIED` chronology. These observations neither prove the cause of a
provider rollout nor themselves reconcile the prior mutation-intent audit.

## Proposed exact-run factual reconciliation

`governance/backend-successor-staging-reconciliation-45006063824.json` pins the
original failed run/audit and the one protected diagnostic's job, bounded log
digest and sanitized observation digests. The existing history planner checks
the GitHub job log through a fixed, credential-isolated redirect, validates the
original six audit rows, and retains the actual `backend-successor-staging`
mutation intent. This records a persisted run-specific payload, **unverified**
pin, no *recorded* new Render deployment, and no independent proof that a
configuration-triggered restart did not happen. It never declares zero writes,
financial eligibility, successful release, rollback or automatic continuation.
Only the exact original application revision and combined release purpose can
consume the factual proof in a new first-attempt history plan. Provider and
database conditions must be checked fresh by the release path: before the first
verified successor, the complete live Render deployment history must still
match the diagnostic's authenticated 133-row identity/status/source snapshot.
Any new or changed deployment denies before staging; a later verified successor
is governed by its own release receipt instead. Stale
CI or a missing diagnostic log denies admission. Neither this record nor the
diagnostic authorizes another production dispatch.

The release controller also reads back exactly these two executor-staged keys
after each PUT, both before the initial Render deployment and after the additive
migrator job. It still compares full stored values before proceeding; a read
failure or mismatch fails closed. Its protected-client tests exercise both
staging rounds and all four PUT/GET pairs, with unauthorized keys denied.

## Proposed next-candidate D10 source and digest contract

The first future backend successor must read the existing service-level
`App__AQGreenV2__Commissioning__DecisionPath` and require exactly
`environment:App:AQGreenV2:Commissioning:DecisionJsonBase64` before either
successor configuration write. It authenticates the selected base64 decision
against `App__AQGreenV2__Commissioning__DecisionSha256` (raw bytes), then
rechecks the selector, encoded decision and pin immediately before each Render
deployment request, including an additive restart. An absent, file-selected,
different or unreadable selector denies; the executor does not set it or change
commissioning configuration. Existing baseline, historical, financial and
provider checks remain required.

Only `predecessorDecisionSha256` in the new successor payload uses the .NET
canonical digest of that typed decision. The raw decision pin and audit hashes
remain raw-byte hashes; the successor payload itself retains its raw-byte pin.
The reviewed helper's typed model, canonical writer, startup selector and
runtime acceptance source are constrained to the pinned candidate source
contracts. Drift or helper failure denies before staging. This contract makes
no assertion about the decision source selected by the earlier failed process.
The currently effective service-level DecisionPath has not been authenticated
by the retained diagnostics and remains **UNVERIFIED**; if it is absent or
file-selected, an owner-authorized separate configuration decision is needed
before any later release can pass this gate.
The existing protected `provider-credential-check.yml` offers an opt-in,
mutually exclusive `render_decision_path_diagnostic` mode for a separately
authorized, single service-level GET. Its report contains only MATCH, MISMATCH,
MISSING or UNVERIFIED, the fixed key/service and HTTP status; it does not read
linked groups, reveal the value, stage configuration or authorize a release.
Until that mode is authorized and executed, the selector remains **UNVERIFIED**.

## Later acknowledged Render update failure

Executor run `45098115310/1` remains **failed**. Its authenticated audit
`14784681111` records both staged keys, an acknowledged Render deployment
`dep-dc1q0d3l550s73f78dbg`, then
`PROVIDER_DEPLOYMENT_FAILED_INSPECT_RELEASE_REPORT`; no migrator job or Vercel
request was made by this attempt. Existing authenticated Render CLI access
observed the target as `update_failed` at the qualified source, while the
original `dep-dbru710n74is738ah8bg` remained live. The CLI returned only its
latest 20 deployments, not a full historical inventory. Bounded service logs
show `D10_BACKEND_SUCCESSOR_PREDECESSOR_DECISION_CHANGED` during the update;
they lack the deployment ID, so causal linkage is an inference, and the
provider-issued failure reason remains **UNKNOWN**. The startup mismatch has
not been corrected. No separate business-owner authorization record issued
before the original run was available; its status remains **UNVERIFIED** even
though GitHub identifies the triggering account.

`governance/render-update-failed-reconciliation-45098115310.json` is an exact,
whole-file-pinned factual record, not a success, retry, rollout or financial
permission. The history planner reauthenticates the failed run, its audit and
operational GitHub admission. Before a first subsequent verified successor may
stage either key, the full current Render history must consist of the original
authenticated 133-row snapshot plus exactly the recorded `update_failed`
deployment; unknown later operations or changed provider statuses deny. Only
a separately owner-authorized, freshly qualified release with the unchanged
live provider/database/financial safeguards could proceed. A history-plan PASS
does not fix the D10 startup mismatch or justify a new production dispatch.
