# AI form-change proposals

## Current status

Form Farm contains the first backend-only AI proposal boundary. It is **not activated** in local composition,
Preview, Production, CI, the Angular application, or the MCP server. No AI credential or model configuration is
required, and normal application startup, builds, tests, and deployments make no model requests.

This boundary is intentionally useful before provider activation: provider-independent tests exercise the same
application orchestration with deterministic fakes, while the Vercel AI Gateway adapter compiles and is tested
without contacting the service. Installing the SDK does not authorize usage or spending.

## Proposal flow

```text
verified owner + bounded natural-language goal
        |
        v
Form-change proposal application use case
        |
        +--> owner-authorized current draft
        |
        +--> provider port --> untrusted JSON
        |
        +--> validate controlled FormChangeSet
        +--> apply to an in-memory clone
        +--> deterministic semantic diff
        +--> deterministic impact analysis
        +--> deterministic candidate analysis when publishable
        v
review-only proposal result
```

The provider does not return an authoritative `FormDefinition`. It proposes only the closed, versioned
Form Change Operation vocabulary. Form Farm validates and applies that output in memory. The result does not
persist a draft, publish a version, mutate submissions, or authorize a later write.

Provider errors and timeouts become a stable generic failure. Prompts, raw provider output, reasoning,
definitions, credentials, and authentication material are not logged or returned as error details. Safe
generation metadata is limited to provider/model identity, finish reason, and token counts.

## Zero-cost boundary

The current implementation has no API key, Vercel OIDC AI authorization, Preview secret, or Production secret.
It must remain impossible to incur model usage through routine tests or application operation. ChatGPT account
subscriptions are not used as backend credentials and must never be represented by copied browser sessions or
cookies.

Activating a real provider later requires a separate reviewed issue and explicit owner approval covering:

- independently scoped development, Preview, and Production credentials;
- a current allow-listed model and measured structured-output compatibility;
- a hard budget/spending decision and request-rate limits;
- prompt and output size caps plus timeout behavior;
- provider data handling, retention, and operational logging review;
- an opt-in composition path and an end-to-end synthetic test;
- rollback by disabling the AI capability without affecting deterministic form management.

Until that decision, do not add `AI_GATEWAY_API_KEY`, `VERCEL_OIDC_TOKEN` for AI use, provider API keys, or AI
environment variables to Vercel or GitHub environments.
