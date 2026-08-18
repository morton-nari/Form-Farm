# Release and promotion policy

This policy covers the retained non-production preview and any later production promotion. Issue 112 adds
verification and approval gates only: it does not provision, migrate, deploy, or promote production resources.
ADR 0007 is Accepted. Its acceptance selects the deployment architecture. Issue 121 separately provisioned an
empty, isolated Production resource boundary; neither action authorizes migrations, deployment, or promotion.

## Required pull-request checks

Pull requests into `dev` must pass these stable GitHub job names before review and merge:

- `Frontend and domain`: Angular/domain tests, frontend build, whitespace, and production dependency audit;
- `Form domain`: explicit shared domain compilation;
- `Backend`: backend tests and build;
- `Backend integration`: database-backed integration tests through Testcontainers;
- `Deployment`: Vercel entry-graph type checking plus smoke/workflow policy tests.

Repository branch protection owns enforcement. A reviewer must still assess the code, migrations, documentation,
and security impact; green automation is necessary but is not approval.

## Retained-preview smoke

`Deployed preview smoke` is a manual workflow bound to the `preview-smoke` GitHub Environment. It targets only
the named isolated Vercel/Neon preview. The Environment contains `PREVIEW_SMOKE_ORIGIN` and the two narrowly
scoped secrets required for the run: a Vercel automation-bypass value and a direct preview database URL used by
cleanup. It must contain no Production-scoped value. The preview application continues to use its separately
scoped pooled `DATABASE_URL` with `DATABASE_POOL_MAX=1`; the cleanup URL is never attached to the application.

Each run creates a unique reserved identity of the form
`form-farm-smoke-<GitHub run id>-<attempt>@example.invalid`. The runner checks shallow health, Angular deep-link
fallback, JSON API 404 behavior, registration, secure host-only session issuance, session bootstrap, XSRF
bootstrap and rotation, missing/incorrect XSRF rejection, wrong-Origin rejection, an authenticated
database-backed management read, logout cookie clearing/revocation, and denial of subsequent protected access.

Cleanup runs even when smoke verification fails. In one transaction it selects only the exact reserved email,
refuses deletion if that account owns any form, deletes only its sessions and account, and reports numeric counts.
It also enforces an intentional **preview-wide operational retention policy** by removing all authentication
rate-limit buckets older than 24 hours. That housekeeping is broader than the exact smoke identity; it contains no
account/form deletion and must not be described as identity-specific cleanup. A cleanup error fails the workflow
and is therefore visible. The safety refusal deliberately favors a visible retained account over deleting
potentially valuable data. Investigate and remove a refused account manually only after confirming its exact
identity and ownership; never broaden account cleanup by wildcard, domain, age, or arbitrary user selection.

## Secret and output policy

GitHub Environment secrets must be masked and accessible only to the preview smoke job. Preview and Production
configuration remain independent; never copy Preview values into Production or select both provider scopes when
creating a value. Normal workflow output and artifacts must never contain database URLs or credentials, session
cookies, XSRF values, HMAC secrets, authorization headers, raw answers, or potentially sensitive form data.

The runner keeps credentials, cookies, and tokens in memory and emits fixed check names only. Cleanup emits only
numeric counts and generic failures. Policy tests reject production/generic database secret references and
artifact upload from the smoke workflow, and prove reporter output cannot interpolate supplied secret material.
Do not add request/response dumps, shell tracing, provider environment downloads, or debug artifacts to these
workflows.

## Manual production promotion

Production remains manual. `Production promotion gate` records readiness but intentionally performs no migration,
deployment, provisioning, or promotion. It is bound to the protected `Production` GitHub Environment, whose
required reviewers provide explicit approval. Before invoking it, the release operator must establish:

1. the exact application commit was reviewed and all required GitHub checks are green;
2. the target environment/database identity and current migration table were reviewed without exposing secrets;
3. the named migration level is compatible with the application commit;
4. an authorized reviewer supplied an approval/change reference.

The workflow records the full application commit SHA, migration filename, and non-secret approval reference in
the GitHub run summary. A future production workflow may consume an approved release record, but complete CI/CD
is separate future work and requires explicit approval of production resources and protections first.

## Migration and rollback

Migrations are an explicit release step using `DATABASE_ADMIN_URL`; they never run during application startup,
Vercel build, or ordinary deployment. Before migration, verify `APP_ENV`, database identity, provider project and
branch, recovery point, application commit, and current `form_farm_migrations` level. A failed or ambiguous
migration blocks promotion.

Prefer expand/deploy/contract ordering: add backward-compatible schema first, deploy compatible application code,
and remove old schema only in a later reviewed release. Record when a migration makes application rollback unsafe.
Promoting a previous Vercel deployment is allowed only after verifying it remains compatible with the database's
current schema.

Application rollback and database rollback are separate decisions. Never automatically reverse SQL migrations.
For irreversible or partially applied schema changes, forward-fix is the default recovery path. A database
restore or corrective migration requires its own reviewed incident/release plan and target-identity verification.

## Preview ownership and lifecycle

The repository owner owns the retained preview. It is synthetic-data-only and must remain within the current
Vercel Hobby and Neon Free limits documented by the providers. Review current dashboard usage and published
limits rather than treating a number in this repository as permanent. At each deployment issue and at least
quarterly, review owner need, deployments, secrets, database storage/compute, smoke cleanup failures, and last use.

Remove unused branch-scoped values immediately. Tear down the retained preview when it has no named owner, has
not been used for one quarter, exceeds a free-plan boundary, or production supersedes its verification purpose.
Remove Vercel variables/deployments before deleting the Neon project, and record only non-secret resource IDs.

Before Production is migrated or deployed, evidence is still required for current ownership/cost limits,
protected GitHub Environment reviewers, provider access and recovery roles, a rehearsed explicit migration,
schema-compatible deployment rollback, monitoring/incident ownership, and a reviewed complete CI/CD
implementation. The independently scoped empty resources, secrets, and assigned domain are recorded in
`docs/DEPLOYMENT.md`; their existence is not release approval.

The accountable operator, actionable evidence matrix, isolated rehearsal, and current no-go checklist are
defined in `docs/PRODUCTION_READINESS.md`. A passing rehearsal is evidence for release controls, not permission to
provision Production.

## References

- [Vercel usage and pricing](https://vercel.com/docs/pricing)
- [Vercel limits](https://vercel.com/docs/limits)
- [Vercel Protection Bypass for Automation](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation)
- [Neon plans](https://neon.com/docs/introduction/plans)
