# Form Farm AI Backend API

This document describes implemented HTTP behavior. Form writes/publishing and AI operations are not part of
the current API. The Angular form viewer consumes the generic form endpoints; Angular authentication wiring is
a separate follow-up.

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

## Get a form definition

```http
GET /api/v1/forms/:formId
```

`v1` is the HTTP API version. It is separate from both `schemaVersion`, which versions the shape of the
Form Farm contract, and `formVersion`, which identifies a content revision of one logical form.

The initial deterministic form is available at:

```http
GET /api/v1/forms/customer-feedback
```

A successful response is the validated provider-neutral `FormDefinition` JSON with status `200`. The
current fixture has `schemaVersion: 1`, `id: "customer-feedback"`, and `formVersion: 1`. The endpoint
passes source data through `validateFormDefinition` before returning it, even though its current source
is owned in-memory data.

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
trust. A deterministic development seed supplies `customer-feedback`. Unit tests may inject the in-memory
source, but production composition does not use it.

This read capability does not imply authorization or privileged workflow execution. Version creation,
publishing operations, ownership, and dashboard queries remain planned work.

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
