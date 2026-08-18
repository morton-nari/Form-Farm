# Deployment environment contract

Form Farm AI has one isolated Neon/Vercel preview for Milestone 8 verification and one empty, independently
scoped Production resource boundary. This contract defines the configuration both environments must satisfy
before the backend starts. ADR 0007 is Accepted based on the isolated hosted evidence. Empty Production
resources are provisioned, but migration, deployment, promotion, traffic, and real data remain unauthorized
until the separate release criteria and approval in `docs/RELEASE_POLICY.md` are satisfied.

## Isolated preview record

The preview uses Neon project `wandering-flower-45162707`, branch `br-polished-mud-aywzxibq`, database `neondb`,
AWS region `us-east-2`, PostgreSQL 18, and a 0.25 CU free-plan compute. The Vercel project is `form-farm`; Git
previews run the retained branch `deployment/retained-preview` in function region `iad1`. Verification at
application commit `abf7d98` used preview deployment `dpl_4ZDWy3PqPVvt77vPhvB2VRSck3fe` and the stable branch
alias configured as the exact public origin. Deployed smoke run `32014044841` exercised runner commit `d8efb1c`
against that application deployment.

Committed migrations `0000` through `0003` were applied explicitly and recorded in `form_farm_migrations`.
Application traffic uses the dedicated least-privileged role through the pooled endpoint. The direct
administrative URL was never attached to Vercel, and no seed command or production configuration was applied.
All ten application variables are branch-scoped Preview values; the database and two independent HMAC secrets
are hidden. No equivalent production values were created by this work.

Hosted verification established:

- exact `/api/*` forwarding to Fastify, JSON API 404s, exact `/health`, and Angular deep-link fallback;
- secure host-only session issuance, authenticated database access, XSRF rotation, logout clearing, and generic
  fail-closed responses for missing, mismatched, and cross-origin evidence;
- one trusted Vercel proxy hop, with caller-supplied forwarded identity rejected by the platform boundary;
- successful cold starts and a 16-request authenticated burst across three observed warm instances while
  retaining `DATABASE_POOL_MAX=1`;
- a complete protected deployed-smoke run whose fixed-name checks all passed, whose exact cleanup deleted one
  synthetic account and session, and whose independent follow-up query found no matching user, session, or form.

When the missing Vercel project was restored, Vercel forcibly classified the new project's first bootstrap
deployment as Production even though no Production-scoped configuration or secrets existed. That unusable
bootstrap deployment and its alias were removed immediately; `https://form-farm.vercel.app/health` then returned
provider `404`. The retained deployment is explicitly `target=preview`. This provider bootstrap behavior does not
authorize a future Production deployment and must not be repeated as a promotion procedure.

The resources are retained as the named non-production verification environment for deployed smoke automation
and promotion-policy work. `morton-nari` owns the environment; it must remain on the providers' free
plans, branch-scoped, synthetic-data-only, and separate from production. Review ownership, scope, and provider
usage when completing each deployment issue. If it is no longer required or exceeds those limits, remove the
branch-scoped Vercel variables/deployments, then delete the Neon project. Never place credentials or connection
strings in teardown records.

## Empty Production resource record

Issue 121 provisioned an inert Production boundary on 18 August 2026. `morton-nari` owns it under the approved
AUD 0 portfolio limit:

- authoritative Vercel project `form-farm` (`prj_21V36935x87KWQOWvd5b34q4dUaq`), using its independently scoped
  Production environment and assigned `form-farm.vercel.app` domain;
- Neon Free project `form-farm-production` (`flat-shadow-07136156`) in `aws-us-east-2`, PostgreSQL 18;
- default Production branch `production` (`br-icy-lake-axt1h4na`), database `neondb`, and read/write compute
  `ep-shy-block-axm0q4w0` capped at 0.25 CU with free-plan scale-to-zero;
- application login role `form_farm_app`, with database connect and `public` schema usage only: it is not a
  superuser, cannot create databases or roles, has no inherited memberships, and cannot create schema objects.

The Vercel Production scope contains only `APP_ENV`, `NODE_ENV`, `DATABASE_ENVIRONMENT`, `DATABASE_POOL_MAX`,
`DATABASE_URL`, `PUBLIC_APP_ORIGIN`, `AUTH_SECURE_COOKIES`, `TRUSTED_PROXY_HOPS`,
`AUTH_SECRET_ENVIRONMENT`, `XSRF_HMAC_SECRET`, and `RATE_LIMIT_HMAC_SECRET`. The pooled application URL and both
independently generated HMAC secrets are sensitive values. `DATABASE_POOL_MAX` remains `1`. The direct owner URL
exists only as the masked `PRODUCTION_DATABASE_ADMIN_URL` secret in the protected GitHub `Production`
Environment; it is not attached to Vercel application runtime.

Verification listed names, types, and scopes only. No value was downloaded or recorded. Preview retains its
separate branch-scoped variables and separate Neon project. Production has no Form Farm table, migration ledger,
seed, account, form, submission, application deployment, or serving traffic. The assigned domain therefore does
not constitute a launched application. The Vercel Hobby and Neon Free dashboards showed no approved paid plan or
spend; provider quotas remain release-time observations rather than guarantees.

Review ownership, free-tier usage, secrets, and continued need at every Production release issue and at least
quarterly. If this empty boundary must be removed, first remove Production-scoped Vercel variables and the GitHub
Production administrative secret, confirm no deployment or alias is serving traffic, then delete Neon project
`flat-shadow-07136156`. Remove the assigned Vercel domain/project only if the authoritative application project is
also intentionally retired. Record identifiers and outcomes only, never credentials or connection strings.

## Environment ownership

`APP_ENV` is the application-owned deployment stage. It is separate from `NODE_ENV`, which controls Node.js
runtime behavior. Hosted functions require `NODE_ENV=production` and one of these explicit stages:

| Stage | Defaults | Database and secrets |
| --- | --- | --- |
| `development` | Loopback origin, insecure loopback cookies, development-only secrets, pool maximum 10 | Disposable local PostgreSQL only |
| `preview` | None | Explicit isolated-preview database and independent preview secrets |
| `production` | None | Explicit production database and independent production secrets |

Hosted configuration also requires `DATABASE_ENVIRONMENT` and `AUTH_SECRET_ENVIRONMENT` to equal `APP_ENV`.
These labels make cross-environment attachment an explicit configuration act; they do not replace provider access
controls. When Vercel system variables are present, `VERCEL_ENV` must match `APP_ENV`. Preview
`PUBLIC_APP_ORIGIN` must be exactly `https://${VERCEL_BRANCH_URL}`; production must match
`https://${VERCEL_PROJECT_PRODUCTION_URL}`. The deployment-specific `VERCEL_URL` is not a stable configured
origin, and the production project URL is never inferred in a preview.

Vercel values must be scoped separately to Preview and Production. Do not select both environments when adding
a database URL or secret. An isolated preview should use branch-specific Preview values where practical. Inspect
names and scopes with `vercel env ls`; do not download, print, paste, or screenshot secret values for review.

## Inventory

| Variable | Development | Preview and production owner |
| --- | --- | --- |
| `APP_ENV` | `development` | Release operator: `preview` or `production` |
| `NODE_ENV` | `development` | Vercel/runtime: `production` |
| `DATABASE_URL` | Local URL | Database owner: Neon pooled application URL |
| `DATABASE_ADMIN_URL` | Local direct URL for tooling | Release operator only; direct Neon URL, never function runtime |
| `DATABASE_ENVIRONMENT` | Not required | Database owner; must equal `APP_ENV` |
| `DATABASE_POOL_MAX` | `10` | Release operator; initially `1`, no default |
| `PUBLIC_APP_ORIGIN` | `http://localhost:4200` | Deployment owner; exact HTTPS deployment origin |
| `AUTH_SECURE_COOKIES` | `false` | Deployment owner: `true` |
| `TRUSTED_PROXY_HOPS` | `0` | Deployment owner; explicit verified hop count |
| `AUTH_SECRET_ENVIRONMENT` | Not required | Secret owner; must equal `APP_ENV` |
| `XSRF_HMAC_SECRET` | Development-only default | Secret owner; independent 32-byte base64url value |
| `RATE_LIMIT_HMAC_SECRET` | Development-only default | Secret owner; independent 32-byte base64url value |
| previous-secret variables and deadline | Optional | Secret owner; bounded rotation overlap only |

Timeouts and rate-limit values retain their centrally validated defaults unless deployment evidence justifies an
override. Angular receives none of the database or authentication variables.

## Database URL roles and migrations

Application traffic uses `DATABASE_URL`. In preview and production it must be a Neon PostgreSQL URL whose endpoint
name ends in `-pooler` and whose query includes `sslmode=require`. Neon uses PgBouncer transaction pooling; code
must not rely on session state across transactions.

Migrations and Drizzle tooling use `DATABASE_ADMIN_URL`, which must be a direct, non-pooler endpoint. The variable
belongs only in the controlled migration environment and must not be attached to the Vercel function. Migrations
remain an explicit release operation and never run during build, startup, or function initialization.

Before a hosted migration, verify the stage and database identity using non-secret provider metadata, verify the
available recovery point, run `npm run db:migrate` once with `DATABASE_ADMIN_URL` injected, and record the commit
and migration version. Never echo either URL.

After migrations, run `npm run db:grant-production-app-role` through the same protected release boundary. It
revokes broad table/sequence privileges, preserves schema usage without schema creation, grants CRUD only on the
seven application tables listed with the migration manifest, and leaves `form_farm_migrations` inaccessible to
the application role. The migration/admin and application roles must remain different. Every new application
table requires an explicit reviewed update to that grant manifest; do not grant ownership or migration rights for
convenience.

## Initial pool budget

The local pool maximum of 10 is not a hosted default. Preview and production must set `DATABASE_POOL_MAX`
explicitly. The initial managed-function value is **1 per warm function instance**:

```text
potential application clients = warm function instances × DATABASE_POOL_MAX
```

On 17 August 2026, a disposable local PostgreSQL run used `DATABASE_POOL_MAX=1`, concurrency 8, and a 250 ms held
query. The safe numeric output was:

```json
{"poolMax":1,"concurrency":8,"holdMilliseconds":250,"peak":{"total":1,"idle":1,"waiting":7},"final":{"total":1,"idle":1,"waiting":0}}
```

This proves the `pg` client cap and queue behavior without contacting a provider. It also demonstrates that one
client serializes excess database work. It does not establish Vercel instance concurrency, the number of warm
instances, Neon active transaction behavior, or acceptable request latency. No larger value is justified before
the isolated preview measures those inputs.

Repeat with a disposable database using:

```powershell
$env:DATABASE_URL = '<injected disposable application URL>'
$env:DATABASE_POOL_MAX = '1'
$env:POOL_MEASURE_CONCURRENCY = '8'
$env:POOL_MEASURE_HOLD_MS = '250'
npm run db:measure-pool
```

The command prints numeric pool metrics only. Do not capture the invoking environment or shell history in PRs.
The isolated-preview issue must repeat this observation under managed-function concurrency and compare Neon
monitoring before changing the budget.

The isolated preview kept `DATABASE_POOL_MAX=1`. A 16-request authenticated burst completed successfully across
three observed warm Vercel instances. Application response times in the platform logs ranged from roughly 74 ms
to 235 ms, while repeated Neon activity snapshots showed one server-side connection for the restricted
application role. This small sample supports retaining `1`; it is not evidence to increase the per-instance pool.
Neon activity does not expose each warm instance's internal `pg.Pool.waitingCount`, so hosted queued-count
evidence remains a limitation of this black-box preview check rather than a reason to weaken or raise the bound.

The Vercel function explicitly includes the Argon2 prebuilt native binaries. Authentication is part of the
composed backend even when a shallow route is requested, and Vercel's file tracing otherwise selects only the
build host's native asset. Keep this inclusion at the infrastructure packaging edge; it does not change the
authentication or application boundary.

The `api` deployment entry point has its own ESM package boundary. Vercel emits the TypeScript entry point as
JavaScript under that boundary, so Node loads its generated imports with the same module semantics as the backend.
The `/api/:path*` rewrite carries its captured path to the single function through a private query marker. The
Vercel entry point restores the original `/api/*` pathname and removes that marker before Fastify routing; the SPA
fallback continues to exclude the complete API namespace. A separate exact `/health` rewrite reaches the same
function and restores the backend's shallow health path without adding database work.

`__form_farm_path` and `__form_farm_health` are reserved infrastructure metadata. A public request that collides
with, duplicates, or combines these markers fails with a generic `400` before application routing. Restored API
paths reject traversal segments, absolute-looking separators, backslashes, malformed encoding, and repeatedly
encoded variants while preserving legitimate encoded path segments and ordinary query parameters.

## Secret generation and rotation

Generate each current secret independently using a cryptographically secure source, for example
`node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"`, and send its
output directly to the provider secret input. Do not save the output in the repository, shell transcript, issue,
PR, passwordless note, or screenshot.

To rotate, install a new current value, move the old current value to its matching previous variable, and set
`AUTH_PREVIOUS_SECRET_VALID_UNTIL` no more than 24 hours ahead. Redeploy, verify authentication, then remove the
previous value and deadline after the overlap. XSRF and limiter secrets must never be equal or reused between
preview and production.

## Trusted proxy ownership

`TRUSTED_PROXY_HOPS` is owned by the deployment configuration, not by request headers or schema data. The isolated
Vercel preview showed that the Node function receives Vercel's request on a loopback socket, with the client chain
in the forwarded address metadata. Its branch-scoped preview value is therefore `1`: trust the one platform hop,
then use the first untrusted address as the client identity. Re-verify this boundary before using another runtime
or proxy topology. `PUBLIC_APP_ORIGIN` is never inferred from `Host`, `Forwarded`, or `X-Forwarded-*`.

## References

- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Vercel system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
