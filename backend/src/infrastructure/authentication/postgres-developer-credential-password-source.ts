import { and, eq } from 'drizzle-orm';

import type { DeveloperCredentialPasswordSource } from '../../application/ports/developer-credentials.js';
import type { FormFarmDatabase } from '../database/create-database.js';
import { users } from '../database/schema.js';
import { safelyPersistAuthentication } from './authentication-persistence-error.js';

export class PostgresDeveloperCredentialPasswordSource implements DeveloperCredentialPasswordSource {
  constructor(private readonly database: FormFarmDatabase) {}

  findActivePasswordHash(userId: string): Promise<string | undefined> {
    return safelyPersistAuthentication(async () => {
      const [account] = await this.database
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(and(eq(users.id, userId), eq(users.status, 'active')))
        .limit(1);
      return account?.passwordHash;
    });
  }
}
