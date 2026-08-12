# Form Farm AI

Form Farm AI is evolving into an AI-powered dynamic form platform. Its current working foundation is a modern Angular implementation of the insurance journey from the original Nobleoak frontend coding assessment:

`Your Details → Application → Quote`

The product direction is documented in [Product Vision](docs/PRODUCT_VISION.md), [Architecture](docs/ARCHITECTURE.md), and [Roadmap](docs/ROADMAP.md). Development workflow and quality expectations are in [Contributing](CONTRIBUTING.md).

The provider-neutral form contract and its supported version-one capabilities are documented in
[Form Schema](docs/FORM_SCHEMA.md).
The owned HTTP endpoints are documented in [Backend API](docs/BACKEND_API.md).

> **Current status:** the Angular API-driven journey is functional. An owned Fastify backend foundation now provides configuration validation, health checks, safe HTTP error mapping, and graceful shutdown. Database, authentication, generic form APIs, the form builder, and AI capabilities are not implemented yet.

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
- **Signals:** signals hold synchronous UI and journey state, including loading, navigation, submission, and quote results.
- **Reactive Forms:** Angular Reactive Forms provide typed, API-driven form models and validation.
- **Single-page journey:** signal-based section state drives the assessment flow, so no unused URL router is bundled.
- **API page fidelity:** the supplied About You and Lifestyle pages are kept intact and rendered together; answering a section updates the progress navigation without moving questions into synthetic form steps.
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

It listens on `http://127.0.0.1:3000` by default. `GET /health` returns `{ "status": "ok" }`.

For a clean, lockfile-based installation, such as in CI, use:

```bash
npm ci
```

## Available commands

| Command                   | Purpose                                                   |
| ------------------------- | --------------------------------------------------------- |
| `npm start`               | Start the Angular development server                      |
| `npm run backend:dev`     | Start the backend with file watching                      |
| `npm run backend:start`   | Run the compiled backend                                  |
| `npm run build`           | Create the Angular production build                       |
| `npm run backend:build`   | Strictly compile the backend                              |
| `npm run build:all`       | Build the frontend and backend                            |
| `npm test`                | Run the Angular unit tests once                           |
| `npm run backend:test`    | Run the backend tests once                                |
| `npm run test:all`        | Run frontend and backend tests                            |
| `npm run watch`           | Build Angular continuously in development mode            |

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
│   ├── core/api/        # Typed HTTP contracts and API client
│   ├── domain/forms/    # Provider-neutral form contract and runtime validation
│   ├── shared/form-runner/ # Generic Reactive Forms factory and field renderer
│   ├── features/
│   │   └── quote-journey/
│   │       ├── components/  # Question renderer and journey navigation
│   │       ├── data-access/ # API schema adapter and signal store
│   │       ├── forms/       # Dynamic Reactive Forms factory
│   │       ├── models/      # Presentation-focused journey models
│   │       └── pages/       # Composed quote journey screen
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

| Variable    | Default       | Accepted values                              |
| ----------- | ------------- | -------------------------------------------- |
| `NODE_ENV`  | `development` | `development`, `test`, `production`          |
| `HOST`      | `127.0.0.1`   | Any non-empty host                           |
| `PORT`      | `3000`        | Integer from 1 through 65535                  |
| `LOG_LEVEL` | `info`        | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` |

Fastify remains an HTTP adapter. Application and domain code do not depend on Fastify types. The backend exposes one persistence-free seeded form-definition endpoint and does not yet accept submissions.

## API development

The supplied Azure API does not expose browser CORS headers. During local development, Angular forwards relative `/api` requests through the development proxy configured in `proxy.conf.json`:

```text
Browser → /api/application → Angular development proxy → Azure API /application
Browser → /api/quote       → Angular development proxy → Azure API /quote
```

The application code therefore contains no environment-specific host name. The typed API client is located under `src/app/core/api` and exposes:

- `getApplication()` for `GET /api/application`;
- `submitQuote(answers)` for `POST /api/quote`.

The quote endpoint requires answers to be sent inside an `answers` property. No authentication headers or API keys are required.

The Angular development proxy is only active with `npm start`. A production deployment will require its hosting platform to forward `/api` to the supplied API or provide an equivalent same-origin backend route.

## Quality and verification

The implementation is verified with:

- unit tests covering API adaptation, state transitions, form rendering, validation, navigation, follow-up questions, retry paths, and quote completion;
- strict Angular production compilation with `npm run build`;
- desktop and mobile browser walkthroughs against the live API;
- browser console and network inspection;
- Lighthouse accessibility auditing and keyboard-focused form semantics.

The UI includes native labelled controls, required/error announcements, visible keyboard focus, a skip link, responsive navigation, and loading/error states. API question IDs drive the data model while labels, input types, required rules, and options remain server-driven.

## Assumptions

- The supplied wireframe is a visual reference rather than a pixel-perfect specification.
- `Your Details` represents an earlier completed stage, so it is displayed as static progress and is not inferred from the application API fields.
- The API contract shown in the assessment brief is the source of truth.
- The API requires no authentication based on direct GET and POST contract verification.
- Bootstrap utilities may be supplemented with small, application-specific SCSS rules.

## Known limitations

- Production hosting must provide the documented same-origin `/api` forwarding rule because the external API does not enable CORS.
- The current quote is presented for assessment purposes only; purchasing or persisting a policy is outside the supplied API contract.
- `npm audit` currently reports three moderate development-tooling advisories through the latest Angular CLI's MCP dependencies. There are no high or critical advisories and no production-runtime dependency is affected; npm's suggested remediation is an Angular CLI downgrade, which has intentionally not been applied.

## Time spent

Approximately four hours across repository setup, API investigation, architecture, implementation, automated tests, browser verification, accessibility review, and documentation.

## AI assistance

OpenAI Codex was used to review the assessment requirements, scaffold the Angular baseline, investigate the supplied API, support implementation, prepare documentation, and run automated and browser-based verification. All generated changes were reviewed and subjected to the same build, test, and quality checks as manually authored code.
