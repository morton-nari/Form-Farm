# ADR 0009: Local MCP developer credentials

## Status

Accepted 2026-08-24

## Context

ADR 0008 permits an initial local stdio MCP adapter, but it deliberately does not choose how that process
authenticates a Form Farm owner. Stdio environment configuration is only a way for a parent process to deliver
credential material to its child. An environment variable, MCP client name, configured user ID, tool argument,
or long-lived connection does not establish a verified actor.

Issue #130 needs owner-aware inspection, version comparison, and impact analysis without weakening ADR 0005's
opaque-session boundary or ADR 0006's owner-scoped application use cases. Browser cookies are deliberately bound
to same-origin HTTP, secure cookie attributes, XSRF, and session lifecycle. Copying one into local tooling would
discard those protections and create confusing coupled logout behavior.

The initial MCP process is local development tooling, not a remote service. It must work against an explicitly
configured development Form Farm environment and remain independently revocable without adding OAuth or a
Production MCP deployment prematurely.

## Decision

### Credential purpose and scope

Introduce an application-issued **local developer credential** for owner-aware local tooling. It is a distinct
credential type, not a browser session, password, API-wide shared secret, MCP session, or owner identifier.

The first and only initial scope is `form-intelligence:read`. It permits application use cases that inspect an
owned form or draft, compare authorized immutable versions, and analyze explicit operations in memory. It does
not permit draft persistence, publication, archival, submission access, account management, credential
management, arbitrary API calls, or SQL. Later proposal or mutation scopes require a separate security decision;
read scope must never be interpreted as future write authority.

The initial implementation accepts these credentials only when `APP_ENV=development`. Preview and Production
credential issuance and use are disabled. Local stdio does not become a route to hosted databases, and this ADR
does not authorize remote Streamable HTTP or OAuth.

### Opaque format and secret handling

Generate a versioned two-part credential with an unmistakable secret prefix, a public lookup identifier, and at
least 256 bits of cryptographically secure random secret material. A representative shape is:

```text
ffmcp_v1_<credential-id>_<secret>
```

The exact encoded grammar is an owned contract and must reject malformed, oversized, unknown-version, and
extra-segment values before persistence access. The prefix supports secret scanning and operator recognition; it
does not provide security. The lookup identifier is not authentication and may appear in owner-visible metadata.

The raw credential is returned exactly once after successful issuance. Form Farm stores only the public ID and
a SHA-256 verifier of the high-entropy secret, following the existing opaque-session approach. A database leak
therefore does not reveal a reusable credential. The raw credential, complete encoded token, verifier, and any
authorization header or environment value are excluded from logs, errors, analytics, audit payloads, tool
arguments, tool results, and artifacts.

SHA-256 is used here for uniformly random 256-bit material, not human-chosen passwords. Passwords continue to use
the existing password-hashing boundary. Verifier comparison must avoid secret-dependent application behavior,
and failed authentication returns one stable unauthenticated result without revealing whether the public ID,
secret, scope, expiry, revocation state, owner, or environment was wrong.

### Issuance and owner management

Credential creation is an explicit owner action through the existing same-origin authenticated management
boundary. It requires a valid browser session, exact Origin and XSRF protections, and current-password
verification before secret generation. The owner supplies only a bounded display name and an expiry choice.

Current-password confirmation is verified server-side through the existing password-verification boundary. The
raw password remains request-scoped and is never persisted, logged, returned, cached, placed in audit metadata,
or passed to the credential repository. Successful verification authorizes only that specific credential-
issuance attempt; it does not mark the browser session as recently privileged or create reusable step-up state.
Any future reusable privileged-session capability requires its own threat model and decision.

Missing or incorrect password confirmation uses the same bounded, enumeration-safe failure behavior regardless
of account details and participates in the applicable authentication rate limit without storing raw identifiers.
Issuance rechecks that the authenticated session still belongs to the same active actor inside, or immediately
adjacent to, the transactional issuance boundary. If that continuity cannot be established, issuance fails
closed even when the supplied password was correct. Password verification alone never supplies the actor or
permits issuance after session expiry or revocation.

Initial policy:

- expiry is required and may be from 1 to 30 days;
- one owner may have at most five active, unexpired developer credentials;
- scope is fixed to `form-intelligence:read` rather than client-selected arbitrary strings;
- the secret is displayed once and cannot be recovered later;
- creation races enforce the active limit transactionally;
- issuing a replacement does not silently revoke another credential.

The owner can list safe metadata: public ID, display name, fixed scope, created time, expiry, revocation state, and
coarsened last-used time. Listing never returns the verifier or raw credential. Revocation requires the existing
authenticated session plus Origin/XSRF protection, is idempotent for the owner, and takes effect on the next MCP
tool invocation. Deleting rows is not the revocation mechanism; revoked metadata is retained for a bounded
security-audit period defined by the implementation issue and then removed through explicit cleanup.

### Authentication and invocation flow

The MCP host delivers the raw credential to the child process through one named environment variable. It must
not place it in command arguments, repository files, `.vscode/mcp.json`, URLs, stdout, or committed `.env`
files. Client-specific secure storage and teardown instructions are documented only after verified client tests.

The stdio entry reads the value without logging it and supplies it to an authentication adapter. Every owner-aware
tool invocation resolves the credential again through an application authentication port. Connection setup,
successful discovery, an MCP session, prior tool success, and cached actor data never substitute for this check.
This makes expiry and revocation effective during a long-running local client session.

The adapter validates format, hashes the secret, and asks an owner-scoped credential repository for an active,
unexpired record with the required scope and `development` environment identity. Success produces only the
existing minimal `AuthenticatedActor { userId }` for the application use case. Protocol handlers never receive
or construct owner IDs from request data. Missing, non-owned, and inappropriate system resources retain the
existing existence-hiding application semantics.

Last-used metadata may be updated after successful authentication, but it must be write-throttled so every read
tool call does not create unnecessary database churn. This operational metadata does not make an MCP tool a form
mutation and must not contain tool inputs or form content.

### Storage and boundaries

Persist a separate developer-credential record associated with one user. Required data includes public ID,
user ID, secret verifier, fixed scope, display name, environment identity, created/expiry/revoked timestamps, and
coarsened last-used metadata. Database constraints enforce identifier/verifier formats, allowed scope and
environment, expiry after creation, bounded text, and uniqueness. Runtime validation and application policy
remain authoritative; database inference does not replace either.

Credential issuance, listing, revocation, and authentication are application use cases behind ports. PostgreSQL
is an infrastructure adapter. HTTP management routes and the future MCP adapter call application use cases; they
do not call each other or query tables directly. Angular may provide the owner management screen, but it never
stores a credential after the one-time display and never sends one back except as part of the issuance response
already protected by `Cache-Control: no-store`.

### Rate limits, audit, and failure behavior

Issuance and failed authentication receive explicit per-owner and per-credential/IP-appropriate rate limits
without storing raw identifiers. Successful authentication may record safe credential ID, actor ID, outcome,
scope, and coarse last-used time under the existing restricted operational-log policy. It never records form
definitions, operations, answers, submissions, email addresses, secrets, verifiers, or headers.

Expected malformed, missing, expired, revoked, wrong-scope, and invalid-secret cases are safe authentication
failures. Persistence and configuration failures fail closed. No fallback accepts a configured user ID, browser
session, default owner, or public access to owner resources.

### Implementation and review sequence

1. Add the migration, credential model/ports, secure generator/parser/verifier, issuance/list/revocation use
   cases, cleanup policy, and PostgreSQL integration tests.
2. Add protected owner-management HTTP endpoints and minimal Angular creation/list/revocation UX, including
   current-password confirmation and one-time display.
3. Add the development-only credential resolver and configuration boundary with expiry, revocation, scope,
   rotation, rate-limit, and redaction tests.
4. Only then implement owner-aware local MCP tools in #130 through those application boundaries.
5. Document tested client storage/connection/revocation workflows in #135 after the tool surface is stable.

Each implementation slice receives its own issue and PR. This ADR adds no credential, migration,
endpoint, MCP SDK, model provider, or deployed behavior.

## Alternatives considered

### Reuse the browser session cookie

Rejected. It couples local tooling to browser session rotation/logout, encourages copying a secure cookie, and
bypasses the same-origin HTTP/XSRF context in which that credential was designed to operate.

### Configure a user or owner ID

Rejected. Identity configuration is impersonation, not authentication. Client metadata and tool arguments are
equally unsuitable.

### Use one shared development secret

Rejected. A shared secret cannot provide owner attribution, per-credential scope, independent expiry,
revocation, rotation, or safe lifecycle management.

### Implement a browser/device authorization exchange now

Deferred. It can improve developer experience and avoid manually transporting a token, but it adds one-time
codes, polling/callback behavior, secure client storage, and more protocol surface before local MCP value is
proven. A later flow may issue the same underlying scoped credential after separate review.

### Implement OAuth for stdio

Rejected initially. MCP's network authorization architecture applies to remote HTTP resources; local stdio
receives credentials from its environment. Remote MCP remains a separate OAuth/resource-server decision.

### Expose only public/system tools and defer owner access

Acceptable as a temporary bootstrap but insufficient for #130's owner-aware objective. Public discovery must not
be interpreted as authorization, and it does not remove the need for this credential before owner data ships.

### Store recoverable encrypted credentials

Rejected. Form Farm needs to verify a presented random secret, not recover it. One-time display plus a
non-recoverable verifier reduces the consequence of database disclosure.

## Consequences

### Positive

- Owner-aware local tools resolve a real actor without reusing browser sessions or trusting client claims.
- Scope, expiry, revocation, rotation, and environment identity are explicit and testable.
- The future MCP adapter remains a thin protocol edge over application authorization.
- A leaked database does not directly reveal reusable local developer credentials.
- AI and MCP remain separate from credential lifecycle and publication authority.

### Negative

- #130 cannot complete until credential persistence and owner-management slices are implemented.
- Owners must deliberately create, store, rotate, and revoke another credential type.
- Current-password confirmation and one-time display add frontend/backend work.
- Environment transport is practical for local stdio but depends on client-specific secure configuration that
  must be verified rather than assumed.

### Named deferrals

- remote Streamable HTTP and OAuth;
- Preview or Production MCP credentials;
- device/browser authorization exchange;
- write/proposal scopes and confirmation proof;
- organization/service-account credentials;
- automatic rotation or refresh tokens;
- AI providers, model prompts, RAG, embeddings, and agents.

## References

- [ADR 0005: Authentication, sessions, and form ownership](0005-authentication-sessions-and-ownership.md)
- [ADR 0006: Owner form creation, draft editing, and publication](0006-owner-form-write-lifecycle.md)
- [ADR 0008: Form Intelligence and MCP architecture](0008-form-intelligence-and-mcp-architecture.md)
- [MCP authorization](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
