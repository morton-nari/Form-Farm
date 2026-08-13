import { describe, expect, it } from 'vitest';

import { XsrfTokenService } from './xsrf-token-service.js';

describe('XsrfTokenService', () => {
  it('validates matching unexpired pre-authentication tokens and rejects malformed evidence', () => {
    let now = 1_000_000;
    const tokens = new XsrfTokenService(
      'current-secret-that-is-at-least-32-bytes',
      undefined,
      600_000,
      () => now,
    );
    const token = tokens.issuePreAuthenticationToken();

    expect(tokens.verifyPreAuthenticationToken(token, token)).toBe(true);
    expect(tokens.verifyPreAuthenticationToken(token, `${token}x`)).toBe(false);
    expect(tokens.verifyPreAuthenticationToken(undefined, token)).toBe(false);
    expect(tokens.verifyPreAuthenticationToken('malformed', 'malformed')).toBe(false);
    now += 600_000;
    expect(tokens.verifyPreAuthenticationToken(token, token)).toBe(false);
  });

  it('accepts previous-key overlap but always issues with the current key', () => {
    const previousOnly = new XsrfTokenService(
      'previous-secret-that-is-at-least-32-bytes',
      undefined,
      600_000,
      () => 1_000_000,
    );
    const oldToken = previousOnly.issuePreAuthenticationToken();
    const rotated = new XsrfTokenService(
      'new-current-secret-that-is-at-least-32-bytes',
      'previous-secret-that-is-at-least-32-bytes',
      600_000,
      () => 1_000_000,
    );

    expect(rotated.verifyPreAuthenticationToken(oldToken, oldToken)).toBe(true);
    const newToken = rotated.issuePreAuthenticationToken();
    expect(previousOnly.verifyPreAuthenticationToken(newToken, newToken)).toBe(false);
  });

  it('binds authenticated XSRF tokens to the exact opaque credential', () => {
    const tokens = new XsrfTokenService(
      'current-secret-that-is-at-least-32-bytes',
      undefined,
      600_000,
    );
    const token = tokens.issueSessionToken('first-session');

    expect(tokens.verifySessionToken('first-session', token, token)).toBe(true);
    expect(tokens.verifySessionToken('second-session', token, token)).toBe(false);
    expect(tokens.verifySessionToken('first-session', token, `${token}x`)).toBe(false);
  });
});
