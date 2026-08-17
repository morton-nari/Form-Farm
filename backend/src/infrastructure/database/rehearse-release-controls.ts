import { Pool } from 'pg';

import { requireDirectDatabaseAdminUrl } from './database-url-policy.js';
import { migrationNames, verifyMigrationLedger } from './migration-manifest.js';

function requireSafeValue(environment: NodeJS.ProcessEnv, name: string, pattern: RegExp): string {
  const value = environment[name];
  if (!value || !pattern.test(value))
    throw new Error(`Release rehearsal requires a valid ${name}.`);
  return value;
}

let pool: Pool | undefined;

try {
  const databaseUrl = requireDirectDatabaseAdminUrl(process.env);
  const stage = requireSafeValue(process.env, 'RELEASE_REHEARSAL_ENVIRONMENT', /^preview$/);
  const expectedDatabase = requireSafeValue(
    process.env,
    'RELEASE_REHEARSAL_DATABASE',
    /^[A-Za-z0-9_]{1,63}$/,
  );
  const runId = requireSafeValue(process.env, 'RELEASE_REHEARSAL_RUN_ID', /^[0-9]{1,20}$/);
  const url = new URL(databaseUrl);
  const expectedRole = decodeURIComponent(url.username);
  const rollbackObject = `release_rehearsal_${runId}`;
  pool = new Pool({ connectionString: databaseUrl, max: 1 });

  const identity = await pool.query<{ database_name: string; role_name: string }>(
    'select current_database() as database_name, current_user as role_name',
  );
  if (
    stage !== 'preview' ||
    identity.rows[0]?.database_name !== expectedDatabase ||
    identity.rows[0]?.role_name !== expectedRole
  ) {
    throw new Error(
      'Release rehearsal target identity did not match the protected preview configuration.',
    );
  }

  const ledger = await pool.query<{ name: string }>(
    'select name from form_farm_migrations order by name asc',
  );
  verifyMigrationLedger(ledger.rows.map(({ name }) => name));

  await pool.query('begin');
  let rollbackObjectCreated = false;
  try {
    await pool.query(`create table "${rollbackObject}" (id integer primary key)`);
    rollbackObjectCreated = true;
    await pool.query('select 1 / 0');
  } catch {
    await pool.query('rollback');
  }
  if (!rollbackObjectCreated) {
    throw new Error('Release rehearsal could not establish the rollback fixture.');
  }

  const rollbackCheck = await pool.query<{ object_name: string | null }>(
    'select to_regclass($1) as object_name',
    [`public.${rollbackObject}`],
  );
  if (rollbackCheck.rows[0]?.object_name !== null) {
    throw new Error('Release rehearsal rollback left a persistent database object.');
  }

  console.log(
    `Release rehearsal checks passed: migrations=${migrationNames.length}, rollback_objects=0.`,
  );
} catch {
  console.error(
    'Release rehearsal failed; protected configuration and provider details were redacted.',
  );
  process.exitCode = 1;
} finally {
  if (pool) {
    try {
      await pool.end();
    } catch {
      console.error('Release rehearsal cleanup failed; protected provider details were redacted.');
      process.exitCode = 1;
    }
  }
}
