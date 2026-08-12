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
