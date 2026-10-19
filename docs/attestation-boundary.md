# Inactive signed-attestation prototype

The selected MVP contract is
[`github-evidence-v1`](github-evidence-admission.md), explicitly configured in
`tools/deployment/unattended-policy.json` version 3. The owner trusts `Xolani-M` and
`aqualifestyleclub`; external administrator-resistant custody is not required.
The deployment workflow does not fetch signed bundles, invoke this validator or
access a PostgreSQL replay credential. Missing GitHub evidence never falls back
to an attestation. Neither a signer nor a replay database is a v3 prerequisite.

The earlier credential-free prototype remains unchanged in:

- `tools/deployment/authorization-attestation.mjs` and its tests;
- `schemas/deployment-authorization-attestation-v2.schema.json`;
- `tools/deployment/postgres-replay-store.mjs`, its tests and
  `schemas/deployment-authorization-replay.sql`;
- `release-control.mjs:requireDeploymentAttestation`, an inactive consumer bridge
  retained for prototype tests only.

It uses Node's Ed25519 verification, explicit issuer/policy/inventory trust roots,
exact repository/SHA/run/attempt/verifier claims, expiry and replay-store injection.
The PostgreSQL adapter uses a single parameterized unique INSERT; its disposable
integration test races 64 requests and checks INSERT-only role restrictions.
No production signer, trust root or replay store is provisioned. Test signing keys
are ephemeral test material. These tests do not establish external custody,
production durability or deployment authority.

A future independently verified policy would need explicit approval and authentic
issuer, policy and execution evidence, with credentials isolated from untrusted
workers. Signing candidate-authored assertions is insufficient. This historical
prototype must not be presented as the active MVP gate or production assurance.
