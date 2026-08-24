import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { createApplication } from '../../app.js';
import { createAuthenticationServices } from '../../composition/create-authentication-services.js';
import type { BackendConfig } from '../../config/backend-config.js';
import { createDatabase } from '../../infrastructure/database/create-database.js';
import { SeededFormDefinitionSource } from '../../infrastructure/forms/seeded-form-definition-source.js';

describe('authentication HTTP boundary with PostgreSQL', () => {
  let container: StartedTestContainer;
  let pool: Pool;
  let app: FastifyInstance;

  beforeAll(async () => {
    container = await new GenericContainer('postgres:18-alpine')
      .withEnvironment({
        POSTGRES_USER: 'form_farm',
        POSTGRES_PASSWORD: 'form_farm_test',
        POSTGRES_DB: 'form_farm_test',
      })
      .withExposedPorts(5432)
      .withWaitStrategy(
        Wait.forLogMessage('database system is ready to accept connections', 2).withStartupTimeout(
          60_000,
        ),
      )
      .start();
    const databaseUrl = `postgresql://form_farm:form_farm_test@${container.getHost()}:${container.getMappedPort(5432)}/form_farm_test`;
    pool = new Pool({ connectionString: databaseUrl });
    for (const migrationName of [
      '0000_initial_form_read.sql',
      '0001_versioned_form_submissions.sql',
      '0002_authentication_ownership_core.sql',
    ]) {
      const migration = await readFile(
        fileURLToPath(new URL(`../../../drizzle/${migrationName}`, import.meta.url)),
        'utf8',
      );
      await pool.query(migration);
    }
    const config = testConfig(databaseUrl);
    const database = createDatabase(config);
    app = createApplication({
      config,
      formDefinitionSource: new SeededFormDefinitionSource(),
      formSubmissionTransaction: {
        execute: async () => ({ status: 'created', submissionId: 'unused' }),
      },
      authentication: createAuthenticationServices(
        database.database,
        config.auth,
        config.deploymentStage,
      ),
      closeInfrastructure: database.close,
    });
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await container?.stop();
  });

  it('registers, logs in, resolves, and revokes a hashed opaque session', async () => {
    const bootstrap = await app.inject({ method: 'GET', url: '/api/v1/auth/xsrf' });
    const preAuthCookie = setCookies(bootstrap.headers['set-cookie'])[0]!.split(';')[0];
    const preAuthToken = preAuthCookie.slice(preAuthCookie.indexOf('=') + 1);
    const unsafeHeaders = {
      cookie: preAuthCookie,
      origin: 'http://localhost:4200',
      'x-xsrf-token': preAuthToken,
    };
    const credentials = {
      email: 'integration@example.com',
      password: 'an exact integration password',
    };

    const registration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: unsafeHeaders,
      payload: credentials,
    });
    expect(registration.statusCode).toBe(202);

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: unsafeHeaders,
      payload: credentials,
    });
    expect(login.statusCode).toBe(200);
    const cookies = setCookies(login.headers['set-cookie']);
    const sessionCookie = cookies.find((value) => value.startsWith('ff_session='))!.split(';')[0];
    const sessionCredential = sessionCookie.slice(sessionCookie.indexOf('=') + 1);
    const xsrfCookie = cookies.find((value) => value.startsWith('ff_xsrf='))!.split(';')[0];
    const xsrfToken = xsrfCookie.slice(xsrfCookie.indexOf('=') + 1);

    const stored = await pool.query<{ token_hash: string }>(`select token_hash from user_sessions`);
    expect(stored.rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.rows[0].token_hash).not.toBe(sessionCredential);

    const session = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: { cookie: sessionCookie },
    });
    expect(session.statusCode).toBe(200);

    const logout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        cookie: `${sessionCookie}; ${xsrfCookie}`,
        origin: 'http://localhost:4200',
        'x-xsrf-token': xsrfToken,
      },
      payload: {},
    });
    expect(logout.statusCode).toBe(204);
    await expect(
      pool.query(`select revoked_at is not null as revoked from user_sessions`),
    ).resolves.toMatchObject({
      rows: [{ revoked: true }],
    });
  });
});

function testConfig(databaseUrl: string): BackendConfig {
  return {
    environment: 'test',
    host: '127.0.0.1',
    port: 3000,
    logLevel: 'silent',
    databaseUrl,
    databasePoolMax: 4,
    auth: {
      publicOrigin: 'http://localhost:4200',
      secureCookies: false,
      trustedProxyHops: 0,
      sessionIdleTimeoutMilliseconds: 30 * 60_000,
      sessionAbsoluteTimeoutMilliseconds: 7 * 24 * 60 * 60_000,
      sessionActivityWriteCadenceMilliseconds: 5 * 60_000,
      xsrfLifetimeMilliseconds: 10 * 60_000,
      xsrfCurrentSecret: 'integration-xsrf-secret-that-is-at-least-32-bytes',
      rateLimitCurrentSecret: 'integration-rate-secret-that-is-at-least-32-bytes',
      registrationRateLimit: 5,
      loginRateLimit: 10,
      rateLimitWindowMilliseconds: 15 * 60_000,
    },
  };
}

function setCookies(value: string | string[] | undefined): string[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}
