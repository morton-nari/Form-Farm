# Nobleoak Angular Assessment

A modern Angular foundation for the Nobleoak frontend coding assessment. The application will implement the insurance journey described in the supplied brief:

`Your Details → Application → Quote`

> **Current status:** base application only. The assessment journey and API integration have intentionally not been implemented yet.

## Technical baseline

| Tool        | Version                     |
| ----------- | --------------------------- |
| Angular     | 22.1.x                      |
| Angular CLI | 22.1.x                      |
| TypeScript  | 6.0.x                       |
| RxJS        | 7.8.x                       |
| Bootstrap   | 5.3.8                       |
| Vitest      | 4.x                         |
| Node.js     | 22.22.3+, 24.15.0+, or 26.x |
| npm         | 12.0.2+                     |

Exact dependency versions are recorded in `package-lock.json` for reproducible installs.

## Architecture choices

- **Standalone Angular:** the application is bootstrapped with `bootstrapApplication`; there are no NgModules.
- **Zoneless:** Angular 22 applications are zoneless by default. This project does not install `zone.js` or configure a zone-based change-detection provider.
- **Signals:** signals will hold synchronous UI and journey state.
- **Reactive Forms:** Angular Reactive Forms will provide typed form models and validation.
- **Angular Router:** routes are configured through standalone providers.
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

For a clean, lockfile-based installation, such as in CI, use:

```bash
npm ci
```

## Available commands

| Command         | Purpose                                                |
| --------------- | ------------------------------------------------------ |
| `npm start`     | Start the local development server                     |
| `npm run build` | Create a production build in `dist/`                   |
| `npm test`      | Run the unit test suite once                           |
| `npm run watch` | Build continuously using the development configuration |

## Current project structure

```text
src/
├── app/
│   ├── app.config.ts   # Application-level providers
│   ├── app.routes.ts   # Route definitions
│   ├── app.ts          # Standalone root component
│   ├── app.html        # Minimal application shell
│   ├── app.scss        # Root component styles
│   └── app.spec.ts     # Root component tests
├── index.html
├── main.ts             # Standalone bootstrap entry point
└── styles.scss         # Global application styles
```

Bootstrap's minified CSS is included through the `styles` array in `angular.json`. No Bootstrap JavaScript is loaded.

## Planned assessment scope

The next implementation phase will add:

- the `Your Details`, `Application`, and `Quote` journey;
- required-field validation with typed reactive forms;
- signal-based journey and submission state;
- `GET /application` and `POST /quote` integration;
- support for API-driven additional questions;
- loading, validation, error, and final quote states;
- focused unit tests.

## Assumptions

- The supplied wireframe is a visual reference rather than a pixel-perfect specification.
- The API contract shown in the assessment brief is the source of truth.
- API base URLs and the local development strategy will be documented when integration is implemented.
- Bootstrap utilities may be supplemented with small, application-specific SCSS rules.

## Known limitations

- This baseline does not yet implement the insurance journey.
- API services and mock API behaviour have not yet been added.
- Accessibility, responsive behaviour, and full feature tests will be completed with the feature implementation.
- `npm audit` currently reports three moderate development-tooling advisories through the latest Angular CLI's MCP dependencies. There are no high or critical advisories and no production-runtime dependency is affected; npm's suggested remediation is an Angular CLI downgrade, which has intentionally not been applied.

## Time spent

Approximately 30 minutes on repository review, Angular scaffolding, dependency configuration, baseline verification, and documentation. This will be updated as the assessment progresses.

## AI assistance

OpenAI Codex was used to review the assessment requirements, scaffold the Angular baseline, configure dependencies, prepare documentation, and run verification commands. All generated changes are reviewed and remain subject to the same build, test, and code-quality checks as manually authored code.
