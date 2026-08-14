import type { FastifyPluginAsync } from 'fastify';

import type { CreateFormDraft } from '../../application/forms/create-form-draft.js';
import type {
  GetOwnerFormDraft,
  SaveOwnerFormDraft,
} from '../../application/forms/owner-form-draft.js';
import type { PublishFormDraft } from '../../application/forms/publish-form-draft.js';
import type { BootstrapFormDraft } from '../../application/forms/bootstrap-form-draft.js';
import type { ListOwnerManagedForms } from '../../application/forms/list-owner-managed-forms.js';
import { ApplicationError } from '../../application/errors/application-error.js';
import { FORM_IDENTIFIER_PATTERN } from '@form-farm/form-domain';
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
  readonly bootstrapFormDraft: BootstrapFormDraft;
  readonly listOwnerManagedForms: ListOwnerManagedForms;
}

export const registerFormManagementRoutes: FastifyPluginAsync<FormManagementRouteOptions> = async (
  app,
  options,
) => {
  app.addHook('onSend', async (_request, reply) => {
    void reply.header('cache-control', 'no-store');
  });
  app.get<{ Querystring: { readonly limit?: string; readonly cursor?: string } }>(
    '/api/v1/management/forms',
    async (request) => {
      const authenticated = await resolveAuthenticatedRequest(
        request,
        options.config.secureCookies,
        options.resolveSession,
      );
      const result = await options.listOwnerManagedForms.execute(
        authenticated.userId,
        parseLimit(request.query.limit),
        parseCursor(request.query.cursor),
      );
      return {
        forms: result.forms,
        nextCursor: result.nextCursor ? encodeCursor(result.nextCursor) : null,
      };
    },
  );
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
  app.post<{ Params: { readonly formId: string }; Body: Record<string, never> }>(
    '/api/v1/management/forms/:formId/draft',
    { schema: { body: { type: 'object', additionalProperties: false } } },
    async (request, reply) => {
      assertUnsafeRequest(request, options.config.publicOrigin);
      const authenticated = await resolveAuthenticatedRequest(
        request,
        options.config.secureCookies,
        options.resolveSession,
      );
      assertSessionXsrf(request, authenticated.sessionCredential, options);
      const draft = await options.bootstrapFormDraft.execute(
        { userId: authenticated.userId },
        request.params.formId,
      );
      return reply
        .status(draft.created ? 201 : 200)
        .header('etag', draftEtag(draft.draftRevision))
        .send(draft);
    },
  );
};

function parseLimit(value: string | undefined): number {
  if (value === undefined) return 20;
  if (!/^[1-9][0-9]*$/.test(value) || Number(value) > 100)
    throw new ApplicationError('invalid_input', 'The page size is invalid.');
  return Number(value);
}

function parseCursor(value: string | undefined): { updatedAt: Date; formId: string } | undefined {
  if (!value) return undefined;
  if (value.length > 512)
    throw new ApplicationError('invalid_input', 'The page cursor is invalid.');
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      typeof parsed[0] !== 'string' ||
      typeof parsed[1] !== 'string'
    )
      throw new Error();
    const updatedAt = new Date(parsed[0]);
    if (
      Number.isNaN(updatedAt.valueOf()) ||
      updatedAt.toISOString() !== parsed[0] ||
      !new RegExp(FORM_IDENTIFIER_PATTERN).test(parsed[1])
    )
      throw new Error();
    return { updatedAt, formId: parsed[1] };
  } catch {
    throw new ApplicationError('invalid_input', 'The page cursor is invalid.');
  }
}

function encodeCursor(cursor: { updatedAt: Date; formId: string }): string {
  return Buffer.from(JSON.stringify([cursor.updatedAt.toISOString(), cursor.formId])).toString(
    'base64url',
  );
}

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
