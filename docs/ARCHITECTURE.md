# Form Farm AI Architecture

This document separates the architecture that exists today from the intended target. Planned capabilities must not be described as implemented.

## Current architecture

Form Farm AI currently contains an Angular 22 frontend connected to its owned Fastify backend.

```text
GET /api/v1/forms/:formId
        ↓ HttpClient Observable<unknown>
FormDefinitionApiService
        ↓
FormViewerStore + validateFormDefinition
        ↓ readonly signals
FormViewerPage
        ↓
DynamicFormFactory + DynamicField
        ↓
Accessible Reactive Form UI
```

### Current boundaries

- `core/api` contains the owned API client and leaves external definitions untrusted.
- `features/form-viewer/data-access` validates API data and owns loading state.
- `shared/form-runner/forms` creates Reactive Form controls and validators.
- `shared/form-runner/components` renders provider-neutral fields accessibly.
- `features/form-viewer/pages` coordinates rendering, review, retry, and focus behaviour.

The running frontend loads `GET /api/v1/forms/:formId` through a client that returns `unknown`.
`FormViewerStore` applies `validateFormDefinition` before exposing readonly state to `FormViewerPage`.
The shared form runner then maps the validated definition into accessible Reactive Forms controls. It
has explicit rendering and validation behavior for all 15 schema-version-1 field discriminants.
Backend and frontend validation are intentional independent trust boundaries: backend validation
protects what the API serves, while Angular must still treat every HTTP payload as external input.
Validation issue details are not rendered to users; invalid payloads produce a stable product error.

`customer-feedback` is selected only at the current demo composition edge. The API client, store, and
runner all accept arbitrary valid form IDs, so a future route or dashboard selection can supply the ID
without changing the provider-neutral engine.

The repository also contains an initial Fastify 5 backend workspace. Its current implemented scope is
deliberately limited to a testable application factory, startup configuration validation, `GET /health`,
safe HTTP error mapping, graceful shutdown, a PostgreSQL-backed form-definition read endpoint, and an
exact-version generic submission endpoint. It has no form-definition writes, authentication, or AI
integration yet.

## Target architecture

The target is a modular monolith with clear frontend, backend, persistence, and AI boundaries.

```text
Angular frontend
        ↓ versioned HTTP API
TypeScript backend
   ├── form management
   ├── form publication and submissions
   ├── authentication and authorization
   └── AI orchestration
        ↓
PostgreSQL
        ↓
External AI provider APIs
```

Microservices are not planned. They would add operational complexity without solving a current scaling or ownership problem.

The owned backend uses Fastify 5 directly as a lean modular TypeScript application. Domain models,
validation, and use cases remain framework-independent; Fastify routes and plugins form the HTTP and
infrastructure edge. The decision and alternatives are recorded in
[`ADR 0002`](adr/0002-backend-framework.md).

```text
HTTP / Fastify → application use cases → domain
                         ↑
              infrastructure adapters
```

Infrastructure implementations satisfy ports required by application use cases. Application and domain
code do not import Fastify request/reply types or concrete persistence and AI adapters.

The provider-neutral form contract and runtime validator live in the `@form-farm/form-domain` workspace.
Angular and the backend both import the public exports of the same compiled package directly. The first
owned form read follows this dependency flow:

```text
GET /api/v1/forms/:formId
        â†“
Fastify route â†’ GetFormDefinition use case â†’ FormDefinitionSource port
                         â†“                         â†‘
              validateFormDefinition      PostgreSQL adapter
```

## Form API direction

Forms are resources, not individually generated APIs. Seeded templates and future administrator-created
forms use the same stable routes, such as `GET /api/forms/:formId` and
`POST /api/forms/:formId/submissions`. Creating or publishing a custom form creates validated form data
and immutable versions; it must not register arbitrary Fastify routes or compile user-provided schemas
as executable route schemas.

Initial seeded examples should demonstrate meaningfully different data-collection needs without pulling
forward deferred security capabilities:

- customer feedback;
- event registration;
- job application without file upload.

Common template libraries also emphasize contact, lead, order, booking, consent, appointment, and
application forms. Those are candidates for later templates, not separate endpoint families. Payment,
signature, upload, and conditional-flow templates wait for their required domain and security designs.

Login is an authentication operation rather than a generic stored form submission. Account registration
may eventually reuse the renderer, but a trusted backend handler must create the account, hash credentials,
and apply security policy. A form definition alone cannot authorize that behavior.

## Form domain boundary

The reusable form engine must depend on provider-neutral types:

```text
FormDefinition
└── FormSection[]
    └── FormField[]
        ├── identity and presentation
        ├── field type
        ├── options
        └── validation rules
```

External API contracts, persistence records, and AI output must be mapped and validated before entering this domain.

Untrusted definitions pass through the owned `validateFormDefinition` boundary. Zod performs strict
structural parsing and owned validation code applies cross-object domain invariants. Consumers receive
a provider-neutral result with path-specific issues and do not depend directly on Zod APIs. The
decision is recorded in [`ADR 0001`](adr/0001-runtime-schema-validation.md).

Passing this boundary establishes structural and domain validity only. It does not grant
authorization, approve publication, establish ownership, or authorize workflow execution. Those
decisions remain separate trusted backend responsibilities.

The browser uses Zod's supported Mini entry point to limit the cost of strict runtime validation. The
initial bundle warning budget is 850 kB, with the existing 1 MB error ceiling retained; production
build output must be reviewed when domain capabilities change.

The Angular `shared/form-runner` maps validated domain fields into Reactive Form controls and accessible
UI. It does not import legacy API models or encode quote, registration, payment, publishing, or other
workflow behavior. The current frontend supports validation, answer review, and generic submission with
safe success and retry states. `DynamicFormFactory.getAnswers` extracts a provider-neutral `FormAnswers`
map; the feature store passes that map and the exact rendered version to the trusted generic endpoint,
never Angular controls or schema-defined actions. It retains one idempotency key while retrying the same
logical answers and replaces it when the answers or rendered version change. Answer identity sorts field
keys explicitly while preserving array order, so object construction order cannot rotate the key. Client
keys use the supported-browser `crypto.randomUUID()` baseline; no insecure fallback is provided.

The version-one domain contract is defined in `packages/form-domain` and documented in
[`FORM_SCHEMA.md`](FORM_SCHEMA.md). It supports a controlled set of standard form fields through a
discriminated union. Field IDs are globally unique answer keys, array position defines ordering, and
choice labels are separate from their stable submitted values.

The schema contains renderable form content and safe submission presentation only. Lifecycle,
ownership, persistence metadata, AI generation metadata, HTTP destinations, and privileged backend
operations remain outside the form definition. Retired provider-specific API and workflow code has been
removed; it does not define the domain or the running application.

Submission button text and success text are versioned with the immutable form definition in schema
version 1 because they are API-driven presentation content. They do not select a route, redirect,
handler, or workflow outcome. That separation must be preserved as publishing capabilities evolve.

The submission boundary is recorded in
[`ADR 0004`](adr/0004-versioned-form-submissions.md). A client submits the form version it rendered and a
provider-neutral answer map. The backend validates and persists those answers against that exact immutable
version in one transaction-oriented application boundary. Generic submission persistence rejects
password fields; account credentials remain dedicated trusted authentication behavior.

## Persistence direction

PostgreSQL is the preferred candidate. The intended model combines relational lifecycle data with JSONB for the flexible schema:

- `Form` owns stable identity, name, status, and ownership.
- `FormVersion` stores an immutable validated schema and version number.
- `FormSubmission` references the exact published version and stores validated answers.

Future authentication will associate forms with an owning user and may later introduce organizations.
Ownership and authorization are relational concerns; they must not be embedded inside `FormDefinition`.
The model must support a future owner dashboard that can efficiently list forms, filter by lifecycle
status, show the current published version, count submissions, and inspect recent activity without
scanning JSONB documents.

Likely relational query fields include owner identity, form status, created/updated timestamps,
published version, submission timestamps, and exact form-version references. Flexible definitions and
answer payloads can use JSONB after validation. Appropriate ownership, status, version, and submission
time indexes will be designed with the actual database schema.

Form versions are immutable once published. Submissions retain the exact form version used for collection
so later edits do not change the meaning of historical answers. Deleting or archiving a form must not
silently orphan or reinterpret its submissions. Retention, export, deletion, and sensitive-data policies
require explicit design before production data is collected.

The accepted PostgreSQL tooling, transaction boundaries, relational/JSONB model, deletion rules, migration
strategy, and integration-test approach are recorded in
[`ADR 0003`](adr/0003-postgresql-persistence.md). Database implementation remains a separate focused slice.

## AI boundary

AI calls run only on the backend. Provider keys must never be included in Angular.

AI-generated data passes through two validation layers:

1. Runtime structural validation verifies the expected output shape.
2. Domain validation verifies supported fields, identifiers, rules, limits, and safe behaviour.

Users preview and approve generated forms before persistence or publication.

## Testing direction

- Frontend tests cover schema adaptation, form creation, validation, state, accessibility, and UI flows.
- Backend tests cover domain behaviour and AI orchestration.
- API integration tests verify HTTP contracts and persistence.
- End-to-end tests verify important user journeys.
- CI runs relevant tests and builds on every pull request.

## Decisions still required

- Acceptance of the proposed owner form write lifecycle in ADR 0006
- Hosting architecture
- AI provider and provider-abstraction boundary

Each significant decision will be evaluated when its milestone begins and recorded in an ADR.

The accepted authentication, opaque-session, CSRF, and form-ownership boundaries are recorded in
[`ADR 0005`](adr/0005-authentication-sessions-and-ownership.md). The framework-independent backend core now
provides account policy, Argon2id credential hashing, opaque PostgreSQL sessions, durable rate-limit storage,
and relational user/system form ownership. The Fastify authentication boundary is implemented with fixed
routes, exact-origin and XSRF enforcement,
opaque host-only cookies, durable source/account throttling, safe error mapping, and centralized startup
configuration. Angular authentication and owner authorization remain separate consumers of this boundary.
Immediately previous XSRF and limiter keys require an explicit future deadline no more than 24 hours away;
validation stops consulting them at that deadline even if a process has not restarted.

Angular now bootstraps session state through the backend, routes anonymous users to explicit account UI, and
protects the `/forms` area with backend-derived session state. A custom same-origin interceptor reads only the
owned development or production XSRF cookie and adds it to unsafe `/api` requests; it never reads the HttpOnly
session credential. Registration remains explicit account behavior rather than a generic form workflow. The
protected forms landing consumes an owner-scoped summary endpoint. Backend application use cases and
PostgreSQL queries authorize every list/detail read: authenticated users can access published system forms and
their own published user forms, while inaccessible IDs are indistinguishable from missing IDs. Dashboard
responses exclude full definitions, persistence rows, and ownership metadata. Angular validates summaries at
runtime and routes the selected ID to the provider-neutral viewer; guards remain navigation UX, not authorization.

“Accessible to an authenticated user” and “owned by that user” are separate application concepts. The current
landing query is published-only and includes curated system forms plus the actor's published forms. A future
management dashboard must introduce an owner-only lifecycle query for drafts, archived forms, and editing; it
must not stretch `AccessibleFormSource` into a write-authorization or management abstraction. The initial list
is unpaginated only while users cannot create forms. Its SQL ordering is `updated_at DESC, id ASC`; pagination
and relational dashboard projections must be designed before collections can grow enough for repeated full
JSONB validation to become costly.

The seeded `health-questionnaire` is provider-neutral demonstration content and intentionally uses only schema
version 1 fields with established renderer, answer, validation, accessibility, and test semantics. Its address
is represented by stable individual answer keys because nested groups are deferred. It does not encode
diagnosis, treatment, emergency handling, or another privileged medical workflow. Health and contact answers
can still be highly sensitive: the sample must not be treated as approved for real collection until access,
consent, retention, deletion, encryption, audit, and jurisdiction-specific governance have been reviewed.
Free-text guidance cannot prevent sensitive or emergency content and is not a security control. Both seeded
samples are intentionally system-owned and visible to all authenticated users. Seed reruns preserve already
published lifecycle timestamps; `updated_at` is never manipulated as presentation rank. A future featured-form
order must be modeled explicitly outside the provider-neutral definition and separately from lifecycle time.

The proposed owner-write lifecycle is recorded in
[`ADR 0006`](adr/0006-owner-form-write-lifecycle.md). It separates an owner-only mutable draft workspace from
immutable published versions, uses optimistic concurrency for saves, and makes publication one authorized
transaction that revalidates unknown JSON, allocates the next version, updates lifecycle pointers, and consumes
the draft. Owner management queries remain distinct from accessible published-form queries. Implementation is
split into backend creation, save/publication, and Angular builder slices before AI generation.

The first ADR 0006 implementation slice now creates a validated user-owned logical form and revision-1 draft in
one PostgreSQL transaction. The fixed management route derives ownership from the authenticated actor and
requires the existing origin/session-XSRF boundary. A per-owner advisory transaction lock makes the temporary
100-form controlled-release cap concurrency-safe. Its namespace seed `0` is reserved for owner-form creation;
future advisory-lock families require distinct documented namespaces. The cap includes every lifecycle state of
a user-owned form and excludes system-owned forms. Publication and builder UI remain separate slices; no AI
capability or dependency is present.

The second ADR 0006 backend slice loads owner drafts through an application-owned store and saves complete
validated snapshots with strong ETags. PostgreSQL locks the owner-scoped form/draft row, compares the expected
revision, and increments it atomically; concurrent stale editors cannot overwrite the winner. Persisted JSONB
remains `unknown`, exact relational identity and next-version invariants fail closed, and database `bigint`
revisions are range-checked before entering application DTOs. Safe GET requests require the opaque session;
PUT additionally reuses exact-origin and session-bound XSRF enforcement. Publication, Angular builder behavior,
and AI remain outside this slice. The maximum safe-integer revision is treated as exhausted and conflicts rather
than wrapping.

The publication slice locks the owner form and exact draft in one PostgreSQL transaction. A synchronous
application callback revalidates locked JSONB from `unknown`, checks relational identity and the next immutable
version, and applies the explicit password-field release prohibition separately from schema validity. Only then
does infrastructure insert `form_versions`, update lifecycle pointers/status, and consume the draft. Races return
safe conflicts and any validation or persistence failure rolls back the entire state transition. Historical
versions remain immutable and submission-eligible under ADR 0004. Angular builder and AI capabilities remain
outside this backend slice.
Published-version arithmetic explicitly validates the relational value and treats PostgreSQL integer exhaustion as
a conflict. Missing draft state after an owned form is locked is also a conflict because the expected working state
was consumed or changed, rather than an ownership-disclosing not-found distinction.

Published-form edit bootstrap locks the owner form and validates the current immutable definition before creating
one revision-1 draft for `latest_version + 1`. Existing draft content wins unchanged, so concurrent tabs converge
without replacement. The operation reuses the management session/origin/XSRF boundary and introduces no builder
or AI behavior.
It explicitly relies on `current_published_version = latest_version`. A future rollback should create a new
immutable publication from historical content instead of moving the pointer backward. Bootstrap validates the
relational version before arithmetic and treats PostgreSQL integer exhaustion as a conflict.

The owner-management list is separate from accessible published reads. One owner-filtered PostgreSQL query joins
the optional draft and current immutable version, orders by `updated_at DESC, id ASC`, and returns bounded cursor
pages. Application code validates the selected JSONB and relational identity/version fields before deriving safe
summaries; definitions and owner IDs never enter the HTTP representation.
Lifecycle combinations and next-definition arithmetic are checked explicitly, including the archived no-draft rule
and PostgreSQL integer boundary. The existing partial `(owner_user_id, updated_at DESC)` index supports this bounded
release; adding `id` is deferred until query plans at realistic volume justify a migration.

Angular now exposes a protected owner-management area separate from the accessible forms dashboard. Its HTTP
adapter returns `unknown`; strict summary parsing and shared form-definition validation gate UI state. A minimal
editor can create a deterministic starter draft and edit title/description while preserving the complete validated
definition, exact draft ETag, and fixed save/publication endpoints. Schema content never selects actions or URLs.
Structured field operations, autosave, and AI remain deferred.

The owner editor now maps validated sections into Angular Reactive Form groups for title and optional
description editing. Section array position remains the only ordering mechanism. Add, move, and remove
operations reconstruct a complete candidate `FormDefinition` while retaining untouched field discriminants,
options, defaults, validation rules, and presentation data by stable section ID. Because schema version 1
requires every section to contain a field, a newly added section receives one deterministic text-field starter;
field configuration remains a separate builder slice. Publication stays disabled while the editor is dirty,
and the complete candidate still crosses the existing ETag and runtime-validation boundaries. No schema data
selects management endpoints or privileged operations.

Basic field editing follows the same boundary. Nested typed Reactive Form arrays own field label, optional help
text, and within-section order, while a private stable-ID map retains immutable discriminated-union snapshots.
Candidate reconstruction replaces presentation properties on a new field object and preserves type-specific
configuration such as options, defaults, autocomplete, placeholders, rows, and validation. Missing snapshots or
unexpected type changes fail closed before an HTTP request, and the complete candidate must pass shared runtime
validation. New fields are text fields with globally collision-safe IDs because answer keys are unique across the
whole form. Field-type switching and type-specific configuration remain separate operations.

The first type-specific builder controls edit only validation rules shared by fixed text-entry discriminants:
`required`, `minLength`, and `maxLength`. Values are nullable safe non-negative integers, and the nested field
group rejects a minimum greater than its maximum. Candidate rules are reconstructed in required/minimum/maximum
order so duplicate families cannot be produced. An empty configuration removes `validation`; non-text fields and
all other text properties remain unchanged. Shared runtime definition validation still runs before HTTP, and
backend validation remains authoritative.

Fixed select, radio, multi-select, and checkbox-group fields expose ordered option label/value controls without
allowing discriminant changes. Option labels and stable submitted values remain separate, while each option's
existing disabled state travels in an internal typed control and survives reordering. The option array requires
at least one item, unique non-blank values, and continued validity of every existing enabled default. Invalid
default references are reported locally rather than silently cleared or rewritten. Candidate reconstruction
replaces only the options on a new choice-field snapshot and retains defaults, validation, placeholders, and
unrelated field properties.

Field creation uses a per-section typed selector and an exhaustive factory for all schema-version-1
discriminants that the current release permits publishing. Each choice field receives one valid starter option;
other types receive only their required base properties. Password is intentionally absent because generic
password-bearing definitions are currently non-publishable. An exhaustive product-policy map covers every domain
discriminant with either a creation label or an explicit unavailable decision, so adding a schema type requires a
new policy decision at compile time. Selection affects only the next new field and is not serialized. Existing
field discriminants remain immutable, so creation introduces no type-conversion semantics.
New fields immediately enter the same validated snapshot, dirty-state, ETag, and applicable type-specific editor
boundaries as loaded fields.

Fixed number fields expose the complete schema-version-1 number-rule family: `required`, `min`, `max`, and
`integer`. Minimum and maximum controls accept any finite number, including negative, fractional, and zero
values, while the nested group rejects a minimum greater than its maximum. Candidate rules are rebuilt in
required/minimum/maximum/integer order and removed entirely when unset. Placeholder, default value, and unrelated
snapshot properties remain unchanged. The domain rejects a numeric default outside min/max bounds or incompatible
with an integer rule, so the builder cannot silently retain an invalid default or rewrite it. An exhaustive
number-rule policy forces a builder decision when the domain adds a new numeric rule. Full runtime definition
validation still precedes persistence.

Fixed date, datetime, and time fields expose the complete schema-version-1 temporal-rule family: `required`,
`earliest`, and `latest`. The editor uses the matching native input shape for each immutable discriminant and
retains the canonical schema value as a string; it does not perform timezone conversion. A nested field group
rejects an earliest value later than its latest value, and candidate rules are rebuilt deterministically in
required/earliest/latest order. Clearing every rule removes `validation`, while defaults and unrelated snapshot
properties remain unchanged. The shared domain validator also rejects a temporal default outside its configured
range, so the builder surfaces the inconsistency instead of deleting or rewriting the default. An exhaustive
temporal-rule policy requires an explicit builder decision if the domain later gains another temporal rule, and
the complete definition still passes runtime validation before persistence.
Canonical domain values are zero-padded ISO dates (`YYYY-MM-DD`), local datetimes
(`YYYY-MM-DDTHH:mm` with optional seconds/fraction), or times (`HH:mm` with optional seconds/fraction). Offset
and `Z` datetime values are rejected: schema-v1 datetime values represent local wall-clock time, not instants.
Type-specific comparison treats omitted seconds as zero, so supported precision variants remain consistent.
