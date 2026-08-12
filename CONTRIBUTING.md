# Contributing to Form Farm AI

Form Farm AI is built incrementally as a production-quality learning and portfolio project. Contributions should preserve working behaviour, strengthen clear architecture, and avoid speculative complexity.

## Before starting

1. Read `AGENTS.md` and the documents under `docs/`.
2. Confirm the work is represented by a focused GitHub issue.
3. Identify the affected architecture, tests, and documentation.
4. Discuss significant design choices before implementing them.

## Branch workflow

Start from an up-to-date `dev` branch:

```bash
git switch dev
git pull --ff-only origin dev
git switch -c <type>/<short-description>
```

Use descriptive branch prefixes:

- `feature/` for user-facing or platform capabilities
- `refactor/` for behaviour-preserving structural improvements
- `architecture/` for architectural foundations or decisions
- `docs/` for documentation-only work
- `ci/` for delivery automation
- `fix/` for defects

Keep each branch focused on one issue. Do not include unrelated formatting or user changes.

## Engineering expectations

- Preserve working code unless a change has a clear architectural or maintainability benefit.
- Use strict TypeScript and current Angular standalone patterns.
- Keep writable signals private and expose readonly or computed state.
- Use Reactive Forms for form values and validation state.
- Maintain accessible labels, keyboard support, focus behaviour, and error feedback.
- Treat HTTP, persisted, and AI-generated data as untrusted at runtime.
- Keep credentials and privileged operations out of the Angular application.
- Add dependencies only when their benefit justifies their maintenance cost.

## Validation

Install dependencies and run the application with:

```bash
npm install
npm start
```

Before opening a meaningful pull request, run:

```bash
npm test
npm run build
```

Add or update tests for changed behaviour. Future backend and end-to-end commands will be documented here when those workspaces exist.

## Documentation and ADRs

Update documentation when a change affects architecture, APIs, domain concepts, setup, workflow, deployment, security, or major dependencies.

Create an Architecture Decision Record under `docs/adr/` only for a significant decision with meaningful alternatives and long-term consequences. Do not use ADRs for routine implementation details.

## Pull requests

A pull request into `dev` should include:

- the problem or objective;
- what changed and why;
- user and developer impact;
- tests and builds performed;
- relevant issue and documentation links;
- screenshots for meaningful visual changes.

Keep PRs small enough to review. Address review feedback on the same branch, rerun affected checks, and merge only when required checks pass.

## AI-assisted contributions

AI-generated code and documentation require the same review and testing as human-authored changes. AI must not generate arbitrary Angular source as a runtime product feature. User-facing AI capabilities should produce structured data that passes runtime and domain validation before preview, persistence, or publication.
