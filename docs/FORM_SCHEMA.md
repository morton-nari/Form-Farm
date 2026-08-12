# Form Farm AI Schema

## Purpose

The Form Farm schema is the provider-neutral contract used to describe a form. A form definition can come from a deterministic backend endpoint, persisted data, a form builder, or validated AI structured output. The Angular renderer must not need feature-specific knowledge to display it.

The TypeScript domain vocabulary lives in `src/app/domain/forms/form-definition.models.ts`. Untrusted input enters through `validateFormDefinition` in `form-definition.validator.ts`, which applies strict structural parsing followed by domain invariant validation. The validation approach is recorded in [ADR 0001](adr/0001-runtime-schema-validation.md).

## Boundary

`FormDefinition` describes renderable form content. It does not contain:

- Angular controls, validators, or component configuration;
- HTTP routes or arbitrary submission URLs;
- database IDs, ownership, lifecycle status, or timestamps;
- AI prompts, model names, raw output, or generation metadata;
- privileged backend operations such as creating an account or taking payment.

The backend chooses the controlled operation associated with a published form. Schema data may control safe presentation such as button text and a success message, but it cannot select arbitrary executable behavior.

`submission.submitLabel` and `submission.successMessage` remain in the immutable definition for schema version 1 because they are part of the form's API-driven user experience and should be versioned with the fields users complete. They are presentation content only. Publishing metadata, redirects, API destinations, handler selection, and workflow outcomes remain outside the definition. This boundary should be reconsidered if publishing later needs to vary presentation without creating a new form version.

## Structure

```text
FormDefinition
├── schemaVersion
├── id and formVersion
├── title and optional description
├── FormSection[]
│   └── FormField[]
└── submission presentation
```

`FormDefinition` is the complete renderable definition. `FormSection` groups fields for presentation and navigation. `FormField` is a discriminated union whose `type` determines its supported configuration and answer value.

## Versioning

- `schemaVersion` identifies the structure and interpretation of the Form Farm contract. Breaking contract changes require a new schema version.
- `formVersion` identifies an immutable content revision of a logical form. Editing a title, field, option, or rule creates a new form version without changing the schema version.

Both are positive integers. A submission must reference the exact logical form and form version used to collect it.

## Identifiers and ordering

- A form ID is stable across its content versions.
- Section IDs are unique within a form.
- Field IDs are unique across the entire form and are used as answer keys.
- IDs remain stable when labels or positions change.
- IDs use machine-safe values matching `^[A-Za-z][A-Za-z0-9_-]*$`.
- Array position is authoritative for sections, fields, and options. Separate order properties are intentionally omitted.

Runtime domain validation enforces these invariants before external data enters the form engine.

## Supported fields

Schema version 1 defines these standard fields. A type is considered supported only when its runtime structure and invariants are validated, its answer representation is enforced, the frontend renders it accessibly, and those behaviors have automated test coverage. The TypeScript contract establishes that target; issues #17 and #21 will prove it at the system boundary.

| Field type       | Answer value | Notes                                                          |
| ---------------- | ------------ | -------------------------------------------------------------- |
| `text`           | string       | Single-line text                                               |
| `email`          | string       | Email syntax is inherent to the type                           |
| `password`       | string       | No default value; sensitive handling is required               |
| `tel`            | string       | Telephone input semantics without assuming a particular format |
| `url`            | string       | URL syntax is inherent to the type                             |
| `textarea`       | string       | Multi-line text                                                |
| `number`         | number       | May be constrained by range and integer rules                  |
| `date`           | string       | ISO `YYYY-MM-DD`                                               |
| `datetime`       | string       | ISO 8601 date-time                                             |
| `time`           | string       | `HH:mm` or `HH:mm:ss`                                          |
| `select`         | string       | One stable option value                                        |
| `radio`          | string       | One stable option value                                        |
| `multi-select`   | string[]     | Multiple stable option values                                  |
| `checkbox`       | boolean      | One boolean answer                                             |
| `checkbox-group` | string[]     | Multiple stable option values                                  |

The union deliberately prevents invalid combinations such as options on an email field. Renderers and validators should handle the union exhaustively and reject unknown types.

## Options

Choice fields use separate presentation labels and submitted values:

```ts
{ label: 'Phone call', value: 'phone' }
```

Option values must be unique within the field and remain stable when labels change. Array position controls display order. Version 1 uses string option values to keep transport, storage, and analytics predictable.

## Validation rules

Validation is declarative and restricted by field category:

- text: `required`, `minLength`, `maxLength`;
- number: `required`, `min`, `max`, `integer`;
- date/time: `required`, `earliest`, `latest`;
- multi-choice: `required`, `minSelections`, `maxSelections`;
- checkbox: `required`, `accepted`;

Email and URL format validation follows the field type. Empty optional answers are omitted from submissions. `null` may be useful in frontend form state but is not a submitted answer value.

Arbitrary regular expressions, executable validation, asynchronous checks, and cross-field rules are not supported in version 1. Backend business rules still apply after schema-based answer validation.

## Complete example

`src/app/domain/forms/examples/user-registration.form.ts` demonstrates a complete registration form with API-owned title, sections, labels, validation, options, submission label, and success message.

The example does not authorize account creation by itself. A trusted backend route or stored association selects an approved registration handler, hashes passwords, prevents sensitive logging, and applies authentication policy.

## Use at system boundaries

### Backend API

The backend returns a validated `FormDefinition`. A typical read endpoint can identify the logical form and version, while a controlled submission endpoint accepts the corresponding answers. Exact routes will be designed with the owned backend.

### Persistence

Lifecycle and ownership data remain relational concerns. Each published form version stores an immutable validated definition. Each submission references the exact version and contains only validated answer values.

### AI structured output

AI produces candidate structured data on the backend, never Angular source code. Candidate data must pass structural and domain validation, then be reviewed by a user before it can be published. Provider metadata is stored separately from the form definition.

### Frontend

The frontend validates the API response, creates Reactive Form controls from the rules, renders fields by their discriminant, and submits typed answers. It does not infer behavior from field IDs or from names such as “registration.”

## Legacy migration

The existing insurance API is an external legacy contract, not part of the Form Farm domain. During migration:

| Legacy API       | Form Farm domain                                     |
| ---------------- | ---------------------------------------------------- |
| application      | form definition                                      |
| page             | section                                              |
| question         | field                                                |
| required boolean | `required` rule                                      |
| string option    | separate label/value option                          |
| quote answers    | generic form answers adapted at the feature boundary |

Existing loading, retry, validation, accessibility, navigation, review, and focus behavior should be preserved. Quote outcomes and server-requested follow-up pages are workflow behavior and do not belong in the general schema.

## Deferred concepts

The following require concrete use cases and separate security or design work:

- conditional visibility and branching;
- repeatable or nested groups;
- calculated and cross-field values;
- remote option sources;
- arbitrary custom widgets;
- rich-text editing;
- file uploads and uploaded-file reference lifecycle;
- signatures;
- payments;
- address-provider integrations;
- arbitrary submission URLs or executable actions;
- AI-selected privileged backend behavior.

New capabilities should be added as validated, explicit schema variants rather than through an untyped metadata escape hatch.
