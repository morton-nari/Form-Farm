import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { normalizeAccountEmail } from '../../application/authentication/account-policy.js';
import type { BackendConfig } from '../../config/backend-config.js';
import {
  ForbiddenAuthenticationRequestError,
  UnauthenticatedError,
} from '../authentication/authentication-errors.js';
import type { AuthenticationRateLimiter } from '../authentication/authentication-rate-limiter.js';
import type { XsrfTokenService } from '../authentication/xsrf-token-service.js';

interface AuthenticationRouteOptions {
  readonly config: BackendConfig['auth'];
  readonly registerAccount: {
    execute(input: CredentialsBody): Promise<void>;
  };
  readonly login: {
    execute(input: CredentialsBody): Promise<{ readonly sessionCredential: string }>;
  };
  readonly logout: { execute(sessionCredential: string): Promise<void> };
  readonly resolveSession: {
    execute(sessionCredential: string): Promise<{ readonly userId: string } | undefined>;
  };
  readonly rateLimiter: AuthenticationRateLimiter;
  readonly xsrfTokens: XsrfTokenService;
}

interface CredentialsBody {
  readonly email: string;
  readonly password: string;
}

const credentialsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['email', 'password'],
  properties: {
    email: { type: 'string', minLength: 3, maxLength: 254 },
    password: { type: 'string', minLength: 1, maxLength: 16_384 },
  },
} as const;

export const registerAuthenticationRoutes: FastifyPluginAsync<AuthenticationRouteOptions> = async (
  app,
  options,
) => {
  const cookieNames = authenticationCookieNames(options.config.secureCookies);
  const cookieBase = {
    path: '/',
    sameSite: 'lax' as const,
    secure: options.config.secureCookies,
  };

  app.addHook('onRequest', async (request) => {
    if (request.method === 'POST') assertUnsafeRequest(request, options.config.publicOrigin);
  });

  app.get('/api/v1/auth/xsrf', async (_request, reply) => {
    const token = options.xsrfTokens.issuePreAuthenticationToken();
    return reply
      .setCookie(cookieNames.xsrf, token, {
        ...cookieBase,
        httpOnly: false,
        maxAge: Math.floor(options.config.xsrfLifetimeMilliseconds / 1_000),
      })
      .status(204)
      .send();
  });

  app.post<{ Body: CredentialsBody }>(
    '/api/v1/auth/register',
    { bodyLimit: 16 * 1024, schema: { body: credentialsSchema } },
    async (request, reply) => {
      assertUnsafeRequest(request, options.config.publicOrigin);
      assertPreAuthenticationXsrf(request, cookieNames.xsrf, options.xsrfTokens);
      await options.rateLimiter.consume(
        'registration-source',
        request.ip,
        options.config.registrationRateLimit,
      );
      await options.rateLimiter.consume(
        'registration-account',
        normalizeAccountEmail(request.body.email),
        options.config.registrationRateLimit,
      );
      await options.registerAccount.execute(request.body);
      return reply.status(202).send({ accepted: true });
    },
  );

  app.post<{ Body: CredentialsBody }>(
    '/api/v1/auth/login',
    { bodyLimit: 16 * 1024, schema: { body: credentialsSchema } },
    async (request, reply) => {
      assertUnsafeRequest(request, options.config.publicOrigin);
      assertPreAuthenticationXsrf(request, cookieNames.xsrf, options.xsrfTokens);
      await options.rateLimiter.consume('login-source', request.ip, options.config.loginRateLimit);
      await options.rateLimiter.consume(
        'login-account',
        normalizeAccountEmail(request.body.email),
        options.config.loginRateLimit,
      );
      const { sessionCredential } = await options.login.execute(request.body);
      const sessionXsrf = options.xsrfTokens.issueSessionToken(sessionCredential);
      return reply
        .setCookie(cookieNames.session, sessionCredential, {
          ...cookieBase,
          httpOnly: true,
          maxAge: Math.floor(options.config.sessionAbsoluteTimeoutMilliseconds / 1_000),
        })
        .setCookie(cookieNames.xsrf, sessionXsrf, {
          ...cookieBase,
          httpOnly: false,
          maxAge: Math.floor(options.config.sessionAbsoluteTimeoutMilliseconds / 1_000),
        })
        .status(200)
        .send({ authenticated: true });
    },
  );

  app.get('/api/v1/auth/session', async (request, reply) => {
    const credential = request.cookies[cookieNames.session];
    if (!credential || !(await options.resolveSession.execute(credential))) {
      throw new UnauthenticatedError();
    }
    return reply.status(200).send({ authenticated: true });
  });

  app.post(
    '/api/v1/auth/logout',
    {
      bodyLimit: 16 * 1024,
      schema: { body: { type: 'object', additionalProperties: false } },
    },
    async (request, reply) => {
      assertUnsafeRequest(request, options.config.publicOrigin);
      const credential = request.cookies[cookieNames.session];
      if (credential) {
        if (
          !options.xsrfTokens.verifySessionToken(
            credential,
            request.cookies[cookieNames.xsrf],
            headerValue(request, 'x-xsrf-token'),
          )
        ) {
          throw new ForbiddenAuthenticationRequestError();
        }
        await options.logout.execute(credential);
      } else {
        assertPreAuthenticationXsrf(request, cookieNames.xsrf, options.xsrfTokens);
      }
      return reply
        .clearCookie(cookieNames.session, cookieBase)
        .clearCookie(cookieNames.xsrf, cookieBase)
        .status(204)
        .send();
    },
  );
};

function assertUnsafeRequest(request: FastifyRequest, publicOrigin: string): void {
  const contentType = headerValue(request, 'content-type')?.toLowerCase();
  const origin = headerValue(request, 'origin');
  const fetchSite = headerValue(request, 'sec-fetch-site');
  if (
    contentType?.split(';', 1)[0]?.trim() !== 'application/json' ||
    !originsMatch(origin, publicOrigin) ||
    fetchSite === 'cross-site'
  ) {
    throw new ForbiddenAuthenticationRequestError();
  }
}

function originsMatch(candidate: string | undefined, configured: string): boolean {
  if (!candidate) return false;
  try {
    const parsed = new URL(candidate);
    return (
      parsed.pathname === '/' &&
      parsed.search === '' &&
      parsed.hash === '' &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.origin === new URL(configured).origin
    );
  } catch {
    return false;
  }
}

function assertPreAuthenticationXsrf(
  request: FastifyRequest,
  cookieName: string,
  tokens: XsrfTokenService,
): void {
  if (
    !tokens.verifyPreAuthenticationToken(
      request.cookies[cookieName],
      headerValue(request, 'x-xsrf-token'),
    )
  ) {
    throw new ForbiddenAuthenticationRequestError();
  }
}

function headerValue(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? undefined : value;
}

export function authenticationCookieNames(secure: boolean): {
  readonly session: string;
  readonly xsrf: string;
} {
  return secure
    ? { session: '__Host-ff_session', xsrf: '__Host-ff_xsrf' }
    : { session: 'ff_session', xsrf: 'ff_xsrf' };
}
