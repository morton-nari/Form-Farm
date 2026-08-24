import type { FastifyPluginAsync } from 'fastify';

import type {
  ConfirmAndIssueDeveloperCredential,
  ListDeveloperCredentials,
  RevokeDeveloperCredential,
} from '../../application/authentication/developer-credentials.js';
import type { BackendConfig } from '../../config/backend-config.js';
import type { AuthenticationRateLimiter } from '../../application/authentication/authentication-rate-limiter.js';
import { resolveAuthenticatedRequest } from '../authentication/resolve-authenticated-user.js';
import type { XsrfTokenService } from '../authentication/xsrf-token-service.js';
import {
  assertUnsafeRequest,
  authenticationCookieNames,
  headerValue,
} from './authentication.route.js';
import { ForbiddenAuthenticationRequestError } from '../authentication/authentication-errors.js';

interface DeveloperCredentialRouteOptions {
  readonly config: BackendConfig['auth'];
  readonly resolveSession: {
    execute(sessionCredential: string): Promise<{ readonly userId: string } | undefined>;
  };
  readonly rateLimiter: AuthenticationRateLimiter;
  readonly xsrfTokens: XsrfTokenService;
  readonly issueDeveloperCredential: ConfirmAndIssueDeveloperCredential;
  readonly listDeveloperCredentials: ListDeveloperCredentials;
  readonly revokeDeveloperCredential: RevokeDeveloperCredential;
}

interface IssueBody {
  readonly displayName: unknown;
  readonly expiresInDays: unknown;
  readonly currentPassword: unknown;
}

export const registerDeveloperCredentialRoutes: FastifyPluginAsync<
  DeveloperCredentialRouteOptions
> = async (app, options) => {
  app.addHook('onSend', async (_request, reply) => {
    void reply.header('cache-control', 'no-store');
  });

  app.get('/api/v1/management/developer-credentials', async (request) => {
    const authenticated = await authenticate(request, options);
    return { credentials: await options.listDeveloperCredentials.execute(authenticated) };
  });

  app.post<{ Body: IssueBody }>(
    '/api/v1/management/developer-credentials',
    {
      bodyLimit: 20 * 1024,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['displayName', 'expiresInDays', 'currentPassword'],
          properties: {
            displayName: { type: 'string', minLength: 1, maxLength: 80 },
            expiresInDays: { type: 'integer', minimum: 1, maximum: 30 },
            currentPassword: { type: 'string', minLength: 1, maxLength: 16_384 },
          },
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
      await options.rateLimiter.consume(
        'developer-credential-source',
        request.ip,
        options.config.loginRateLimit,
      );
      await options.rateLimiter.consume(
        'developer-credential-actor',
        authenticated.userId,
        options.config.loginRateLimit,
      );
      const issued = await options.issueDeveloperCredential.execute(
        { userId: authenticated.userId },
        request.body,
        () => options.resolveSession.execute(authenticated.sessionCredential),
      );
      return reply.status(201).send(issued);
    },
  );

  app.delete<{ Params: { readonly publicId: string }; Body: Record<string, never> }>(
    '/api/v1/management/developer-credentials/:publicId',
    { schema: { body: { type: 'object', additionalProperties: false } } },
    async (request, reply) => {
      assertUnsafeRequest(request, options.config.publicOrigin);
      const authenticated = await resolveAuthenticatedRequest(
        request,
        options.config.secureCookies,
        options.resolveSession,
      );
      assertSessionXsrf(request, authenticated.sessionCredential, options);
      await options.revokeDeveloperCredential.execute(
        { userId: authenticated.userId },
        request.params.publicId,
      );
      return reply.status(204).send();
    },
  );
};

async function authenticate(
  request: Parameters<typeof resolveAuthenticatedRequest>[0],
  options: DeveloperCredentialRouteOptions,
) {
  const authenticated = await resolveAuthenticatedRequest(
    request,
    options.config.secureCookies,
    options.resolveSession,
  );
  return { userId: authenticated.userId };
}

function assertSessionXsrf(
  request: Parameters<typeof headerValue>[0],
  sessionCredential: string,
  options: DeveloperCredentialRouteOptions,
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
