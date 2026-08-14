import type { FastifyPluginAsync } from 'fastify';

import type { CreateFormDraft } from '../../application/forms/create-form-draft.js';
import type {
  GetOwnerFormDraft,
  SaveOwnerFormDraft,
} from '../../application/forms/owner-form-draft.js';
import type { PublishFormDraft } from '../../application/forms/publish-form-draft.js';
import type { BackendConfig } from '../../config/backend-config.js';
import { ForbiddenAuthenticationRequestError } from '../authentication/authentication-errors.js';
import { resolveAuthenticatedRequest } from '../authentication/resolve-authenticated-user.js';
import type { XsrfTokenService } from '../authentication/xsrf-token-service.js';
import {
  assertUnsafeRequest,
  authenticationCookieNames,
  headerValue,
} from './authentication.route.js';
import { draftEtag, parseDraftIfMatch } from '../draft-etag.js';

interface FormManagementRouteOptions {
  readonly config: BackendConfig['auth'];
  readonly resolveSession: {
    execute(sessionCredential: string): Promise<{ readonly userId: string } | undefined>;
  };
  readonly xsrfTokens: XsrfTokenService;
  readonly createFormDraft: CreateFormDraft;
  readonly getOwnerFormDraft: GetOwnerFormDraft;
  readonly saveOwnerFormDraft: SaveOwnerFormDraft;
  readonly publishFormDraft: PublishFormDraft;
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
      assertSessionXsrf(request, authenticated.sessionCredential, options);
      const created = await options.createFormDraft.execute(
        { userId: authenticated.userId },
        request.body.definition,
      );
      return reply.status(201).send(created);
    },
  );
  app.get<{ Params: { readonly formId: string } }>(
    '/api/v1/management/forms/:formId/draft',
    async (request, reply) => {
      const authenticated = await resolveAuthenticatedRequest(
        request,
        options.config.secureCookies,
        options.resolveSession,
      );
      const draft = await options.getOwnerFormDraft.execute(
        { userId: authenticated.userId },
        request.params.formId,
      );
      return reply.header('etag', draftEtag(draft.draftRevision)).send(draft);
    },
  );
  app.put<{ Params: { readonly formId: string }; Body: { readonly definition: unknown } }>(
    '/api/v1/management/forms/:formId/draft',
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
      assertSessionXsrf(request, authenticated.sessionCredential, options);
      const draft = await options.saveOwnerFormDraft.execute(
        { userId: authenticated.userId },
        request.params.formId,
        parseDraftIfMatch(request.headers['if-match']),
        request.body.definition,
      );
      return reply.header('etag', draftEtag(draft.draftRevision)).send(draft);
    },
  );
  app.post<{ Params: { readonly formId: string }; Body: Record<string, never> }>(
    '/api/v1/management/forms/:formId/publications',
    { schema: { body: { type: 'object', additionalProperties: false } } },
    async (request, reply) => {
      assertUnsafeRequest(request, options.config.publicOrigin);
      const authenticated = await resolveAuthenticatedRequest(
        request,
        options.config.secureCookies,
        options.resolveSession,
      );
      assertSessionXsrf(request, authenticated.sessionCredential, options);
      const published = await options.publishFormDraft.execute(
        { userId: authenticated.userId },
        request.params.formId,
        parseDraftIfMatch(request.headers['if-match']),
      );
      return reply.status(201).send(published);
    },
  );
};

function assertSessionXsrf(
  request: Parameters<typeof headerValue>[0],
  sessionCredential: string,
  options: FormManagementRouteOptions,
): void {
  const cookieName = authenticationCookieNames(options.config.secureCookies).xsrf;
  if (
    !options.xsrfTokens.verifySessionToken(
      sessionCredential,
      request.cookies[cookieName],
      headerValue(request, 'x-xsrf-token'),
    )
  ) {
    throw new ForbiddenAuthenticationRequestError();
  }
}
