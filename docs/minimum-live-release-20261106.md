# PR125 exact-source held release

The owner-approved scoped-minimum application correction is PR125, reviewed head
`029adf697f1ce869ca6c5359c1ff55fb5191597b`, merged as
`6fe686a67408cfd025b5e7e3770fa29de070a57e`. Its main-push CI selection is
`42299618797/1`; deployment still requires that exact attempt's complete successful
qualification, not this document's assertion.

This executor binding admits only that candidate/CI pair and the existing fixed
targets under the unchanged policy. It carries forward the immutable completed
reset/migration evidence, all previous source pins except the reviewed production
selector successor, and native readiness version 2. The selector's exact source
digest is `ad095690c48e81cfd618279035cf515e4f77c3917a08ca99149343ce73485850`.

This is a code-only **held** deployment. It does not activate financial operations,
commissioning, workers, payouts or Normal, or attest to old merchant references.
Successful deployment must retain the new revision's authenticated runtime
bindings for subsequent genuine D10 evidence assembly. Earlier assembly and
configuration bindings cannot substitute for this revision.

The reviewed PR124 controller fingerprint remains recognized for authenticated
pre-mutation history classification. Its write-ahead provider mutation ordering
was inspected and is unchanged by this binding. Acknowledged or uncertain provider
writes still require the existing reconciliation/continuation path.

Validation is the complete `node --test tools/deployment/*.test.mjs` suite with
`AQUA_TEST_DATABASE_URL` pointing to the existing disposable PostgreSQL fixture,
followed by PR and main executor CI. Source/CI/target/purpose substitutions,
unreviewed source changes, migration changes and missing ancestry remain denied.
No production state is inferred from component or disposable PostgreSQL tests.

Local result: **TESTED**, 334 passed, zero failed/skipped, including the actual
disposable PostgreSQL replay-concurrency case. `npm ci --ignore-scripts` reported
zero vulnerabilities for this unchanged executor lockfile. PR/main CI and the
protected release remain separate evidence steps.
