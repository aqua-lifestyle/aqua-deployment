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
provider rollout nor reconcile the prior mutation-intent audit. No admission
path is changed; exact provider-effect reconciliation remains a separate owner
decision after authenticated observations exist.

The release controller also reads back exactly these two executor-staged keys
after each PUT, both before the initial Render deployment and after the additive
migrator job. It still compares full stored values before proceeding; a read
failure or mismatch fails closed. Its protected-client tests exercise both
staging rounds and all four PUT/GET pairs, with unauthorized keys denied.
