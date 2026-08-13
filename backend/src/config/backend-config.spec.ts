import { describe, expect, it } from 'vitest';

import { BackendConfigurationError, loadBackendConfig } from './backend-config.js';

describe('loadBackendConfig', () => {
  it('provides local development defaults', () => {
    expect(loadBackendConfig({ DATABASE_URL: 'postgresql://localhost/form_farm' })).toEqual({
      environment: 'development',
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
        registrationRateLimit: 5,
        loginRateLimit: 10,
        rateLimitWindowMilliseconds: 900_000,
      },
    });
  });

  it('loads explicit supported values and freezes the result', () => {
    const config = loadBackendConfig({
      NODE_ENV: 'production',
      HOST: '0.0.0.0',
      PORT: '65535',
      LOG_LEVEL: 'warn',
      DATABASE_URL: 'postgresql://db.example/form_farm',
      DATABASE_POOL_MAX: '3',
      PUBLIC_APP_ORIGIN: 'https://forms.example.com',
      AUTH_SECURE_COOKIES: 'true',
      XSRF_HMAC_SECRET: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE',
      RATE_LIMIT_HMAC_SECRET: 'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI',
    });

    expect(config).toEqual({
      environment: 'production',
      host: '0.0.0.0',
      port: 65_535,
      logLevel: 'warn',
      databaseUrl: 'postgresql://db.example/form_farm',
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
      DATABASE_URL: 'postgresql://localhost/form_farm',
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
});
