# Minimum permission correction and qualification handoff

> **NOT BUSINESS AUTHORITY.** This worklog records execution state and evidence. It
> cannot confirm or supersede a business-policy decision.

## Scope, authority and completed code

Owner authorization: bounded permission corrections on executor PR #1, starting
at `15e0f5092e119dc671e23d2c4a7420eb336280b5`. Branch:
`feature/automatic-qualified-executor`. The two named administrators are trusted.
That code-only authorization excluded settings, secrets, provider operations,
dispatch and merge.
Application PR #106 remains unchanged; B6/B7 are separate.

Subsequent explicit owner authorization at baseline `61d9e44` permits only the six
prepared executor settings requests, original readback capture/commit, focused tests
and hosted safety CI. Those settings were applied and independently read back on
2026-10-19 by authenticated administrator `Xolani-M` (86495928). No merge, PAT,
provider credential or qualification dispatch is authorized by that setup task.

Implemented: explicit read-only GitHub credential wiring; GET-only evidence
transport without fallback; administrator-readback binding for hidden ruleset
fields; administrator merge approval before use of those records. Existing
candidate, 17-check/240-test classification, qualification-purpose receipt,
history/replay and provider sequencing are reused. No inventory expansion.

## Original evidence and assumptions

The application readback in `governance/ruleset-readbacks.json` was retrieved with
the existing authorized administrator session from
`GET /repos/aqua-lifestyle/aqua-lifestyle/rulesets/25297647`. It is an observation,
not approval of this unmerged executor revision. Its full policy authority comes
only from the exact trusted-administrator merge checked by the controller.

The runtime compares the approved public projection and exact `updated_at` string
with GitHub's live response. It relies on GitHub updating that revision metadata
when configuration changes and on trusted administrators preserving the approved
configuration. Local tests establish comparison/denial behavior, not GitHub's
timestamp behavior for a live bypass mutation. No live setting was changed to
test that assumption. This mechanism does not prove current hidden bypass actors
independently of GitHub metadata or resist a trusted administrator changing policy.
An unexpected/missing revision, visible bypass, unapproved ruleset or altered
public rule denies. Do not refresh approval automatically from the runtime.

Executor ruleset #25403847 is active on main; its full original administrator
response, including `bypass_actors: []`, is now retained in the same readbacks file.
The original response includes GitHub defaults not specified by the prepared
request. In particular, `require_extra_approval_for_unattributed_changes: true`
has no effect with zero required approvals, per GitHub's ruleset documentation;
it was preserved. Effective rules and environment/Actions settings are recorded in
`governance/executor-configuration-readback.json`. The environment and repository
secret inventories are both empty. Approval through the exact trusted executor
merge and actual evidence-read credential operation remain unverified.

## Exact operations requiring separate owner authorization

Prepared bodies are `governance/qualification-setup-requests.json`. Compare current
settings before application; preserve unrelated protections and read back each
result. These are requests, not an executable auto-configuration script.

1. **Completed and read back.** Create the active executor-main ruleset: deletion/non-fast-forward protections,
   PR required, zero reviews/last-push approval, no bypass actors, strict
   `Executor safety tests` bound to App 15368. Existing application ruleset is
   unchanged. Create empty `production-release`, main branch only, no wait or
   reviewers, `can_admins_bypass=false`. No provider secret is needed.
2. **Completed and read back.** Apply selected-actions restrictions for the four existing exact SHA pins and
   SHA enforcement; retain read-only token defaults and no workflow PR approval.
3. **Original captured; PR commit/CI recorded with this handoff.** An authorized administrator obtains the new executor ruleset via
   `GET /repos/aqua-lifestyle/aqua-deployment/rulesets/25403847`, including explicit
   `bypass_actors: []`. Retain the `id`, `name`, `target`, `source_type`, `source`,
   `enforcement`, `conditions`, `rules`, `bypass_actors`, `updated_at` fields in a
   new `rulesets` entry with `repository` and original `observedAt`. Remove that
   repository from `pendingRepositories`. Commit to PR #1 and obtain passing
   safety CI before the trusted administrator merges it. This is configuration
   evidence completion, not another controller feature or per-release approval.
4. Provision/approve the narrowly scoped GitHub evidence-read PAT separately:
   resource owner `aqua-lifestyle`; selected repositories `aqua-lifestyle` and
   `aqua-deployment`; Actions/Checks/Contents/Pull requests/Metadata read only;
   all other permissions absent. Use an expiring token with owner-managed renewal.
   Store as **executor repository** secret `AQGREEN_EVIDENCE_READ_TOKEN`, not an
   application/organization-shared secret or production-environment secret.
   Record permission/scope/expiry metadata only, never the token. Candidate and
   admission necessarily read GitHub; they still have no provider credentials.
   The PR test workflow does not reference this secret. All executor workflow
   write access must remain with trusted administrators; a repository secret is
   not claimed to be administrator-resistant custody.
5. Demonstrate that identity can GET exact application run/attempt jobs, checks,
   artifact metadata/archive, commit/PR/source metadata, and both repositories'
   environment/branch-policy, rules and history metadata. Public listing alone
   does not establish authenticated archive retrieval. The controller uses fixed
   GitHub origins and strips authentication on the storage redirect. An App/PAT
   with write or provider permissions is not the specified setup.
6. Separately authorize the trusted administrator's merge of PR #1. Its resulting
   main merge SHA, not the old PR head, is the executor identity for qualification.
   The controller checks that merge against the two approved user IDs/logins.
7. Obtain fresh approved application-main evidence without editing PR #106:
   current main `23f176db6eb13af5ee01ff69f1a9f7bbe6b880ff` cannot produce the
   mandatory report. Existing run `38911525858` (attempt 1, October 16) is stale and
   has no such artifact. Rerunning that source cannot fix the missing reporter.
   Publishing the approved source already in PR #106 requires separate owner
   merge authorization; it is not implied here. Keep automatic-trigger credentials
   unconfigured and provider credentials absent. Do not weaken source pins or
   substitute a PR-branch run. After the separately authorized source publication,
   require current-main push CI with all 17 checks successful, 25 protected hashes
   unchanged, and exactly one unexpired digest-bearing
   `mandatory-security-SHA-RUN-ATTEMPT` containing the complete `report.json`.
   Evidence must be less than 24 hours old at admission.
8. Only after separate dispatch authorization: run `deploy.yml` on executor main
   once with exact `sha`, string `ci_run_id`, string `ci_run_attempt`, and boolean
   `qualification_only: true`. No automatic-trigger App is required for this
   single expressly authorized test. Candidate and admission must succeed;
   production must be skipped, with no environment/provider access. Retain the
   purpose-bound receipt and exact source/executor/run-attempt evidence. Bounded
   negative attempts (wrong CI attempt and same-run rerun) need their own stated
   authorization; both must deny, with production skipped. Preserve all history.

Any missing evidence, policy drift, expired token or unknown history stops this
sequence. No provider credentials or replay database are required. A successful
qualification does not authorize or prove production deployment.

## Validation and next action

### Bounded credential-verification correction

At baseline `05cc1f8`, the owner separately authorized a GitHub-only credential
verification mechanism and commit/push, excluding merge, application changes,
qualification dispatch and provider operations. GitHub secret metadata confirms
the evidence secret exists; its value was never retrieved or logged here.

Implemented `credential-check.yml` and `verify-evidence-credential.mjs` with a
trusted-administrator, exact-head `readpat-SHA` label gate on PR #1. The existing
ordinary safety CI is unchanged and receives no secret. A pre-secret job-token
check validates the live PR approval and successful safety CI; the PAT is passed
only to the subsequent GET-only verification step. It checks both repositories'
required evidence-reading routes and authenticates the actual archive bytes.
Approval is checked again at completion. Missing access denies without fallback.

The gate is explicit review of the exact PR code, not a claim that arbitrary PR
code is trusted. Forks, other PRs, changed heads, ordinary label actors and reruns
are rejected. The trusted-admin model still assumes executor workflow writes are
restricted to trusted administrators. No actor permission changes were made.

Local focused command:

```bash
node --test tools/deployment/verify-evidence-credential.test.mjs
```

7 passed, 0 failed, 0 skipped. Controlled HTTP substitutes verify context denial,
pre-secret ordering, GET-only reads, missing/denied authentication, artifact and
identity substitution, approval revocation and redacted output. Hosted safety CI
runs the existing complete executor test command at the pushed revision. No
mandatory application inventory was changed. Real credential execution is pending
the administrator's SHA-specific label; successful local/CI substitutes do not
verify the PAT. See `SETUP.md` for exact execution and evidence requirements.
The new suite plus existing evidence-access and qualification-only suites passed
21 tests, 0 failed, 0 skipped; `git diff --check` passed.

Next action for this correction: review the new head and passing safety CI, then
explicitly apply its `readpat-SHA` label. Do not merge or dispatch qualification as
part of this implementation task. Read success will not prove the token has no
write permissions or that the old main artifact qualifies for deployment.

### Carried-forward implementation evidence

Local command:

```bash
node --test tools/deployment/evidence-access.test.mjs tools/deployment/executor.test.mjs tools/deployment/github-evidence.test.mjs tools/deployment/qualification-only.test.mjs
git diff --check
```

Baseline `61d9e44`: 61 passed, 0 failed, 0 skipped. Hosted safety CI is bound to the pushed commit and
reported in PR #1. Tests use controlled GitHub/provider substitutes; they do not
establish token installation, live secret scope, live timestamp changes or actual
admission. For the setup evidence change, focused validation is
`node --test tools/deployment/evidence-access.test.mjs tools/deployment/qualification-only.test.mjs`;
14 passed, 0 failed, 0 skipped; `git diff --check` passed. The pushed commit's
hosted CI is reported in PR #1. No controller or inventory
change was made during setup. Next owner actions: separately authorize the scoped
read credential, exact trusted executor merge, fresh application-main evidence and
one qualification-only dispatch. Production remains blocked.

Supported platform contracts: [repository-scoped job token](https://docs.github.com/en/actions/concepts/security/github_token),
[artifact authentication](https://docs.github.com/en/rest/actions/artifacts#download-an-artifact),
[ruleset private fields](https://docs.github.com/en/rest/repos/rules#get-a-repository-ruleset),
[environment reads](https://docs.github.com/en/rest/deployments/environments#get-an-environment).
