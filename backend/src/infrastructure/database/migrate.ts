import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

import { requireDirectDatabaseAdminUrl } from './database-url-policy.js';
import { migrationNames } from './migration-manifest.js';

const databaseUrl = requireDirectDatabaseAdminUrl(process.env);

const pool = new Pool({ connectionString: databaseUrl, max: 1 });

try {
  await pool.query('begin');
  await pool.query(`
    create table if not exists form_farm_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);
  for (const name of migrationNames) {
    const applied = await pool.query<{ name: string }>(
      'select name from form_farm_migrations where name = $1',
      [name],
    );
    if (applied.rowCount === 0) {
      const path = fileURLToPath(new URL(`../../../drizzle/${name}`, import.meta.url));
      await pool.query(await readFile(path, 'utf8'));
      await pool.query('insert into form_farm_migrations (name) values ($1)', [name]);
    }
  }
  await pool.query('commit');
} catch (error) {
  await pool.query('rollback');
  throw error;
} finally {
  await pool.end();
}
