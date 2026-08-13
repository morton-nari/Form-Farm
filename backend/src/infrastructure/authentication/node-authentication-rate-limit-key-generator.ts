import { createHmac } from 'node:crypto';

import type { AuthenticationRateLimitKeyGenerator } from '../../application/ports/authentication.js';

export class NodeAuthenticationRateLimitKeyGenerator implements AuthenticationRateLimitKeyGenerator {
  constructor(private readonly secret: Buffer) {
    if (secret.byteLength < 32)
      throw new Error('The rate-limit HMAC key must contain at least 32 bytes.');
  }

  hash(normalizedIdentifier: string): string {
    return createHmac('sha256', this.secret).update(normalizedIdentifier, 'utf8').digest('hex');
  }
}
