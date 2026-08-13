import { eq, sql } from 'drizzle-orm';

import type {
  StoredUserAccount,
  UserAccountRepository,
} from '../../application/ports/authentication.js';
import type { FormFarmDatabase } from '../database/create-database.js';
import { users } from '../database/schema.js';
import { safelyPersistAuthentication } from './authentication-persistence-error.js';

export class PostgresUserAccountRepository implements UserAccountRepository {
  constructor(private readonly database: FormFarmDatabase) {}

  async createIfAbsent(input: {
    email: string;
    normalizedEmail: string;
    passwordHash: string;
  }): Promise<'created' | 'exists'> {
    return safelyPersistAuthentication(async () => {
      const created = await this.database
        .insert(users)
        .values(input)
        .onConflictDoNothing({ target: users.normalizedEmail })
        .returning({ id: users.id });
      return created.length === 1 ? 'created' : 'exists';
    });
  }

  async findByNormalizedEmail(normalizedEmail: string): Promise<StoredUserAccount | undefined> {
    return safelyPersistAuthentication(async () => {
      const [account] = await this.database
        .select({
          id: users.id,
          normalizedEmail: users.normalizedEmail,
          passwordHash: users.passwordHash,
          status: users.status,
        })
        .from(users)
        .where(eq(users.normalizedEmail, normalizedEmail))
        .limit(1);
      if (!account || (account.status !== 'active' && account.status !== 'disabled'))
        return undefined;
      return { ...account, status: account.status };
    });
  }

  async replacePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await safelyPersistAuthentication(async () => {
      await this.database
        .update(users)
        .set({ passwordHash, updatedAt: sql`now()` })
        .where(eq(users.id, userId));
    });
  }
}
