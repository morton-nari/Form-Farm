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
    });

    expect(config).toEqual({
      environment: 'production',
      host: '0.0.0.0',
      port: 65_535,
      logLevel: 'warn',
      databaseUrl: 'postgresql://db.example/form_farm',
      databasePoolMax: 3,
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
});
