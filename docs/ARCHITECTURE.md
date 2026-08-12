# Form Farm AI Architecture

This document separates the architecture that exists today from the intended target. Planned capabilities must not be described as implemented.

## Current architecture

Form Farm AI currently contains an Angular 22 frontend derived from the Nobleoak coding assessment.

```text
External insurance API
        ↓ HTTP Observable
InsuranceApiService
        ↓
QuoteJourneyStore
        ↓ readonly signals
QuoteJourneyPage
        ↓
JourneyFormFactory + DynamicQuestion
        ↓
Accessible Reactive Form UI
```

### Current boundaries

- `core/api` contains external HTTP contracts and the API client.
- `features/quote-journey/data-access` adapts API data and owns journey state.
- `features/quote-journey/forms` creates Reactive Form controls and validators.
- `features/quote-journey/components` renders questions and progress navigation.
- `features/quote-journey/pages` coordinates the screen and focus behaviour.

The current schema supports text, email, number, select, and radio controls. The project has no owned backend, database, authentication, or AI integration yet.

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

The version-one domain contract is defined in `src/app/domain/forms` and documented in
[`FORM_SCHEMA.md`](FORM_SCHEMA.md). It supports a controlled set of standard form fields through a
discriminated union. Field IDs are globally unique answer keys, array position defines ordering, and
choice labels are separate from their stable submitted values.

The schema contains renderable form content and safe submission presentation only. Lifecycle,
ownership, persistence metadata, AI generation metadata, HTTP destinations, and privileged backend
operations remain outside the form definition. The current insurance API remains a legacy external
contract until the runner migration in Phase 1; it does not define the new domain.

## Persistence direction

PostgreSQL is the preferred candidate. The intended model combines relational lifecycle data with JSONB for the flexible schema:

- `Form` owns identity, name, status, and ownership.
- `FormVersion` stores an immutable validated schema and version number.
- `FormSubmission` references the exact published version and stores validated answers.

The database and data model will be confirmed through ADRs before implementation.

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

- Backend framework
- Runtime schema-validation library
- Database access and migration tooling
- Authentication strategy
- Hosting architecture
- AI provider and provider-abstraction boundary

Each significant decision will be evaluated when its milestone begins and recorded in an ADR.
