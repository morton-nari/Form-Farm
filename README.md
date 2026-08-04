# Nobleoak Angular Assessment

A modern Angular foundation for the Nobleoak frontend coding assessment. The application will implement the insurance journey described in the supplied brief:

`Your Details → Application → Quote`

> **Current status:** the complete API-driven journey is functional, including validation, responsive navigation, answer review, quote submission, dynamically appended follow-up questions, resubmission, and final quote presentation.

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
- **Signals:** signals hold synchronous UI and journey state, including loading, navigation, submission, and quote results.
- **Reactive Forms:** Angular Reactive Forms provide typed, API-driven form models and validation.
- **Single-page journey:** signal-based section state drives the assessment flow, so no unused URL router is bundled.
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
│   ├── core/api/        # Typed HTTP contracts and API client
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

In development mode, successful GET and POST responses are logged in the browser console with both the browser-facing `/api` URL and the corresponding Azure upstream URL. These diagnostic messages are disabled in production mode.

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
