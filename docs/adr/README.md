# Architecture Decision Records

Use an Architecture Decision Record when a decision materially affects system boundaries, security, data ownership, deployment, or long-term maintainability.

Examples include backend framework selection, database tooling, authentication strategy, AI provider boundaries, and deployment architecture.

Use sequential filenames:

```text
0001-backend-framework.md
0002-runtime-schema-validation.md
```

Each ADR should contain:

- Status
- Context
- Decision
- Alternatives considered
- Consequences

Do not create ADRs for minor implementation details or decisions that have not yet been made.

## Current records

- [ADR 0001: Runtime form-schema validation](0001-runtime-schema-validation.md)
- [ADR 0002: Backend framework](0002-backend-framework.md)
- [ADR 0003: PostgreSQL persistence tooling and data model](0003-postgresql-persistence.md)
- [ADR 0004: Version-bound form submissions](0004-versioned-form-submissions.md)
- [ADR 0005: Authentication, sessions, and form ownership](0005-authentication-sessions-and-ownership.md)
