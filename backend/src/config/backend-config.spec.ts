import { describe, expect, it } from 'vitest';

import { BackendConfigurationError, loadBackendConfig } from './backend-config.js';

describe('loadBackendConfig', () => {
  it('provides local development defaults', () => {
    expect(loadBackendConfig({})).toEqual({
      environment: 'development',
      host: '127.0.0.1',
      port: 3000,
      logLevel: 'info',
    });
  });

  it('loads explicit supported values and freezes the result', () => {
    const config = loadBackendConfig({
      NODE_ENV: 'production',
      HOST: '0.0.0.0',
      PORT: '65535',
      LOG_LEVEL: 'warn',
    });

    expect(config).toEqual({
      environment: 'production',
      host: '0.0.0.0',
      port: 65_535,
      logLevel: 'warn',
    });
    expect(Object.isFrozen(config)).toBe(true);
  });

  it.each(['0', '65536', '3000x', '-1', ''])('rejects invalid ports without coercion: %j', (port) => {
    expect(() => loadBackendConfig({ PORT: port })).toThrow(BackendConfigurationError);
  });

  it('reports only invalid field names and does not expose configuration values', () => {
    const secretLikeValue = 'not-a-real-secret-value';

    try {
      loadBackendConfig({ NODE_ENV: secretLikeValue, HOST: ' ', LOG_LEVEL: 'verbose' });
      expect.fail('Expected configuration loading to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(BackendConfigurationError);
      expect((error as BackendConfigurationError).fields).toEqual([
        'environment',
        'host',
        'logLevel',
      ]);
      expect((error as Error).message).not.toContain(secretLikeValue);
      expect(error).not.toHaveProperty('issues');
    }
  });
});
