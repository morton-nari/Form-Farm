export const SMOKE_RATE_LIMIT_RETENTION_HOURS = 24;

export interface SmokeCleanupDatabase {
  query<Result extends { readonly rowCount?: number | null; readonly rows?: readonly unknown[] }>(
    text: string,
    values?: readonly unknown[],
  ): Promise<Result>;
}

export type SmokeCleanupResult = Readonly<{
  accountDeleted: number;
  sessionsDeleted: number;
  expiredRateLimitsDeleted: number;
}>;

export function requireSmokeAccountEmail(environment: NodeJS.ProcessEnv): string {
  if (environment['SMOKE_DATABASE_ENVIRONMENT'] !== 'preview') {
    throw new Error('Smoke cleanup requires the preview database environment marker.');
  }
  const email = environment['SMOKE_ACCOUNT_EMAIL']?.toLowerCase();
  if (!email || !/^form-farm-smoke-[0-9]+-[0-9]+@example\.invalid$/.test(email)) {
    throw new Error('Smoke cleanup requires the reserved synthetic account pattern.');
  }
  return email;
}

export async function cleanupSmokeAccount(
  database: SmokeCleanupDatabase,
  normalizedEmail: string,
): Promise<SmokeCleanupResult> {
  await database.query('begin');
  try {
    const user = await database.query<{
      readonly rowCount: number;
      readonly rows: readonly { readonly id: string; readonly normalized_email: string }[];
    }>(
      `select id, normalized_email
       from users
       where normalized_email = $1
       for update`,
      [normalizedEmail],
    );

    let sessionsDeleted = 0;
    let accountDeleted = 0;
    if (user.rowCount > 0) {
      if (user.rowCount !== 1 || user.rows[0]?.normalized_email !== normalizedEmail) {
        throw new Error('Smoke cleanup account identity was ambiguous.');
      }
      const userId = user.rows[0].id;
      const ownedForms = await database.query<{ readonly rows: readonly { readonly count: string }[] }>(
        `select count(*)::text as count
         from forms
         where owner_user_id = $1`,
        [userId],
      );
      if (ownedForms.rows[0]?.count !== '0') {
        throw new Error('Smoke cleanup refuses to delete an account that owns forms.');
      }
      const sessions = await database.query<{ readonly rowCount: number }>(
        'delete from user_sessions where user_id = $1',
        [userId],
      );
      sessionsDeleted = sessions.rowCount;
      const account = await database.query<{ readonly rowCount: number }>(
        'delete from users where id = $1 and normalized_email = $2',
        [userId, normalizedEmail],
      );
      if (account.rowCount !== 1) throw new Error('Smoke cleanup account deletion was not exact.');
      accountDeleted = 1;
    }

    const expiredRateLimits = await database.query<{ readonly rowCount: number }>(
      `delete from auth_rate_limits
       where updated_at < now() - make_interval(hours => $1)`,
      [SMOKE_RATE_LIMIT_RETENTION_HOURS],
    );
    await database.query('commit');
    return {
      accountDeleted,
      sessionsDeleted,
      expiredRateLimitsDeleted: expiredRateLimits.rowCount,
    };
  } catch (error) {
    await database.query('rollback').catch(() => undefined);
    throw error;
  }
}
