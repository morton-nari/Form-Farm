import fastifyCookie from '@fastify/cookie';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { CreateFormDraft } from '../../application/forms/create-form-draft.js';
import type { CreateFormDraftTransaction } from '../../application/ports/create-form-draft-transaction.js';
import type { OwnerFormDraftStore } from '../../application/ports/owner-form-draft-store.js';
import { GetOwnerFormDraft, SaveOwnerFormDraft } from '../../application/forms/owner-form-draft.js';
import { PublishFormDraft } from '../../application/forms/publish-form-draft.js';
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
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ actor: { userId: 'user-1' } }));
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

  it('loads an owner draft with its exact ETag', async () => {
    const store = ownerDraftStore();
    const app = createRoutes(vi.fn(), tokenService(), store);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/management/forms/customer-feedback/draft',
      headers: { cookie: 'ff_session=valid-session' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers.etag).toBe('"draft-1"');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(store.findByIdForOwner).toHaveBeenCalledWith('customer-feedback', { userId: 'user-1' });
    await app.close();
  });

  it('saves for the resolved actor with session XSRF and increments the ETag', async () => {
    const store = ownerDraftStore();
    const tokens = tokenService();
    const xsrf = tokens.issueSessionToken('valid-session');
    const app = createRoutes(vi.fn(), tokens, store);
    const definition = { ...CUSTOMER_FEEDBACK_FORM, title: 'Updated feedback' };
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/management/forms/customer-feedback/draft',
      headers: {
        origin: 'http://localhost:4200',
        'content-type': 'application/json',
        'if-match': '"draft-1"',
        'x-xsrf-token': xsrf,
        cookie: `ff_session=valid-session; ff_xsrf=${xsrf}`,
      },
      payload: { definition },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers.etag).toBe('"draft-2"');
    expect(store.save).toHaveBeenCalledWith({
      actor: { userId: 'user-1' },
      formId: 'customer-feedback',
      expectedRevision: 1,
      definition,
    });
    await app.close();
  });

  it('rejects malformed If-Match before saving', async () => {
    const store = ownerDraftStore();
    const tokens = tokenService();
    const xsrf = tokens.issueSessionToken('valid-session');
    const app = createRoutes(vi.fn(), tokens, store);
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/management/forms/customer-feedback/draft',
      headers: {
        origin: 'http://localhost:4200',
        'content-type': 'application/json',
        'if-match': 'W/"draft-1"',
        'x-xsrf-token': xsrf,
        cookie: `ff_session=valid-session; ff_xsrf=${xsrf}`,
      },
      payload: { definition: CUSTOMER_FEEDBACK_FORM },
    });
    expect(response.statusCode).toBe(400);
    expect(store.save).not.toHaveBeenCalled();
    await app.close();
  });

  it('publishes through the authenticated origin and session-XSRF boundary', async () => {
    const tokens = tokenService();
    const xsrf = tokens.issueSessionToken('valid-session');
    const app = createRoutes(vi.fn(), tokens);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/management/forms/customer-feedback/publications',
      headers: {
        origin: 'http://localhost:4200',
        'content-type': 'application/json',
        'if-match': '"draft-1"',
        'x-xsrf-token': xsrf,
        cookie: `ff_session=valid-session; ff_xsrf=${xsrf}`,
      },
      payload: {},
    });
    expect(response.statusCode).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toMatchObject({
      formId: 'customer-feedback',
      status: 'published',
      formVersion: 1,
    });
    await app.close();
  });
});

function createRoutes(
  execute: CreateFormDraftTransaction['execute'],
  tokens = tokenService(),
  store = ownerDraftStore(),
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
    getOwnerFormDraft: new GetOwnerFormDraft(store),
    saveOwnerFormDraft: new SaveOwnerFormDraft(store),
    publishFormDraft: new PublishFormDraft({
      execute: async () => ({
        status: 'published',
        version: 1,
        publishedAt: new Date('2026-08-14T00:00:00.000Z'),
      }),
    }),
  });
  return app;
}

function ownerDraftStore(): OwnerFormDraftStore {
  const timestamp = new Date('2026-08-14T00:00:00.000Z');
  return {
    findByIdForOwner: vi.fn(async () => ({
      definition: CUSTOMER_FEEDBACK_FORM,
      rowFormId: CUSTOMER_FEEDBACK_FORM.id,
      latestVersion: 0,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
    save: vi.fn(async (input) => ({
      status: 'saved' as const,
      draft: {
        definition: input.definition,
        rowFormId: input.formId,
        latestVersion: 0,
        revision: 2,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    })),
  };
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
