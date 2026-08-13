import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';

import { createApplication, type AuthenticationApplicationServices } from '../../app.js';
import { InvalidCredentialsError } from '../../application/authentication/login.js';
import type { AuthenticationRateLimitRepository } from '../../application/ports/authentication.js';
import type { BackendConfig } from '../../config/backend-config.js';
import { AuthenticationRateLimiter } from '../authentication/authentication-rate-limiter.js';
import { XsrfTokenService } from '../authentication/xsrf-token-service.js';
import { SeededFormDefinitionSource } from '../../infrastructure/forms/seeded-form-definition-source.js';

const applications: FastifyInstance[] = [];
const publicOrigin = 'http://localhost:4200';

afterEach(async () => {
  await Promise.all(applications.splice(0).map((app) => app.close()));
});

describe('authentication HTTP boundary', () => {
  it('issues a readable pre-authentication XSRF cookie with no-store caching', async () => {
    const response = await testApplication().inject({ method: 'GET', url: '/api/v1/auth/xsrf' });

    expect(response.statusCode).toBe(204);
    expect(response.headers['cache-control']).toBe('no-store');
    const cookie = setCookies(response.headers['set-cookie'])[0];
    expect(cookie).toMatch(/^ff_xsrf=/);
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).not.toContain('HttpOnly');
    expect(cookie).not.toContain('Secure');
    expect(cookie).not.toContain('Domain=');
  });

  it('rejects missing, wrong-origin, cross-site, non-JSON, and mismatched XSRF requests', async () => {
    const app = testApplication();
    const xsrf = await bootstrapXsrf(app);
    const base = {
      method: 'POST' as const,
      url: '/api/v1/auth/register',
      payload: { email: 'person@example.com', password: 'a sufficiently long password' },
    };

    for (const headers of [
      {},
      xsrfHeaders(xsrf, 'https://attacker.example'),
      { ...xsrfHeaders(xsrf), 'sec-fetch-site': 'cross-site' },
      { ...xsrfHeaders(xsrf), 'x-xsrf-token': `${xsrf.token}tampered` },
      {
        cookie: `ff_xsrf=${xsrf.token}`,
        origin: publicOrigin,
        'x-xsrf-token': xsrf.token,
        'content-type': 'text/plain',
      },
      {
        cookie: `ff_xsrf=${xsrf.token}`,
        origin: publicOrigin,
        'x-xsrf-token': xsrf.token,
        'content-type': 'application/json-malformed',
      },
    ]) {
      const response = await app.inject({ ...base, headers });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        error: { code: 'forbidden', message: 'The request is forbidden.' },
      });
    }
  });

  it('returns enumeration-safe registration and login contracts', async () => {
    const registerAccount = { execute: vi.fn(async () => undefined) };
    const app = testApplication({ registerAccount });
    const registrationXsrf = await bootstrapXsrf(app);
    const registration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: xsrfHeaders(registrationXsrf),
      payload: { email: ' Person@Example.COM ', password: 'a sufficiently long password' },
    });
    expect(registration.statusCode).toBe(202);
    expect(registration.json()).toEqual({ accepted: true });
    expect(registration.headers['cache-control']).toBe('no-store');
    expect(registerAccount.execute).toHaveBeenCalledOnce();

    const invalidApp = testApplication({
      login: { execute: async () => Promise.reject(new InvalidCredentialsError()) },
    });
    const loginXsrf = await bootstrapXsrf(invalidApp);
    const login = await invalidApp.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: xsrfHeaders(loginXsrf),
      payload: { email: 'missing@example.com', password: 'wrong but sufficiently long' },
    });
    expect(login.statusCode).toBe(401);
    expect(login.json()).toEqual({
      error: { code: 'invalid_credentials', message: 'The email or password is incorrect.' },
    });
  });

  it('sets production host-only cookies and resolves then idempotently logs out', async () => {
    const logout = { execute: vi.fn(async () => undefined) };
    const app = testApplication(
      {
        login: { execute: async () => ({ sessionCredential: 'opaque-session-credential' }) },
        resolveSession: asyncResolver({ userId: 'user-id' }),
        logout,
      },
      { secureCookies: true, publicOrigin: 'https://forms.example.com' },
    );
    const preAuth = await bootstrapXsrf(app);
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: xsrfHeaders(preAuth, 'https://forms.example.com'),
      payload: { email: 'person@example.com', password: 'a sufficiently long password' },
    });
    expect(login.statusCode).toBe(200);
    const cookies = setCookies(login.headers['set-cookie']);
    const sessionCookie = cookies.find((cookie) => cookie.startsWith('__Host-ff_session='))!;
    const xsrfCookie = cookies.find((cookie) => cookie.startsWith('__Host-ff_xsrf='))!;
    expect(sessionCookie).toContain('Secure');
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('SameSite=Lax');
    expect(sessionCookie).not.toContain('Domain=');
    expect(xsrfCookie).toContain('Secure');
    expect(xsrfCookie).not.toContain('HttpOnly');

    const session = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: { cookie: '__Host-ff_session=opaque-session-credential' },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json()).toEqual({ authenticated: true });

    const xsrfValue = cookieValue(xsrfCookie);
    const logoutResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        cookie: `__Host-ff_session=opaque-session-credential; __Host-ff_xsrf=${xsrfValue}`,
        origin: 'https://forms.example.com',
        'x-xsrf-token': xsrfValue,
      },
      payload: {},
    });
    expect(logoutResponse.statusCode).toBe(204);
    expect(logout.execute).toHaveBeenCalledWith('opaque-session-credential');
    expect(setCookies(logoutResponse.headers['set-cookie']).join(';')).toContain('Max-Age=0');
  });

  it('returns safe unauthenticated and throttled responses with Retry-After', async () => {
    const app = testApplication({ resolveSession: asyncResolver(undefined) });
    const session = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: { cookie: 'ff_session=expired-token' },
    });
    expect(session.statusCode).toBe(401);
    expect(session.json()).toEqual({
      error: { code: 'unauthenticated', message: 'Authentication is required.' },
    });

    const limited = testApplication({}, {}, { allowed: false, retryAfterSeconds: 17 });
    const xsrf = await bootstrapXsrf(limited);
    const response = await limited.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: xsrfHeaders(xsrf),
      payload: { email: 'person@example.com', password: 'a sufficiently long password' },
    });
    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBe('17');
    expect(response.body).not.toContain('person@example.com');
  });

  it('uses forwarded client identity only when an exact trusted-proxy hop is configured', async () => {
    const identifiers: string[] = [];
    const app = testApplication({}, { trustedProxyHops: 1 }, undefined, identifiers);
    const xsrf = await bootstrapXsrf(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      remoteAddress: '127.0.0.1',
      headers: { ...xsrfHeaders(xsrf), 'x-forwarded-for': '203.0.113.10' },
      payload: { email: ' Person@Example.COM ', password: 'a sufficiently long password' },
    });

    expect(response.statusCode).toBe(200);
    expect(identifiers).toEqual(['203.0.113.10', 'person@example.com']);

    const untrustedIdentifiers: string[] = [];
    const directApp = testApplication({}, { trustedProxyHops: 0 }, undefined, untrustedIdentifiers);
    const directXsrf = await bootstrapXsrf(directApp);
    await directApp.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      remoteAddress: '127.0.0.1',
      headers: { ...xsrfHeaders(directXsrf), 'x-forwarded-for': '198.51.100.20' },
      payload: { email: 'person@example.com', password: 'a sufficiently long password' },
    });
    expect(untrustedIdentifiers[0]).toBe('127.0.0.1');
  });

  it('logs only a safe category for unexpected authentication failures', async () => {
    const errorLog = vi.fn();
    const logger = testLogger(errorLog);
    const secret = 'person@example.com with submitted-password-value';
    const app = testApplication(
      { registerAccount: { execute: async () => Promise.reject(new Error(secret)) } },
      {},
      undefined,
      [],
      logger,
    );
    const xsrf = await bootstrapXsrf(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: xsrfHeaders(xsrf),
      payload: { email: 'person@example.com', password: 'submitted-password-value' },
    });

    expect(response.statusCode).toBe(500);
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(secret);
    expect(errorLog).toHaveBeenCalledWith(
      { errorName: 'Error' },
      'Unhandled authentication request error',
    );
  });
});

function testApplication(
  overrides: Partial<AuthenticationApplicationServices> = {},
  authOverrides: Partial<BackendConfig['auth']> = {},
  rateResult: { allowed: boolean; retryAfterSeconds: number } = {
    allowed: true,
    retryAfterSeconds: 0,
  },
  observedIdentifiers: string[] = [],
  loggerInstance?: FastifyBaseLogger,
): FastifyInstance {
  const rateRepository: AuthenticationRateLimitRepository = {
    consume: async () => rateResult,
  };
  const auth = {
    publicOrigin,
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
    ...authOverrides,
  };
  const authentication: AuthenticationApplicationServices = {
    registerAccount: { execute: async () => undefined },
    login: { execute: async () => ({ sessionCredential: 'opaque-session-credential' }) },
    logout: { execute: async () => undefined },
    resolveSession: asyncResolver({ userId: 'user-id' }),
    rateLimiter: new AuthenticationRateLimiter(
      rateRepository,
      [
        {
          hash: (value) => {
            observedIdentifiers.push(value);
            return value;
          },
        },
      ],
      auth.rateLimitWindowMilliseconds,
    ),
    xsrfTokens: new XsrfTokenService(
      auth.xsrfCurrentSecret,
      auth.xsrfPreviousSecret,
      auth.xsrfLifetimeMilliseconds,
    ),
    ...overrides,
  };
  const app = createApplication({
    config: {
      environment: 'test',
      host: '127.0.0.1',
      port: 3000,
      logLevel: 'silent',
      databaseUrl: 'postgresql://localhost/test',
      databasePoolMax: 1,
      auth,
    },
    formDefinitionSource: new SeededFormDefinitionSource(),
    formSubmissionTransaction: { execute: async () => ({ status: 'created', submissionId: 'id' }) },
    authentication,
    ...(loggerInstance ? { loggerInstance } : {}),
  });
  applications.push(app);
  return app;
}

function testLogger(error: ReturnType<typeof vi.fn>): FastifyBaseLogger {
  const logger = {
    level: 'info',
    fatal: vi.fn(),
    error,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    silent: vi.fn(),
    child: () => logger,
  };
  return logger as unknown as FastifyBaseLogger;
}

function asyncResolver(
  result: { readonly userId: string } | undefined,
): AuthenticationApplicationServices['resolveSession'] {
  return { execute: async () => result };
}

async function bootstrapXsrf(app: FastifyInstance): Promise<{ cookie: string; token: string }> {
  const response = await app.inject({ method: 'GET', url: '/api/v1/auth/xsrf' });
  const cookie = setCookies(response.headers['set-cookie'])[0]!;
  return { cookie: cookie.split(';')[0], token: cookieValue(cookie) };
}

function xsrfHeaders(xsrf: { cookie: string; token: string }, origin = publicOrigin) {
  return { cookie: xsrf.cookie, origin, 'x-xsrf-token': xsrf.token };
}

function setCookies(value: string | string[] | undefined): string[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function cookieValue(cookie: string): string {
  return cookie.slice(cookie.indexOf('=') + 1, cookie.indexOf(';'));
}
