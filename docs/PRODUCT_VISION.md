# Form Farm AI Product Vision

## Product

Form Farm AI is an AI-powered dynamic form platform. It will enable people to create, manage, publish, complete, and analyse forms without requiring a developer to build each form by hand.

The existing Angular form runner is reusable foundation code. The product evolves it incrementally
rather than replacing proven rendering, validation, accessibility, and state-management behavior.

## Problem

Traditional form builders make simple forms easy, but complex forms still require users to understand field configuration, validation, conditional behaviour, and data structure. Form Farm AI will combine a reliable schema-driven form engine with carefully controlled AI assistance.

## Target users

- Operations and HR teams creating internal workflows
- Small organisations publishing customer-facing forms
- Product teams prototyping structured data collection
- Developers integrating validated forms into applications

## Future product hypothesis

Form Farm may eventually serve two related audiences:

- people and product teams building forms with carefully controlled AI assistance;
- developers and AI clients inspecting, validating, comparing, and evolving versioned forms through stable
  application and MCP capabilities.

The working direction is the **Form Farm Intelligence Platform**: safely inspect, analyze, simulate, evolve, and
audit versioned forms through AI and MCP. Its proposed differentiator is a deterministic **Form Change Impact
Engine** that explains the consequences of a proposed change before any mutation. This is a hypothesis to
validate, not a claim that the product is commercially differentiated or ready to sell.

Possible future positioning includes “versioned form engineering with safe AI operations” and “form
infrastructure built for humans and AI agents.” Evidence from real developer and product-team workflows must
determine whether either audience and positioning is valuable.

## Product principles

1. **Schema first:** every form is represented by a versioned, validated domain schema.
2. **AI proposes; the application validates:** model output is never rendered, persisted, or published without validation.
3. **Human control:** users preview and confirm AI-generated or AI-edited forms.
4. **Accessible by default:** generated forms retain labels, keyboard support, validation feedback, and semantic markup.
5. **Incremental delivery:** backend, persistence, authentication, and AI are introduced as independently testable milestones.
6. **Secure boundaries:** credentials and privileged AI operations remain on the backend.

## First AI capability

A user describes a form in natural language:

> Create a customer feedback form with name, email, a rating from 1–5, comments, and permission to contact the customer.

The intended flow is:

```text
Natural-language request
        ↓
Backend AI service
        ↓
Structured model output
        ↓
Runtime and domain validation
        ↓
Form Farm AI schema
        ↓
Existing Angular form engine
        ↓
User preview and confirmation
```

The model generates structured form data, not Angular source code.

## Near-term scope

- Generalise the existing form schema
- Build and test an owned TypeScript backend
- Render complete realistic forms from the owned API
- Add form creation, editing, preview, versioning, and submissions
- Persist forms and submissions in PostgreSQL
- Add authentication and ownership
- Generate validated form schemas with AI

## Explicitly deferred

- Autonomous agents
- Repository RAG
- Remote or production MCP deployment
- Team permissions
- Advanced analytics
- RAG and embeddings without a concrete knowledge problem

MCP now has a concrete future use case as a safe capability boundary for form engineering. It remains deferred
until its architecture is accepted and deterministic controlled operations, semantic diffing, and impact analysis
are proven independently of any protocol or model provider. AI-assisted editing remains proposal-first and may
operate only through those controlled boundaries; it never publishes automatically.

These capabilities will be introduced only when a concrete use case justifies them.
