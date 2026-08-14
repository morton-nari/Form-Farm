import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) throw new Error('DATABASE_URL is required to run migrations.');

const migrations = [
  '0000_initial_form_read.sql',
  '0001_versioned_form_submissions.sql',
  '0002_authentication_ownership_core.sql',
  '0003_owner_form_drafts.sql',
] as const;
const pool = new Pool({ connectionString: databaseUrl, max: 1 });

try {
  await pool.query('begin');
  await pool.query(`
    create table if not exists form_farm_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);
  for (const name of migrations) {
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
