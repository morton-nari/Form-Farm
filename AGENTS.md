# Smart Forms AI Repository Guidance

## Product

Smart Forms AI is evolving from an Angular insurance assessment into an AI-powered dynamic form platform. Treat the existing form runner as reusable foundation code. Do not rewrite working behaviour without a documented reason.

Read `docs/PRODUCT_VISION.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, and `CONTRIBUTING.md` before making architectural changes.

## Current implementation

- Angular 22, standalone and zoneless
- Strict TypeScript
- Signals for synchronous UI and journey state
- RxJS and `HttpClient` for API operations
- Angular Reactive Forms for values and validation
- Bootstrap CSS only; do not add its JavaScript bundle
- Vitest through the Angular unit-test builder

## Commands

```bash
npm install
npm start
npm test
npm run build
```

Run affected tests during development. Before completing a meaningful branch, run both `npm test` and `npm run build`.

## Architecture rules

- Keep UI, domain, and infrastructure concerns separated.
- Keep writable store signals private and expose readonly or computed signals.
- Components request state changes through store methods.
- Keep Reactive Forms responsible for input values and validation state.
- Do not couple the reusable form engine to an AI provider or persistence model.
- Validate external API, persisted, and AI-generated schemas at runtime before using them.
- Never expose database credentials, authentication secrets, or AI provider keys in Angular.
- Prefer a modular monolith; do not introduce microservices without a demonstrated need.
- Avoid premature abstractions and dependencies.

## Git workflow

- Start from an up-to-date `dev` branch.
- Create one focused branch per issue.
- Use prefixes such as `docs/`, `feature/`, `refactor/`, `architecture/`, or `ci/`.
- Keep commits intentional and do not include unrelated user changes.
- Open a PR into `dev`, include the purpose and validation performed, and merge only after checks pass.
- Share important PR links with the user's external GPT advisor when requested.

## Documentation

Update documentation when a change affects architecture, APIs, domain concepts, setup, workflow, deployment, security, or major dependencies. Do not update it for trivial internal edits.

Use ADRs under `docs/adr` only for significant decisions. Clearly distinguish current behaviour from planned architecture.

## AI implementation rules

- AI generates structured schema data, not Angular source code.
- AI operations run through the backend.
- Treat model output as untrusted input.
- Apply runtime and domain validation before previewing or persisting output.
- Require user review before publishing AI-generated or AI-edited forms.
- Add RAG, agents, embeddings, or MCP only for a documented use case.
