# Form Farm AI Roadmap

## Current status

The Angular form runner is functional and tested. It still consumes the supplied external insurance API. The project is beginning its transition from assessment solution to full-stack product.

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
- Add runtime schema validation (in progress in issue #17)
- Expand supported field and validation types
- Decouple the form engine from insurance API contracts
- Preserve existing accessibility and tests

## Phase 2 — Owned backend

- Compare backend approaches and record the selection in an ADR
- Scaffold a TypeScript backend
- Add health, configuration, and error-handling foundations
- Serve a deterministic form definition from the owned API
- Connect the Angular form runner to that API
- Add backend and API contract tests

## Phase 3 — Form builder and realistic demos

- List and create forms
- Add and arrange sections and fields
- Configure field options and validation
- Preview forms through the existing runner
- Provide several interview-ready example forms

## Phase 4 — PostgreSQL persistence and versioning

- Select database access and migration tooling
- Persist forms and immutable versions
- Publish form versions
- Store submissions against the submitted version
- Add database integration tests

## Phase 5 — Authentication and authorization

- Implement sign-up, login, logout, and session handling
- Protect frontend routes and backend operations
- Add form ownership and authorization
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
