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
- MCP integrations
- Team permissions
- Advanced analytics
- AI-assisted schema editing

These capabilities will be introduced only when a concrete use case justifies them.
