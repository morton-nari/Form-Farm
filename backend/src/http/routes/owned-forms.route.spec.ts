import fastifyCookie from '@fastify/cookie';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import type { AccessibleFormSource } from '../../application/ports/accessible-form-source.js';
import { GetAccessibleFormDefinition } from '../../application/forms/get-accessible-form-definition.js';
import { ListAccessibleForms } from '../../application/forms/list-accessible-forms.js';
import { CUSTOMER_FEEDBACK_FORM } from '../../infrastructure/forms/customer-feedback.form.js';
import { registerErrorHandler } from '../errors/register-error-handler.js';
import { registerOwnedFormsRoutes } from './owned-forms.route.js';

describe('owned forms HTTP routes', () => {
  it('requires a resolved session and passes only its user ID to the query', async () => {
    const list = vi.fn(async () => [record()]);
    const app = createRoutes({ listPublishedForUser: list });
    expect((await app.inject({ method: 'GET', url: '/api/v1/forms' })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/forms',
          headers: { cookie: 'ff_session=expired-or-malformed' },
        })
      ).statusCode,
    ).toBe(401);
    expect(list).not.toHaveBeenCalled();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/forms',
      headers: { cookie: 'ff_session=valid-session' },
    });
    expect(response.statusCode).toBe(200);
    expect(list).toHaveBeenCalledWith('user-1');
    expect(response.json()).toEqual({
      forms: [
        {
          id: 'customer-feedback',
          title: 'Customer feedback',
          formVersion: 1,
          updatedAt: '2026-08-14T00:00:00.000Z',
        },
      ],
    });
    await app.close();
  });

  it('returns not found rather than revealing an inaccessible form', async () => {
    const find = vi.fn(async () => undefined);
    const app = createRoutes({ findPublishedByIdForUser: find });
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/forms/private-form',
      headers: { cookie: 'ff_session=valid-session' },
    });
    expect(response.statusCode).toBe(404);
    expect(find).toHaveBeenCalledWith('private-form', 'user-1');
    expect(response.json()).toEqual({ error: { code: 'not_found', message: 'Form not found.' } });
    await app.close();
  });
});

function createRoutes(overrides: Partial<AccessibleFormSource>) {
  const source: AccessibleFormSource = {
    listPublishedForUser: async () => [],
    findPublishedByIdForUser: async () => undefined,
    ...overrides,
  };
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  void app.register(fastifyCookie);
  void app.register(registerOwnedFormsRoutes, {
    secureCookies: false,
    resolveSession: { execute: async (credential) => credential === 'valid-session' ? { userId: 'user-1' } : undefined },
    getFormDefinition: new GetAccessibleFormDefinition(source),
    listForms: new ListAccessibleForms(source),
  });
  return app;
}

function record() {
  return {
    definition: CUSTOMER_FEEDBACK_FORM,
    updatedAt: new Date('2026-08-14T00:00:00.000Z'),
    rowFormId: CUSTOMER_FEEDBACK_FORM.id,
    rowVersion: CUSTOMER_FEEDBACK_FORM.formVersion,
    rowSchemaVersion: CUSTOMER_FEEDBACK_FORM.schemaVersion,
  };
}
