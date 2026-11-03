# Private application source fetching

Version: 1. Branch: `fix/private-source-fetch-20261103`.

## Bounded owner authorization and diagnosis

The owner authorized the smallest executor correction for private source fetching,
safe diagnostics, focused tests, the required executor safety checks and a protected
PR on 2026-11-03. This worklog records engineering execution, not new business-policy
authority. It authorizes no production deployment/rollback, operational database
work, financial activation, Yoco reimplementation, infrastructure or broader
executor redesign. Existing source identity, freshness and admission requirements
remain authoritative.

Base executor: `dcaaabe578b14355699ecc715a7aef6d30e38740`.

- GitHub repository metadata reports the application repository as private. The
  original fetch script used anonymous HTTPS and discarded the underlying error.
  A controlled anonymous access check failed with terminal prompts disabled.
- Failed qualification run `41615174871/1` stopped in `fetch-source.mjs`; admission
  and production were skipped. Its retained generic error does not establish the
  runner's exact underlying exception or HTTP status.
- Previous dispatches paired CI `41601901625/1` with an outdated application SHA.
  Authenticated GitHub metadata instead binds that successful main-push CI and
  merged application PR #119 to `1b748dfdaf3b63fb9dcc42f781ab79d5c39ca503`.

## Authentication and isolation

All three existing source-fetch steps use the existing protected repository secret
`AQGREEN_EVIDENCE_READ_TOKEN`. The fine-grained token's existing two-repository scope
and read permissions are described in [SETUP.md](../SETUP.md); Git object fetching
requires only **Contents: read** on the application repository. No new credential,
permission grant, job-token fallback or anonymous fallback is introduced. Runtime
tests establish transport behavior, not the token's configured permissions,
expiration or actual GitHub access.

`fetch-source.mjs` supplies HTTP Basic authentication (`x-access-token` username)
through Git's process-only `GIT_CONFIG_COUNT` environment, with `extraHeader` scoped
to the executor-owned exact application HTTPS repository URL. The credential is
absent from command arguments, remote URLs and persistent Git configuration. Only
fetch processes receive the header; init and SHA verification do not. HTTP redirects
and credential helpers are disabled. Inherited Git configuration, helpers, askpass,
tracing, Node options, job credentials and provider credentials are not forwarded.
Git smart-HTTP upload-pack requests only read Git objects; they are not repository
writes even though the protocol includes a POST.

Source fetching still only initializes a Git object directory, fetches exact
validated SHAs and verifies `FETCH_HEAD`. It never checks out application files,
loads application configuration, initializes submodules, installs dependencies or
executes application code. The existing explicitly selected member path uses the
same authentication for its pinned receiver SHA and retains receiver verification.

Candidate and admission jobs receive no provider credentials. The production job's
source-fetch step receives only the read token; provider credentials remain in the
separate existing deployment-controller step. Ordinary PR safety tests receive no
secrets. No authentication settings or branch/environment protection is changed.

## Safe failure categories

The CLI exits nonzero with one fixed category and the existing no-application-code
message. It never prints subprocess errors, stdout/stderr, HTTP responses or headers.

| Category | Meaning |
| --- | --- |
| `SOURCE_FETCH_EVENT_UNREADABLE` | Event file unavailable or invalid JSON |
| `EXECUTOR_INPUT_INVALID` | Dispatch contract rejected |
| `INERT_SOURCE_DIRECTORY_REQUIRED` | Source object directory missing or equals executor worktree |
| `GITHUB_EVIDENCE_READ_CREDENTIAL_REQUIRED` | Explicit read credential missing, empty or malformed |
| `SOURCE_FETCH_DIRECTORY_UNAVAILABLE` | Object directory cannot be created |
| `SOURCE_FETCH_INIT_FAILED` | Git initialization failed |
| `SOURCE_FETCH_REMOTE_FAILED` | Git remote fetch failed; auth, HTTP and network cause are not inferred from stderr |
| `SOURCE_FETCH_IDENTITY_UNREADABLE` | `FETCH_HEAD` could not be read |
| `FETCHED_SOURCE_MISMATCH` / `FETCHED_RECEIVER_MISMATCH` | Returned object identity does not match the selected SHA |
| `SOURCE_FETCH_UNEXPECTED_FAILURE` | Unrecognized internal failure; never interpreted as successful fetching |

Failures stop immediately without automatic retries or identity fallback.

## Exact application and CI binding

The owner's authorized binding for a subsequent separately authorized qualification
is:

```json
{
  "ci_run_id": "41601901625",
  "ci_run_attempt": "1",
  "sha": "1b748dfdaf3b63fb9dcc42f781ab79d5c39ca503",
  "qualification_only": true,
  "release_mode": "full"
}
```

Do not substitute `a4755801ce89868d7791422f3c983363ab76bf30`: it is not this CI's
source. The executor's own workflow SHA is a separate identity. The correction does
not hard-code an application release into runtime policy, relax freshness or main
checks, or dispatch a qualification/release. If this binding later becomes stale or
main advances, stop for fresh authoritative evidence; do not rewrite timestamps or
reuse outdated acceptance. Other admission failures remain independent requirements.

## Execution plan and evidence

1. Inspect exact executor source, existing authentication and protected PR checks.
2. Add process-only authenticated inert fetching and bounded diagnostics.
3. Exercise positive and negative authentication, identity, isolation and binding
   cases, including real Git against a disposable local smart-HTTP fixture.
4. Run the existing full executor safety suite, inspect the diff and submit the
   protected PR; collect current-head CI and human review evidence.

Local HTTP/Git fixtures are component/transport evidence, not actual protected-token GitHub access,
application acceptance, provider acceptance or production verification. The existing
hosted safety workflow includes its disposable PostgreSQL prototype test; this
correction adds no database behavior or operator database action.

### Local validation

- Node `26.6.0`; `npm ci --ignore-scripts` passed (audit: zero vulnerabilities).
- Initial focused run: **53 passed, 1 failed, 0 skipped**. The new provenance
  regression fixture omitted the required `workflow_dispatch` event context. The
  fixture context was corrected without changing its rejection assertion.
- Final focused command:
  `node --test tools/deployment/fetch-source.test.mjs tools/deployment/qualification-only.test.mjs tools/deployment/executor.test.mjs tools/deployment/evidence-access.test.mjs`:
  **54 passed, 0 failed, 0 skipped**.
- Existing full command `node --test tools/deployment/*.test.mjs`:
  **234 tests, 233 passed, 0 failed, 1 skipped**. The existing disposable PostgreSQL
  replay-adapter test was skipped because local `AQUA_TEST_DATABASE_URL` is absent.
  Required hosted Node-24 CI provisions its existing test service and must execute
  this test before a complete hosted-suite claim.
- `git diff --check` passed. Standalone `actionlint` is unavailable locally;
  workflow secret placement and every source-fetch call site have focused checks.
- Self-review traced the three fetch callers, default/full and selected member
  paths, remote failure/redirect, source/receiver mismatch, retained provenance
  rejection, and the separate provider-bearing controller step. No blocking
  branch-owned defect was identified. Human review remains separate evidence.

Status: **IMPLEMENTED**, **TESTED** locally with the explicit skip above. Exact PR
revision, required hosted check and human-review outcomes are recorded on the
protected PR. Merge readiness requires those current-revision results; no merge,
qualification dispatch or production operation is authorized by this record.
