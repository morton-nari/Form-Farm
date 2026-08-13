import { sql } from 'drizzle-orm';

import type { AuthenticationRateLimitRepository } from '../../application/ports/authentication.js';
import type { FormFarmDatabase } from '../database/create-database.js';
import { safelyPersistAuthentication } from './authentication-persistence-error.js';

export class PostgresAuthenticationRateLimitRepository implements AuthenticationRateLimitRepository {
  constructor(private readonly database: FormFarmDatabase) {}

  async consume(input: {
    scope: string;
    keyHash: string;
    windowMilliseconds: number;
    limit: number;
  }): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    return safelyPersistAuthentication(async () => {
      const result = await this.database.execute<{
        attempt_count: number;
        retry_after_seconds: string;
      }>(sql`
        insert into auth_rate_limits (scope, key_hash, window_started_at, attempt_count, updated_at)
        values (${input.scope}, ${input.keyHash}, now(), 1, now())
        on conflict (scope, key_hash) do update set
          window_started_at = case
            when auth_rate_limits.window_started_at <= now() - (${input.windowMilliseconds} * interval '1 millisecond')
              then now()
            else auth_rate_limits.window_started_at
          end,
          attempt_count = case
            when auth_rate_limits.window_started_at <= now() - (${input.windowMilliseconds} * interval '1 millisecond')
              then 1
            else auth_rate_limits.attempt_count + 1
          end,
          updated_at = now()
        returning attempt_count,
          greatest(1, ceil(extract(epoch from (
            window_started_at + (${input.windowMilliseconds} * interval '1 millisecond') - now()
          ))))::text as retry_after_seconds
      `);
      const row = result.rows[0];
      if (!row) throw new Error('Rate-limit update did not return state.');
      const allowed = row.attempt_count <= input.limit;
      return {
        allowed,
        retryAfterSeconds: allowed ? 0 : Number(row.retry_after_seconds),
      };
    });
  }
}
