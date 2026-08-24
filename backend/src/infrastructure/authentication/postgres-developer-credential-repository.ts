import { and, count, desc, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';

import type {
  DeveloperCredentialMetadata,
  DeveloperCredentialAuthenticationRepository,
  DeveloperCredentialRepository,
  IssueDeveloperCredentialResult,
} from '../../application/ports/developer-credentials.js';
import {
  DEVELOPER_CREDENTIAL_ENVIRONMENT,
  DEVELOPER_CREDENTIAL_SCOPE,
} from '../../application/ports/developer-credentials.js';
import type { FormFarmDatabase } from '../database/create-database.js';
import { developerCredentials, users } from '../database/schema.js';
import { safelyPersistDeveloperCredential } from './developer-credential-persistence-error.js';

export class PostgresDeveloperCredentialRepository
  implements DeveloperCredentialRepository, DeveloperCredentialAuthenticationRepository
{
  constructor(private readonly database: FormFarmDatabase) {}

  issue(
    input: Parameters<DeveloperCredentialRepository['issue']>[0],
  ): Promise<IssueDeveloperCredentialResult> {
    return safelyPersistDeveloperCredential(() =>
      this.database.transaction(async (transaction) => {
        const [actor] = await transaction
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.id, input.actor.userId), eq(users.status, 'active')))
          .for('update')
          .limit(1);
        if (!actor) return { status: 'actor_unavailable' } as const;

        const [active] = await transaction
          .select({ value: count() })
          .from(developerCredentials)
          .where(
            and(
              eq(developerCredentials.userId, actor.id),
              isNull(developerCredentials.revokedAt),
              gt(developerCredentials.expiresAt, sql`now()`),
            ),
          );
        if ((active?.value ?? 0) >= input.maximumActiveCredentials) {
          return { status: 'active_limit_reached' } as const;
        }

        const [created] = await transaction
          .insert(developerCredentials)
          .values({
            id: input.publicId,
            userId: actor.id,
            secretHash: input.secretVerifier,
            displayName: input.displayName,
            scope: DEVELOPER_CREDENTIAL_SCOPE,
            environment: DEVELOPER_CREDENTIAL_ENVIRONMENT,
            createdAt: sql`now()`,
            expiresAt: sql`now() + (${input.expiresInDays} * interval '1 day')`,
          })
          .returning(metadataSelection);
        if (!created) throw new Error('Credential creation did not return metadata.');
        return { status: 'created', credential: mapMetadata(created) } as const;
      }),
    );
  }

  listForOwner(
    actor: Parameters<DeveloperCredentialRepository['listForOwner']>[0],
  ): Promise<readonly DeveloperCredentialMetadata[]> {
    return safelyPersistDeveloperCredential(async () => {
      const records = await this.database
        .select(metadataSelection)
        .from(developerCredentials)
        .where(eq(developerCredentials.userId, actor.userId))
        .orderBy(desc(developerCredentials.createdAt), developerCredentials.id);
      return records.map(mapMetadata);
    });
  }

  async revokeForOwner(
    input: Parameters<DeveloperCredentialRepository['revokeForOwner']>[0],
  ): Promise<void> {
    await safelyPersistDeveloperCredential(async () => {
      await this.database
        .update(developerCredentials)
        .set({ revokedAt: sql`now()` })
        .where(
          and(
            eq(developerCredentials.id, input.publicId),
            eq(developerCredentials.userId, input.actor.userId),
            isNull(developerCredentials.revokedAt),
          ),
        );
    });
  }

  findForAuthentication(
    publicId: string,
  ): ReturnType<DeveloperCredentialAuthenticationRepository['findForAuthentication']> {
    return safelyPersistDeveloperCredential(async () => {
      const [record] = await this.database
        .select({
          publicId: developerCredentials.id,
          userId: developerCredentials.userId,
          secretVerifier: developerCredentials.secretHash,
          scope: developerCredentials.scope,
          environment: developerCredentials.environment,
          expiresAt: developerCredentials.expiresAt,
          revokedAt: developerCredentials.revokedAt,
        })
        .from(developerCredentials)
        .innerJoin(users, eq(users.id, developerCredentials.userId))
        .where(and(eq(developerCredentials.id, publicId), eq(users.status, 'active')))
        .limit(1);
      return record;
    });
  }

  confirmActiveAndTouch(
    input: Parameters<DeveloperCredentialAuthenticationRepository['confirmActiveAndTouch']>[0],
  ): Promise<boolean> {
    return safelyPersistDeveloperCredential(() =>
      this.database.transaction(async (transaction) => {
        const [active] = await transaction
          .select({
            publicId: developerCredentials.id,
            lastUsedAt: developerCredentials.lastUsedAt,
          })
          .from(developerCredentials)
          .innerJoin(users, eq(users.id, developerCredentials.userId))
          .where(
            and(
              eq(developerCredentials.id, input.publicId),
              eq(developerCredentials.userId, input.userId),
              eq(developerCredentials.scope, DEVELOPER_CREDENTIAL_SCOPE),
              eq(developerCredentials.environment, DEVELOPER_CREDENTIAL_ENVIRONMENT),
              isNull(developerCredentials.revokedAt),
              gt(developerCredentials.expiresAt, sql`now()`),
              eq(users.status, 'active'),
            ),
          )
          .for('update', { of: developerCredentials })
          .limit(1);
        if (!active) return false;

        await transaction
          .update(developerCredentials)
          .set({ lastUsedAt: sql`now()` })
          .where(
            and(
              eq(developerCredentials.id, active.publicId),
              or(
                isNull(developerCredentials.lastUsedAt),
                lte(
                  developerCredentials.lastUsedAt,
                  sql`now() - (${input.writeCadenceMilliseconds} * interval '1 millisecond')`,
                ),
              ),
            ),
          );
        return true;
      }),
    );
  }

  deleteTerminal(retentionMilliseconds: number): Promise<number> {
    return safelyPersistDeveloperCredential(async () => {
      const deleted = await this.database
        .delete(developerCredentials)
        .where(
          sql`coalesce(${developerCredentials.revokedAt}, ${developerCredentials.expiresAt})
              < now() - (${retentionMilliseconds} * interval '1 millisecond')`,
        )
        .returning({ id: developerCredentials.id });
      return deleted.length;
    });
  }
}

const metadataSelection = {
  publicId: developerCredentials.id,
  displayName: developerCredentials.displayName,
  scope: developerCredentials.scope,
  environment: developerCredentials.environment,
  createdAt: developerCredentials.createdAt,
  expiresAt: developerCredentials.expiresAt,
  revokedAt: developerCredentials.revokedAt,
  lastUsedAt: developerCredentials.lastUsedAt,
};

interface StoredDeveloperCredentialMetadata {
  publicId: string;
  displayName: string;
  scope: string;
  environment: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
}

function mapMetadata(record: StoredDeveloperCredentialMetadata): DeveloperCredentialMetadata {
  if (
    record.scope !== DEVELOPER_CREDENTIAL_SCOPE ||
    record.environment !== DEVELOPER_CREDENTIAL_ENVIRONMENT
  ) {
    throw new Error('Stored developer credential policy is invalid.');
  }
  return { ...record, scope: record.scope, environment: record.environment };
}
