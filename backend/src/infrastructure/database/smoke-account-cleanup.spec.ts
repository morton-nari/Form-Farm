import { describe, expect, it, vi } from 'vitest';

import {
  cleanupSmokeAccount,
  requireSmokeAccountEmail,
  type SmokeCleanupDatabase,
} from './smoke-account-cleanup.js';

describe('requireSmokeAccountEmail', () => {
  it('accepts only the reserved pattern with the preview marker', () => {
    expect(
      requireSmokeAccountEmail({
        SMOKE_DATABASE_ENVIRONMENT: 'preview',
        SMOKE_ACCOUNT_EMAIL: 'form-farm-smoke-123-2@example.invalid',
      }),
    ).toBe('form-farm-smoke-123-2@example.invalid');
  });

  it.each([
    {},
    { SMOKE_DATABASE_ENVIRONMENT: 'production', SMOKE_ACCOUNT_EMAIL: 'form-farm-smoke-1-1@example.invalid' },
    { SMOKE_DATABASE_ENVIRONMENT: 'preview', SMOKE_ACCOUNT_EMAIL: 'person@example.com' },
  ])('rejects unsafe cleanup identity input', (environment) => {
    expect(() => requireSmokeAccountEmail(environment)).toThrow();
  });
});

describe('cleanupSmokeAccount', () => {
  it('deletes only the exact ownerless smoke account and its sessions', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'smoke-user-id', normalized_email: 'form-farm-smoke-1-1@example.invalid' }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rowCount: 2, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 3, rows: [] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });

    const result = await cleanupSmokeAccount(
      { query } as unknown as SmokeCleanupDatabase,
      'form-farm-smoke-1-1@example.invalid',
    );

    expect(result).toEqual({ accountDeleted: 1, sessionsDeleted: 2, expiredRateLimitsDeleted: 3 });
    expect(query).toHaveBeenNthCalledWith(
      5,
      'delete from users where id = $1 and normalized_email = $2',
      ['smoke-user-id', 'form-farm-smoke-1-1@example.invalid'],
    );
  });

  it('refuses cleanup when the account owns any form and rolls back', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'smoke-user-id', normalized_email: 'form-farm-smoke-1-1@example.invalid' }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });

    await expect(
      cleanupSmokeAccount(
        { query } as unknown as SmokeCleanupDatabase,
        'form-farm-smoke-1-1@example.invalid',
      ),
    ).rejects.toThrow('refuses');
    expect(query).toHaveBeenLastCalledWith('rollback');
  });
});
