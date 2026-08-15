# Form Farm AI Roadmap

## Current status

The form runner, owned backend, PostgreSQL submissions, authentication, owner-authorized published reads,
dashboard, health sample, owner draft create/load/save, atomic publication, structured section/basic field
operations, text-entry validation editing, fixed choice-option editing, and publishable field creation are
implemented. Number-, temporal-, selection-, and checkbox-acceptance validation are also editable.
Builder sections are collapsible for larger forms. Existing-field type conversion and AI editing are not.

## Phase 0 — Product foundation

Status: **in progress**

- [x] Confirm product name: Form Farm AI
- [x] Rename GitHub repository to Form-Farm
- [x] Restore service-owned Observable application loading
- [x] Document product vision and current/target architecture
- [x] Add repository-level AI agent guidance
- [x] Add contribution and pull-request guidance
- [ ] Review and merge the product-foundation PR
- [ ] Create initial GitHub issues and milestone
- [ ] Create a GitHub Project and Kanban views
- [ ] Add the initial pull-request CI workflow on a dedicated branch

## Phase 1 — General form domain

- [x] Define a provider-neutral form schema
- [x] Add runtime schema validation
- [x] Expand supported field and validation types
- [x] Decouple the form engine from provider-specific API contracts
- [x] Preserve existing accessibility and tests

## Phase 2 — Owned backend

- [x] Compare backend approaches and select lean Fastify 5 in ADR 0002
- [x] Scaffold a TypeScript backend
- [x] Add health, configuration, and error-handling foundations
- [x] Serve a deterministic form definition from the owned API
- [x] Connect the Angular form runner to that API
- [x] Add backend and API contract tests

## Phase 3 — Form builder and realistic demos

- [x] Add an authenticated accessible-forms dashboard
- [x] Define owner creation, draft, versioning, and publication semantics in ADR 0006
- [x] Add atomic owner form and revision-1 draft creation
- [x] Load and save owner drafts with strict optimistic concurrency
- [x] Publish owner drafts as immutable versions atomically
- [x] Bootstrap one next-version draft from a published owner form
- [x] Add a separate owner-management backend query across lifecycle states
- [x] Add a minimal Angular owner-management dashboard and trusted create/edit/publish workflow
- [x] Add structured section editing
- [x] Add basic structured field editing and arrangement
- [x] Configure text-entry required and length validation
- [x] Configure ordered options for fixed choice fields
- [x] Choose a publishable field type when creating a field
- [x] Configure number-field validation
- [x] Configure temporal-field validation
- [x] Configure selection-field validation
- [x] Configure checkbox acceptance validation
- [x] Preview owner drafts through the existing runner primitives without submission
- [x] Add accessible collapsible builder sections
- Provide several interview-ready example forms

## Phase 4 — PostgreSQL persistence and versioning

- [x] Select database access and migration tooling in ADR 0003
- [x] Persist and read the seeded published form/version from PostgreSQL
- Persist owner-created forms and immutable versions
- [x] Publish form versions
- [x] Store submissions against the submitted version
- [x] Submit provider-neutral Angular answers with safe idempotent retry
- [x] Support an owner-authorized dashboard form-summary query
- Add database integration tests

## Phase 5 — Authentication and authorization

- [x] Define authentication, session, CSRF, and ownership architecture in ADR 0005
- [x] Add the framework-independent account, opaque-session, rate-limit, and ownership persistence core
- [x] Expose sign-up, login, logout, session, cookie, XSRF, origin, and rate-limit HTTP handling
- [x] Wire Angular registration, login, session bootstrap, guards, and logout
- [x] Protect frontend routes and backend form-read operations
- [x] Add user form ownership and read authorization, with organizations deferred until justified
- [x] Add a provider-neutral health questionnaire as the primary authenticated sample
- Establish secure secret and environment management

## Phase 6 — AI form generation

- Accept a natural-language form description
- Request structured model output from the backend
- Validate and normalize generated schemas
- Preview generated forms before saving
- Record generation metadata and failures safely

## Phase 7 — AI-assisted editing

- Define controlled schema operations
- Generate operations rather than uncontrolled replacements
- Validate and preview changes as a diff
- Apply changes only after user confirmation

## Phase 8 — CI/CD and deployment

CI foundations should start earlier; this phase completes public delivery.

- Enforce frontend and backend checks on pull requests
- Add integration and end-to-end test jobs
- Deploy a public portfolio demo
- Document environments, configuration, rollback, and operational limits

## Phase 9 — Advanced AI capabilities

Evaluate RAG, embeddings, MCP, and a repository-aware developer assistant only after a concrete use case and measurable value are established.

## Working method

```text
issue → branch from dev → implementation and docs → checks → PR → review → merge to dev
```

Share important PR links with the external GPT advisor when additional architectural feedback is useful.
