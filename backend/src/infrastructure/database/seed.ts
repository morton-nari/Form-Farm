import { Pool } from 'pg';
import { validateFormDefinition } from '@form-farm/form-domain';

import { CUSTOMER_FEEDBACK_FORM } from '../forms/customer-feedback.form.js';
import { HEALTH_QUESTIONNAIRE_FORM } from '../forms/health-questionnaire.form.js';
import { assertDatabaseSeedAllowed } from './seed-policy.js';

assertDatabaseSeedAllowed(process.env);
const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) throw new Error('DATABASE_URL is required to seed the database.');

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
try {
  await pool.query('begin');
  // Seed health last so the dashboard's documented updated-at ordering presents it first.
  for (const candidate of [CUSTOMER_FEEDBACK_FORM, HEALTH_QUESTIONNAIRE_FORM]) {
    const validation = validateFormDefinition(candidate);
    if (!validation.success) {
      throw new Error(`Refusing to seed invalid form definition "${candidate.id}".`);
    }
    const definition = validation.value;
    await pool.query(
      `insert into forms (id, status, latest_version, current_published_version, ownership_kind)
       values ($1, 'draft', $2, null, 'system')
       on conflict (id) do nothing`,
      [definition.id, definition.formVersion],
    );
    await pool.query(
      `insert into form_versions (form_id, version, schema_version, definition, published_at)
       values ($1, $2, $3, $4::jsonb, now())
       on conflict (form_id, version) do nothing`,
      [definition.id, definition.formVersion, definition.schemaVersion, JSON.stringify(definition)],
    );
    await pool.query(
      `update forms set status = 'published', current_published_version = $2, updated_at = clock_timestamp() where id = $1`,
      [definition.id, definition.formVersion],
    );
  }
  await pool.query('commit');
} catch (error) {
  await pool.query('rollback');
  throw error;
} finally {
  await pool.end();
}
