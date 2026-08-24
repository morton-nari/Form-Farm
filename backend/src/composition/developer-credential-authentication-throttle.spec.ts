import { describe, expect, it, vi } from 'vitest';

import { AuthenticationRateLimiter } from '../application/authentication/authentication-rate-limiter.js';
import { DeveloperCredentialAuthenticationThrottleAdapter } from './developer-credential-authentication-throttle.js';

describe('DeveloperCredentialAuthenticationThrottleAdapter', () => {
  it('uses the dedicated scope and delegates identifier hashing to the shared limiter', async () => {
    const limiter = new AuthenticationRateLimiter(
      { consume: async () => ({ allowed: true, retryAfterSeconds: 0 }) },
      [{ hash: (value) => `hashed:${value}` }],
      60_000,
    );
    const consume = vi.spyOn(limiter, 'consume').mockResolvedValue(undefined);
    await new DeveloperCredentialAuthenticationThrottleAdapter(limiter, 20).consume(
      'public-lookup-id',
    );
    expect(consume).toHaveBeenCalledWith(
      'developer-credential-authentication',
      'public-lookup-id',
      20,
    );
  });
});
