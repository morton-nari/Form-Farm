# Form Farm AI Backend API

This document describes implemented HTTP behavior. Form writes/publishing and AI operations are not part of
the current API. Angular consumes both the generic form endpoints and this authentication boundary; owner
dashboard queries use the same opaque-session boundary.

## Authentication

The backend exposes fixed trusted routes; form definitions cannot select or alter them:

```text
GET  /api/v1/auth/xsrf
POST /api/v1/auth/register
POST /api/v1/auth/login
GET  /api/v1/auth/session
POST /api/v1/auth/logout
```

`GET /xsrf` returns `204` and issues a readable, host-only XSRF cookie. Every unsafe authentication request
requires JSON, the exact configured `Origin`, and a matching `X-XSRF-TOKEN` header. Registration returns the
same `202 { "accepted": true }` contract whether a normalized account identifier was newly stored or already
existed. Login returns `200 { "authenticated": true }` and replaces the bootstrap token with a session-bound
XSRF token plus an opaque HttpOnly session cookie. Production cookies use `__Host-` names, `Secure`,
`SameSite=Lax`, `Path=/`, and no `Domain`; explicit loopback development configuration uses non-secure names.

`GET /session` returns `200` only for an active, unexpired, unrevoked PostgreSQL session. Logout is idempotent,
revokes a presented credential, clears both cookies, and returns `204`. Authentication responses use
`Cache-Control: no-store`. Generic failures are `401 invalid_credentials`, `401 unauthenticated`, `403
forbidden`, or `429 rate_limited` with a safe `Retry-After`; submitted identifiers and credentials are never
returned or logged. Durable source and normalized-account rate limits use independently keyed HMAC identities.
Previous XSRF and limiter keys are accepted only until one validated rotation deadline, limited to a maximum
24-hour overlap; current keys are always used for new tokens and identities.

## List and get forms

```http
GET /api/v1/forms
```

An authenticated request returns `{ "forms": [...] }` containing only dashboard summaries: stable ID,
title, current form version, and update timestamp. It does not return definitions, persistence rows, owner
identities, or submission data. Published system forms are available to every authenticated user; published
user forms are available only to their exact owner. Draft, archived, and another user's forms are excluded.
This is deliberately an **accessible-forms landing query**, not an owner-management query. The initial
system-form rule supports curated platform forms (currently only the development sample); it does not imply
that the signed-in user owns or may edit those forms.

Published-only behavior is intentional for this runner-facing slice. A later management API must use a
separate owner-only, lifecycle-aware query for Draft / Published / Archived views and write controls rather
than broadening this accessibility contract. Form creation, editing, and publishing use cases will receive the
authenticated actor and enforce their own authorization policies.

The first response is intentionally unpaginated while form creation is unavailable. Pagination must be added
before users can accumulate large form collections; clients must not treat the current unbounded array as the
final dashboard contract. Results are ordered by `updated_at DESC`, then form ID ascending as a stable
tie-breaker.

```http
GET /api/v1/forms/:formId
```

This read also requires a valid session and applies the same ownership policy in the backend use case and
PostgreSQL query. Missing and inaccessible IDs both return `404`, preventing ownership discovery.

`v1` is the HTTP API version. It is separate from both `schemaVersion`, which versions the shape of the
Form Farm contract, and `formVersion`, which identifies a content revision of one logical form.

The deterministic development form is available to authenticated users at:

```http
GET /api/v1/forms/customer-feedback
```

A successful response is the validated provider-neutral `FormDefinition` JSON with status `200`. The
current fixture has `schemaVersion: 1`, `id: "customer-feedback"`, and `formVersion: 1`. The endpoint
passes persisted source data through `validateFormDefinition` and checks JSON/relational identity before
returning it.

The list currently validates each selected full JSONB definition to obtain trusted title and version data.
That keeps one trust rule for the initial scale, but is not the intended high-volume projection. When creation
is introduced, frequently queried dashboard fields should be evaluated for relational storage so list requests
do not repeatedly parse every definition.

Valid identifiers begin with a letter and contain only letters, digits, `_`, or `-`.

## Errors

Errors use a stable envelope:

```json
{
  "error": {
    "code": "not_found",
    "message": "Form not found."
  }
}
```

| Situation                                              | Status | Code              |
| ------------------------------------------------------ | -----: | ----------------- |
| Malformed `formId`                                     |  `400` | `invalid_request` |
| Unknown form                                           |  `404` | `not_found`       |
| Invalid source definition or unexpected server failure |  `500` | `internal_error`  |

Invalid source definitions are logged internally and are never returned as form data. Validation details
and internal exception messages are not exposed to clients.

## Current source and lifecycle

The runtime endpoint uses PostgreSQL and selects only the current published version. The JSONB definition
remains `unknown` until it passes `validateFormDefinition`; Drizzle inference is never treated as domain
trust. Deterministic development seeds supply `health-questionnaire` and `customer-feedback`. Both are
system-owned published samples and are therefore intentionally visible to every authenticated user under the
current accessible-form policy. Unit tests may inject the in-memory source, but production composition does not
use it.

The health questionnaire is sample content, not medical advice and not approval to collect real health data.
Health/contact answers may be sensitive personal information. Production use requires explicit review of
consent, access, retention, deletion, encryption, auditing, incident response, and applicable jurisdictional
requirements before submissions are enabled for real people.
The optional free-text field can collect arbitrary sensitive information; its warning copy is guidance, not an
enforceable security control. The date-of-birth limits are immutable sample-version rules and require a new form
version when their policy changes.

Seed reruns do not touch lifecycle timestamps or republish forms that are already published. Dashboard ordering
continues to mean resource update recency, not featured rank. If curated samples need a fixed featured order,
that requires separate explicit product data rather than overloading `updated_at`.

Dashboard and definition reads are owner-authorized. This does not grant form creation, publishing, or other
privileged workflow capabilities, which remain planned work.

## Create an owner form draft

```http
POST /api/v1/management/forms
Origin: https://the-configured-app-origin.example
X-XSRF-TOKEN: <session-bound token>
Content-Type: application/json

{ "definition": { ...complete FormDefinition... } }
```

This authenticated management route implements only initial draft creation. Ownership comes exclusively from
the resolved session actor; ownership fields are not accepted in JSON. The complete definition is treated as
`unknown`, must pass `validateFormDefinition`, and must have `formVersion: 1`.

One PostgreSQL transaction serializes creation for the actor, enforces the controlled-release limit of 100
owned forms, inserts a user-owned logical form with `latest_version = 0`, and inserts revision-1 draft JSON. A
duplicate global form ID or owner limit returns `409 conflict`; validation returns `400`; missing authentication
returns `401`; origin/XSRF failures return `403`. Every response is `Cache-Control: no-store`. Failure cannot
leave a normal owner form without its draft.

The global client-chosen identifier and 100-form cap are controlled portfolio-release constraints, not the final
multi-tenant namespace design. Draft load/save, ETags, publication, archive/restore, Angular builder behavior,
and AI generation are not implemented by this endpoint.

## Submit a form response

```http
POST /api/v1/forms/:formId/submissions
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "formVersion": 1,
  "answers": {
    "overallRating": "good"
  }
}
```

The exact rendered version is required and remains the version used for validation and persistence.
Creation returns `201`; an identical idempotent replay returns `200` and the original PostgreSQL-owned
submission ID. The route body limit is currently 256 KiB.

Answers pass through `validateFormAnswers` against the validated persisted definition. Unknown fields,
wrong types, unavailable options, missing required values, and rule violations fail with `422
invalid_submission` and safe provider-neutral issues that never echo values. Draft/unknown versions
return `404`, archived forms and conflicting idempotency reuse return `409`, oversized bodies return
`413`, and unexpected persistence failures return a safe `500`.

Previously published non-current versions remain eligible while the logical form is published. Archival
stops all versions. Generic password fields are not submittable. Full boundaries are in
[`ADR 0004`](adr/0004-versioned-form-submissions.md).

An existing form with no current published version is intentionally indistinguishable from an unknown
form at this public endpoint: both return `404 not_found`. This avoids exposing draft existence. A future
authenticated management API may distinguish those states through a separate use case and authorization
policy.
