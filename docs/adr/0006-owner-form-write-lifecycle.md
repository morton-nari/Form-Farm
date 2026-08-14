# ADR 0006: Owner form creation, draft editing, and publication

## Status

Proposed

## Context

Form Farm AI can authenticate owners, authorize published reads, and retain submissions against exact immutable
versions. It cannot create owner forms, save builder work, or publish new versions. These writes must preserve
`FormDefinition` as provider-neutral renderable data and keep Angular, Fastify, Drizzle, persistence metadata,
and future AI output outside the trusted domain contract.

A builder needs recoverable saves and explicit stale-editor conflicts. Published content needs immutable history,
monotonic versions, and atomic lifecycle pointers. Making every autosave permanent history creates noisy versions;
mutating published rows would change the meaning of historical submissions.

## Decision

Separate three application concepts:

- an owner-management query across the owner's lifecycle states;
- one mutable draft workspace for the current candidate definition;
- immutable `FormVersion` rows created only by publication.

“Accessible to an actor” remains distinct from “owned by an actor.” `AccessibleFormSource` remains published and
runner-facing. New management ports are owner-only and never include system forms or another user's resources.

### Actor and authorization

Every use case receives an application-owned `AuthenticatedActor` containing a stable user ID. Fastify resolves
the opaque session; request JSON never supplies owner identity or authorization. Creation always derives
`owner_user_id` from the actor and inserts `ownership_kind = 'user'`.

Every management query, lock, and update includes form ID and actor ID. Missing, system-owned, and differently
owned forms all return `404 not_found`. Authentication fails with `401` before a management port is invoked.
Ownership transfer is unsupported. Write authorization is defined per use case and is not inferred from read
access or Angular guards.

### Draft model

Add one `form_drafts` row per logical form:

- `form_id` primary key with a restrictive foreign key to `forms`;
- `definition jsonb not null`, read as `unknown`;
- `revision bigint not null`, beginning at 1 and incremented by successful saves;
- database-owned `created_at` and `updated_at`.

The JSON is a complete schema-v1 `FormDefinition`. Its identity must match the relational form, and its
`formVersion` must equal `forms.latest_version + 1`. Revision, lifecycle, ownership, and timestamps never enter
`FormDefinition`. PostgreSQL applies narrow identity checks only; `validateFormDefinition` remains authoritative.

A draft is mutable working state, not a published version and never submission-eligible. Draft history,
collaboration, approval, and recovery logs are deferred.

### Create

Use a fixed route such as `POST /api/v1/management/forms` with `{ "definition": unknown }`. The use case:

1. requires an authenticated actor;
2. runs `validateFormDefinition` and requires `formVersion = 1`;
3. atomically inserts a user-owned `forms` row in draft state with `latest_version = 0` and draft revision 1;
4. returns an owned management representation, not a persistence row.

The initial client supplies a schema-valid stable form ID. A uniqueness race returns `409 conflict` without
revealing ownership. IDs cannot be renamed. Slug suggestions or server-generated IDs are deferred.

### Save and optimistic concurrency

Use `PUT /api/v1/management/forms/:formId/draft` with a complete unknown definition and an opaque
`If-Match: "draft-7"` revision. The use case validates before persistence and performs one owner-scoped
conditional update at the expected revision. Success increments revision and returns a new ETag. Missing
ownership returns `404`; stale state returns `409` without embedding the current definition. The UI must reload
and let the user reconcile deliberately. Silent last-write-wins merging is prohibited.

Full-definition saves are the first contract. JSON Patch and field operations are deferred until builder UX
demonstrates a need. Request limits are HTTP policy, not domain metadata.

### Publish transaction

Use `POST /api/v1/management/forms/:formId/publications` with the expected draft ETag. One infrastructure
transaction behind an application-owned port:

1. locks the owner-scoped form and draft rows;
2. verifies the draft revision;
3. exposes JSON as `unknown` to a synchronous CPU-only application callback;
4. reruns runtime/domain validation and relational identity checks;
5. applies publishability policy separately from validity;
6. allocates `latest_version + 1` while locked;
7. inserts an immutable version with database-owned `published_at`;
8. updates latest/current-published pointers, status, and timestamp atomically; and
9. deletes the consumed draft.

The callback performs no network, AI, or unrelated I/O. Database uniqueness and composite pointer constraints
remain final integrity guarantees. Races and stale drafts return `409`; safe publishability failures return
`422`; infrastructure failures remain internal.

Editing a published form starts through a separate owner-authorized operation that copies the validated current
definition, sets `formVersion = latest_version + 1`, and creates draft revision 1. Publication never mutates or
deletes older versions. ADR 0004 continues to govern their submission eligibility.

### Validity, publishability, and AI

Successful `validateFormDefinition` means structurally/domain valid—not authorized, publishable, or safe for a
workflow. Create/save keep invalid JSON out of normal draft storage. Publish validates again inside the
transaction, then applies explicit policy, initially rejecting password collection, unsupported schema versions,
and content prohibited by release/data-governance controls.

AI output eventually enters as unknown draft input through exactly the same validation, owner review, and
publication boundary. It receives no direct persistence or publishing path.

### Owner management query

Add a separate paginated owner-only query ordered by `updated_at DESC, id ASC`. It may expose lifecycle status,
latest/published version, draft presence/revision, and relational title/timestamps needed by management UI. It
never exposes owner IDs, raw rows, list definitions, submissions, or system samples. Builder screens never infer
edit permission from the accessible landing list.

Definitions remain `unknown` at HTTP and persistence ingress. API representations are owned DTOs, not Drizzle
rows or domain aliases. Management responses use `Cache-Control: no-store`.

### Errors, logging, and audit

- malformed envelope, ETag, or definition: `400 invalid_request`;
- missing session: `401 unauthenticated`;
- missing/system/non-owned form: `404 not_found`;
- duplicate ID, stale draft, or publication race: `409 conflict`;
- valid but prohibited publication: `422 unpublishable_form` with stable safe issues;
- unexpected persistence error: `500 internal_error`.

Issues never echo values or validator-library terms. Definitions, field content, credentials, and answers are
not logged. Safe logs may include request ID, actor ID, form ID, operation category, and resulting revision.

Database timestamps provide initial operational metadata, not a complete audit trail. An append-only audit
system is deferred until compliance/collaboration requirements define event vocabulary, retention, and access.

### Implementation sequence

1. Migration, owner-management port, create use case/route, and PostgreSQL tests.
2. Load/save draft concurrency, then publication and transaction-race tests.
3. Angular owner-management dashboard and minimal manual builder using the existing runner for preview.
4. Richer builder operations only from demonstrated UX needs.
5. AI structured output only after it must traverse the same draft/review/publication boundary.

Organizations, collaboration, ownership transfer, AI generation, arbitrary workflows, and advanced builder
features are deferred. Each implementation slice receives a separate issue and PR.

## Alternatives considered

### Store every save as an immutable version

Rejected because version numbers would describe autosaves rather than published content revisions.

### Mutate the latest version until publication

Rejected because defects or races could rewrite history referenced by submissions.

### Keep drafts in Angular/browser storage

Rejected because work would not survive device loss and would lack backend authorization and concurrency.

### Last-write-wins saves

Rejected because tabs and delayed requests could silently destroy edits. Revision checks are inexpensive.

### Put revision, ownership, lifecycle, or timestamps in `FormDefinition`

Rejected because these are application/persistence concepts, not renderable form content.

### Expand `AccessibleFormSource`

Rejected because accessibility and ownership answer different questions and imply different authorization.

### Trust Fastify schemas or Drizzle inference

Rejected. External and JSONB definitions remain `unknown` until Form Farm runtime validation succeeds.

## Consequences

- Autosaves are practical without weakening immutable published history.
- Publication atomically validates, allocates a version, updates pointers, and consumes the draft.
- Stale editors conflict instead of silently overwriting.
- Draft storage introduces backup, cleanup, and privacy lifecycle work.
- Full-definition saves are simple but may later require measured debounce/payload improvements.
- Management and runner APIs remain cleanly separate.
- AI remains downstream of deterministic validation and human review.

Required tests include concurrent ID creation, owner/non-owner/system authorization, invalid input before storage,
identity mismatch, stale saves, publication races, monotonic allocation, atomic pointers, consumed drafts,
preserved historical submissions, safe errors/logging, and migrations from empty and current databases.
