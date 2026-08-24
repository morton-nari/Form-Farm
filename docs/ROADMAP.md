# Form Farm AI Roadmap

## Current status

The form runner, owned backend, PostgreSQL submissions, authentication, owner-authorized published reads,
dashboard, health sample, owner draft create/load/save, atomic publication, structured section/basic field
operations, text-entry validation editing, fixed choice-option editing, and publishable field creation are
implemented. Number-, temporal-, selection-, and checkbox-acceptance validation are also editable.
Builder sections are collapsible for larger forms. Draft and published contracts are distinct: owner drafts may
contain temporarily empty sections, while preview and publication retain the strict `FormDefinition` requirement.
Existing-field type conversion and AI editing are not implemented.

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
- [x] Provide several interview-ready example forms
- [x] Introduce a draft-specific contract for temporarily incomplete sections
- [x] Remove automatic starter fields and expose empty-section builder states

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
- [x] Establish secure secret and environment management

## Phase 6 — AI form generation

This product experience is planned after the deterministic Form Intelligence foundations in Phase 9. Model
provider integration remains separate from MCP protocol work.

- Accept a natural-language form description
- Request structured model output from the backend
- Validate and normalize generated schemas
- Preview generated forms before saving
- Record generation metadata and failures safely

## Phase 7 — AI-assisted editing

- Use the controlled schema operations and impact engine delivered through Phase 9
- Generate operations rather than uncontrolled replacements
- Validate and preview changes as a diff
- Apply changes only after user confirmation
- Never publish an AI-generated or AI-edited draft automatically

## Phase 8 — CI/CD and deployment

CI foundations should start earlier; this phase completes public delivery.

- [x] Enforce frontend and backend checks on pull requests
- [x] Define and accept the free portfolio deployment architecture in ADR 0007
- [x] Add the Vercel Fastify adapter and monorepo build/routing configuration
- [x] Add explicit domain, backend integration, deployment, and retained-preview smoke gates
- Deploy a public portfolio demo
- [x] Document environments, configuration, promotion, rollback, and operational limits
- [x] Define accountable Production operations and rehearse release controls in isolated non-production infrastructure
- [x] Provision the approved empty, isolated, zero-cost Production resource boundary without migration or deployment
- [x] Add complete manual, approval-protected Production CI/CD against the reviewed resource boundary

## Phase 9 — Form Intelligence and MCP

Goal: expose Form Farm as an AI-native form-engineering platform without weakening domain validation, ownership,
immutable publication, version-bound submissions, optimistic concurrency, security, or human approval.

The working product direction is the **Form Farm Intelligence Platform**: “Safely inspect, analyze, simulate,
evolve, and audit versioned forms through AI and MCP.” This is a product hypothesis to validate, not a commercial
readiness claim. The flagship capability is a deterministic **Form Change Impact Engine**, not a generic CRUD MCP
server.

### Deterministic foundations

- [x] Define an ADR for the Form Intelligence and MCP architecture before protocol implementation.
- [x] Define an exhaustive provider-neutral Form Change Operation model over `FormDraftDefinition`; do not use
      arbitrary JSON mutation as the client contract.
- [x] Implement immutable operation application with strict runtime/domain validation and no publication behavior.
- [x] Implement semantic form diffing that understands stable IDs, order, presentation, validation, structure,
      choice labels, and submitted option values.
- [x] Implement the deterministic Form Change Impact Engine before requiring an LLM.
- [x] Classify presentation, validation, answer-contract, structural, potentially destructive, privacy-sensitive,
      accessibility-sensitive, and compatibility effects.
- [x] Explain historical-versus-future submission implications using immutable published-version semantics.

### Safe capability boundary

- [x] Define and review the local developer credential lifecycle before owner-aware MCP tools.
- [x] Implement the development-only credential grammar, verifier storage, bounded lifecycle, concurrency-safe
      issuance limit, owner-scoped core use cases, and Production runtime-grant exclusion.
- [x] Add development-only owner-management HTTP and Angular flows with request-scoped current-password
      confirmation, session continuity, one-time display, safe listing, and revocation.
- [x] Add development-only per-invocation credential resolution into `AuthenticatedActor`, with strict
      environment transport, constant-time verifier checks, revocation/expiry/scope enforcement, durable
      HMAC-keyed failure throttling, and bounded last-used writes.
- Start with a local, read-only MCP adapter exposing a deliberately small surface: `inspect_form`,
  `compare_form_versions`, and `impact_analysis` for explicit operations.
- Route every MCP capability through existing application use cases, domain validation, authorization, and
  persistence ports; never provide SQL, filesystem, arbitrary URL-fetching, secret, or raw session access.
- Define MCP authentication/authorization, privacy-safe errors/results, confirmation, audit, and client identity
  in the architecture ADR.
- Keep deterministic analysis separate from heuristic or AI-assisted suggestions.
- Add non-mutating `analyze_form`, `propose_form_changes`, and advisory `simulate_form` tools only after their
  underlying services are independently proven.
- Add `apply_draft_operations` only after controlled operations, semantic diffing, impact analysis, authorization,
  audit, and confirmation are proven. Require owner authentication and an exact expected ETag, mutate only the
  draft, return the new ETag and deterministic diff, and never publish.

### AI and developer experience

- Integrate an AI provider separately from MCP; model output must be untrusted controlled operations, never an
  authoritative `FormDefinition` replacement.
- Require impact review and explicit human confirmation before applying an AI-generated proposal.
- Record safe proposal/application audit evidence without secrets, raw authentication material, unnecessary full
  definitions, model chain-of-thought, or sensitive submission content.
- Document local connections for compatible developer clients and examples that inspect, explain, compare, and
  propose without mutation by default.
- Evaluate remote MCP deployment only after local behavior, authentication, and authorization are proven.
- Evaluate RAG or embeddings only when a concrete knowledge problem and measurable benefit exist.

The intended sequence is deterministic domain operations → semantic diff → impact engine → read-only local MCP
→ deterministic analysis → AI proposal generation → non-mutating proposal tools → owner-approved ETag draft
application → developer integration. MCP and LLM implementation must not be combined into one issue.

## Working method

```text
issue → branch from dev → implementation and docs → checks → PR → review → merge to dev
```

Share important PR links with the external GPT advisor when additional architectural feedback is useful.
