import { Pool } from 'pg';

import { requireDirectDatabaseAdminUrl } from './database-url-policy.js';
import {
  migrationNames,
  verifyMigrationLedger,
  verifyMigrationLedgerPrefix,
} from './migration-manifest.js';

function requireValue(name: string, pattern: RegExp): string {
  const value = process.env[name];
  if (!value || !pattern.test(value)) throw new Error(`Production release requires valid ${name}.`);
  return value;
}

let pool: Pool | undefined;
try {
  const databaseUrl = requireDirectDatabaseAdminUrl(process.env);
  const expectedDatabase = requireValue('PRODUCTION_DATABASE_NAME', /^[A-Za-z0-9_]{1,63}$/);
  const expectedAdminRole = requireValue('PRODUCTION_DATABASE_ADMIN_ROLE', /^[a-z_][a-z0-9_]{0,62}$/);
  const expectedMigration = requireValue(
    'PRODUCTION_MIGRATION_LEVEL',
    /^[0-9]{4}_[A-Za-z0-9_-]+\.sql$/,
  );
  if (expectedMigration !== migrationNames.at(-1)) {
    throw new Error('Production release migration level does not match the committed manifest.');
  }

  pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const identity = await pool.query<{ database_name: string; role_name: string }>(
    'select current_database() as database_name, current_user as role_name',
  );
  if (
    identity.rows[0]?.database_name !== expectedDatabase ||
    identity.rows[0]?.role_name !== expectedAdminRole
  ) {
    throw new Error('Production release target identity did not match protected configuration.');
  }

  const ledgerExists = await pool.query<{ ledger: string | null }>(
    "select to_regclass('public.form_farm_migrations') as ledger",
  );
  const ledger = ledgerExists.rows[0]?.ledger
    ? await pool.query<{ name: string }>('select name from form_farm_migrations order by name asc')
    : { rows: [] };
  const ledgerNames = ledger.rows.map(({ name }) => name);
  if (process.env['PRODUCTION_REQUIRE_CURRENT_MIGRATIONS'] === 'true') {
    verifyMigrationLedger(ledgerNames);
  } else {
    verifyMigrationLedgerPrefix(ledgerNames);
  }
  console.log(
    `Production preflight passed: current_migrations=${ledger.rows.length}, target_migrations=${migrationNames.length}.`,
  );
} catch {
  console.error('Production preflight failed; protected provider details were redacted.');
  process.exitCode = 1;
} finally {
  if (pool) await pool.end().catch(() => {
    console.error('Production preflight cleanup failed; protected provider details were redacted.');
    process.exitCode = 1;
  });
}
