# Production operating readiness

ADR 0007 accepts the Vercel and Neon architecture. It does not authorize Production. This record maps every
remaining production no-go criterion to an accountable operator, a concrete check, and durable evidence.

## Accountability

`morton-nari` is the accountable operator for this personal portfolio deployment. The role owns:

| Responsibility                  | Required operating action                                                                                                             | Evidence                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Provider and resource ownership | Maintain sole authorized Vercel, Neon, and GitHub access; review access quarterly and after any credential event                      | Provider access review recorded in the release issue |
| Cost and quota ownership        | Review both dashboards before every release and quarterly; stop or remove the demo before exceeding the approved free-tier boundary   | Dated, non-secret usage summary                      |
| Monitoring                      | Check the deployed health/auth smoke, Vercel runtime errors, Neon activity, storage, and compute after promotion and during incidents | Workflow run plus dated dashboard review             |
| Incident response               | Disable promotion, preserve non-secret evidence, assess data exposure, and choose rollback or forward-fix                             | Incident issue linked from the release record        |
| Recovery                        | Verify the available Neon restore point before migration; never claim recovery beyond the active provider window                      | Restore-window observation and rehearsal record      |
| Retained preview                | Keep it synthetic-only, review it quarterly, and remove obsolete secrets/resources in the documented order                            | `docs/DEPLOYMENT.md` retained-preview record         |

This single-operator model has no independent on-call coverage or service-level agreement. If the application
becomes commercial, accepts real personal data, or needs shared operational coverage, Production must stop until
the hosting, privacy, support, access-control, backup, and incident model is reviewed again.

## Current provider boundary

The selected portfolio boundary is the Vercel Hobby and Neon Free plans. Provider limits are operational inputs
and must be checked at release time; they are not architectural constants. As reviewed on 2026-08-17:

- Vercel Hobby is for personal, non-commercial use. Its included usage can pause when exhausted, runtime logs are
  short-lived, team RBAC/log drains are unavailable, and no application SLA is assumed.
- Neon Free currently provides 100 CU-hours and 0.5 GB storage per project, scales idle compute to zero, and has a
  restore window of at most six hours or 1 GB of changes, whichever is reached first.
- Free-tier recovery is not a substitute for an independently rehearsed backup policy. The public portfolio must
  remain synthetic/non-sensitive and visibly limited.

The initial `DATABASE_POOL_MAX=1` is an accepted operating policy supported by local and hosted evidence. It may
change only after a separate deployment review records function concurrency, warm instances, provider-side
connections, and queue latency.

## Independently scoped Production design

Production must use a separate Vercel environment scope and separate Neon project/branch from the retained
preview. Values are generated directly in their target scope; Preview values are never copied or multi-selected.
The inventory and rotation rules remain in `docs/DEPLOYMENT.md`.

The GitHub `Production` Environment requires `morton-nari` review, permits protected branches only, and disables
administrator bypass. Self-review remains permitted because this is currently a single-operator personal
repository; the workflow approval is still a distinct manual action. Environment secrets are unavailable before
approval. Issue 114 must verify these settings again before it adds any migration, deployment, or promotion
command.

## Isolated release-control rehearsal

`Release control rehearsal` is manual and bound only to the protected `preview-smoke` Environment. It checks out
an immutable full commit SHA, runs backend and deployment compatibility checks, validates the protected preview
database name and administrative role without printing either credential, verifies the exact ordered migration
ledger, and runs the explicit migrator as an idempotent no-op.

This proves migration-command idempotence for a database whose ledger is already current: the migrator recognizes
every recorded entry and does not reapply it. It does not prove that arbitrary migration SQL is intrinsically
safe to execute twice. Every new migration still requires its own ordering, compatibility, and failure review.

The rehearsal deliberately creates a uniquely named table inside a transaction, forces the failure path, rolls
the transaction back, and proves that no object remains. This tests failure-stop behavior without deleting or
modifying application data. It does not automate a SQL down migration. Application rollback remains a separate
schema-compatibility decision. The result proves PostgreSQL transactional rollback for this compatible DDL
fixture, not that every future schema change is reversible; forward-fix is the default for irreversible schema
changes. Failure of the `ROLLBACK` command is itself a visible failed rehearsal and never ambiguous success.

Normal output contains only the reviewed commit, fixed environment label, migration count, and numeric rollback
object count. It must not upload artifacts or print URLs, credentials, roles, cookies, tokens, headers, SQL
payloads, answers, form data, or provider environment dumps.

## Production authorization checklist

Production remains **No-go** until one release issue records all of the following:

- [ ] `morton-nari` reviewed current Vercel/Neon access, quotas, costs, recovery window, monitoring, and incident ownership.
- [ ] Independent Production resources, domains, configuration, and secrets received explicit provisioning approval.
- [ ] The protected GitHub `Production` Environment reviewer and branch/tag policy were independently verified.
- [ ] A `Release control rehearsal` run passed for the immutable candidate commit and recorded no secret output.
- [ ] The target migration identity/level and available recovery point were reviewed.
- [ ] The candidate and previous application deployment were both assessed against the current schema; any unsafe rollback has a forward-fix plan.
- [ ] Issue 114 implements and passes review for complete Production CI/CD without weakening these gates.
- [ ] A final human approval explicitly authorizes Production provisioning and the named release.

Until every item is evidenced, the retained preview is the only authorized hosted environment.

## References

- [Vercel Hobby plan](https://vercel.com/docs/plans/hobby)
- [Vercel limits](https://vercel.com/docs/limits)
- [Neon pricing and Free-plan limits](https://neon.com/pricing)
- [Release and promotion policy](RELEASE_POLICY.md)
- [Deployment environment contract](DEPLOYMENT.md)
