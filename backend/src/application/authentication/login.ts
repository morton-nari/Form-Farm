import type {
  PasswordHasher,
  SessionCredentialGenerator,
  SessionRepository,
  UserAccountRepository,
} from '../ports/authentication.js';
import { assertLoginPassword, normalizeAccountEmail } from './account-policy.js';

export interface SessionPolicy {
  readonly idleTimeoutMilliseconds: number;
  readonly absoluteTimeoutMilliseconds: number;
}

export class Login {
  constructor(
    private readonly accounts: UserAccountRepository,
    private readonly passwords: PasswordHasher,
    private readonly credentials: SessionCredentialGenerator,
    private readonly sessions: SessionRepository,
    private readonly policy: SessionPolicy,
  ) {}

  async execute(input: {
    readonly email: string;
    readonly password: string;
  }): Promise<{ readonly sessionCredential: string }> {
    const normalizedEmail = normalizeAccountEmail(input.email);
    assertLoginPassword(input.password);
    const account = await this.accounts.findByNormalizedEmail(normalizedEmail);
    const valid = await this.passwords.verify(
      account?.passwordHash ?? this.passwords.dummyHash,
      input.password,
    );
    if (!account || !valid || account.status !== 'active') {
      throw new InvalidCredentialsError();
    }

    if (this.passwords.needsRehash(account.passwordHash)) {
      await this.accounts.replacePasswordHash(
        account.id,
        await this.passwords.hash(input.password),
      );
    }

    const credential = this.credentials.generate();
    await this.sessions.create({
      userId: account.id,
      credentialHash: credential.credentialHash,
      idleTimeoutMilliseconds: this.policy.idleTimeoutMilliseconds,
      absoluteTimeoutMilliseconds: this.policy.absoluteTimeoutMilliseconds,
    });
    return { sessionCredential: credential.credential };
  }
}

export class InvalidCredentialsError extends Error {
  override readonly name = 'InvalidCredentialsError';

  constructor() {
    super('The email or password is incorrect.');
  }
}
