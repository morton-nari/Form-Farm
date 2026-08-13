import { Pool } from 'pg';

import { CUSTOMER_FEEDBACK_FORM } from '../forms/customer-feedback.form.js';
import { assertDatabaseSeedAllowed } from './seed-policy.js';

assertDatabaseSeedAllowed(process.env);
const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) throw new Error('DATABASE_URL is required to seed the database.');

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
try {
  await pool.query('begin');
  await pool.query(
    `insert into forms (id, status, latest_version, current_published_version)
     values ($1, 'draft', $2, null)
     on conflict (id) do nothing`,
    [CUSTOMER_FEEDBACK_FORM.id, CUSTOMER_FEEDBACK_FORM.formVersion],
  );
  await pool.query(
    `insert into form_versions (form_id, version, schema_version, definition, published_at)
     values ($1, $2, $3, $4::jsonb, now())
     on conflict (form_id, version) do nothing`,
    [
      CUSTOMER_FEEDBACK_FORM.id,
      CUSTOMER_FEEDBACK_FORM.formVersion,
      CUSTOMER_FEEDBACK_FORM.schemaVersion,
      JSON.stringify(CUSTOMER_FEEDBACK_FORM),
    ],
  );
  await pool.query(
    `update forms set status = 'published', current_published_version = $2, updated_at = now() where id = $1`,
    [CUSTOMER_FEEDBACK_FORM.id, CUSTOMER_FEEDBACK_FORM.formVersion],
  );
  await pool.query('commit');
} catch (error) {
  await pool.query('rollback');
  throw error;
} finally {
  await pool.end();
}
