import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) throw new Error('DATABASE_URL is required to run migrations.');

const migrationPath = fileURLToPath(
  new URL('../../../drizzle/0000_initial_form_read.sql', import.meta.url),
);
const sql = await readFile(migrationPath, 'utf8');
const pool = new Pool({ connectionString: databaseUrl, max: 1 });

try {
  await pool.query('begin');
  await pool.query(`
    create table if not exists form_farm_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);
  const applied = await pool.query<{ name: string }>(
    'select name from form_farm_migrations where name = $1',
    ['0000_initial_form_read.sql'],
  );
  if (applied.rowCount === 0) {
    await pool.query(sql);
    await pool.query('insert into form_farm_migrations (name) values ($1)', [
      '0000_initial_form_read.sql',
    ]);
  }
  await pool.query('commit');
} catch (error) {
  await pool.query('rollback');
  throw error;
} finally {
  await pool.end();
}
