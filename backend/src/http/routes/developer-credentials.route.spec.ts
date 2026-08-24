import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ConfirmAndIssueDeveloperCredential,
  IssueDeveloperCredential,
  ListDeveloperCredentials,
  RevokeDeveloperCredential,
} from '../../application/authentication/developer-credentials.js';
import type { DeveloperCredentialRepository } from '../../application/ports/developer-credentials.js';
import { registerErrorHandler } from '../errors/register-error-handler.js';
import { AuthenticationRateLimiter } from '../authentication/authentication-rate-limiter.js';
import { XsrfTokenService } from '../authentication/xsrf-token-service.js';
import { registerDeveloperCredentialRoutes } from './developer-credentials.route.js';

describe('developer credential management routes', () => {
  const applications: FastifyInstance[] = [];
  afterEach(async () => Promise.all(applications.splice(0).map((app) => app.close())));

  it('issues once through authenticated Origin/XSRF/password boundaries with no-store output', async () => {
    const context = await testApplication();
    const xsrf = context.xsrf.issueSessionToken('browser-session');
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/v1/management/developer-credentials',
      headers: protectedHeaders(xsrf),
      payload: { displayName: 'Local IDE', expiresInDays: 7, currentPassword: 'password' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toEqual({
      ...issuedCredential(),
      createdAt: '2026-08-24T00:00:00.000Z',
      expiresAt: '2026-08-31T00:00:00.000Z',
    });
    expect(context.consume).toHaveBeenNthCalledWith(
      1,
      'developer-credential-source',
      '127.0.0.1',
      10,
    );
    expect(context.consume).toHaveBeenNthCalledWith(2, 'developer-credential-actor', 'owner-1', 10);
    expect(context.issue).toHaveBeenCalledOnce();
    const revalidate = context.issue.mock.calls[0]![2];
    await expect(revalidate()).resolves.toEqual({ userId: 'owner-1' });
  });

  it.each([
    ['wrong Origin', { origin: 'https://attacker.example' }],
    ['missing XSRF header', { 'x-xsrf-token': undefined }],
    ['wrong XSRF header', { 'x-xsrf-token': 'wrong' }],
  ])('rejects %s before issuance', async (_scenario, override) => {
    const context = await testApplication();
    const xsrf = context.xsrf.issueSessionToken('browser-session');
    const headers: Record<string, string> = { ...protectedHeaders(xsrf) };
    for (const [name, value] of Object.entries(override)) {
      if (value === undefined) delete headers[name];
      else headers[name] = value;
    }
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/v1/management/developer-credentials',
      headers,
      payload: { displayName: 'Local IDE', expiresInDays: 7, currentPassword: 'password' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.body).not.toContain('password');
    expect(context.issue).not.toHaveBeenCalled();
  });

  it('lists safe metadata and revokes idempotently through the owner boundary', async () => {
    const context = await testApplication();
    const listed = await context.app.inject({
      method: 'GET',
      url: '/api/v1/management/developer-credentials',
      headers: { cookie: 'ff_session=browser-session' },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.headers['cache-control']).toBe('no-store');
    expect(listed.body).not.toContain('secretHash');

    const xsrf = context.xsrf.issueSessionToken('browser-session');
    const revoked = await context.app.inject({
      method: 'DELETE',
      url: `/api/v1/management/developer-credentials/${credentialId}`,
      headers: protectedHeaders(xsrf),
      payload: {},
    });
    expect(revoked.statusCode).toBe(204);
    expect(context.revoke).toHaveBeenCalledWith({ userId: 'owner-1' }, credentialId);
  });

  async function testApplication() {
    const app = Fastify({ logger: false });
    applications.push(app);
    registerErrorHandler(app);
    await app.register(fastifyCookie);
    const xsrf = new XsrfTokenService('x'.repeat(32), undefined, undefined, 600_000);
    const repository = credentialRepository();
    const issueUseCase = new ConfirmAndIssueDeveloperCredential(
      {
        hash: async () => '',
        verify: async () => true,
        needsRehash: () => false,
        dummyHash: 'dummy',
      },
      { findActivePasswordHash: async () => 'hash' },
      new IssueDeveloperCredential(
        {
          generate: () => ({
            publicId: credentialId,
            credential: rawCredential,
            secretVerifier: 'a'.repeat(64),
          }),
          parse: () => undefined,
          verifierMatches: () => false,
        },
        repository,
      ),
    );
    const issue = vi.spyOn(issueUseCase, 'execute').mockResolvedValue(issuedCredential());
    const listUseCase = new ListDeveloperCredentials(repository);
    vi.spyOn(listUseCase, 'execute').mockResolvedValue([metadata()]);
    const revokeUseCase = new RevokeDeveloperCredential(repository);
    const revoke = vi.spyOn(revokeUseCase, 'execute').mockResolvedValue(undefined);
    const limiter = new AuthenticationRateLimiter(
      { consume: async () => ({ allowed: true, retryAfterSeconds: 0 }) },
      [{ hash: (value) => `hash:${value}` }],
      900_000,
    );
    const consume = vi.spyOn(limiter, 'consume');
    await app.register(registerDeveloperCredentialRoutes, {
      config: {
        publicOrigin: 'http://localhost:4200',
        secureCookies: false,
        trustedProxyHops: 0,
        sessionIdleTimeoutMilliseconds: 1,
        sessionAbsoluteTimeoutMilliseconds: 2,
        sessionActivityWriteCadenceMilliseconds: 1,
        xsrfLifetimeMilliseconds: 600_000,
        xsrfCurrentSecret: 'x'.repeat(32),
        rateLimitCurrentSecret: 'r'.repeat(32),
        registrationRateLimit: 5,
        loginRateLimit: 10,
        rateLimitWindowMilliseconds: 900_000,
      },
      resolveSession: {
        execute: async (credential) =>
          credential === 'browser-session' ? { userId: 'owner-1' } : undefined,
      },
      rateLimiter: limiter,
      xsrfTokens: xsrf,
      issueDeveloperCredential: issueUseCase,
      listDeveloperCredentials: listUseCase,
      revokeDeveloperCredential: revokeUseCase,
    });
    await app.ready();
    return { app, xsrf, consume, issue, revoke };
  }
});

const credentialId = '123e4567-e89b-42d3-a456-426614174000';
const rawCredential = `ffmcp_v1.${credentialId}.${'A'.repeat(43)}`;

function protectedHeaders(xsrf: string) {
  return {
    cookie: `ff_session=browser-session; ff_xsrf=${xsrf}`,
    origin: 'http://localhost:4200',
    'x-xsrf-token': xsrf,
  };
}

function metadata() {
  return {
    publicId: credentialId,
    displayName: 'Local IDE',
    scope: 'form-intelligence:read' as const,
    environment: 'development' as const,
    createdAt: new Date('2026-08-24T00:00:00.000Z'),
    expiresAt: new Date('2026-08-31T00:00:00.000Z'),
    revokedAt: null,
    lastUsedAt: null,
  };
}

function issuedCredential() {
  return { ...metadata(), credential: rawCredential };
}

function credentialRepository(): DeveloperCredentialRepository {
  return {
    issue: async () => ({ status: 'created', credential: metadata() }),
    listForOwner: async () => [metadata()],
    revokeForOwner: async () => undefined,
    deleteTerminal: async () => 0,
  };
}
