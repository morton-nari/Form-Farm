import { describe, expect, it } from 'vitest';

import { assertDatabaseSeedAllowed } from './seed-policy.js';

describe('assertDatabaseSeedAllowed', () => {
  it('requires explicit development opt-in', () => {
    expect(() => assertDatabaseSeedAllowed({ NODE_ENV: 'development' })).toThrow(
      'ALLOW_DATABASE_SEED',
    );
  });

  it('allows an explicitly opted-in non-production seed', () => {
    expect(() =>
      assertDatabaseSeedAllowed({ NODE_ENV: 'development', ALLOW_DATABASE_SEED: 'true' }),
    ).not.toThrow();
  });

  it('refuses production even when opt-in is set', () => {
    expect(() =>
      assertDatabaseSeedAllowed({ NODE_ENV: 'production', ALLOW_DATABASE_SEED: 'true' }),
    ).toThrow('disabled in production');
  });
});
