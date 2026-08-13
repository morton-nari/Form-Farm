import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import type { BackendConfig } from '../../config/backend-config.js';
import * as schema from './schema.js';

export function createDatabase(config: BackendConfig) {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: config.databasePoolMax,
    min: 0,
    connectionTimeoutMillis: 5_000,
  });

  return {
    database: drizzle(pool, { schema }),
    close: async (): Promise<void> => pool.end(),
  };
}

export type FormFarmDatabase = ReturnType<typeof createDatabase>['database'];
