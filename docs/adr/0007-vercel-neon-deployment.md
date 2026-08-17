# ADR 0007: Vercel and Neon portfolio deployment

## Status

Proposed

## Context

Form Farm AI currently runs locally as an Angular application, a persistent Fastify process, and PostgreSQL.
The browser intentionally uses same-origin `/api` requests. Authentication relies on a host-only secure session
cookie, explicit XSRF protection, and exact-origin validation. The backend owns configuration validation,
application composition, database pooling, explicit migrations, safe logging, and graceful shutdown.

The next milestone needs a public, production-like portfolio environment before product AI is introduced. The
initial environment must be free, suitable for personal non-commercial demonstration, and honest about its lack
of a production service-level agreement. It must not weaken the existing security or domain boundaries merely to
fit a hosting platform.

Vercel's Hobby plan supports personal projects, Angular static deployments, and Node.js functions. Neon provides
a free PostgreSQL tier with scale-to-zero and a pooled connection endpoint. Both free tiers have quotas and can
change; their current limits are operational inputs, not permanent architecture guarantees.

## Decision

### Initial topology

Use one Vercel project as the single public origin and one Neon PostgreSQL project:

```text
Browser
  -> https://<project>.vercel.app
       |-- Angular static application
       `-- /api/* -> Fastify Vercel function
                         `-- Neon pooled PostgreSQL endpoint
```

Angular routing and static assets are served by Vercel. Requests under `/api` are handled by one Fastify entry
point built from the existing `createApplication()` composition. Form definitions remain data and never create
deployment routes or Vercel functions.

This is one modular monolith deployed through two managed execution forms, not a move to microservices. The
dependency direction remains:

```text
Vercel HTTP adapter -> application use cases -> domain
                              ^
                    infrastructure adapters
```

### Fastify host adapter

Add a Vercel-specific infrastructure entry point in a focused implementation slice. It may translate Vercel's
request lifecycle into the existing Fastify application, but it must not change application use cases, domain
types, route contracts, validation, or authorization.

The local/persistent `main.ts` entry point continues to own `listen()`, operating-system signals, and graceful
shutdown. The Vercel entry point does not call `listen()` and must not assume that process shutdown hooks run.
Application creation must remain independently testable with `fastify.inject()`.

Module-scoped initialization may be reused across warm invocations where Vercel permits it, but correctness must
not depend on reuse. Initialization and error handling must remain deterministic when a fresh function instance
starts.

### Database connections

Use Neon's pooled PostgreSQL connection string for application traffic. Keep the database URL server-side and
provide it only through Vercel environment configuration. Drizzle and `pg` remain infrastructure concerns;
selected JSONB remains `unknown` and continues through the existing runtime domain validators.

Use a deliberately small pool suitable for managed functions. Do not create and close a pool per request, and do
not rely on a process-exit hook to release it. The implementation spike must measure concurrent connection
behavior and choose an initial pool maximum based on Vercel concurrency and Neon limits rather than copying the
local default.

Use a direct Neon connection only for controlled migration administration when the provider recommends it.
Application traffic uses the pooled endpoint.

### Same-origin authentication

Keep Angular and the API behind the same Vercel origin. Production session cookies retain the `__Host-` prefix,
`Secure`, `HttpOnly`, `Path=/`, and no `Domain`. XSRF and exact-origin checks remain mandatory.

Trusted origins come from validated deployment configuration, never arbitrary forwarded headers. Vercel system
metadata may be used only if it is explicitly identified as deployment-owned input and normalized through the
central configuration boundary. Proxy trust remains explicit.

Preview URLs are distinct origins. They must not receive production secrets or production database access by
default. A preview that needs authenticated state must receive an explicitly isolated non-production origin and
database policy; otherwise PR validation remains CI/build/test only.

### Environments and promotion

Maintain at least two logical environments:

- **non-production**: development/staging data, demo accounts, and safe deterministic samples;
- **production portfolio demo**: separately configured database and secrets, promoted only from reviewed code.

Production deployment follows successful required GitHub checks and an explicit promotion action. Deployment is
not added to the existing pull-request validation workflow. Vercel preview deployments do not constitute
production approval.

The first implementation may deploy only a non-production preview until health, auth, migration, rollback, and
data-isolation checks pass. A custom domain is deferred; the assigned `vercel.app` domain is sufficient initially.

### Migrations and seed data

Database migrations remain committed, reviewed SQL and an explicit release operation. They never run during
Fastify startup, Vercel function initialization, Angular build, or a general preview build.

Before applying a production migration:

1. verify the target environment and database identity without printing credentials;
2. take or verify the available recovery point;
3. apply migrations once through a controlled command;
4. verify migration state and `/health`;
5. deploy/promote compatible application code.

Most production corrections are forward-fix migrations. Rollback must not assume every schema migration is
reversible.

The existing development seed remains non-production. Public demo samples require an explicit idempotent
provisioning command with production safeguards; it must never reset user data, lifecycle timestamps, accounts,
submissions, or migrations.

### Configuration and secrets

Vercel owns production environment values. Angular receives no database URL, session credential, XSRF secret,
rate-limit HMAC secret, or future AI key. Production startup/function initialization fails closed when required
values are missing, weak, reused across purposes, or retain development defaults.

At minimum, keep separate values for:

- `DATABASE_URL`;
- public application origin;
- session hashing/rotation secrets;
- XSRF current/previous secrets;
- rate-limit HMAC current/previous secrets;
- cookie security and trusted-proxy policy.

Secret rotation and removal are deployment operations. Secrets must never appear in Git, Angular build-time
configuration, PR comments, screenshots, logs, or Vercel preview output.

### Health, logging, and rollback

Retain a shallow process/function health endpoint that does not expose configuration or credentials. Add a
separate deployment verification step for database-backed behavior rather than making every shallow health call
consume a database connection.

Logs may include request IDs, stable form IDs, route/status/timing, and safe operational error classes. They must
not include cookies, authorization/XSRF headers, database URLs, definitions, answer payloads, passwords, raw
session credentials, request fingerprints, or future model prompts/output.

Rollback means selecting a previously verified Vercel deployment when it remains compatible with the migrated
database. If a database migration makes old application code incompatible, deploy a forward-compatible fix
instead. Every release records the application commit and migration version used.

### Free portfolio data policy

The free public environment is a demonstration system, not a production service for real customers. It must show
a visible demo limitation and must not solicit or store real health information, passwords outside the trusted
account workflow, payment data, government identifiers, or other sensitive personal data. Sample health fields
use synthetic data only.

Apply conservative request, account, form, submission, and payload limits. Monitor Vercel and Neon quotas. If the
project becomes commercial, receives sustained traffic, or accepts real personal data, reassess hosting,
availability, backup/restore, privacy, retention, monitoring, and paid support before continuing.

## Alternatives considered

### Vercel Angular plus Render Fastify plus Neon

This preserves the persistent Fastify process with fewer runtime changes. Vercel could proxy `/api` to Render to
retain a single browser origin. It was not selected because Render free web services currently sleep after idle
time and can take roughly a minute to wake, producing a poor login/dashboard demonstration. It also adds another
provider and proxy boundary. It remains the fallback if the Vercel Fastify adaptation cannot preserve the current
security and persistence behavior cleanly.

Render's free PostgreSQL was rejected because free databases currently expire after 30 days, which is unsuitable
for a durable portfolio environment.

### Render for Angular, Fastify, and PostgreSQL

This reduces provider count and matches the persistent process model, but inherits the same web-service cold
start and expiring free database. It is appropriate for temporary experiments, not the selected public demo.

### Vercel Angular plus a separately addressed API

This is operationally simple but makes browser authentication cross-origin and complicates cookie, XSRF, CORS,
and exact-origin policy. It was rejected while a same-origin route is available.

### Deploy immediately without an ADR

Rejected because function lifecycle, database pooling, migrations, preview isolation, and authentication origins
are architectural and security decisions rather than dashboard settings.

### Paid always-on hosting

This would improve availability and operational controls but conflicts with the current free portfolio constraint.
It should be reconsidered before real users or sensitive data are accepted.

## Consequences

### Compatibility-spike evidence

The first implementation slice adds a generic Vercel Node request handler rather than using Vercel's
Fastify-specific listener detection. It prepares the existing composed Fastify application, forwards the Node
request/response pair through Fastify's server, and never opens a port or installs signal handlers. Local
`main.ts` still owns those persistent-process responsibilities. Module-scoped readiness is reused when a warm
instance survives, but failed initialization is cleared so another cold initialization attempt can succeed.

Repository checks now compile the Angular output, backend, and Vercel entry graph. Routing configuration sends
`/api/*` to the handler and excludes that namespace from the Angular SPA fallback. Migrations remain absent from
both build and initialization paths.

This is local compatibility evidence only. It does not prove Vercel's hosted rewrite semantics, secure cookie
behavior, exact-origin/XSRF checks, proxy trust, or database connection budgeting. The ADR remains Proposed until
those behaviors are exercised in an isolated preview without production data or secrets.

The next repository-only slice makes deployment stage explicit and cross-checks preview/production application,
database, secret-set, origin, and Vercel stage ownership. Hosted application traffic requires a Neon pooled URL;
administrative migration tooling requires a separate direct URL. Hosted pool size no longer inherits the local
maximum of 10. A provider-free PostgreSQL observation with maximum 1 and eight concurrent held queries recorded
one client, seven queued operations, and one idle client after completion. This supports an initial maximum of 1,
not a production capacity claim. Hosted routing, proxy behavior, and connection evidence are still outstanding,
so this ADR remains Proposed.

Hosted preflight found that Vercel's deployment-specific `VERCEL_URL` changes across deployments and therefore
cannot be the configured exact origin. Preview validation instead uses the deployment-owned stable
`VERCEL_BRANCH_URL`, while production uses `VERCEL_PROJECT_PRODUCTION_URL`. This correction preserves exact-origin
validation without coupling configuration to one ephemeral deployment URL.

The first hosted preview also showed that automatic function tracing did not reliably retain the Argon2 native
prebuild required during backend module initialization. The Vercel function packaging now explicitly includes
only Argon2's prebuilt native assets. This remains an infrastructure packaging concern and does not move password
hashing, authentication, or provider behavior into the deployment adapter.

Vercel also emitted the TypeScript function entry point as ESM JavaScript while loading it from a CommonJS package
boundary. A narrow `api/package.json` now declares the deployment entry point as ESM, matching the backend without
changing the Angular workspace package semantics.

The original rewrite to a fixed `/api/index` destination discarded the incoming API pathname. The same single
infrastructure adapter now carries the captured wildcard in a private rewrite query marker, restores the original
`/api/*` path, and removes the marker before Fastify routing. The Angular fallback remains explicitly outside that
namespace.

With proxy trust disabled, the hosted Node function reported its loopback socket as every request's client
identity. The isolated preview therefore sets the deployment-owned hop count to `1`, matching the single Vercel
hop in front of the function. This is preview evidence for the selected runtime, not a portable default for other
hosts or topologies.

An authenticated 16-request management-list burst exercised Neon through three observed warm Vercel instances.
All requests returned successfully, application timings were approximately 74--235 ms, and repeated Neon activity
snapshots showed one server-side connection for the restricted application role. The preview therefore retains
`DATABASE_POOL_MAX=1`; broader traffic and latency evidence is still required before raising it.

The deployed route table also gives the shallow `/health` path an exact rewrite to the existing function. The
adapter restores `/health` for Fastify, while wildcard `/api/*` traffic retains its full API pathname and all
other paths remain eligible for Angular's SPA fallback.

The rewrite markers are infrastructure-private and never become trusted application parameters. Duplicate or
mixed markers and paths that could escape the `/api/` namespace fail before Fastify with a generic response. The
boundary retains normal queries, encoded identifiers, trailing slashes, and the API root, with regression tests
covering traversal and marker-collision cases.

At commit `b59a80d`, the isolated preview verified secure host-only session issuance, XSRF bootstrap and rotation,
logout clearing, exact-Origin rejection, API-owned failures, SPA deep links, provider-derived client identity,
cold function initialization, and database-backed traffic. These observations substantially reduce the adapter
risk. The isolated resources are retained as the repository-owner-managed, free-plan, non-production verification
environment for deployed smoke automation and promotion-policy work. The ADR remains Proposed until a separate
architectural decision explicitly accepts or rejects it.

### Positive

- One public origin preserves the established browser security model.
- Angular and Fastify are supported without introducing a new application framework.
- Neon provides PostgreSQL without replacing current migrations, Drizzle adapters, or domain validation.
- Preview and production separation is explicit.
- The free portfolio can be demonstrated publicly with a credible upgrade path.

### Negative

- Fastify requires a host-specific entry point and function-lifecycle verification.
- Managed-function database pooling requires stricter connection budgeting than local development.
- Free tiers provide quotas, scale-to-zero behavior, limited logs/recovery, and no project SLA.
- One Vercel project containing Angular and Fastify requires explicit monorepo build/output routing.
- Stateful preview deployments require isolation work and are not automatically enabled.

### Risks and mitigations

- **Connection exhaustion:** use Neon's pooled endpoint, a small measured application pool, and integration/load
  verification.
- **Origin/cookie regression:** retain exact-origin/XSRF tests and add deployed Playwright authentication checks.
- **Migration drift:** keep migrations explicit, record versions, and verify the target before execution.
- **Secret leakage:** centralize environment validation and preserve logging redaction tests.
- **Free-tier suspension or quota exhaustion:** document limits, expose safe failure behavior, and maintain a
  teardown/upgrade runbook.
- **Sensitive demo data:** prohibit it, use synthetic samples, and display the limitation in the product.

## Implementation sequence

After this ADR is accepted, create separate issues for:

1. add the Vercel Fastify adapter and monorepo build/routing configuration without provisioning production;
2. define deployment environment validation, secret inventory, and Neon pool configuration;
3. provision a non-production Neon database, apply migrations explicitly, and deploy a Vercel preview;
4. add deployed Playwright smoke coverage for health, registration/login/logout, management, publication, public
   rendering, and submission without real sensitive data;
5. document promotion, rollback, migration, backup/restore limitations, quota monitoring, and teardown;
6. promote the reviewed portfolio demo only after the preceding evidence is accepted.

No AI provider, AI key, model output, RAG, agent, or product MCP behavior belongs in these slices.

## References

- [Vercel Angular deployment](https://examples.vercel.com/kb/guide/deploying-angular-with-vercel)
- [Vercel Fastify deployment](https://vercel.com/templates/other/fastify-on-vercel)
- [Vercel Hobby plan](https://vercel.com/docs/plans/hobby)
- [Vercel Functions limits](https://vercel.com/docs/functions/limitations)
- [Neon pricing and free-tier limits](https://neon.com/pricing)
- [Render free-service limitations](https://render.com/docs/free)
