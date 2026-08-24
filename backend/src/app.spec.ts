import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { createApplication, type AuthenticationApplicationServices } from './app.js';
import { ApplicationError } from './application/errors/application-error.js';
import type { FormDefinitionSource } from './application/ports/form-definition-source.js';
import type { FormSubmissionTransaction } from './application/ports/form-submission-transaction.js';
import { SeededFormDefinitionSource } from './infrastructure/forms/seeded-form-definition-source.js';

const testAuthConfig = {
  publicOrigin: 'http://localhost:4200',
  secureCookies: false,
  trustedProxyHops: 0,
  sessionIdleTimeoutMilliseconds: 30 * 60_000,
  sessionAbsoluteTimeoutMilliseconds: 7 * 24 * 60 * 60_000,
  sessionActivityWriteCadenceMilliseconds: 5 * 60_000,
  xsrfLifetimeMilliseconds: 10 * 60_000,
  xsrfCurrentSecret: 'test-xsrf-secret-that-is-at-least-32-bytes',
  rateLimitCurrentSecret: 'test-rate-secret-that-is-at-least-32-bytes',
  registrationRateLimit: 5,
  loginRateLimit: 10,
  rateLimitWindowMilliseconds: 15 * 60_000,
} as const;

const applications: FastifyInstance[] = [];

function createTestApplication(
  formDefinitionSource?: FormDefinitionSource,
  formSubmissionTransaction: FormSubmissionTransaction = successfulSubmissionTransaction(),
): FastifyInstance {
  const app = createApplication({
    config: {
      environment: 'test',
      host: '127.0.0.1',
      port: 3000,
      logLevel: 'silent',
      databaseUrl: 'postgresql://localhost/test',
      databasePoolMax: 1,
      auth: testAuthConfig,
    },
    formDefinitionSource: formDefinitionSource ?? new SeededFormDefinitionSource(),
    formSubmissionTransaction,
  });
  applications.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(applications.splice(0).map(async (app) => app.close()));
});

describe('createApplication', () => {
  it('serves health checks without opening a network port', async () => {
    const response = await createTestApplication().inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('closes composed infrastructure with the application', async () => {
    let closed = false;
    const app = createApplication({
      config: {
        environment: 'test',
        host: '127.0.0.1',
        port: 3000,
        logLevel: 'silent',
        databaseUrl: 'postgresql://localhost/test',
        databasePoolMax: 1,
        auth: testAuthConfig,
      },
      formDefinitionSource: new SeededFormDefinitionSource(),
      formSubmissionTransaction: successfulSubmissionTransaction(),
      closeInfrastructure: async () => {
        closed = true;
      },
    });

    await app.close();

    expect(closed).toBe(true);
  });

  it('returns a consistent safe response for unknown routes', async () => {
    const response = await createTestApplication().inject({ method: 'GET', url: '/missing' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: 'route_not_found', message: 'Route not found.' },
    });
  });

  it('does not register developer credential management outside development', async () => {
    const issueDeveloperCredential = vi.fn();
    const app = createApplication({
      config: {
        environment: 'production',
        deploymentStage: 'production',
        host: '127.0.0.1',
        port: 3000,
        logLevel: 'silent',
        databaseUrl: 'postgresql://localhost/test',
        databasePoolMax: 1,
        auth: { ...testAuthConfig, publicOrigin: 'https://forms.example.com', secureCookies: true },
      },
      formDefinitionSource: new SeededFormDefinitionSource(),
      formSubmissionTransaction: successfulSubmissionTransaction(),
      authentication: {
        registerAccount: { execute: async () => undefined },
        login: { execute: async () => ({ sessionCredential: 'unused' }) },
        logout: { execute: async () => undefined },
        resolveSession: { execute: async () => ({ userId: 'owner-1' }) },
        rateLimiter: {} as AuthenticationApplicationServices['rateLimiter'],
        xsrfTokens: {} as AuthenticationApplicationServices['xsrfTokens'],
        developerCredentials: {
          issueDeveloperCredential: { execute: issueDeveloperCredential },
          listDeveloperCredentials: { execute: vi.fn() },
          revokeDeveloperCredential: { execute: vi.fn() },
        },
      } as AuthenticationApplicationServices,
    });
    applications.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/management/developer-credentials',
    });
    expect(response.statusCode).toBe(404);
    expect(issueDeveloperCredential).not.toHaveBeenCalled();
  });

  it('serves a validated deterministic form definition', async () => {
    const response = await createTestApplication().inject({
      method: 'GET',
      url: '/api/v1/forms/customer-feedback',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      schemaVersion: 1,
      id: 'customer-feedback',
      formVersion: 1,
      title: 'Customer feedback',
    });
  });

  it('returns not found for an unknown valid form identifier', async () => {
    const response = await createTestApplication().inject({
      method: 'GET',
      url: '/api/v1/forms/unknown-form',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: 'not_found', message: 'Form not found.' },
    });
  });

  it('rejects malformed form identifiers at the HTTP boundary', async () => {
    const response = await createTestApplication().inject({
      method: 'GET',
      url: '/api/v1/forms/123-invalid',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: 'invalid_request', message: 'The request is invalid.' },
    });
  });

  it('does not serve invalid source data', async () => {
    const invalidSource: FormDefinitionSource = {
      findById: async () => ({ id: 'invalid' }),
    };
    const response = await createTestApplication(invalidSource).inject({
      method: 'GET',
      url: '/api/v1/forms/invalid',
    });

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('Stored form definition');
    expect(response.json()).toEqual({
      error: { code: 'internal_error', message: 'An unexpected error occurred.' },
    });
  });

  it('maps application errors without exposing framework details', async () => {
    const app = createTestApplication();
    app.get('/conflict', async () => {
      throw new ApplicationError('conflict', 'The resource already exists.');
    });

    const response = await app.inject({ method: 'GET', url: '/conflict' });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: { code: 'conflict', message: 'The resource already exists.' },
    });
  });

  it('maps request schema failures without leaking validator internals', async () => {
    const app = createTestApplication();
    app.post('/validated', {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['name'],
          properties: { name: { type: 'string', minLength: 1 } },
        },
      },
      handler: async () => ({ accepted: true }),
    });

    const response = await app.inject({ method: 'POST', url: '/validated', payload: {} });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: 'invalid_request', message: 'The request is invalid.' },
    });
  });

  it('hides unexpected error details', async () => {
    const app = createTestApplication();
    app.get('/unexpected', async () => {
      throw new Error('sensitive implementation detail');
    });

    const response = await app.inject({ method: 'GET', url: '/unexpected' });

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('sensitive implementation detail');
    expect(response.json()).toEqual({
      error: { code: 'internal_error', message: 'An unexpected error occurred.' },
    });
  });

  it('creates a version-bound provider-neutral submission', async () => {
    const response = await createTestApplication().inject({
      method: 'POST',
      url: '/api/v1/forms/customer-feedback/submissions',
      headers: { 'idempotency-key': '550e8400-e29b-41d4-a716-446655440000' },
      payload: { formVersion: 1, answers: { overallRating: 'good' } },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ submissionId: 'submission-id', replayed: false });
  });

  it('returns safe provider-neutral issues for invalid answers', async () => {
    const response = await createTestApplication().inject({
      method: 'POST',
      url: '/api/v1/forms/customer-feedback/submissions',
      headers: { 'idempotency-key': '550e8400-e29b-41d4-a716-446655440000' },
      payload: { formVersion: 1, answers: { overallRating: 'secret-value' } },
    });
    expect(response.statusCode).toBe(422);
    expect(response.body).not.toContain('secret-value');
    expect(response.json()).toMatchObject({
      error: { code: 'invalid_submission' },
      issues: [{ path: ['answers', 'overallRating'], code: 'invalid_option' }],
    });
  });

  it('returns the original submission for an idempotent replay', async () => {
    const transaction: FormSubmissionTransaction = {
      execute: async () => ({ status: 'replayed', submissionId: 'original-id' }),
    };
    const response = await createTestApplication(undefined, transaction).inject({
      method: 'POST',
      url: '/api/v1/forms/customer-feedback/submissions',
      headers: { 'idempotency-key': '550e8400-e29b-41d4-a716-446655440000' },
      payload: { formVersion: 1, answers: { overallRating: 'good' } },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ submissionId: 'original-id', replayed: true });
  });

  it('rejects malformed envelopes and oversized payloads at the HTTP edge', async () => {
    const app = createTestApplication();
    const malformed = await app.inject({
      method: 'POST',
      url: '/api/v1/forms/customer-feedback/submissions',
      headers: { 'idempotency-key': 'not-a-uuid' },
      payload: { formVersion: 0, answers: {} },
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toEqual({
      error: { code: 'invalid_request', message: 'The request is invalid.' },
    });

    const malformedKey = await app.inject({
      method: 'POST',
      url: '/api/v1/forms/customer-feedback/submissions',
      headers: { 'idempotency-key': 'not-a-uuid' },
      payload: { formVersion: 1, answers: { overallRating: 'good' } },
    });
    expect(malformedKey.statusCode).toBe(400);
    expect(malformedKey.json()).toEqual({
      error: { code: 'invalid_request', message: 'The request is invalid.' },
    });

    const oversized = await app.inject({
      method: 'POST',
      url: '/api/v1/forms/customer-feedback/submissions',
      headers: { 'idempotency-key': '550e8400-e29b-41d4-a716-446655440000' },
      payload: { formVersion: 1, answers: { text: 'x'.repeat(257 * 1024) } },
    });
    expect(oversized.statusCode).toBe(413);
    expect(oversized.body).not.toContain('xxx');
  });
});

function successfulSubmissionTransaction(): FormSubmissionTransaction {
  return {
    execute: async (request, validate) => {
      validate({
        rowFormId: 'customer-feedback',
        rowVersion: 1,
        rowSchemaVersion: 1,
        definition: (await new SeededFormDefinitionSource().findById('customer-feedback'))!,
      });
      return { status: 'created', submissionId: 'submission-id' };
    },
  };
}
