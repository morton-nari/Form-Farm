# ADR 0008: Form Intelligence and MCP architecture

## Status

Proposed

## Context

Form Farm needs a controlled way for developer tools and future AI-assisted experiences to inspect, compare,
analyze, and eventually propose changes to versioned forms. MCP is useful as a protocol adapter for those
capabilities, but it is not the product's reasoning engine, authorization boundary, persistence API, or AI
provider abstraction.

Existing decisions require external definitions to enter as `unknown`, owner identity to come from verified
authentication rather than request data, draft writes to use optimistic concurrency, and publication to remain
an explicit owner action. MCP must preserve those decisions. It must not create a second path to PostgreSQL,
accept arbitrary SQL, expose browser sessions, or let model output bypass validation and human review.

The current MCP specification defines stdio and Streamable HTTP. Stdio is launched as a local child process and
obtains credentials from its environment. Streamable HTTP is a separately hosted network service with additional
Origin, authentication, authorization, session, and deployment obligations. They are materially different trust
boundaries.

## Decision

### Architecture and ownership

Add MCP only as a thin infrastructure adapter over application-owned Form Intelligence use cases.

```text
MCP client / IDE
       |
       | stdio JSON-RPC (initially)
       v
local Form Farm MCP adapter
       |
       | validated DTOs + verified actor context
       v
Form Intelligence application use cases
       |
       +--> domain validators / controlled operations / semantic diff / impact engine
       |
       +--> existing authorized application ports --> PostgreSQL adapters
```

The adapter owns protocol negotiation, MCP schemas, capability discovery, transport lifecycle, safe error
translation, and output shaping. It does not own domain rules, authorization, persistence queries, form-change
semantics, or AI orchestration. Application and domain modules have no MCP SDK dependency.

There is no MCP-to-database shortcut. Definitions loaded from persistence remain `unknown` until the owned
runtime validator accepts them. Owner-scoped operations receive an application-owned actor and enforce ownership
in both the use case and persistence predicate.

The local process is operator-owned development tooling. It writes protocol messages only to stdout and
privacy-safe diagnostics only to stderr. It is not part of Vercel startup, the Angular bundle, or Production.

### Local first; remote deferred

The initial adapter uses stdio and exposes read-only capabilities. This bounds process and credential risk while
tool contracts, authorization, privacy, and client compatibility are tested locally.

Remote MCP over Streamable HTTP requires a new ADR or explicit update. Evidence must cover:

- named deployment and operational ownership;
- HTTPS, exact Origin validation, DNS-rebinding protection, request limits, and rate limits;
- MCP-compliant OAuth protected-resource metadata and authorization-server discovery;
- resource indicators, audience-bound tokens, least-privilege scopes, revocation, and rotation;
- session handling without treating an MCP session ID as Form Farm authentication;
- owner isolation, confused-deputy tests, log redaction, incident response, and deployed client tests;
- independent Preview and Production configuration and explicit release authorization.

Deprecated HTTP+SSE, custom transports, and experimental MCP tasks are not supported.

### Identity, authentication, and authorization

Protocol client identity, tool identity, and Form Farm actor identity are separate.

```text
client metadata -------> diagnostic/protocol identity only
verified credential ---> authentication adapter ---> AuthenticatedActor
tool name + input -----> use-case authorization ---> owner-scoped result
```

Client names, model claims, tool arguments, form IDs, owner IDs, and environment values that merely name an
owner never establish authorization. Browser cookies, XSRF values, authorization headers, raw session tokens,
and their hashes are never tool arguments or results.

The first local adapter must define and test an explicit local credential mechanism before exposing owner data.
It may retrieve a credential from its process environment as prescribed for stdio, but must resolve it through
an authentication adapter into the same minimal `AuthenticatedActor` used by application use cases. It must not
impersonate an owner from configuration or call a repository with an unverified user ID. Until this exists, only
public/system information may be exposed.

Authorization is checked for every invocation, not inferred from discovery or connection state. Non-owned,
inappropriate system-owned, and missing resources retain the HTTP management API's existence-hiding behavior.

### Initial surface

The initial surface is deliberately small, local, and read-only:

- `inspect_form`: return a bounded, privacy-safe structural summary of one accessible form and lifecycle identity;
- `compare_form_versions`: return a deterministic semantic diff between two authorized immutable versions;
- `analyze_form_change_impact`: evaluate explicit controlled change operations without persisting them.

These are tools because each is a parameterized application operation with validation, authorization, and a
bounded result. Stable resource URIs may later expose already-authorized immutable summaries when a client-driven
context workflow demonstrates a need. Resources must not become an alternate unpaginated listing API. Prompts
are deferred because they are optional interface templates, not capabilities or security controls.

Inputs and structured outputs use strict owned JSON Schemas with unknown properties rejected. Names and ordering
are deterministic. Tool annotations are descriptive only and never trusted for authorization or confirmation.
Results prefer identifiers, counts, stable issue codes, and bounded structural summaries; they exclude
submissions, answers, credentials, secrets, sessions, and unnecessary complete definitions.

### Proposal and mutation boundaries

AI provider integration is a separate infrastructure adapter and issue. Provider output is untrusted structured
data and may only propose controlled Form Change Operations. Deterministic validation, semantic diffing, and
impact analysis run without MCP or an LLM and precede provider integration.

Proposal-only tools may be considered after those foundations exist. A proposal does not write a draft, approve
itself, or publish anything.

Mutation tools remain deferred until all of these exist and have direct tests:

- a closed, versioned vocabulary of controlled operations;
- deterministic semantic diff and impact results;
- verified owner authentication and per-use-case authorization;
- the exact current draft ETag and stale-write rejection;
- application-owned confirmation proof bound to actor, form, revision, operation digest, and expiry;
- append-only audit evidence with an explicit retention and access policy.

A client boolean such as `confirmed: true`, model text claiming approval, or a tool annotation is not
confirmation. Client UI may participate, but Form Farm verifies application-owned proof at the mutation
boundary. Applying operations may update only the mutable owner draft; MCP never publishes, archives, transfers
ownership, seeds data, or changes immutable versions.

### Errors, privacy, audit, and limits

Expected application failures become stable, safe tool-execution errors so clients can correct input. Protocol
errors are reserved for malformed JSON-RPC or unsupported protocol behavior. Neither form echoes values,
definitions, provider prompts/output, database details, credentials, or authorization evidence.

Safe logs and future audit events may contain correlation ID, verified actor ID, client category, tool name,
form ID, version/revision, operation digest, outcome, duration, and bounded counts. They never contain cookies,
tokens, headers, emails, definitions, answers, submissions, raw operations, model chain-of-thought, or provider
secrets. Tool results and logs are safe by default rather than relying on clients to redact them.

Each capability has explicit input-size, result-size, pagination, execution-time, and invocation-rate limits.
The adapter supports cancellation and timeouts where negotiated. It performs no URL fetching, arbitrary
filesystem access, shell execution, dynamic module loading, or arbitrary SQL.

### Test and threat strategy

Implementation tests cover:

- forged identity and missing, invalid, expired, or insufficient credentials;
- owner A attempting to inspect or analyze owner B's form;
- malformed schemas, unknown properties, oversized input, pagination, timeout, and cancellation;
- prompt/tool-description injection having no effect on capability or authorization;
- path, URI, resource, and tool-name confusion;
- safe errors, stdout protocol purity, stderr/log redaction, and output-size bounds;
- deterministic results and no persistence mutation from read-only tools;
- stale ETag, replayed/expired confirmation, operation tampering, and publication prohibition before writes.

Tests use in-process application doubles and ephemeral PostgreSQL where authorization predicates matter. Normal
CI contacts no real MCP client, AI provider, Vercel, Neon, or other external service. Separate compatibility
tests may exercise named MCP clients with synthetic local data.

## Alternatives considered

### Start with remote Streamable HTTP

Rejected initially. It combines protocol behavior with OAuth, network exposure, deployment, rate limiting, and
multi-client operations before product contracts are proven.

### Expose Fastify routes directly as MCP tools

Rejected. HTTP handlers contain browser transport concerns. Both adapters should call application use cases
instead of calling each other.

### Let MCP or an AI provider query PostgreSQL directly

Rejected because it bypasses validation, owner authorization, lifecycle policy, safe errors, and controlled
operations.

### Begin with generic CRUD or arbitrary JSON Patch

Rejected because impact, policy, confirmation, and review become ambiguous. Controlled operations come first.

### Treat resources or prompts as security boundaries

Rejected. Neither replaces input validation, verified actor identity, authorization, or confirmation.

### Combine MCP, provider selection, RAG, embeddings, and agents

Rejected as an oversized trust boundary. Protocol work, deterministic intelligence, and provider integration
remain separate. RAG, embeddings, broad agents, and autonomous mutation have no demonstrated requirement.

## Consequences

### Positive

- MCP can be added without coupling domain/application code to a protocol SDK or AI provider.
- Local read-only behavior supplies evidence before network and mutation risk.
- Existing validation, ownership, ETag, draft, and publication guarantees stay authoritative.
- Deterministic intelligence remains reusable by Angular, HTTP, MCP, tests, and future provider adapters.
- Remote and write capabilities have explicit evidence gates.

### Negative

- Owner-aware local tools require credential design rather than convenient user-ID configuration.
- Clients initially receive no remote access, prompts, subscriptions, writes, or autonomous workflows.
- Protocol DTOs require deliberate mapping and contract tests.
- A future remote service needs a separate OAuth and operational design.

### Named deferrals

- remote Streamable HTTP deployment;
- prompts, subscriptions, and experimental tasks;
- proposal and mutation tools until prerequisite issues are complete;
- confirmation and append-only audit storage design;
- AI provider selection and integration;
- RAG, embeddings, broad agents, autonomous publication, and autonomous mutation.

## References

- [MCP transports, revision 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [MCP authorization, revision 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [MCP server primitives](https://modelcontextprotocol.io/specification/2025-06-18/server/index)
- [MCP tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [ADR 0001: Runtime form-schema validation](0001-runtime-schema-validation.md)
- [ADR 0005: Authentication, sessions, and form ownership](0005-authentication-sessions-and-ownership.md)
- [ADR 0006: Owner form creation, draft editing, and publication](0006-owner-form-write-lifecycle.md)
- [ADR 0007: Vercel and Neon portfolio deployment](0007-vercel-neon-deployment.md)
