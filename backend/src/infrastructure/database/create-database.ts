import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import type { BackendConfig } from '../../config/backend-config.js';
import * as schema from './schema.js';

export function createDatabase(config: Pick<BackendConfig, 'databaseUrl' | 'databasePoolMax'>) {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: config.databasePoolMax,
    min: 0,
    connectionTimeoutMillis: 5_000,
  });
  let closePromise: Promise<void> | undefined;

  return {
    database: drizzle(pool, { schema }),
    close: (): Promise<void> => {
      closePromise ??= pool.end();
      return closePromise;
    },
  };
}

export type FormFarmDatabase = ReturnType<typeof createDatabase>['database'];
