import { describe, expect, it, vi } from 'vitest';

import type {
  PasswordHasher,
  SessionRepository,
  UserAccountRepository,
} from '../ports/authentication.js';
import { normalizeAccountEmail } from './account-policy.js';
import { InvalidCredentialsError, Login } from './login.js';
import { Logout } from './logout.js';
import { RegisterAccount } from './register-account.js';
import { ResolveSession } from './resolve-session.js';

describe('authentication application services', () => {
  it('defines case-insensitive normalized account identity while preserving display input', async () => {
    expect(normalizeAccountEmail('  Usér@Example.COM  ')).toBe('usér@example.com');
    const createIfAbsent = vi.fn(async () => 'created' as const);
    const hash = vi.fn(async () => 'hash');
    const register = new RegisterAccount(
      accountRepository({ createIfAbsent }),
      passwordHasher({ hash }),
      { contains: () => false },
    );

    const password = 'e\u0301-is-not-the-same-password';
    await register.execute({ email: '  Usér@Example.COM  ', password });

    expect(hash).toHaveBeenCalledWith(password);
    expect(createIfAbsent).toHaveBeenCalledWith({
      email: 'Usér@Example.COM',
      normalizedEmail: 'usér@example.com',
      passwordHash: 'hash',
    });
  });

  it('applies password boundaries and blocklist policy without account disclosure', async () => {
    const register = new RegisterAccount(accountRepository(), passwordHasher(), {
      contains: (password) => password === 'blocked-password-value',
    });
    await expect(
      register.execute({ email: 'user@example.com', password: 'short' }),
    ).rejects.toMatchObject({
      code: 'invalid_input',
    });
    await expect(
      register.execute({ email: 'user@example.com', password: 'blocked-password-value' }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('uses a dummy verification for unknown accounts and returns one generic failure', async () => {
    const verify = vi.fn(async () => false);
    const login = createLogin(accountRepository(), passwordHasher({ verify }));

    await expect(
      login.execute({ email: 'missing@example.com', password: 'a valid login attempt' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(verify).toHaveBeenCalledWith('dummy-hash', 'a valid login attempt');
  });

  it('rehashes when required and always creates a fresh exact-expiry session', async () => {
    const replacePasswordHash = vi.fn(async () => undefined);
    const create = vi.fn(async () => ({ sessionId: 'session-id' }));
    const login = createLogin(
      accountRepository({
        findByNormalizedEmail: async () => ({
          id: 'user-id',
          normalizedEmail: 'user@example.com',
          passwordHash: 'old-hash',
          status: 'active',
        }),
        replacePasswordHash,
      }),
      passwordHasher({
        verify: async () => true,
        needsRehash: () => true,
        hash: async () => 'new-hash',
      }),
      sessionRepository({ create }),
    );

    await expect(
      login.execute({ email: 'user@example.com', password: 'exact password value' }),
    ).resolves.toEqual({ sessionCredential: 'fresh-credential' });
    expect(replacePasswordHash).toHaveBeenCalledWith('user-id', 'new-hash');
    expect(create).toHaveBeenCalledWith({
      userId: 'user-id',
      credentialHash: 'fresh-hash',
      idleTimeoutMilliseconds: 30 * 60_000,
      absoluteTimeoutMilliseconds: 7 * 24 * 60 * 60_000,
    });
  });

  it('resolves with deterministic activity parameters and makes logout idempotent through its port', async () => {
    const resolve = vi.fn(async () => ({ userId: 'user-id', sessionId: 'session-id' }));
    const revoke = vi.fn(async () => undefined);
    const sessions = sessionRepository({ resolve, revoke });
    const credentials = {
      generate: () => ({ credential: 'fresh', credentialHash: 'fresh-hash' }),
      hash: (value: string) => `hash:${value}`,
    };
    const resolver = new ResolveSession(sessions, credentials, 30 * 60_000, 5 * 60_000);

    await expect(resolver.execute('token')).resolves.toEqual({ userId: 'user-id' });
    expect(resolve).toHaveBeenCalledWith({
      credentialHash: 'hash:token',
      idleTimeoutMilliseconds: 30 * 60_000,
      activityWriteCadenceMilliseconds: 5 * 60_000,
    });

    const logout = new Logout(sessions, credentials);
    await logout.execute('token');
    await logout.execute('token');
    expect(revoke).toHaveBeenCalledTimes(2);
  });
});

function accountRepository(overrides: Partial<UserAccountRepository> = {}): UserAccountRepository {
  return {
    createIfAbsent: async () => 'created',
    findByNormalizedEmail: async () => undefined,
    replacePasswordHash: async () => undefined,
    ...overrides,
  };
}

function passwordHasher(overrides: Partial<PasswordHasher> = {}): PasswordHasher {
  return {
    dummyHash: 'dummy-hash',
    hash: async () => 'hash',
    verify: async () => false,
    needsRehash: () => false,
    ...overrides,
  };
}

function sessionRepository(overrides: Partial<SessionRepository> = {}): SessionRepository {
  return {
    create: async () => ({ sessionId: 'session-id' }),
    resolve: async () => undefined,
    revoke: async () => undefined,
    deleteExpired: async () => 0,
    ...overrides,
  };
}

function createLogin(
  accounts: UserAccountRepository,
  passwords: PasswordHasher,
  sessions: SessionRepository = sessionRepository(),
): Login {
  return new Login(
    accounts,
    passwords,
    {
      generate: () => ({ credential: 'fresh-credential', credentialHash: 'fresh-hash' }),
      hash: (value) => `hash:${value}`,
    },
    sessions,
    { idleTimeoutMilliseconds: 30 * 60_000, absoluteTimeoutMilliseconds: 7 * 24 * 60 * 60_000 },
  );
}
