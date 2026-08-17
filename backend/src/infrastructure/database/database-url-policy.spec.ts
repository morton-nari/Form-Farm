import { describe, expect, it } from 'vitest';

import { requireDirectDatabaseAdminUrl } from './database-url-policy.js';

describe('requireDirectDatabaseAdminUrl', () => {
  it('accepts a direct PostgreSQL administrative URL', () => {
    const value = 'postgresql://admin@example.us-east-2.aws.neon.tech/form_farm?sslmode=require';
    expect(requireDirectDatabaseAdminUrl({ DATABASE_ADMIN_URL: value })).toBe(value);
  });

  it.each([
    {},
    { DATABASE_ADMIN_URL: 'not-a-url' },
    { DATABASE_ADMIN_URL: 'https://example.com/database' },
    {
      DATABASE_ADMIN_URL:
        'postgresql://admin@example-pooler.us-east-2.aws.neon.tech/form_farm?sslmode=require',
    },
  ])(
    'rejects missing, malformed, non-PostgreSQL, or pooled tooling configuration',
    (environment) => {
      expect(() => requireDirectDatabaseAdminUrl(environment)).toThrowError(/DATABASE_ADMIN_URL/);
    },
  );
});
