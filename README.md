# Form Farm AI

Form Farm AI is an API-driven dynamic form platform. Its Angular form runner consumes provider-neutral,
runtime-validated form definitions from an owned Fastify backend.

The product direction is documented in [Product Vision](docs/PRODUCT_VISION.md), [Architecture](docs/ARCHITECTURE.md), and [Roadmap](docs/ROADMAP.md). Development workflow and quality expectations are in [Contributing](CONTRIBUTING.md).

The provider-neutral form contract and its supported version-one capabilities are documented in
[Form Schema](docs/FORM_SCHEMA.md).
The owned HTTP endpoints are documented in [Backend API](docs/BACKEND_API.md).

> **Current status:** PostgreSQL stores immutable form definitions, Fastify serves the current published
> version, and Angular validates and renders it with loading, retry, validation, answer-review, and persisted
> submission states. Angular provides login, registration, session bootstrap, protected navigation, logout,
> and an owner-scoped forms dashboard against the secure backend boundary. Form writes, the form builder, and
> AI capabilities are not implemented yet.

## Technical baseline

| Tool        | Version                     |
| ----------- | --------------------------- |
| Angular     | 22.1.x                      |
| Angular CLI | 22.1.x                      |
| TypeScript  | 6.0.x                       |
| RxJS        | 7.8.x                       |
| Bootstrap   | 5.3.8                       |
| Fastify     | 5.x                         |
| Vitest      | 4.x                         |
| Node.js     | 22.22.3+, 24.15.0+, or 26.x |
| npm         | 12.0.2+                     |

Exact dependency versions are recorded in `package-lock.json` for reproducible installs.

## Architecture choices

- **Standalone Angular:** the application is bootstrapped with `bootstrapApplication`; there are no NgModules.
- **Zoneless:** Angular 22 applications are zoneless by default. This project does not install `zone.js` or configure a zone-based change-detection provider.
- **Signals:** signals hold synchronous UI state, including definition loading, errors, retry, and review.
- **Reactive Forms:** Angular Reactive Forms provide typed, API-driven form models and validation.
- **Protected navigation:** Angular routes anonymous users to login and protects the forms area through backend
  session bootstrap; the reusable form runner remains route-independent.
- **Untrusted API boundary:** HTTP form data remains `unknown` until shared runtime and domain validation succeeds.
- **Bootstrap CSS only:** Bootstrap supplies styling and layout utilities. Its JavaScript bundle is intentionally excluded so Angular remains responsible for interactive behaviour and DOM state.
- **SCSS:** application-specific styles use SCSS.
- **Strict compilation:** strict TypeScript and Angular template checks are enabled.

## Prerequisites

Install:

- Node.js `^22.22.3`, `>=24.15.0 <25`, or `>=26.0.0`
- npm 12.0.2 or newer

Check the installed versions:

```bash
node --version
npm --version
```

## Install and run

From the repository root:

```bash
npm install
npm start
```

Open [http://localhost:4200](http://localhost:4200). The development server reloads when source files change.

Run the backend separately with:

```bash
npm run backend:dev
```

Before starting the backend, run PostgreSQL and apply the committed migration and development seed:

```powershell
docker compose up -d postgres
$env:DATABASE_URL = 'postgresql://form_farm:form_farm_local@127.0.0.1:5432/form_farm'
npm run db:migrate
$env:ALLOW_DATABASE_SEED = 'true'
npm run db:seed
npm run backend:dev
```

It listens on `http://127.0.0.1:3000` by default. `GET /health` returns `{ "status": "ok" }`, and
authenticated `GET /api/v1/forms` lists accessible forms, and authenticated
`GET /api/v1/forms/health-questionnaire` reads the primary sample from PostgreSQL. The health questionnaire
is demonstration content, not medical advice, diagnosis, or treatment.
The Compose credentials are development examples only and must never be reused in a hosted environment.
The seed command requires `ALLOW_DATABASE_SEED=true` and refuses to run when `NODE_ENV=production`.

For a clean, lockfile-based installation, such as in CI, use:

```bash
npm ci
```

## Available commands

| Command                 | Purpose                                        |
| ----------------------- | ---------------------------------------------- |
| `npm start`             | Start the Angular development server           |
| `npm run backend:dev`   | Start the backend with file watching           |
| `npm run backend:start` | Run the compiled backend                       |
| `npm run build`         | Create the Angular production build            |
| `npm run backend:build` | Strictly compile the backend                   |
| `npm run build:all`     | Build the frontend and backend                 |
| `npm test`              | Run the Angular unit tests once                |
| `npm run backend:test`  | Run the backend tests once                     |
| `npm run test:all`      | Run frontend and backend tests                 |
| `npm run watch`         | Build Angular continuously in development mode |

## Current project structure

```text
backend/
`-- src/
    |-- application/    # Framework-independent application errors and future use cases
    |-- config/         # Validated process configuration
    |-- http/           # Fastify routes and HTTP error mapping
    |-- lifecycle/      # Graceful process shutdown
    |-- app.ts          # Testable Fastify application factory
    `-- main.ts         # Process entry point
packages/
`-- form-domain/        # Framework-independent form contract and runtime validator
src/
├── app/
│   ├── core/api/        # Owned API client; external definitions remain unknown
│   ├── domain/forms/    # Provider-neutral form contract and runtime validation
│   ├── shared/form-runner/ # Generic Reactive Forms factory and field renderer
│   ├── features/
│   │   └── form-viewer/     # Validated loading state and composed form screen
│   ├── app.config.ts   # Application-level providers
│   ├── app.ts          # Standalone root component
│   ├── app.html        # Minimal application shell
│   ├── app.scss        # Root component styles
│   └── app.spec.ts     # Root component tests
├── index.html
├── main.ts             # Standalone bootstrap entry point
└── styles.scss         # Global application styles
```

Bootstrap's minified CSS is included through the `styles` array in `angular.json`. No Bootstrap JavaScript is loaded.

## Backend configuration

Backend configuration is read and validated once at startup. Invalid configuration stops startup without including environment values in the error.

| Variable                 | Default                  | Accepted values                                              |
| ------------------------ | ------------------------ | ------------------------------------------------------------ |
| `NODE_ENV`               | `development`            | `development`, `test`, `production`                          |
| `HOST`                   | `127.0.0.1`              | Any non-empty host                                           |
| `PORT`                   | `3000`                   | Integer from 1 through 65535                                 |
| `LOG_LEVEL`              | `info`                   | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` |
| `DATABASE_URL`           | none                     | PostgreSQL connection URL; required and never logged         |
| `DATABASE_POOL_MAX`      | `10`                     | Integer from 1 through 100; deployment-specific pool limit   |
| `PUBLIC_APP_ORIGIN`      | local Angular            | Exact public origin; production requires HTTPS               |
| `AUTH_SECURE_COOKIES`    | local `false`            | Boolean; production requires `true`                          |
| `TRUSTED_PROXY_HOPS`     | `0`                      | Exact trusted reverse-proxy hop count                        |
| `XSRF_HMAC_SECRET`       | development-only default | Production: independent 32-byte base64url secret             |
| `RATE_LIMIT_HMAC_SECRET` | development-only default | Production: separate 32-byte base64url secret                |

Session idle/absolute timeouts, bounded activity cadence, XSRF lifetime, registration/login limits, limiter
window, and immediately previous rotation secrets also use validated environment configuration. See
`.env.example` for local values and ADR 0005 for the security contract. Insecure cookies are accepted only for
explicit HTTP loopback development origins; production requires HTTPS and secure cookies.

Fastify remains an HTTP adapter. Application and domain code do not depend on Fastify or database types.
The backend reads the current published definition through an application-owned port and validates JSONB
as untrusted data before returning it. It accepts validated, idempotent submissions against exact
published versions but does not yet write form definitions.

## API development

During local development, Angular forwards relative `/api` requests to the owned backend at
`http://127.0.0.1:3000` through `proxy.conf.json`:

```text
Browser → /api/v1/forms/customer-feedback → Angular proxy → Fastify → PostgreSQL
```

The client receives `unknown`, and the feature store calls `validateFormDefinition` before exposing a
definition to the renderer. The Angular development proxy is only active with `npm start`; a production
host must provide equivalent same-origin `/api` forwarding. After local validation and answer review,
Angular submits only the provider-neutral answer map and exact rendered version to the owned generic
endpoint. Failed attempts retain their idempotency key for safe retry; changed answers use a new key.

## Quality and verification

The implementation is verified with:

- unit tests covering the owned API boundary, runtime rejection, form rendering, validation, answer review, and retry paths;
- strict Angular production compilation with `npm run build`;
- desktop and mobile browser walkthroughs against the local owned API;
- browser console and network inspection;
- Lighthouse accessibility auditing and keyboard-focused form semantics.

The UI includes native labelled controls, required/error announcements, visible keyboard focus, a skip link, responsive navigation, and loading/error states. API question IDs drive the data model while labels, input types, required rules, and options remain server-driven.

## Assumptions

- The seeded customer-feedback form is a deterministic first example, not a special product workflow.
- Owner-scoped form management is deferred; published form reads remain public at the API lifecycle boundary.
- Bootstrap utilities may be supplemented with small, application-specific SCSS rules.

## Known limitations

- Production hosting must provide the documented same-origin `/api` forwarding rule.
- The `/forms` landing page uses the deterministic sample until the owner-scoped dashboard API is implemented.
- `npm audit` currently reports four moderate development-tooling advisories through Drizzle Kit's legacy esbuild loader chain. `npm audit --omit=dev` reports no production dependency vulnerabilities. npm's suggested remediation downgrades Drizzle Kit across a breaking boundary, so it has not been applied; Drizzle dependencies remain exactly pinned and will be upgraded through a focused review.

## Time spent

Approximately four hours across repository setup, API investigation, architecture, implementation, automated tests, browser verification, accessibility review, and documentation.

## AI assistance

OpenAI Codex was used to review the assessment requirements, scaffold the Angular baseline, investigate the supplied API, support implementation, prepare documentation, and run automated and browser-based verification. All generated changes were reviewed and subjected to the same build, test, and quality checks as manually authored code.
