import { and, eq, gt, isNull, lte, sql } from 'drizzle-orm';

import type { SessionRepository } from '../../application/ports/authentication.js';
import type { FormFarmDatabase } from '../database/create-database.js';
import { users, userSessions } from '../database/schema.js';
import { safelyPersistAuthentication } from './authentication-persistence-error.js';

export class PostgresSessionRepository implements SessionRepository {
  constructor(private readonly database: FormFarmDatabase) {}

  async create(input: {
    userId: string;
    credentialHash: string;
    idleTimeoutMilliseconds: number;
    absoluteTimeoutMilliseconds: number;
  }): Promise<{ sessionId: string }> {
    return safelyPersistAuthentication(async () => {
      const [created] = await this.database
        .insert(userSessions)
        .values({
          userId: input.userId,
          tokenHash: input.credentialHash,
          createdAt: sql`now()`,
          lastSeenAt: sql`now()`,
          idleExpiresAt: sql`now() + (${input.idleTimeoutMilliseconds} * interval '1 millisecond')`,
          absoluteExpiresAt: sql`now() + (${input.absoluteTimeoutMilliseconds} * interval '1 millisecond')`,
        })
        .returning({ sessionId: userSessions.id });
      if (!created) throw new Error('Session creation did not return an identity.');
      return created;
    });
  }

  async resolve(input: {
    credentialHash: string;
    idleTimeoutMilliseconds: number;
    activityWriteCadenceMilliseconds: number;
  }): Promise<{ userId: string; sessionId: string } | undefined> {
    return safelyPersistAuthentication(() =>
      this.database.transaction(async (transaction) => {
        const [session] = await transaction
          .select({
            sessionId: userSessions.id,
            userId: userSessions.userId,
          })
          .from(userSessions)
          .innerJoin(users, eq(users.id, userSessions.userId))
          .where(
            and(
              eq(userSessions.tokenHash, input.credentialHash),
              isNull(userSessions.revokedAt),
              gt(userSessions.idleExpiresAt, sql`now()`),
              gt(userSessions.absoluteExpiresAt, sql`now()`),
              eq(users.status, 'active'),
            ),
          )
          .for('update', { of: userSessions })
          .limit(1);
        if (!session) return undefined;

        await transaction
          .update(userSessions)
          .set({
            lastSeenAt: sql`now()`,
            idleExpiresAt: sql`now() + (${input.idleTimeoutMilliseconds} * interval '1 millisecond')`,
          })
          .where(
            and(
              eq(userSessions.id, session.sessionId),
              lte(
                userSessions.lastSeenAt,
                sql`now() - (${input.activityWriteCadenceMilliseconds} * interval '1 millisecond')`,
              ),
            ),
          );
        return { userId: session.userId, sessionId: session.sessionId };
      }),
    );
  }

  async revoke(credentialHash: string): Promise<void> {
    await safelyPersistAuthentication(async () => {
      await this.database
        .update(userSessions)
        .set({ revokedAt: sql`now()` })
        .where(
          and(
            eq(userSessions.tokenHash, credentialHash),
            isNull(userSessions.revokedAt),
            lte(userSessions.createdAt, sql`now()`),
          ),
        );
    });
  }

  async deleteExpired(retentionMilliseconds: number): Promise<number> {
    return safelyPersistAuthentication(async () => {
      const deleted = await this.database
        .delete(userSessions)
        .where(
          sql`
          greatest(
            coalesce(${userSessions.revokedAt}, '-infinity'::timestamptz),
            ${userSessions.idleExpiresAt},
            ${userSessions.absoluteExpiresAt}
          ) < now() - (${retentionMilliseconds} * interval '1 millisecond')
        `,
        )
        .returning({ id: userSessions.id });
      return deleted.length;
    });
  }
}
