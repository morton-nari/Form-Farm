# ADR 0002: Backend framework

## Status

Accepted

## Context

Form Farm AI needs an owned TypeScript backend for versioned form APIs, submissions, persistence, authentication, and controlled AI orchestration. The target is a modular monolith, and the provider-neutral form domain and runtime validation boundary must remain independent of the HTTP framework.

Milestone 1 initially needs a health endpoint and a deterministic form-definition endpoint. Database, authentication, and AI integrations arrive in later milestones. The framework should support those capabilities without forcing their architecture into the current work.

The two candidates are:

- NestJS using its Fastify platform adapter;
- Fastify directly, organized as a small modular TypeScript application.

This is ADR 0002 because ADR 0001 already records the runtime schema-validation decision. GitHub issue #18 predates ADR 0001 and referred to the backend decision as ADR 0001; renumbering an accepted ADR would damage the repository's decision history.

## Decision

Use Fastify 5 directly for the first owned backend.

The backend will be a workspace inside the existing repository, without introducing a monorepo orchestrator. Its initial structure should separate:

- application creation and infrastructure configuration;
- HTTP routes and transport schemas;
- form-domain use cases;
- external adapters such as persistence and AI providers when those capabilities are introduced.

Route handlers will remain thin. Form definitions entering from fixtures, HTTP, persistence, or future AI output must pass the existing owned `validateFormDefinition` boundary before use. Fastify route validation does not replace Form Farm domain validation.

Fastify plugins will be registered explicitly. Framework decorators, a dependency-injection container, and generated module scaffolding will not be recreated through custom abstractions. Dependencies will be passed using ordinary TypeScript composition until a demonstrated need justifies a different approach.

## Comparison

| Requirement                      | NestJS with Fastify                                                                                         | Lean Fastify                                                                                                                     | Assessment                                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Testing                          | `@nestjs/testing` provides isolated modules, dependency overrides, and application test utilities.          | `fastify.inject()` tests requests in-process; domain services remain ordinary unit-testable TypeScript.                          | Both are strong. Fastify has less setup for the current API size.                                                     |
| OpenAPI                          | `@nestjs/swagger` reflects controllers and decorators into an OpenAPI document.                             | `@fastify/swagger` generates OpenAPI from registered route schemas.                                                              | Both meet the requirement. Fastify keeps route validation and documentation close together.                           |
| Authentication and authorization | Modules, guards, decorators, and documented JWT patterns provide conventions.                               | Hooks, decorators, and official ecosystem plugins provide primitives, but the application must define its own policy boundary.   | NestJS has stronger built-in conventions. Authentication is deferred and will require a separate decision regardless. |
| AI integration                   | Injectable providers offer an obvious adapter pattern.                                                      | Provider clients can be ordinary adapters passed into application services.                                                      | Neither requires framework coupling; Fastify is sufficient if AI remains behind domain interfaces.                    |
| Validation                       | Pipes and DTO patterns integrate with NestJS, with choices about class-based DTOs and validation libraries. | Route schemas validate transport data; the existing Form Farm validator handles domain definitions.                              | Fastify aligns with the existing explicit two-layer validation boundary.                                              |
| Operational complexity           | More packages, decorators, reflection, lifecycle concepts, and framework-specific testing conventions.      | Smaller runtime surface and explicit startup/plugin lifecycle.                                                                   | Fastify better matches incremental delivery and avoids premature machinery.                                           |
| Modularity                       | Modules and dependency injection strongly enforce an application structure.                                 | Plugin encapsulation plus TypeScript module boundaries provide structure, but discipline is owned by the project.                | NestJS is stronger for large teams; Fastify is adequate for the current modular monolith.                             |
| Learning and portfolio value     | Demonstrates a common enterprise Node architecture and dependency injection.                                | Demonstrates HTTP fundamentals, explicit composition, schema boundaries, and architecture without framework-generated structure. | Both are valuable; Fastify makes architectural decisions more visible for this learning project.                      |
| Migration risk                   | Domain code can remain portable, but controllers, providers, guards, and tests become Nest-specific.        | Domain code remains portable and routes are a thin adapter.                                                                      | Fastify minimizes initial commitment if requirements change.                                                          |

## Alternatives considered

### NestJS with the Fastify adapter

NestJS provides mature conventions for modules, dependency injection, guards, testing, configuration, and OpenAPI. It is the stronger candidate if the project develops many teams, extensive cross-cutting policies, or a large dependency graph.

It is not selected now because the first backend slice is small, the repository explicitly avoids premature abstractions, and the important boundaries already exist as plain TypeScript. Using the Fastify adapter would also require attention to platform-specific packages because Express-oriented recipes and middleware do not always transfer unchanged.

### Express

Express has a large ecosystem and widespread familiarity. It was not a finalist because Fastify offers a more cohesive TypeScript, schema, logging, plugin, and injection-testing story for a new backend.

### Serverless functions without an application framework

Individual functions could minimize initial setup but would fragment the intended modular monolith and couple application boundaries to a hosting model before deployment requirements are known.

## Consequences

- The initial backend has a small dependency and concept surface.
- Route schemas, response serialization, OpenAPI generation, logging, and request injection can use Fastify's established mechanisms.
- The project must define and consistently preserve its own module boundaries rather than relying on NestJS modules and dependency injection.
- Authentication and authorization will need an explicit later design; Fastify selection does not choose JWTs, sessions, or an identity provider.
- AI providers remain ordinary backend adapters and cannot enter the form domain directly.
- Fastify JSON schemas are trusted application code. User- or AI-generated schemas must never be compiled as route schemas; generated form data continues through `validateFormDefinition`.
- The choice should be reconsidered only if demonstrated complexity appears, such as a difficult dependency graph, extensive cross-cutting policies, multiple backend teams, or repeated manual lifecycle wiring.
- A future migration to NestJS remains possible because domain models, validation, and application use cases must not import Fastify types.

## References

- [Fastify reference](https://fastify.dev/docs/latest/Reference/)
- [Fastify validation and serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
- [Fastify type providers](https://fastify.dev/docs/latest/Reference/Type-Providers/)
- [Fastify testing](https://fastify.dev/docs/latest/Guides/Testing/)
- [Fastify OpenAPI plugin](https://github.com/fastify/fastify-swagger)
- [NestJS testing](https://docs.nestjs.com/fundamentals/testing)
- [NestJS OpenAPI](https://docs.nestjs.com/openapi/introduction)
- [NestJS authentication](https://docs.nestjs.com/security/authentication)
- [NestJS Fastify adapter](https://docs.nestjs.com/techniques/performance)
