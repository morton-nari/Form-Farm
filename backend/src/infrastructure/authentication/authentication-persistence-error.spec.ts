import { describe, expect, it } from 'vitest';

import {
  AuthenticationPersistenceError,
  safelyPersistAuthentication,
} from './authentication-persistence-error.js';

describe('authentication persistence errors', () => {
  it('replaces infrastructure failures without retaining sensitive causes', async () => {
    const secret = 'submitted-password-or-database-url';

    const failure = await safelyPersistAuthentication(async () => {
      throw new Error(secret);
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AuthenticationPersistenceError);
    expect(failure).toMatchObject({
      name: 'AuthenticationPersistenceError',
      message: 'The authentication persistence operation failed.',
    });
    expect(failure).not.toHaveProperty('cause');
    expect(JSON.stringify(failure)).not.toContain(secret);
  });
});
