# Exact-source D10 one-time activation correction

Application PR126 implements the owner's one-time commissioning authorization
lifecycle. Its application lifecycle/Production-process restart evidence is in the
application PR and worklog. The immutable record selects only its exact merge and
successful main-push CI attempt; this document grants no deployment or activation.

This binding carries the accepted reset/migration evidence unchanged and updates
only the two reviewed pinned sources (production selectors and Core D10 model).
Every other source, ancestry, migration, policy and provider-target guard remains.
The reviewed predecessor controller fingerprint is preserved for authenticated
pre-mutation history recognition, with unchanged provider write-ahead ordering.

The existing executor still performs a code-only held deployment, requires native
readiness v2 and retains the new revision's runtime bindings. Genuine D10 acceptance
and the atomic Yoco Normal transaction follow separately. No credentials, provider
targets, schema, recovery grants, financial flags, workers or payouts change here.

Validation: complete `node --test tools/deployment/*.test.mjs` with the existing
disposable PostgreSQL replay fixture, exact-source application main CI, executor
PR/main safety, and final protected coupled-release evidence. No historical reset,
conservation or schema operation is rerun to qualify this code-only successor.

Local result: **TESTED**,337 passed, zero failed/skipped, including the actual
disposable PostgreSQL replay-concurrency case. The unchanged executor lockfile
reported zero npm vulnerabilities. Exact-source hosted/main CI and protected
deployment are separate required evidence steps.
