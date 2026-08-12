import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { createApplication } from './app.js';
import { ApplicationError } from './application/errors/application-error.js';
import type { FormDefinitionSource } from './application/ports/form-definition-source.js';

const applications: FastifyInstance[] = [];

function createTestApplication(formDefinitionSource?: FormDefinitionSource): FastifyInstance {
  const app = createApplication({
    config: {
      environment: 'test',
      host: '127.0.0.1',
      port: 3000,
      logLevel: 'silent',
    },
    ...(formDefinitionSource === undefined ? {} : { formDefinitionSource }),
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

  it('returns a consistent safe response for unknown routes', async () => {
    const response = await createTestApplication().inject({ method: 'GET', url: '/missing' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: 'route_not_found', message: 'Route not found.' },
    });
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
});
