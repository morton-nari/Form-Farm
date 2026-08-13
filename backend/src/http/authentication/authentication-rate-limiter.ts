import type {
  AuthenticationRateLimitKeyGenerator,
  AuthenticationRateLimitRepository,
  AuthenticationRateLimitScope,
} from '../../application/ports/authentication.js';

export class RateLimitedError extends Error {
  override readonly name = 'RateLimitedError';

  constructor(readonly retryAfterSeconds: number) {
    super('Too many authentication attempts.');
  }
}

export class AuthenticationRateLimiter {
  constructor(
    private readonly repository: AuthenticationRateLimitRepository,
    private readonly keyGenerators: readonly AuthenticationRateLimitKeyGenerator[],
    private readonly windowMilliseconds: number,
    private readonly previousKeyValidUntilMilliseconds: number | undefined = undefined,
    private readonly now: () => number = Date.now,
  ) {}

  async consume(
    scope: AuthenticationRateLimitScope,
    identifier: string,
    limit: number,
  ): Promise<void> {
    if (this.keyGenerators.length === 0) {
      throw new Error('Authentication rate limiting is not configured.');
    }
    let retryAfterSeconds = 0;
    const activeGenerators = this.keyGenerators.filter(
      (_generator, index) =>
        index === 0 ||
        (this.previousKeyValidUntilMilliseconds !== undefined &&
          this.now() < this.previousKeyValidUntilMilliseconds),
    );
    for (const generator of activeGenerators) {
      const result = await this.repository.consume({
        scope,
        keyHash: generator.hash(identifier),
        windowMilliseconds: this.windowMilliseconds,
        limit,
      });
      if (!result.allowed)
        retryAfterSeconds = Math.max(retryAfterSeconds, result.retryAfterSeconds);
    }
    if (retryAfterSeconds > 0) throw new RateLimitedError(retryAfterSeconds);
  }
}
