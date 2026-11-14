# AQGreen frontend-only release: exact failed-run reconciliation

The owner authorized **one** dispatch of `post-normal-frontend-v1` for application
`fb4d7e509db2f5c8de68df44ea978995a5c455fb`, CI `43597833117/1`. Executor
run [`43630374712/1`](https://github.com/aqua-lifestyle/aqua-deployment/actions/runs/43630374712)
failed after its original audit acknowledged Vercel deployment
`dpl_EXC25PZxFuuWzeV3Vud5F3PgkmfE`. Its eight-row audit, final `failed` row
and GitHub conclusion remain unchanged. No second dispatch, provider retry,
rollback, Render deployment, D10 edit or financial-setting change occurred.

## Required public build inputs and defect

The qualified source proof authorizes exactly
`NEXT_PUBLIC_ABP_API_URL=https://aqualifestyle-api.onrender.com` and
`NEXT_PUBLIC_DEFAULT_TENANT_NAME=Default`. The authenticated file-deployment
request explicitly provided both values in `env` **and** `build.env`, with
deployment-build-env precedence, pinned project settings and hashes of all
500 source files. The original upload/create intent and acknowledgement,
run/CI/release identity, manifest and source proof are in the immutable audit.
The provider's deployment GET contains both **names**, but not their effective
values, in `env` and `build.env`; the current project environment cannot prove
historical build inputs. These checks prevent a frontend compiled for the
wrong backend or tenant from being marked verified.

`frontend-release.mjs` previously invoked the values-only
`validateFileDeployment` before `verifyObservedFileDeployment`. That caused
`VERCEL_EFFECTIVE_BUILD_INPUTS_UNVERIFIABLE` **before** its existing, stricter
names-only path could read the actual alias-bound compiled public-env module.
The correction removes this premature gate and runs the observed verifier both
after READY and at final readback. Readable provider values still must match;
names-only metadata requires exact names, the original file-source proof, the
unchanged pinned `public-env.ts` hash, a stable authenticated production alias,
compiled literals matching **both** approved values, project/root/build-command
validation and a stable final backend. Missing, conflicting or inaccessible
assets continue to deny verification. This does not attest private
`NEXTAUTH_SECRET`, another runtime secret or an actual customer checkout.

## Separately traceable historical effect

`governance/aqgreen-frontend-failed-release-43630374712.json` (SHA-256
`eb8e7c97a815e0e5181983bf26adf098af3193b2885b41268f3c6563549c09f0`)
binds the exact original run, actor, failed job, audit artifact `14128261978`,
archive SHA-256 `c471733ef4d2bd47f006a38339ee4f377e283f155f40e41271afec72077baf43`,
audit rows digest `f42bcd7bbe44d67b8797360d6c592605c8c4016bfe`, source
manifest, acknowledged deployment and one compiled chunk digest. The original
unmodified JSONL is separately retained in the owner evidence directory with
file SHA-256 `14adb3dd0f7a4c22d4a0908db26a3fbdeffe285736e9cfd2c0171730d290c746`.

An authenticated original-artifact read and the exact failed job/attempt are
required before the history plan can classify the run as
`frontendReconciliations`. This is **not** a successful run, verified release
receipt, new full-release predecessor or retry authority. Re-dispatching the
same source remains blocked. The separate read-only verifier rechecks current
provider identity, READY state, alias/domain, original request reconstruction,
compiled values and asset hash, single candidate deployment, single unchanged
live Render deployment, Normal settings, health and payment availability. Its
live GET-only check passed using the original eight audit rows at
2026-11-14T20:07:46Z. Provider snapshots and the protected code/record review
are separate facts: later provider drift fails closed.

A GET-only history dry run with a synthetic, never-dispatched next run and all
82 actual executor runs authenticated the original GitHub artifact. It retained
the nine existing full-release receipts, selected run 81 as the full baseline,
classified run 82 only in `frontendReconciliations`, and granted no automatic
resume. This dry run made no GitHub workflow dispatch or provider request.

## Production behavior boundary

The public production invitation page displayed the corrected invalid-code
guidance without offering checkout; anonymous member navigation required
login. The served invitation bundle contains the recorded two-instalment
continuation logic, and qualifying source tests cover replay and uncertain
checkout outcomes. No genuine signed-in invitation, R600 payment or provider
confirmation was performed. The commissioned backend remained the only live
Render deployment `dep-dbru710n74is738ah8bg`, at SHA `b8d86e5e60997483423b273d5f426c08b411f573`,
Healthy/Available with automatic payouts, background jobs and monthly entry
obligations held. The retained commissioning receipt records Normal/Committed;
the old operator session was expired, so no new privileged phase GET is claimed.

Protected review/CI of this correction is required. No code or record in this
change retroactively edits the original failed audit or authorizes a further
production deployment. Subsequent frontend sources require their own qualified
successor and alias/baseline admission; ordinary full backend release remains
blocked in Normal state.
