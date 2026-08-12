# Form Farm AI Backend API

This document describes implemented HTTP behavior. Planned persistence, submission, authentication,
publishing, and AI operations are not part of the current API.

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

| Situation | Status | Code |
| --- | ---: | --- |
| Malformed `formId` | `400` | `invalid_request` |
| Unknown form | `404` | `not_found` |
| Invalid source definition or unexpected server failure | `500` | `internal_error` |

Invalid source definitions are logged internally and are never returned as form data. Validation details
and internal exception messages are not exposed to clients.

## Current source and lifecycle

The endpoint uses a seeded in-memory source. It does not imply that the form is published, authorized,
or executable as a privileged workflow. PostgreSQL persistence, immutable stored versions, ownership,
and dashboard queries remain planned work.
