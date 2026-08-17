import { describe, expect, it } from 'vitest';

import { BackendConfigurationError, loadBackendConfig } from './backend-config.js';

describe('loadBackendConfig', () => {
  it('provides local development defaults', () => {
    expect(loadBackendConfig({ DATABASE_URL: 'postgresql://localhost/form_farm' })).toEqual({
      environment: 'development',
      deploymentStage: 'development',
      host: '127.0.0.1',
      port: 3000,
      logLevel: 'info',
      databaseUrl: 'postgresql://localhost/form_farm',
      databasePoolMax: 10,
      auth: {
        publicOrigin: 'http://localhost:4200',
        secureCookies: false,
        trustedProxyHops: 0,
        sessionIdleTimeoutMilliseconds: 1_800_000,
        sessionAbsoluteTimeoutMilliseconds: 604_800_000,
        sessionActivityWriteCadenceMilliseconds: 300_000,
        xsrfLifetimeMilliseconds: 600_000,
        xsrfCurrentSecret: 'development-only-xsrf-secret-change-me',
        xsrfPreviousSecret: undefined,
        rateLimitCurrentSecret: 'development-only-rate-secret-change-me',
        rateLimitPreviousSecret: undefined,
        previousSecretValidUntilMilliseconds: undefined,
        registrationRateLimit: 5,
        loginRateLimit: 10,
        rateLimitWindowMilliseconds: 900_000,
      },
    });
  });

  it('loads explicit supported values and freezes the result', () => {
    const config = loadBackendConfig({
      NODE_ENV: 'production',
      APP_ENV: 'production',
      HOST: '0.0.0.0',
      PORT: '65535',
      LOG_LEVEL: 'warn',
      DATABASE_URL:
        'postgresql://app@example-pooler.us-east-2.aws.neon.tech/form_farm?sslmode=require',
      DATABASE_ENVIRONMENT: 'production',
      AUTH_SECRET_ENVIRONMENT: 'production',
      DATABASE_POOL_MAX: '3',
      PUBLIC_APP_ORIGIN: 'https://forms.example.com',
      AUTH_SECURE_COOKIES: 'true',
      XSRF_HMAC_SECRET: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE',
      RATE_LIMIT_HMAC_SECRET: 'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI',
    });

    expect(config).toEqual({
      environment: 'production',
      deploymentStage: 'production',
      host: '0.0.0.0',
      port: 65_535,
      logLevel: 'warn',
      databaseUrl:
        'postgresql://app@example-pooler.us-east-2.aws.neon.tech/form_farm?sslmode=require',
      databasePoolMax: 3,
      auth: {
        publicOrigin: 'https://forms.example.com',
        secureCookies: true,
        trustedProxyHops: 0,
        sessionIdleTimeoutMilliseconds: 1_800_000,
        sessionAbsoluteTimeoutMilliseconds: 604_800_000,
        sessionActivityWriteCadenceMilliseconds: 300_000,
        xsrfLifetimeMilliseconds: 600_000,
        xsrfCurrentSecret: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE',
        xsrfPreviousSecret: undefined,
        rateLimitCurrentSecret: 'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI',
        rateLimitPreviousSecret: undefined,
        previousSecretValidUntilMilliseconds: undefined,
        registrationRateLimit: 5,
        loginRateLimit: 10,
        rateLimitWindowMilliseconds: 900_000,
      },
    });
    expect(Object.isFrozen(config)).toBe(true);
  });

  it.each(['0', '65536', '3000x', '-1', ''])(
    'rejects invalid ports without coercion: %j',
    (port) => {
      expect(() =>
        loadBackendConfig({ PORT: port, DATABASE_URL: 'postgresql://localhost/form_farm' }),
      ).toThrow(BackendConfigurationError);
    },
  );

  it('reports only invalid field names and does not expose configuration values', () => {
    const secretLikeValue = 'not-a-real-secret-value';

    try {
      loadBackendConfig({
        NODE_ENV: secretLikeValue,
        HOST: ' ',
        LOG_LEVEL: 'verbose',
        DATABASE_URL: secretLikeValue,
      });
      expect.fail('Expected configuration loading to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(BackendConfigurationError);
      expect((error as BackendConfigurationError).fields).toEqual([
        'environment',
        'host',
        'logLevel',
        'databaseUrl',
      ]);
      expect((error as Error).message).not.toContain(secretLikeValue);
      expect(error).not.toHaveProperty('issues');
    }
  });

  it('rejects insecure production cookies, non-origin URLs, weak or reused secrets, and invalid cadence', () => {
    const production = {
      NODE_ENV: 'production',
      APP_ENV: 'production',
      DATABASE_URL:
        'postgresql://app@example-pooler.us-east-2.aws.neon.tech/form_farm?sslmode=require',
      DATABASE_POOL_MAX: '1',
      DATABASE_ENVIRONMENT: 'production',
      AUTH_SECRET_ENVIRONMENT: 'production',
      PUBLIC_APP_ORIGIN: 'http://forms.example.com/path',
      AUTH_SECURE_COOKIES: 'false',
      XSRF_HMAC_SECRET: 'same-secret-that-is-at-least-thirty-two-bytes',
      RATE_LIMIT_HMAC_SECRET: 'same-secret-that-is-at-least-thirty-two-bytes',
      SESSION_IDLE_TIMEOUT_MS: '1000',
      SESSION_ACTIVITY_CADENCE_MS: '1000',
    };

    expect(() => loadBackendConfig(production)).toThrow(BackendConfigurationError);
    expect(() =>
      loadBackendConfig({
        DATABASE_URL: 'postgresql://localhost/form_farm',
        PUBLIC_APP_ORIGIN: 'http://non-loopback.example',
        AUTH_SECURE_COOKIES: 'false',
      }),
    ).toThrow(BackendConfigurationError);
  });

  it('requires explicit isolated hosted configuration and a Neon pooled application URL', () => {
    const hosted = {
      NODE_ENV: 'production',
      APP_ENV: 'preview',
      DATABASE_URL:
        'postgresql://app@example-pooler.us-east-2.aws.neon.tech/form_farm_preview?sslmode=require',
      DATABASE_POOL_MAX: '1',
      DATABASE_ENVIRONMENT: 'preview',
      AUTH_SECRET_ENVIRONMENT: 'preview',
      PUBLIC_APP_ORIGIN: 'https://preview.example.com',
      AUTH_SECURE_COOKIES: 'true',
      XSRF_HMAC_SECRET: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE',
      RATE_LIMIT_HMAC_SECRET: 'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI',
    };

    expect(loadBackendConfig(hosted).databasePoolMax).toBe(1);
    expect(() => loadBackendConfig({ ...hosted, DATABASE_POOL_MAX: undefined })).toThrow(
      BackendConfigurationError,
    );
    expect(() => loadBackendConfig({ ...hosted, DATABASE_ENVIRONMENT: 'production' })).toThrow(
      BackendConfigurationError,
    );
    expect(() => loadBackendConfig({ ...hosted, AUTH_SECRET_ENVIRONMENT: 'production' })).toThrow(
      BackendConfigurationError,
    );
    expect(() =>
      loadBackendConfig({
        ...hosted,
        DATABASE_URL: 'postgresql://app@example.us-east-2.aws.neon.tech/form_farm?sslmode=require',
      }),
    ).toThrow(BackendConfigurationError);
  });

  it('cross-checks Vercel-owned stage and exact deployment origin', () => {
    const preview = {
      NODE_ENV: 'production',
      APP_ENV: 'preview',
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      VERCEL_URL: 'form-farm-preview.vercel.app',
      DATABASE_URL:
        'postgresql://app@example-pooler.us-east-2.aws.neon.tech/form_farm_preview?sslmode=require',
      DATABASE_POOL_MAX: '1',
      DATABASE_ENVIRONMENT: 'preview',
      AUTH_SECRET_ENVIRONMENT: 'preview',
      PUBLIC_APP_ORIGIN: 'https://form-farm-preview.vercel.app',
      AUTH_SECURE_COOKIES: 'true',
      XSRF_HMAC_SECRET: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE',
      RATE_LIMIT_HMAC_SECRET: 'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI',
    };

    expect(loadBackendConfig(preview).deploymentStage).toBe('preview');
    expect(() => loadBackendConfig({ ...preview, VERCEL_ENV: 'production' })).toThrow(
      BackendConfigurationError,
    );
    expect(() =>
      loadBackendConfig({ ...preview, PUBLIC_APP_ORIGIN: 'https://production.example.com' }),
    ).toThrow(BackendConfigurationError);
    expect(() =>
      loadBackendConfig({ DATABASE_URL: 'postgresql://localhost/form_farm', VERCEL: '1' }),
    ).toThrow(BackendConfigurationError);
  });

  it('requires a bounded future deadline whenever previous auth secrets are configured', () => {
    const base = {
      DATABASE_URL: 'postgresql://localhost/form_farm',
      XSRF_PREVIOUS_HMAC_SECRET: 'previous-xsrf-secret-that-is-at-least-32-bytes',
    };
    expect(() => loadBackendConfig(base)).toThrow(BackendConfigurationError);
    expect(() =>
      loadBackendConfig({
        ...base,
        AUTH_PREVIOUS_SECRET_VALID_UNTIL: new Date(Date.now() + 25 * 60 * 60_000).toISOString(),
      }),
    ).toThrow(BackendConfigurationError);

    const validUntil = Date.now() + 60 * 60_000;
    expect(
      loadBackendConfig({
        ...base,
        AUTH_PREVIOUS_SECRET_VALID_UNTIL: new Date(validUntil).toISOString(),
      }).auth.previousSecretValidUntilMilliseconds,
    ).toBe(validUntil);
  });
});
