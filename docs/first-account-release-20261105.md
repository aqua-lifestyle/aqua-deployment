# Exact first-account correction release

> **NOT BUSINESS AUTHORITY.** Version 1 execution worklog. No financial or
> commissioning activation is performed by this code-only release.

Application PR122 corrects the reproduced first-account HTTP503 deadlock using
only existing account operations while all financial/background holds remain.
Its merge is `f3490e76628f0b01159bb995bbb7c3bddb479601`; reviewed head
`5624f24625458f8b8ec0a195801f25ecfb2e8a00`. PR CI `42040798328/1` passed all
17 jobs. Main CI `42044364779/1` also passed all 17 required jobs. No deployment
check of the completed PR121 pair is repeated
as engineering evidence for this correction.

The existing executor selects only explicitly bound completed-operation
successors. That mandatory exact-source gate must recognize this necessary
application correction; bypassing it or adopting generic descendants is not an
option. This amendment adds one digest-pinned source/CI binding and the exact
reviewed nonfinancial middleware hash. Every other migration, source, payout,
configuration, ancestry, history, OIDC and runtime-hold check remains unchanged.
Original authority/evidence and the PR121 source/receipt are not rewritten.

The existing source-safe protected executor entry is used. Current immutable
source, native baseline/recovery, fresh holds, admission and readiness must pass;
no credential restoration, application feature reconstruction, new framework,
infrastructure, database operation or financial activation is included. The
application owner guide contains the ordered inherited-configuration/file-custody
and genuine first-customer operator handoff. Its private values are not fabricated
by this release binding.

## Evidence at implementation

Full local suite: 314 passed, zero failed, one existing PostgreSQL replay test
skipped because its disposable URL was absent. Added component cases cover exact
source/CI/purpose/target selection, the one permitted middleware digest, immutable
prior records, every other source pin, missing ancestry and additional migrations.
Full hosted Node24/PostgreSQL executor safety CI is required before merge. Actual release
outcomes are recorded on the PR only after observing them.
