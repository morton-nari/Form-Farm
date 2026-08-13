import { describe, expect, it } from 'vitest';

import { safeAuthenticationErrorName } from './register-error-handler.js';

describe('authentication error logging projection', () => {
  it('retains only a safe error category and never an error message or attached values', () => {
    const secret = 'email-password-cookie-or-token';
    const error = Object.assign(new Error(secret), { email: secret, credential: secret });

    expect(safeAuthenticationErrorName(error)).toBe('Error');
    expect(JSON.stringify(safeAuthenticationErrorName(error))).not.toContain(secret);
    expect(safeAuthenticationErrorName({ name: `Invalid ${secret}` })).toBe('UnknownError');
  });
});
