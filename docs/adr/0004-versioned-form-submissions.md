# ADR 0004: Version-bound form submission validation and persistence

## Status

Accepted

## Context

Form Farm can read an immutable published `FormDefinition` from PostgreSQL, validate it through the
shared domain boundary, and render it in Angular. The next vertical slice must accept a provider-neutral
answer map, validate it against the definition the user actually completed, and persist a
`FormSubmission` without allowing HTTP, Angular, Drizzle, or schema-defined workflow behavior into the
domain.

A submission can race with publication. If Angular renders form version 1 and version 2 becomes current
before the user submits, resolving only the current version at submission time could reject valid version
1 answers or, worse, interpret matching field IDs under different semantics. The submitted version must
therefore be explicit and must remain the version used for both validation and the database reference.

The endpoint is initially public because authentication is a later milestone. That makes payload bounds,
idempotency, safe errors, and data handling part of the first design rather than optional hardening.

## Decision

Add a generic endpoint:

```http
POST /api/v1/forms/:formId/submissions
Idempotency-Key: <opaque client-generated key>
Content-Type: application/json

{
  "formVersion": 1,
  "answers": {
    "overallRating": "good"
  }
}
```

The route is stable for every form. A `FormDefinition` cannot select a URL, handler, redirect, account
operation, payment, or other privileged action. `submission.submitLabel` and `successMessage` remain
presentation only.

Angular sends the `formVersion` it rendered and extracts answers through
`DynamicFormFactory.getAnswers()`. It never sends a `FormGroup`, controls, labels as choice values, or an
action interpreted from schema data. The backend does not silently replace the requested version with
the current version.

### Version eligibility and concurrency

The application accepts a requested version only when:

- the logical form exists and currently accepts submissions (`forms.status = 'published'`);
- the exact `(form_id, form_version)` row exists;
- that version has previously been published (`published_at is not null`); and
- its JSONB definition passes `validateFormDefinition` and matches the relational identity columns.

A previously published version remains submittable while the form itself remains published. This allows
a user who loaded version 1 to finish after version 2 is published. Archiving the form stops all new
submissions. A future lifecycle policy may introduce an explicit acceptance window, but the first slice
does not invent expiry metadata.

One application-owned transaction port coordinates the operation. Its infrastructure implementation:

1. starts a PostgreSQL transaction;
2. locks the `forms` row and requested `form_versions` row for the eligibility check;
3. exposes the persisted definition as `unknown` to an application callback;
4. lets the application validate the definition, relational identity, and answers;
5. inserts only the returned validated `FormAnswers` against that exact version; and
6. commits, or rolls back on every validation, eligibility, idempotency, or database failure.

The callback and port use application/domain values only; transaction clients, Drizzle rows, and SQL
types remain infrastructure details. Form publication and archival must use compatible row locking so a
lifecycle change cannot interleave between the eligibility decision and insert. The existing composite
foreign key remains the final exact-version integrity guarantee.

### Runtime answer validation

Add an owned, framework-independent function such as:

```ts
validateFormAnswers(definition: FormDefinition, input: unknown): FormAnswersValidationResult
```

Like `validateFormDefinition`, it hides Zod and returns deterministic, side-effect-free, provider-neutral
issues. It performs no coercion, trimming, default application, or field-name inference.
This validator defines answer semantics for the product. Angular maps those same domain semantics into
Reactive Forms for early feedback; backend validation must not be implemented by copying Angular
validator behavior or importing frontend code. Shared domain test vectors keep the two consumers aligned.

The answer payload must be a plain JSON object. Keys are globally unique field IDs from the exact
definition. Unknown keys, `null`, nested objects, non-JSON values, and values of the wrong discriminated
type are rejected. Missing optional answers are valid; missing required answers are not. Defaults assist
rendering but are never applied by the backend to an omitted answer.

Field semantics are exhaustive:

| Field type                   | Accepted answer                                  |
| ---------------------------- | ------------------------------------------------ |
| text, textarea, tel          | string                                           |
| email                        | string satisfying the domain email format        |
| url                          | string satisfying the domain URL format          |
| number                       | finite JSON number                               |
| date, datetime, time         | string in that field's schema-v1 ISO format      |
| select, radio                | one enabled option value                         |
| multi-select, checkbox-group | unique enabled option values                     |
| checkbox                     | boolean                                          |
| password                     | not accepted by the generic persistence endpoint |

An empty string is still a string; `required` rejects it, while an optional field may contain it. No
whitespace normalization occurs because password-like and free-text semantics make implicit trimming
unsafe. Clients should omit unanswered optional fields, as the current Angular factory already does.
Persistence and later analytics intentionally distinguish an omitted answer (the user supplied no value)
from a present empty string (the user supplied an empty value). The first slice stores the validated map
as received and does not normalize one representation into the other.

Validation rules retain their schema meaning:

- `required`: answer key is present; strings are non-empty, selections contain at least one value, and a
  checkbox is `true`;
- `accepted`: checkbox is `true`;
- `minLength` / `maxLength`: JavaScript string length, matching the current renderer contract;
- `min` / `max` / `integer`: finite numeric comparisons;
- `minSelections` / `maxSelections`: unique selection count;
- `earliest` / `latest`: compare values only after field-specific ISO format validation.

Disabled option values are rejected even if they existed when authored. Duplicate values in a submitted
selection array are rejected rather than silently deduplicated.

Schema-v1 includes a `password` renderer, but storing credentials or secrets in generic answer JSONB is
not safe. The generic submission use case rejects any submitted password answer and refuses a form
containing a password field with a safe non-submittable-form error. Account registration and login use
dedicated trusted APIs with password hashing and never use `FormSubmission`. Removing or redesigning the
schema field itself is a separate schema-version decision.

### Request bounds and errors

- Set a route-level JSON body limit of 256 KiB for the first slice.
- Require `formVersion` to be a positive integer and `answers` to be a strict object.
- Keep Fastify structural validation shallow; owned domain validation remains authoritative.
- Return `400 invalid_request` for a malformed envelope or idempotency key.
- Return `404 not_found` when the form/version is unavailable without exposing draft existence.
- Return `409 conflict` when the form no longer accepts submissions or an idempotency key is reused with
  a different request.
- Return `422 invalid_submission` with safe field-ID paths and owned issue codes for answer failures.
- Return `500 internal_error` for persistence or unexpected failures.

Answer-validation issues may identify a field and rule but never echo submitted values. Zod errors, SQL
details, definitions, answers, credentials, and connection strings never enter client responses or logs.
Operational logs may include a submission ID, form ID, form version, safe error category, and request
correlation ID.

The `422` issue shape, path segments, and owned issue-code vocabulary are a versioned application
contract. Paths use `['answers', fieldId]` plus a stable rule segment only when needed. Codes describe
Form Farm semantics such as missing, unknown field, invalid type, invalid format, invalid option, or rule
violation; they never expose Zod issue names. Adding or changing codes requires contract tests and API
version compatibility review.

The 256 KiB body limit is an initial HTTP/operational default, not a form-domain invariant. Deployments
may lower it, and raising it requires measured need and abuse/memory review; `FormDefinition` cannot
override it.

### Idempotency

Require an `Idempotency-Key` header for submission creation. The first Angular client generates a UUID,
retains it while retrying the same logical submission, and replaces it only after the answers change or a
submission succeeds.

Persist the opaque key and a server-computed fingerprint of the canonical request alongside the
submission. Version 1 intentionally uses a globally unique key. UUID keys make accidental cross-client
collisions negligible, and global scope is the only honest boundary before actors or tenants exist. It
also prevents one anonymous retry from creating duplicates across route instances. After authentication,
a migration may scope uniqueness to a durable actor/tenant plus key, but the API must not promise that
change until ownership exists.

A database unique constraint is the final arbiter for one result per key. Repeating the same key and
fingerprint returns the original submission identity without inserting another row. Reusing the key for
a different form, version, or answer map returns `409 conflict`.

The key is not authentication and grants no read access to answers. PostgreSQL continues to generate the
submission UUID; the idempotency key is a separate operation identity.

The request fingerprint is SHA-256 over UTF-8 bytes of a canonical JSON serialization of an object with
exactly `formId`, `formVersion`, and `answers`. Canonicalization follows RFC 8785 JSON Canonicalization
Scheme: object keys are recursively sorted by UTF-16 code units, arrays retain order, strings retain their
Unicode code points without normalization, and finite numbers use ECMAScript JSON number serialization.
The validator rejects non-finite numbers and non-JSON values before fingerprinting. Semantically similar
but byte-distinct strings (including different Unicode normalization forms) intentionally produce
different fingerprints. The implementation must use a reviewed RFC 8785-compatible function or
exhaustive conformance tests; ad hoc top-level key sorting is insufficient.

Two concurrent identical requests may both pass the initial lookup. Both attempt the insert, and the
database unique constraint selects the winner. After the winner commits, the loser catches only the named
idempotency constraint, reads the committed row in a new statement/transaction, compares the fingerprint,
and returns the original success response. A different fingerprint returns `409 conflict`. The loser must
never map this expected race to `500`; bounded retry handles the brief case where the winner has not yet
become visible. Other constraint or database failures remain internal errors.

### Persistence changes

Extend the planned `form_submissions` table from ADR 0003 with:

- `id uuid primary key default gen_random_uuid()`;
- `form_id text not null`;
- `form_version integer not null`;
- `answers jsonb not null` treated as `unknown` on every read;
- `idempotency_key text not null unique`;
- `request_fingerprint text not null`;
- `submitted_at timestamptz not null default now()`;
- the existing restrictive composite foreign key to `form_versions`.

PostgreSQL checks only that answers are a JSON object and enforces relational identity, uniqueness, and
references. It does not reproduce field or rule validation. The migration is explicit, reviewed, and
tested from an empty database. The implementation issue may refine index shape from measured query needs
but must not weaken the exact-version or idempotency constraints.

### Security and operational boundary

The first slice is suitable for development and controlled demonstration, not unrestricted collection of
credentials, payment data, medical records, or other high-risk information. Authentication,
authorization, abuse controls, retention/deletion policy, encryption/key management, consent, and data
classification remain separate release requirements. Their absence must be documented rather than hidden
behind the generic schema.

Sensitivity is determined by form meaning and answers, not only field discriminants. Text, email,
telephone, date, number, and choice fields can all collect personal, health, financial, or other sensitive
data. Password is technically blocked because its safe handling is unambiguous, but that is not a general
data-classification system. Public release of any high-risk form remains prohibited until authentication,
authorization, retention/deletion, consent, access controls, and operational governance are implemented.

No answer payload or definition is logged. Integration-test failure diagnostics may include container
state and safe PostgreSQL lifecycle logs, but never connection strings, passwords, query parameters, or
answer values.

## Alternatives considered

### Resolve the current version only at submit time

Rejected because publication can occur after rendering. It can validate against a definition the user
never saw and breaks exact-version historical meaning.

### Put the version in the URL

`POST /forms/:formId/versions/:version/submissions` makes version identity visible, but exposes persistence
shape in the primary public route and complicates the stable form-resource API. A required body version
keeps the route stable while preserving the invariant.

### Accept only the current published version

This is simpler but turns routine publication into user-facing conflicts for forms already in progress.
Accepting any previously published version while the form remains published preserves the user's rendered
contract. Archival remains the explicit stop switch.

### Validate in Fastify route schemas or PostgreSQL

Rejected because it duplicates or replaces the provider-neutral domain boundary and risks executable
schemas derived from untrusted form data. Transport validation remains shallow and database checks remain
relational.

### Read, validate, then insert through unrelated repository calls

Rejected because lifecycle eligibility could change between calls. The application-owned transaction
port keeps validation in the application while infrastructure owns atomic database mechanics.

### Let clients choose submission UUIDs

This could combine identity and idempotency, but changes ADR 0003's clear UUID ownership and makes public
resource identity client-controlled. Separate opaque idempotency keys retain database-owned IDs.

### Store password answers encrypted in JSONB

Rejected for the first slice. Encryption does not supply password hashing, access policy, secret
rotation, redaction, or a justified credential-recovery workflow. Dedicated authentication APIs are the
correct boundary.

## Consequences

- Every submission is validated and stored against the immutable version the user rendered.
- Republish races do not reinterpret answers; archival consistently stops new submissions.
- Retries can be safe without duplicate rows.
- Angular, Fastify, Drizzle, and Zod remain outside the provider-neutral answer contract.
- The implementation adds a transaction-oriented application port, answer validator, migration, and
  idempotency behavior that require exhaustive unit, HTTP, and PostgreSQL integration tests.
- Previously published versions remain open while a form is published; a future expiry policy may narrow
  this deliberately.
- Generic password collection is explicitly unsupported rather than insecurely persisted.
- Public high-risk data collection remains blocked at the product-release level until security and data
  governance work exists.

Required integration cases include submitting the current published version, accepting a previously
published non-current version, rejecting every version after archival, rejecting never-published and
unknown versions without existence leakage, publication/archive races under compatible locks, identical
concurrent idempotent requests resolving to one stored result, conflicting key reuse, and exact
submission-to-version foreign-key integrity.
