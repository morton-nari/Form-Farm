import { describe, expect, it } from 'vitest';

import { NodeAuthenticationRateLimitKeyGenerator } from './node-authentication-rate-limit-key-generator.js';
import { NodeSessionCredentialGenerator } from './node-session-credential-generator.js';

describe('authentication cryptography adapters', () => {
  it('generates opaque high-entropy session credentials and stable lookup hashes', () => {
    const generator = new NodeSessionCredentialGenerator();
    const first = generator.generate();
    const second = generator.generate();
    expect(first.credential).toHaveLength(43);
    expect(first.credential).not.toBe(second.credential);
    expect(first.credentialHash).toBe(generator.hash(first.credential));
    expect(first.credentialHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('uses an independent secret for opaque account limiter identities', () => {
    const first = new NodeAuthenticationRateLimitKeyGenerator(Buffer.alloc(32, 1));
    const rotated = new NodeAuthenticationRateLimitKeyGenerator(Buffer.alloc(32, 2));
    expect(first.hash('owner@example.com')).toMatch(/^[0-9a-f]{64}$/);
    expect(first.hash('owner@example.com')).toBe(first.hash('owner@example.com'));
    expect(first.hash('owner@example.com')).not.toBe(rotated.hash('owner@example.com'));
    expect(() => new NodeAuthenticationRateLimitKeyGenerator(Buffer.alloc(31))).toThrowError(
      'at least 32 bytes',
    );
  });
});
