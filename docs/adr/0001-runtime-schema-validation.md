# ADR 0001: Runtime form-schema validation

## Status

Accepted

## Context

TypeScript types disappear at runtime. Form definitions arriving from HTTP APIs, persistence, and future AI structured output are untrusted and must not enter the form engine based on a compile-time assertion.

The provider-neutral schema has 15 discriminated field variants, field-specific validation-rule variants, strict property boundaries, and domain invariants spanning multiple nodes. Validation must return safe, path-specific issues without coupling the domain to Angular, a backend framework, persistence, or an AI provider.

## Decision

Use Zod 4 for structural runtime parsing behind the owned `validateFormDefinition` function.

Browser builds import the supported `zod/mini` functional API to reduce bundle cost without changing
the owned validation result or domain invariants.

The boundary has two layers:

1. Strict Zod schemas validate JSON-compatible structure, supported schema and field discriminants, field-specific properties, rule shapes, and primitive formats.
2. Owned domain validation enforces cross-object invariants such as globally unique field IDs, unique section IDs and option values, valid defaults, unique rules, compatible ranges, and temporal rule formats.

Consumers depend on the owned validation result and issue types rather than on Zod APIs. The existing TypeScript domain types remain the public domain vocabulary.

A successful validation result asserts structural and domain validity only. It does not assert authorization, ownership, lifecycle eligibility, publication approval, or permission to execute a submission workflow.

## Alternatives considered

### Valibot

Valibot supports discriminated variants, structured issues, and a modular API. It is a credible smaller alternative, but its bundle-size advantage is not decisive for this project and it provides less benefit than Zod's established ecosystem and built-in JSON Schema conversion for future API tooling.

### ArkType

ArkType provides concise TypeScript-like schemas, automatically optimized unions, and detailed errors. Its contract syntax is less conventional for this codebase and would introduce a larger learning surface without solving a requirement that Zod cannot meet.

### Handwritten validation

An owned validator would avoid a dependency and give complete control. It would also duplicate structural traversal, discriminated-union selection, strict unknown-property handling, primitive format validation, and path-aware error construction. Owned code is retained only for Form Farm domain invariants.

### JSON Schema and Ajv

JSON Schema is language-neutral and well suited to published API contracts. Making it the source of truth now would introduce generation or duplicated-type concerns before the backend and OpenAPI direction are decided. Zod can emit JSON Schema later if that becomes useful; generated output will not replace domain validation automatically.

## Consequences

- Invalid external schemas are rejected through a non-throwing result with safe, explainable paths and messages.
- Structural and domain validation remain visibly separate and independently extensible.
- Zod becomes a production dependency and must be maintained and reviewed during upgrades.
- The domain contract and runtime schema can drift unless tests cover every field discriminant and rule family.
- Future backend and frontend boundaries can reuse the validation behavior without importing Angular or provider-specific concepts.
- AI output cannot become a `FormDefinition` until this boundary accepts it, and human review remains required before publication.
