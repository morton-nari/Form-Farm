import type { FastifyPluginAsync } from 'fastify';

import type { CreateFormDraft } from '../../application/forms/create-form-draft.js';
import type { BackendConfig } from '../../config/backend-config.js';
import { ForbiddenAuthenticationRequestError } from '../authentication/authentication-errors.js';
import { resolveAuthenticatedRequest } from '../authentication/resolve-authenticated-user.js';
import type { XsrfTokenService } from '../authentication/xsrf-token-service.js';
import {
  assertUnsafeRequest,
  authenticationCookieNames,
  headerValue,
} from './authentication.route.js';

interface FormManagementRouteOptions {
  readonly config: BackendConfig['auth'];
  readonly resolveSession: {
    execute(sessionCredential: string): Promise<{ readonly userId: string } | undefined>;
  };
  readonly xsrfTokens: XsrfTokenService;
  readonly createFormDraft: CreateFormDraft;
}

export const registerFormManagementRoutes: FastifyPluginAsync<FormManagementRouteOptions> = async (
  app,
  options,
) => {
  app.addHook('onSend', async (_request, reply) => {
    void reply.header('cache-control', 'no-store');
  });
  app.post<{ Body: { readonly definition: unknown } }>(
    '/api/v1/management/forms',
    {
      bodyLimit: 256 * 1024,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['definition'],
          properties: { definition: { type: 'object' } },
        },
      },
    },
    async (request, reply) => {
      assertUnsafeRequest(request, options.config.publicOrigin);
      const authenticated = await resolveAuthenticatedRequest(
        request,
        options.config.secureCookies,
        options.resolveSession,
      );
      const cookieName = authenticationCookieNames(options.config.secureCookies).xsrf;
      if (
        !options.xsrfTokens.verifySessionToken(
          authenticated.sessionCredential,
          request.cookies[cookieName],
          headerValue(request, 'x-xsrf-token'),
        )
      ) {
        throw new ForbiddenAuthenticationRequestError();
      }
      const created = await options.createFormDraft.execute(
        { userId: authenticated.userId },
        request.body.definition,
      );
      return reply.status(201).send(created);
    },
  );
};
