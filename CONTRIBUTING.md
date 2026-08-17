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

Run the backend in watch mode with:

```bash
npm run backend:dev
```

Backend development and integration tests require Docker Desktop with its Linux engine running. Start
PostgreSQL, set `DATABASE_URL`, apply migrations, and seed the deterministic development form as described
in the README. Migrations are explicit commands and must never run implicitly during application startup.

Before opening a meaningful pull request, run:

```bash
npm test
npm run build
npm run backend:test
npm run backend:build
npm run domain:build
```

The frontend and backend commands build the shared form-domain package when required. Use `npm run test:all` and `npm run build:all` to validate all current workspaces. Add or update tests for changed behaviour.

Pull requests into `dev` run the same frontend/domain and backend test and build commands in separate
GitHub Actions jobs. CI installs the committed root lockfile with `npm ci`; backend integration tests use
the runner's Docker daemon through Testcontainers. Dependency caching stores npm's download cache only,
not `node_modules`, so the lockfile remains the installation source of truth.

The frontend/domain job also enforces `git diff --check` and audits production dependencies with
`npm audit --omit=dev`. The shared domain currently has no standalone test script: `npm test` exercises
its public models and validator through the Angular compatibility tests, and both jobs compile the
package through workspace pre-scripts. If domain tests move into the package, CI must invoke that test
script explicitly rather than relying on this transitional arrangement.

## Angular CLI MCP server

The repository includes `.vscode/mcp.json` for the official Angular CLI MCP server. It runs the
workspace-pinned CLI through `npx --no-install ng mcp --local-only`, so it neither downloads an
unreviewed CLI version nor enables tools that require internet access.

Use Angular MCP for Angular workspace discovery, version-aligned best practices, development-server
management, and configured build/test targets. Use Playwright separately to verify real browser
navigation, accessibility, network, and interaction behaviour. MCP is local development tooling only:
it is not part of the Angular bundle, Fastify backend, CI, deployed product, or runtime AI architecture.

VS Code may require MCP servers to be enabled or restarted after opening the workspace. Review tool
requests before allowing write-capable operations; repository guidance and the normal issue/branch/PR
workflow continue to apply.

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
Repository branch protection should require both `Frontend and domain` and `Backend` before merging into
`dev`. The workflow supplies these checks; enabling the protection rule remains a repository setting.

## AI-assisted contributions

AI-generated code and documentation require the same review and testing as human-authored changes. AI must not generate arbitrary Angular source as a runtime product feature. User-facing AI capabilities should produce structured data that passes runtime and domain validation before preview, persistence, or publication.
