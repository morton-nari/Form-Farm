# ADR 0005: Authentication, sessions, and form ownership

## Status

Accepted

## Context

Form Farm AI has an anonymous collection flow, but cannot identify form owners or protect a dashboard.
The next milestone needs registration, login, logout, authenticated Angular navigation, and owner-scoped
form queries. Registration is a trusted account operation and must never be executed by `FormDefinition`.

The deployment model is same-origin: Angular calls Fastify through `/api`. PostgreSQL is the durable store,
and application use cases depend on application-owned ports rather than Fastify, Drizzle, or row types.
Native clients, third-party APIs, organizations, roles, social login, password reset, email verification,
and MFA are outside this decision.

## Decision

Use database-backed opaque sessions carried in a host-only secure cookie. Do not use browser-stored bearer
tokens or self-contained JWT sessions for the first-party Angular application.

```text
Angular -> same-origin HTTP/Fastify -> auth and owner-scoped use cases -> application ports
                                                               -> PostgreSQL adapters
```

Fastify parses cookies and adapts requests. An authentication adapter resolves an opaque credential into
an application `AuthenticatedActor` containing only the stable user ID. Each protected use case receives
that actor explicitly and enforces ownership; route middleware alone is not sufficient authorization.

### Account workflow

The fixed trusted endpoints are:

- `POST /api/v1/auth/register`;
- `POST /api/v1/auth/login`;
- `POST /api/v1/auth/logout`;
- `GET /api/v1/auth/session`;
- `GET /api/v1/auth/xsrf` for the same-origin pre-authentication token bootstrap.

Schema data cannot change these paths, choose handlers, create accounts, or supply redirects. Registration
does not automatically create a session. It returns the same accepted response when the normalized email
already exists, then the UI returns to login. Login returns one generic failure for an unknown email, wrong
password, or disabled account and performs a dummy Argon2id verification for unknown accounts to reduce
timing discrepancy. Logout is idempotent and revokes the presented session.

Registration returns `202 accepted` after a syntactically and policy-valid request whether the account was
inserted or already existed. It performs the same normalization, password-policy checks, and Argon2id work
before the conflict-safe insert path so an existing identifier does not take an obviously cheaper route. Weak
or compromised passwords may return a policy error because that result is independent of account existence.
The Angular confirmation says only that the request was accepted and directs the user to login; it must not
claim that a new account was definitely created.

Successful login always creates a new opaque session token. It never upgrades, adopts, or reuses the
pre-authentication XSRF credential or any caller-supplied session identifier. Authentication responses and
timing cannot be perfectly identical over a network, but implementation tests must avoid obvious status,
body, database-path, and password-hash discrepancies.

### Email and password policy

Email is an account identifier, not proof that a mailbox is controlled. Store the entered email for display
and a separately normalized value for uniqueness. The backend trims, applies Unicode NFC, and lowercases
with a locale-independent operation before validation and lookup. The initial maximum is 254 Unicode code
points. A database unique constraint is the final concurrency guarantee. Registration and login share tests
for the normalization algorithm. Treating the complete address, including its local part, as
case-insensitive is an intentional Form Farm account-identity policy for predictable login and uniqueness;
it is not asserted to be a universal email-delivery rule. The initial syntax check is deliberately minimal
account-identifier validation, not RFC-complete mailbox validation or proof of deliverability.

Passwords:

- are accepted only by dedicated auth models and are never `FormAnswers`;
- require 15 to 1,024 Unicode code points inside a 16 KiB auth request limit;
- accept spaces and Unicode, with no composition rules or forced periodic rotation;
- are hashed and verified exactly as entered, without trimming, case folding, or Unicode normalization;
- are checked as a whole against a maintained local/offline common-password blocklist, never sent to a
  third-party service;
- have a bounded request size and documented maximum to prevent resource exhaustion;
- are hashed with Argon2id and a unique library-generated salt.

The Argon2id floor is 19 MiB memory, two iterations, and parallelism one. Production must benchmark a
higher work factor without falling below it. Before release, benchmark the configured parameters under the
deployment's expected concurrent-login load and record a target authentication-latency budget; the OWASP
floor is not the final production tuning decision. Parameters remain encoded in each hash so successful login
can rehash when policy increases. Exact password preservation and length boundaries must have shared
registration/login tests, including canonically equivalent but byte-distinct Unicode strings. Passwords,
candidate hashes, and blocklist matches never enter logs. A pepper is deferred because its rotation and
recovery lifecycle is not yet designed.

### Session credential and storage

Generate 32 random bytes with Node's cryptographic random source and encode them as base64url. The raw token
exists only in the browser cookie and request. PostgreSQL stores only its SHA-256 digest, which is suitable
for lookup because the token has 256 bits of entropy. Session identifiers contain no claims or PII.

The production cookie is:

```text
__Host-ff_session=<opaque token>; Secure; HttpOnly; SameSite=Lax; Path=/
```

It has no `Domain`. Production requires HTTPS. Development may use explicitly development-only loopback
configuration; production startup rejects insecure cookie configuration. Credentials are never stored in
`localStorage`, `sessionStorage`, Angular signals, or URLs.

Session rows contain a PostgreSQL-owned UUID, `user_id` foreign key, unique `token_hash`, database-owned
`created_at`, `last_seen_at`, `idle_expires_at`, and `absolute_expires_at`, plus nullable `revoked_at`.
Initial configurable defaults are a 30-minute idle timeout and seven-day absolute timeout. Every request
enforces both server-side and confirms the related user remains active. The initial activity-write cadence is
five minutes: a successful authenticated request updates `last_seen_at` and sets `idle_expires_at` to 30
minutes after the database's current time only when at least five minutes have elapsed since the previous
write. The persisted `idle_expires_at` remains authoritative, so a request at or after it is expired rather
than revived. Configuration must require the write cadence to be positive and shorter than the idle timeout.
Logout sets `revoked_at`. A daily deployment job deletes sessions whose revocation or final expiry is older
than 30 days; the first schema supports this indexed cleanup even if job scheduling lands in a later
operational slice. Renewal beyond login rotation is deferred until measured UX or threat requirements justify
its race complexity.

### CSRF and browser boundary

`SameSite=Lax` is defence in depth, not the only CSRF control. No safe method performs a user-visible or
domain mutation; bounded session-activity bookkeeping is the only permitted internal side effect. CORS
remains disabled for credentialed cross-origin callers unless a later decision defines a narrow allowlist.

Every unsafe browser request, including registration and login, requires:

1. JSON content and a fixed custom `X-XSRF-TOKEN` header;
2. an allowed `Origin` matching centrally validated public-origin configuration; and
3. an XSRF value issued by the backend and verified in constant time.

Angular's built-in XSRF support uses owned cookie/header names. The readable XSRF cookie is host-only,
`Secure`, `SameSite=Lax`, and never contains the session credential. For authenticated sessions its value is
derived with a backend HMAC secret from the opaque credential. The unauthenticated bootstrap is deliberately
stateless rather than a second session: `/api/v1/auth/xsrf` issues a random nonce plus issued-at and expiry
(ten minutes) authenticated by the XSRF HMAC key. The signed value is stored only in the readable host-only
XSRF cookie and must be echoed unchanged in the header. It carries no user identity, grants no authentication,
cannot be renewed by unsafe requests, and is replaced when login creates the session-bound XSRF value. Tokens
never appear in URLs or logs. Missing, malformed, expired, or mismatched origin/XSRF evidence fails closed
with generic `403 forbidden`.

Fetch Metadata may reject obvious cross-site unsafe requests as defence in depth, but does not replace origin
and XSRF validation. Client code keeps fixed endpoints so attacker-controlled URL data cannot make Angular a
confused request deputy.

### Rate limiting and enumeration resistance

Registration and login use both a coarse trusted source-IP/network limit and an account-keyed limit derived
from an HMAC of the normalized identifier. The rate-limit HMAC uses its own current/previous rotation keys,
separate from session-token hashing and XSRF secrets, and rotates without resetting all active counters. Raw
email is not a limiter key or log field. Limits are atomic and
shared across instances before horizontal scaling. An in-memory Fastify limiter is local-development or
coarse single-instance protection, not the production account-guessing boundary.

The application owns a rate-limit port; a PostgreSQL adapter is sufficient initially and can later be
replaced without changing auth use cases. Safe `429 rate_limited` responses include `Retry-After` without
confirming account existence. Windows and limits are startup configuration. Permanent account lockout is not
used because it enables denial of service. Limiter scopes are a finite application-owned type and database
constraint, never request-controlled strings. A later cleanup job may delete a bucket only after its configured
window has elapsed; it must use database time and a retention period at least as long as the maximum configured
window. This PR provides the cleanup index but intentionally does not schedule that operational job.

### Relational model and ownership

The separate implementation issue adds `users` with a PostgreSQL-owned UUID, display email, unique normalized
email, Argon2id hash, status (`active` or `disabled`), and database-owned timestamps. Users are disabled rather
than hard-deleted initially. Session and ownership foreign keys use `on delete restrict`.

Add nullable `forms.owner_user_id` referencing `users.id` plus `ownership_kind` constrained to `user` or
`system`. A check requires a user owner exactly when kind is `user`; the existing seeded demo form is
explicitly backfilled as `system`. The database check is exactly `(ownership_kind = 'user' and
owner_user_id is not null) or (ownership_kind = 'system' and owner_user_id is null)`, so no ownerless user
row can be inserted through application defects or direct SQL. Every owner-created form is user-owned. Index
`(owner_user_id, updated_at desc)` for dashboard queries.

Protected form reads and writes query by form ID and authenticated owner ID. Another user's form returns
`404 not_found`, not `403`, to avoid existence leakage. Public published reads and anonymous submissions are
separate lifecycle-governed use cases. Ownership is never accepted from request JSON; it comes from the actor.

PostgreSQL row-level security is deferred. The pooled application role is not an end-user database identity,
and table owners or `BYPASSRLS` roles can bypass policies. Application authorization predicates, foreign keys,
checks, and integration tests form the first boundary. RLS may be defence in depth later only with safe
transaction-local actor context, a non-bypass role, pooling tests, and backup/admin procedures.

### Errors, logging, caching, and secrets

- malformed input: `400 invalid_request`;
- failed login: `401 invalid_credentials` with one generic message;
- missing, expired, or revoked session: `401 unauthenticated`;
- failed CSRF or permission where existence is not sensitive: `403 forbidden`;
- missing or non-owned owner resource: `404 not_found`;
- throttling: `429 rate_limited`;
- unexpected failures: safe `500 internal_error` with internal logging.

Auth and dashboard responses use `Cache-Control: no-store`. Logs may contain request IDs, internal user/session
UUIDs after authentication, routes, and safe categories. They never contain emails, passwords, raw session or
XSRF tokens, token/password hashes, cookies, authorization/XSRF headers, definitions, or answers. Header
redaction covers `cookie`, `set-cookie`, authorization, and XSRF headers.

Central startup configuration adds the exact public application origin, cookie mode, timeouts, rate limits,
trusted-proxy policy, and independent current/previous XSRF and limiter HMAC secrets. The public origin is
never inferred from `Host`, `Forwarded`, or `X-Forwarded-*`. Proxy-derived client IP and protocol are accepted
only from an explicit deployment-specific proxy IP/CIDR allowlist or exact hop count; forwarded headers from
direct/untrusted peers are ignored. Production secrets come from hosting secret management or injected
environment, are entropy-validated, and are never logged. Application code receives typed configuration.
Rotation accepts each purpose's immediately previous key for a bounded overlap and always issues with its
current key.

## Integration and security test strategy

Implementation issues must cover:

- concurrent same-normalized-email registration creating one account with indistinguishable responses;
- normalization parity, password boundaries/blocklist, Argon2id parameters, dummy verification, and rehash;
- cookie name plus `Secure`, `HttpOnly`, `SameSite`, `Path`, and absent `Domain` attributes;
- valid, malformed, expired, absolute-expired, and revoked sessions, login rotation, and logout;
- successful login replacing rather than upgrading every pre-authentication credential;
- deterministic five-minute activity writes, the idle-expiry boundary, and cleanup eligibility/index use;
- positive and negative origin, JSON content, XSRF, Fetch Metadata, and trusted-proxy cases;
- pre-authentication XSRF expiry, tampering, header/cookie mismatch, lack of user binding, and replacement on
  login;
- atomic multi-dimensional throttling and enumeration-safe bodies/statuses;
- owner A accessing only A's forms, owner B receiving not-found, the system seed staying non-user-owned, and
  public published reads remaining available;
- a valid active session for owner B remaining insufficient to list, read, update, publish, or archive owner
  A's resources, keeping authentication success distinct from authorization success;
- foreign keys, uniqueness, ownership checks, deletion restrictions, indexes, and migration on PostgreSQL 18;
- logging and error mapping without credential, email, definition, or answer leakage;
- Angular registration-to-login, session bootstrap, dashboard guard, logout, focus, retry, and safe errors.

Use `fastify.inject()` for cookie/error contracts and ephemeral PostgreSQL 18 for sessions, throttling,
uniqueness, and ownership. Time and randomness enter security-sensitive services through small owned ports
when deterministic tests require them; production uses system time and cryptographic randomness.

## Implementation sequence

1. Add account/session/ownership migrations and framework-independent auth services with PostgreSQL adapters.
2. Add thin fixed Fastify auth routes, cookie/XSRF/origin policy, throttling, errors, and configuration.
3. Add Angular registration, login, session bootstrap, guards, and logout.
4. Add owner-scoped list/dashboard APIs and UI, then form creation/versioning/publishing.

Do not combine all steps in one PR. Do not add AI, organizations, roles, reset, verification, social login,
or builder behavior to the first auth implementation.

## Alternatives considered

### JWT access/refresh tokens in browser storage

Rejected. Browser storage exposes bearer credentials to injected JavaScript, while refresh, revocation, and
rotation still need server state. There is no current cross-service claim-validation need.

### JWT in an HttpOnly cookie

This retains CSRF requirements and complicates immediate revocation, claim changes, and logout. Database
lookups are already needed for ownership and disabled-account state, so self-contained claims add little.

### Encrypted or signed stateful cookie

This makes revocation, forced logout, idle expiry, and state changes harder and adds cookie-size/key-rotation
concerns. The client should carry only a meaningless opaque identifier.

### Rely only on SameSite for CSRF

Rejected because SameSite is site-scoped rather than origin-scoped. Explicit origin and XSRF checks are small
and testable in the same-origin model.

### Use only Fastify's in-memory limiter

Rejected for production because processes have independent counters and restarts erase them. It remains a
useful coarse local control, not the durable guessing boundary.

### Add PostgreSQL RLS immediately

Deferred because the pooled role is not an end-user identity and incorrect pooling cleanup would create a
misleading boundary. Add it only when deployment roles and transaction-local context are proven end to end.

## Consequences

- Angular never handles the authentication credential.
- Sessions revoke immediately and ownership changes do not wait for claim expiry.
- Authentication adds a database lookup and bounded activity writes to authenticated requests.
- XSRF/origin policy requires coordinated backend configuration and Angular setup.
- Enumeration resistance makes registration intentionally less specific.
- The public seed remains honestly system-owned rather than receiving a fake human owner.
- Password recovery and email ownership remain unavailable until separately designed.

## References

- [NIST SP 800-63B password requirements](https://pages.nist.gov/800-63-4/sp800-63b.html#passwordver)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [Angular XSRF guidance](https://angular.dev/best-practices/security#httpclient-xsrf-csrf-security)
- [`@fastify/cookie`](https://github.com/fastify/fastify-cookie#security-considerations)
- [`@fastify/rate-limit`](https://github.com/fastify/fastify-rate-limit)
- [PostgreSQL 18 constraints](https://www.postgresql.org/docs/18/ddl-constraints.html)
- [PostgreSQL 18 row security](https://www.postgresql.org/docs/18/ddl-rowsecurity.html)
