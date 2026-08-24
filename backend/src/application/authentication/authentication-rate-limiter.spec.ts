import { describe, expect, it, vi } from 'vitest';

import type { AuthenticationRateLimitRepository } from '../ports/authentication.js';
import { AuthenticationRateLimiter, RateLimitedError } from './authentication-rate-limiter.js';

describe('AuthenticationRateLimiter', () => {
  it('uses opaque current and previous identifiers during key rotation', async () => {
    const consume = vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 }));
    const repository: AuthenticationRateLimitRepository = { consume };
    const limiter = new AuthenticationRateLimiter(
      repository,
      [{ hash: () => 'a'.repeat(64) }, { hash: () => 'b'.repeat(64) }],
      60_000,
      2_000_000,
      () => 1_000_000,
    );

    await limiter.consume('login-account', 'person@example.com', 5);

    expect(consume).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(consume.mock.calls)).not.toContain('person@example.com');
  });

  it('returns the longest safe retry period when any rotated bucket denies the request', async () => {
    const repository: AuthenticationRateLimitRepository = {
      consume: vi
        .fn()
        .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 7 })
        .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 19 }),
    };
    const limiter = new AuthenticationRateLimiter(
      repository,
      [{ hash: () => 'a'.repeat(64) }, { hash: () => 'b'.repeat(64) }],
      60_000,
      2_000_000,
      () => 1_000_000,
    );

    await expect(limiter.consume('registration-account', 'identifier', 5)).rejects.toMatchObject({
      retryAfterSeconds: 19,
    });
    await expect(Promise.reject(new RateLimitedError(19))).rejects.toBeInstanceOf(RateLimitedError);
  });

  it('stops consulting the previous limiter identity after the bounded overlap', async () => {
    const consume = vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 }));
    const limiter = new AuthenticationRateLimiter(
      { consume },
      [{ hash: () => 'a'.repeat(64) }, { hash: () => 'b'.repeat(64) }],
      60_000,
      999_999,
      () => 1_000_000,
    );

    await limiter.consume('login-account', 'identifier', 5);
    expect(consume).toHaveBeenCalledOnce();
  });
});
