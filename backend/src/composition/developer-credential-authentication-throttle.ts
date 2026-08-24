import type { DeveloperCredentialAuthenticationThrottle } from '../application/ports/developer-credentials.js';
import { AuthenticationRateLimiter } from '../application/authentication/authentication-rate-limiter.js';

export class DeveloperCredentialAuthenticationThrottleAdapter implements DeveloperCredentialAuthenticationThrottle {
  constructor(
    private readonly rateLimiter: AuthenticationRateLimiter,
    private readonly limit: number,
  ) {}

  consume(identifier: string): Promise<void> {
    return this.rateLimiter.consume('developer-credential-authentication', identifier, this.limit);
  }
}
