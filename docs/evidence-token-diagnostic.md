# Protected evidence-token capability diagnostic

Version: 1. Base executor: `0f5fc26047147a86058e613eee10bcd987d11e1e`.
Branch: `fix/protected-evidence-token-check-20261103`.

## Authority and bounded objective

The owner's 2026-11-03 instruction authorizes this smallest fixed-endpoint
diagnostic, focused tests, protected PR/review/CI/merge, and exactly one diagnostic
run after merge. This worklog records execution, not new business-policy authority.
No credential or permission change, production/qualification retry, operational
database action, Yoco/financial activation, infrastructure or broad redesign is
authorized.

Qualification `41627753853/1` stopped at `SOURCE_FETCH_REMOTE_FAILED`. Its retained
evidence establishes token presence but lacks an HTTP/authentication cause. The
older credential checker requires now-closed PR #1 and cannot supply this exact
request. This diagnostic establishes the missing REST capability fact; it does not
change Git transport or resolve other release-admission requirements.

## Execution and credential boundary

`evidence-token-diagnostic.yml` has only a manual trigger, no inputs, and one job
restricted to the fixed executor repository/ID, protected main, approved
administrator login/ID pairs and first attempt. It checks out the exact workflow
SHA with credentials not persisted. A credential-free context step verifies that
checkout, workflow identity and trusted actor before the secret-bearing step.

Only that step receives existing `AQGREEN_EVIDENCE_READ_TOKEN`. There is no
production environment, provider credential, job-token fallback, application
execution, Git fetch, dependency installation or permission grant. The small
standalone script does not import the deployment controller or application code.
Its local checkout-identity subprocess does not inherit the evidence token.

The only network request is:

```text
GET https://api.github.com/repos/aqua-lifestyle/aqua-lifestyle/git/commits/1b748dfdaf3b63fb9dcc42f781ab79d5c39ca503
```

There are no endpoint, repository or SHA overrides, retries, redirect following,
token fallback, metadata enumeration or writes. A 30-second timeout applies; a
success JSON body is bounded to 1 MiB. Error bodies and arbitrary error messages
are never parsed or emitted. Output is one sanitized JSON result containing only
an observed HTTP status (when obtained), fixed classification, object-match state
and token-access verdict. Exact executor SHA/run provenance comes from Actions.

## Evidence meaning

- **TOKEN ACCESS VERIFIED:** HTTP 200, with both commit SHA and canonical GitHub
  API object URL matching the fixed request. Proves this token can read this
  commit via REST at that time; it does not prove Git smart-HTTP access, absence
  of write permissions, configured expiry/repository selection or release admission.
- **TOKEN ACCESS DENIED:** HTTP 401 (authentication rejection) or 403 (access or
  policy denial). Does not invent the exact missing permission or distinguish
  organization policy from other 403 causes.
- **TOKEN ACCESS INDETERMINATE:** missing/malformed credential, context/transport
  failure, 404 (resource or access unavailable), rate limit/server/redirect/other
  HTTP failure, or an unverifiable/mismatched success object. No missing HTTP
  status is replaced with zero and no unobserved object match is reported false.

Minimum expected access for this Git database endpoint is application **Contents:
read**. Configured repository selection, permission grants, expiry and organization
approval remain unverified unless separately established through authorized
metadata. This diagnostic does not enumerate or change those settings.

## Plan and validation record

1. Implement only the protected workflow, fixed read script, tests and this guidance.
2. Run focused and existing executor safety tests; inspect all changed files.
3. Submit for human review and current-head CI; merge only through protections.
4. Confirm merged main, run the diagnostic exactly once, record the safe result on
   the PR and stop. Do not dispatch qualification or deployment.

Local/hosted validation, exact reviewed and merged revisions, human acceptance and
actual run/HTTP result will be recorded on the protected PR. Fixture responses are
component evidence, not proof of the real token. Existing hosted safety CI includes
its disposable PostgreSQL prototype test; this diagnostic adds no database behavior.

### Local evidence

- `node --test tools/deployment/evidence-token-diagnostic.test.mjs`:
  **10 passed, 0 failed, 0 skipped**.
- `node --test tools/deployment/*.test.mjs`:
  **244 tests, 243 passed, 0 failed, 1 skipped** on Node 26.6.0. The existing
  disposable PostgreSQL test is skipped locally because `AQUA_TEST_DATABASE_URL`
  is not configured; hosted safety CI supplies its existing test service.
- `git diff --check` passed. Tests cover fixed endpoint/verb, actor/checkout/main
  rejection, first-attempt enforcement, missing credential/no fallback, exact
  object identity, HTTP denial/ambiguity, malformed/oversized/interrupted bodies,
  transport failure and absence of credentials/private responses in output.
- Self-review traced the credential-free context step, sole secret-bearing GET,
  redirect denial and every result category. No deployment-controller, source-fetch,
  policy, credential or permission configuration is changed.

Status: **IMPLEMENTED**, **TESTED** locally with the explicit existing skip above.
Protected human review, current-head hosted safety CI and the actual post-merge
diagnostic remain separate requirements, not inferred from fixture success.
