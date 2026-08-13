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
safe HTTP error mapping, graceful shutdown, and a PostgreSQL-backed form-definition read endpoint. It has
no form writes, authentication, submissions, or AI integration yet.

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
workflow behavior. The current frontend supports validation and answer review; it explicitly does not
claim to submit or persist answers before an owned submission use case and endpoint exist.
`DynamicFormFactory.getAnswers` extracts a provider-neutral `FormAnswers` map; future submission code
must pass that map to a trusted generic endpoint, never Angular controls or schema-defined actions.

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

- PostgreSQL persistence implementation
- Authentication strategy
- Hosting architecture
- AI provider and provider-abstraction boundary

Each significant decision will be evaluated when its milestone begins and recorded in an ADR.
