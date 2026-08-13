import { ApplicationError } from '../errors/application-error.js';
import type {
  PasswordBlocklist,
  PasswordHasher,
  UserAccountRepository,
} from '../ports/authentication.js';
import { assertRegistrationPassword, normalizeAccountEmail } from './account-policy.js';

export class RegisterAccount {
  constructor(
    private readonly accounts: UserAccountRepository,
    private readonly passwords: PasswordHasher,
    private readonly blocklist: PasswordBlocklist,
  ) {}

  async execute(input: { readonly email: string; readonly password: string }): Promise<void> {
    const normalizedEmail = normalizeAccountEmail(input.email);
    assertRegistrationPassword(input.password);
    if (this.blocklist.contains(input.password)) {
      throw new ApplicationError('invalid_input', 'Choose a less common password.');
    }

    const passwordHash = await this.passwords.hash(input.password);
    await this.accounts.createIfAbsent({
      email: input.email.trim().normalize('NFC'),
      normalizedEmail,
      passwordHash,
    });
  }
}
