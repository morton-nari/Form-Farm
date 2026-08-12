# ADR 0003: PostgreSQL persistence tooling and data model

## Status

Proposed

## Context

Form Farm AI now serves a deterministic validated `FormDefinition` through an application-owned
`FormDefinitionSource` port. The next persistence slice must replace the seeded infrastructure adapter
without changing the HTTP route, application use case, provider-neutral domain, or runtime validation
boundary.

The persistence design must support immutable form versions, exact-version submissions, and efficient
future owner-dashboard queries. Flexible form definitions and answers do not fit a fully normalized field
table model, while lifecycle, identity, versioning, ownership, and timestamps should remain relational.
Authentication, hosted database selection, submission APIs, and AI are separate decisions.

Database tooling must provide useful TypeScript safety without allowing ORM convenience to determine the
domain model. SQL migrations and operational behavior must remain understandable and reviewable.

## Decision

Use PostgreSQL 18 with Drizzle ORM, the `node-postgres` driver, and Drizzle Kit.

The decision was evaluated against Drizzle ORM 0.45.2, Drizzle Kit 0.31.10, `pg` 8.23.0, Kysely
0.29.5, and Prisma 7.9.1 in August 2026. These are evaluation versions, not dependency declarations.

- Define the physical schema in infrastructure-owned TypeScript.
- Generate SQL migrations with Drizzle Kit, commit both the schema changes and generated SQL, and review
  the SQL before it is applied.
- Apply migrations as an explicit development, test, or deployment step. The Fastify process must not
  run migrations automatically at startup.
- Pin Drizzle dependencies to exact versions while the stable packages remain below 1.0. Upgrade them
  only through focused dependency changes that regenerate and inspect representative migrations.
- Keep Drizzle schemas, query types, database rows, pools, and transactions inside infrastructure.
  Application use cases continue to depend on application-owned ports and domain types.

The first implementation issue will replace only the seeded `FormDefinitionSource` with a PostgreSQL
adapter. It will not add writes, submissions, authentication, or AI.

## Tooling comparison

| Option             | Developer experience and type safety                                                                 | Migration stability and operational transparency                                                                                         | Assessment                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Drizzle ORM + `pg` | SQL-shaped typed queries and TypeScript schema declarations with little generated runtime machinery  | Drizzle Kit generates reviewable SQL and can apply a committed migration history; pre-1.0 versions require careful pinning               | Selected: best balance for the explicit modular backend     |
| Kysely + `pg`      | Excellent type-safe SQL query builder with a small runtime and strong SQL fidelity                   | Migrations are explicit and stable but schema typing and migration authoring require more manual coordination or an additional generator | Strong fallback if Drizzle migration churn becomes costly   |
| Prisma             | Integrated schema, generated client, migration tooling, and polished relational developer experience | Generated client and Prisma schema add a larger framework surface; PostgreSQL-specific behavior may require raw SQL                      | Capable but broader than the current backend needs          |
| Direct `pg`        | Maximum SQL control and minimal abstraction                                                          | Requires manual row types, mapping, query composition, and a separate migration discipline                                               | Too much project-owned plumbing for no demonstrated benefit |

Drizzle is an infrastructure choice, not a domain dependency. If it later proves unstable, the
application-owned ports limit replacement cost.

## Logical data model

### `forms`

- `id text` primary key using the domain's stable machine-safe identifier;
- `status text` constrained to `draft`, `published`, or `archived`;
- `latest_version integer` constrained to be non-negative;
- `current_published_version integer null`;
- `created_at timestamptz not null`;
- `updated_at timestamptz not null`;
- `archived_at timestamptz null`.

`latest_version = 0` is the only representation of a form for which no version has ever been created.
Persisted `form_versions.version` values begin at 1, and the first version transaction must therefore
require `formVersion = latest_version + 1 = 1`. Once incremented, `latest_version` never decreases.

The lifecycle checks are intentionally small and explicit:

- `current_published_version is null or current_published_version <= latest_version`;
- `published` requires a non-null `current_published_version`;
- `draft` requires a null `current_published_version`;
- `archived_at is not null` if and only if status is `archived`;
- an archived form may retain a published-version reference so history remains identifiable.

The database repeats the machine-safe ID check intentionally as defence in depth. The public domain
constant remains the application source of truth; migration tests must detect drift between it and the
database constraint.

Ownership is not included in the first schema. Adding an unconstrained owner UUID before an identity
model exists would imply integrity the database cannot enforce. The authentication decision will add a
non-null owner foreign key, backfill or explicitly classify system-owned forms, and add the corresponding
owner/status/update index. This deferral must happen before a multi-user dashboard or form creation is
released.

### `form_versions`

- `form_id text not null`;
- `version integer not null check (version > 0)`;
- `schema_version integer not null check (schema_version > 0)`;
- `definition jsonb not null`;
- `created_at timestamptz not null`;
- `published_at timestamptz null`;
- primary key `(form_id, version)`;
- foreign key `form_id -> forms.id on delete restrict on update restrict`.

The composite primary key enforces version-number uniqueness per logical form at the database level.
After both tables exist, the migration adds this exact circular reference:

```sql
alter table forms
  add constraint forms_current_published_version_fk
  foreign key (id, current_published_version)
  references form_versions (form_id, version)
  match simple
  on update restrict
  on delete restrict;
```

`MATCH SIMPLE` is intentional. Because `forms.id` is never null, a null `current_published_version`
exempts the pair from reference checking and represents an unpublished form. When the version is non-null,
the pair must match the composite `form_versions` primary key and therefore cannot point to another form's
version. `MATCH FULL` would incorrectly reject the intended `(non-null id, null version)` state.

The JSONB document stores the complete validated schema-versioned `FormDefinition`, not a separate
persistence DTO. Relational columns intentionally duplicate the form ID, form version, and schema version
for constraints and queries. Database JSONB checks remain deliberately shallow: they require an object and
compare only its top-level `id`, `formVersion`, and `schemaVersion` values with the corresponding relational
columns. PostgreSQL must not reproduce field types, validation rules, or other
`validateFormDefinition` semantics. On reads, the adapter treats JSONB as `unknown`, calls
`validateFormDefinition`, and verifies the validated identity/version against the row before returning the
domain value. Drizzle's compile-time JSON typing never replaces that runtime boundary.

Form definition content is append-only. Definitions are never updated in place; an edit creates another
version. Publication metadata may make a single one-way transition from unpublished to published. The
application exposes no general definition update or version-delete operation. Database roles and
additional immutability enforcement can be tightened when write use cases are introduced; a trigger is not
added before those use cases prove it necessary.

### `form_submissions`

- `id uuid` primary key defaulting to PostgreSQL `gen_random_uuid()`;
- `form_id text not null`;
- `form_version integer not null`;
- `answers jsonb not null`;
- `submitted_at timestamptz not null`;
- composite foreign key `(form_id, form_version) -> form_versions (form_id, version) on delete restrict on update restrict`.

Answers store the complete validated provider-neutral answer map associated with the submitted version.
PostgreSQL owns submission ID generation; application code treats the returned UUID as an opaque identity
and does not generate a competing value by default.
Submission records may be removed only through a future explicit retention/deletion use case. Deleting a
submission never deletes its form version. Forms and versions referenced by historical submissions cannot
be deleted; forms are archived instead. No cascading delete is used anywhere in this chain.

## Transaction and concurrency boundary

Creating a version and changing the form's version pointers is one database transaction:

1. Validate the complete candidate `FormDefinition` before opening the transaction.
2. Lock the `forms` row with `select ... for update`.
3. Confirm the candidate ID matches the form and its `formVersion` equals `latest_version + 1`.
4. Insert the immutable `form_versions` row.
5. Update `forms.latest_version` and `updated_at`.
6. When publishing in the same operation, also set `current_published_version` and the version's
   `published_at` value.
7. Commit; any failure rolls back both the inserted version and pointer changes.

The row lock serializes competing version allocations for one form. The composite primary key remains the
final database guarantee against duplicates. The transaction contains database work only; HTTP, AI, and
other network operations must not run while the lock is held.

Publishing an already-created version is also one transaction that locks the form, verifies the target
version belongs to it and is publishable, marks its publication time if required, and updates the current
published pointer. Publication semantics will be finalized with the write use case rather than inferred
from the read adapter.

## Constraints and indexes

The initial schema uses named primary-key, foreign-key, unique, not-null, and check constraints for:

- machine-safe form IDs;
- positive schema and form version numbers;
- recognized lifecycle status;
- agreement between relational identity/version columns and JSONB definition values;
- valid current-published-version references;
- exact submission-to-version references.

PostgreSQL owns persistence timestamps. Inserts use `default now()` for `created_at` and `submitted_at`;
publishing sets `published_at = now()`; lifecycle writes set `updated_at = now()` in the same statement or
transaction as their data change. Application code does not supply ordinary persistence timestamps. Tests
that need deterministic time assert ordering or use a database-controlled test clock strategy rather than
introducing mixed timestamp ownership.

Initial B-tree indexes support the current read and anticipated lifecycle queries:

- the `forms.id` primary key;
- the `form_versions (form_id, version)` primary key;
- `form_versions (form_id, published_at desc)`;
- `form_submissions (form_id, submitted_at desc)`;
- `form_submissions (form_id, form_version)` for referential checks and version counts.

Do not add a broad GIN index to definitions or answers without a demonstrated JSONB query. Dashboard
queries should use relational columns. Ownership indexes are added with the authenticated ownership model.

## Connection lifecycle

Create one `pg.Pool` during backend composition and inject an infrastructure adapter built from it. Add
`DATABASE_URL` to centralized startup validation without ever logging its value. A maximum of 10 is only
the initial local default, alongside zero minimum idle connections, a finite connection timeout, and the
driver's normal idle cleanup. It is not an architectural capacity assumption. Deployment configuration
must budget total connections across every application instance, migration job, and provider limit;
serverless or constrained environments may require a maximum of 1 or another substantially smaller value.
Further tuning requires hosting constraints or measured concurrency.

The pool participates in application cleanup and is closed once during graceful shutdown. Routes and use
cases never create pools or read database environment variables. Pool errors are logged safely without
query parameters, definitions, answers, credentials, or connection strings.

## Migration strategy

- Development: edit the infrastructure schema, generate a named SQL migration, inspect it, and apply it to
  a disposable local database.
- CI/test: create an empty isolated database, apply the complete migration history, then run integration
  tests. Schema push is not a substitute for testing migrations.
- Production: run committed migrations once as a release step before compatible application rollout.
  Migration execution is not tied to every Fastify instance starting.
- Prefer expand-and-contract changes when deployed code versions may overlap.
- Write down migrations only when reversal is safe, deterministic, and tested. For destructive or data
  transformations, production recovery normally uses a forward-fix migration. Backups and point-in-time
  recovery are operational safeguards, not a reason to make unsafe down migrations.
- Never rewrite a migration that has reached a shared or production environment.

## Integration-test strategy

Use a real ephemeral PostgreSQL container for persistence integration tests. Start one isolated database
per test suite/worker, apply the committed migrations from empty state, and close its pool and container at
suite completion. Reset tables between tests in foreign-key-safe order; tests that exercise transaction or
migration behavior receive their own database when rollback isolation would hide the behavior under test.

Keep unit and `fastify.inject()` tests database-free by injecting test ports. The PostgreSQL adapter suite
must cover valid reads, missing forms, malformed JSONB failing closed, relational/JSONB identity mismatch,
constraint enforcement, connection cleanup, and the migration history from an empty database. CI must
provide Docker or an equivalent isolated PostgreSQL service before these tests become required checks.

The first implementation PR remains read-only: it creates the schema/migration and replaces
`SeededFormDefinitionSource` for the existing get-form flow. It must not implement version creation,
publication, submissions, or lifecycle mutation. The write-oriented constraints and transaction design in
this ADR guide later issues and do not enlarge that first slice.

## Consequences

- Form Farm keeps one provider-neutral domain and validation boundary across HTTP, persistence, and the
  frontend.
- Relational fields support lifecycle and future dashboard queries without scanning JSONB documents.
- Complete JSONB definitions make exact-version reads and schema evolution straightforward, at the cost of
  deliberate duplication that mappings and constraints must verify.
- Historical submissions cannot silently lose or change their form version.
- The project gains an additional ORM, driver, migration CLI, PostgreSQL service, and integration-test
  lifecycle.
- Drizzle's pre-1.0 maturity creates upgrade risk, mitigated by exact version pins, reviewed SQL, focused
  upgrades, and infrastructure isolation.
- Ownership remains honestly deferred until authentication supplies a real referenced identity.

## Alternatives considered

### Normalize sections, fields, options, and validation rules

This would make arbitrary field-level database queries easier but tightly couple relational migrations to
every form-schema evolution and make exact immutable reconstruction more complex. No current query needs
that cost. Complete validated definitions remain JSONB.

### Store only a persistence-specific JSON representation

This could reduce duplication or storage, but introduces another schema and mapper without a demonstrated
need. The complete domain document is the canonical immutable content; relational projections exist for
integrity and query performance.

### Add owner records before authentication

Placeholder users, owner UUIDs without foreign keys, or a speculative organization model would weaken or
prematurely constrain ownership. Ownership is added with its actual identity and authorization decision.

## References

- [Drizzle ORM overview](https://orm.drizzle.team/docs/overview)
- [Drizzle migrations](https://orm.drizzle.team/docs/migrations)
- [Drizzle transactions](https://orm.drizzle.team/docs/transactions)
- [node-postgres pool API](https://node-postgres.com/apis/pool)
- [Kysely introduction](https://www.kysely.dev/docs/intro)
- [Kysely migrations](https://www.kysely.dev/docs/migrations)
- [Prisma ORM](https://www.prisma.io/docs/orm)
- [Prisma Migrate](https://www.prisma.io/docs/orm/prisma-migrate)
- [PostgreSQL JSON types](https://www.postgresql.org/docs/current/datatype-json.html)
- [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [PostgreSQL multicolumn indexes](https://www.postgresql.org/docs/current/indexes-multicolumn.html)
