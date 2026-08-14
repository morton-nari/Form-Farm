import fastifyCookie from '@fastify/cookie';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { CreateFormDraft } from '../../application/forms/create-form-draft.js';
import type { CreateFormDraftTransaction } from '../../application/ports/create-form-draft-transaction.js';
import type { BackendConfig } from '../../config/backend-config.js';
import { CUSTOMER_FEEDBACK_FORM } from '../../infrastructure/forms/customer-feedback.form.js';
import { XsrfTokenService } from '../authentication/xsrf-token-service.js';
import { registerErrorHandler } from '../errors/register-error-handler.js';
import { registerFormManagementRoutes } from './form-management.route.js';

describe('form management creation route', () => {
  it('requires authentication and does not invoke persistence first', async () => {
    const execute = vi.fn<CreateFormDraftTransaction['execute']>();
    const app = createRoutes(execute);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/management/forms',
      headers: { origin: 'http://localhost:4200', 'content-type': 'application/json' },
      payload: { definition: CUSTOMER_FEEDBACK_FORM },
    });
    expect(response.statusCode).toBe(401);
    expect(execute).not.toHaveBeenCalled();
    await app.close();
  });

  it('verifies session XSRF and creates only for the resolved actor', async () => {
    const execute = vi.fn(async () => ({
      status: 'created' as const,
      createdAt: new Date('2026-08-14T00:00:00.000Z'),
    }));
    const tokens = tokenService();
    const xsrf = tokens.issueSessionToken('valid-session');
    const app = createRoutes(execute, tokens);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/management/forms',
      headers: {
        origin: 'http://localhost:4200',
        'content-type': 'application/json',
        'x-xsrf-token': xsrf,
        cookie: `ff_session=valid-session; ff_xsrf=${xsrf}`,
      },
      payload: { definition: CUSTOMER_FEEDBACK_FORM },
    });
    expect(response.statusCode).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ actor: { userId: 'user-1' } }),
    );
    expect(response.json()).toMatchObject({ formId: 'customer-feedback', draftRevision: 1 });
    await app.close();
  });

  it('rejects malformed definitions safely before persistence', async () => {
    const execute = vi.fn<CreateFormDraftTransaction['execute']>();
    const tokens = tokenService();
    const xsrf = tokens.issueSessionToken('valid-session');
    const app = createRoutes(execute, tokens);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/management/forms',
      headers: {
        origin: 'http://localhost:4200',
        'content-type': 'application/json',
        'x-xsrf-token': xsrf,
        cookie: `ff_session=valid-session; ff_xsrf=${xsrf}`,
      },
      payload: { definition: { id: 'invalid' } },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: 'invalid_request', message: 'The form definition is invalid.' },
    });
    expect(execute).not.toHaveBeenCalled();
    await app.close();
  });
});

function createRoutes(
  execute: CreateFormDraftTransaction['execute'],
  tokens = tokenService(),
) {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  void app.register(fastifyCookie);
  void app.register(registerFormManagementRoutes, {
    config: authConfig,
    resolveSession: {
      execute: async (credential) =>
        credential === 'valid-session' ? { userId: 'user-1' } : undefined,
    },
    xsrfTokens: tokens,
    createFormDraft: new CreateFormDraft({ execute }),
  });
  return app;
}

function tokenService() {
  return new XsrfTokenService('test-xsrf-secret-at-least-32-bytes', undefined, undefined, 60_000);
}

const authConfig = {
  publicOrigin: 'http://localhost:4200',
  secureCookies: false,
  trustedProxyHops: 0,
  sessionIdleTimeoutMilliseconds: 1_800_000,
  sessionAbsoluteTimeoutMilliseconds: 604_800_000,
  sessionActivityWriteCadenceMilliseconds: 300_000,
  xsrfLifetimeMilliseconds: 600_000,
  xsrfCurrentSecret: 'test-xsrf-secret-at-least-32-bytes',
  rateLimitCurrentSecret: 'test-rate-secret-at-least-32-bytes',
  registrationRateLimit: 5,
  loginRateLimit: 10,
  rateLimitWindowMilliseconds: 900_000,
} satisfies BackendConfig['auth'];
