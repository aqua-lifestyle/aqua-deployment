# Bounded Render environment diagnostic

Version 1, owner-authorized diagnostic-only addition for failed production run
41515153443/1. This is not a release correction or deployment authorization.

## Existing observation

The production audit ended at `provider-read: render-env` followed by
`PROVIDER_READ_REJECTED`. The client raises this error for a non-successful HTTP
GET before parsing the body or validating its value. It is distinct from local
`NORMAL_RUNTIME_CONFIGURATION_UNVERIFIED`, malformed-response and transport
failures. The original audit did not retain the exact key or HTTP status.

The existing credential-check mode reads 12 `runtimeSettings` keys. The accepted
CLEAN_START release reads those same keys in order plus
`App__AQGreenV2__Commissioning__AdmissionMode`. That coverage gap does not prove
the additional key is the rejected one.

## Protected execution contract

The existing `provider-credential-check.yml` has an opt-in boolean
`render_env_diagnostic`, default `false`. It is mutually exclusive with
`native_recovery_readback`. Context and mode validation run before the
credential-bearing step. The established fixed repository, protected main,
reviewed checkout SHA and administrator checks remain. Diagnostic execution
requires a valid run ID and attempt 1.

Only the existing protected `RENDER_API_KEY` is exposed to the diagnostic step;
the Vercel credential is absent. The fixed command selects no deployment entrypoint.
Existing verification and recovery observation modes retain their purposes.

One diagnostic execution performs at most 14 GETs:

1. Verify the fixed Render service identity.
2. Read the 13 ordered, executor-owned, allowlisted non-secret keys from
   `cleanStartRuntimeSettings` through the existing per-key client boundary.

No variable identifier, service, URL, key list or credential comes from dispatch
input. There is no environment enumeration, secret-file read, environment-group
read, redirect, retry, fallback or provider write. The first HTTP, format or key
identity failure stops further requests. Value mismatches are recorded without
their values and retain the production reader's read-all-then-validate ordering.

Protected job logs record only fixed classifications, approved key identifiers,
HTTP statuses when observed, run/attempt/producer and fixed service identity.
They never contain values, tokens, headers, raw provider messages or responses.
A transport failure has no fabricated HTTP status. A 404 has no fabricated cause.

## Configuration-source boundary

[Render's per-variable endpoint](https://api-docs.render.com/reference/retrieve-env-var)
explicitly excludes variables inherited from linked environment groups. A 200
with the expected key establishes a service-level entry. A rejection does not
establish whether a key is missing, inherited or inaccessible; the diagnostic
reports `configurationSource: NOT_ESTABLISHED` and
`inheritedConfiguration: NOT_DETERMINED`.

The group-detail API includes all environment values and secret-file content.
It is not called or substituted for the allowlisted endpoint. If the result
requires group-specific or configuration-change evidence, report that gap and
request specific authority rather than broadening access or weakening validation.

## Validation and review

```bash
node --test tools/deployment/render-environment-diagnostic.test.mjs tools/deployment/verify-provider-credentials.test.mjs tools/deployment/native-recovery-observation.test.mjs
node --test tools/deployment/*.test.mjs
git diff --check
```

Tests cover the full fixed plan, first-attempt/context denial, every key's failed
HTTP read, safe classifications, malformed responses, value mismatches, secret
canaries and workflow credential isolation. Provider responses are substitutes;
the one authorized protected diagnostic supplies actual provider evidence.

Review scope: context → mode → Render-only secret exposure → fixed GET plan →
sanitized evidence. No release controller, accepted application SHA, schema,
recovery, reconciliation or financial policy changes. Unknown source/status/cause
remains unknown. Required CI and review precede protected merge, then exactly one
diagnostic run. Report its result and stop; do not dispatch production.
