# Deployment environment contract

Form Farm AI has not yet provisioned Vercel or Neon resources. This contract defines the configuration that
an isolated preview and the production portfolio demo must satisfy before the backend starts. ADR 0007 remains
Proposed until hosted routing, browser security, proxy, and connection behavior are verified.

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
controls. When Vercel system variables are present, `VERCEL_ENV` must match `APP_ENV` and `PUBLIC_APP_ORIGIN`
must be exactly `https://${VERCEL_URL}`. The production project URL is never inferred in a preview.

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

`TRUSTED_PROXY_HOPS` is owned by the deployment configuration, not by request headers or schema data. Keep it at
zero until the isolated Vercel preview establishes the exact trusted hop behavior. The preview must verify direct
and forwarded client-IP cases before changing it. `PUBLIC_APP_ORIGIN` is never inferred from `Host`, `Forwarded`,
or `X-Forwarded-*`.

## References

- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Vercel system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
