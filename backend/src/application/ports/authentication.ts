export interface StoredUserAccount {
  readonly id: string;
  readonly normalizedEmail: string;
  readonly passwordHash: string;
  readonly status: 'active' | 'disabled';
}

export interface UserAccountRepository {
  createIfAbsent(input: {
    readonly email: string;
    readonly normalizedEmail: string;
    readonly passwordHash: string;
  }): Promise<'created' | 'exists'>;
  findByNormalizedEmail(normalizedEmail: string): Promise<StoredUserAccount | undefined>;
  replacePasswordHash(userId: string, passwordHash: string): Promise<void>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
  needsRehash(hash: string): boolean;
  readonly dummyHash: string;
}

export interface PasswordBlocklist {
  contains(password: string): boolean;
}

export interface SessionCredentialGenerator {
  generate(): { readonly credential: string; readonly credentialHash: string };
  hash(credential: string): string;
}

export interface SessionRepository {
  create(input: {
    readonly userId: string;
    readonly credentialHash: string;
    readonly idleTimeoutMilliseconds: number;
    readonly absoluteTimeoutMilliseconds: number;
  }): Promise<{ readonly sessionId: string }>;
  resolve(input: {
    readonly credentialHash: string;
    readonly idleTimeoutMilliseconds: number;
    readonly activityWriteCadenceMilliseconds: number;
  }): Promise<{ readonly userId: string; readonly sessionId: string } | undefined>;
  revoke(credentialHash: string): Promise<void>;
  deleteExpired(retentionMilliseconds: number): Promise<number>;
}

export interface AuthenticationRateLimitRepository {
  consume(input: {
    readonly scope: string;
    readonly keyHash: string;
    readonly windowMilliseconds: number;
    readonly limit: number;
  }): Promise<{ readonly allowed: boolean; readonly retryAfterSeconds: number }>;
}

export interface AuthenticationRateLimitKeyGenerator {
  hash(normalizedIdentifier: string): string;
}
