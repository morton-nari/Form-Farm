import { Pool } from 'pg';

import { requireDirectDatabaseAdminUrl } from './database-url-policy.js';
import {
  developmentOnlyTableNames,
  migrationNames,
  productionRuntimeTableNames,
  verifyMigrationLedger,
} from './migration-manifest.js';

function requireIdentifier(name: string): string {
  const value = process.env[name];
  if (!value || !/^[a-z_][a-z0-9_]{0,62}$/.test(value)) {
    throw new Error(`Production role grant requires valid ${name}.`);
  }
  return value;
}

const quote = (identifier: string) => `"${identifier}"`;

let pool: Pool | undefined;
try {
  const databaseUrl = requireDirectDatabaseAdminUrl(process.env);
  const appRole = requireIdentifier('PRODUCTION_DATABASE_APP_ROLE');
  const adminRole = requireIdentifier('PRODUCTION_DATABASE_ADMIN_ROLE');
  const databaseName = requireIdentifier('PRODUCTION_DATABASE_NAME');
  if (appRole === adminRole)
    throw new Error('Production application and migration roles must differ.');
  pool = new Pool({ connectionString: databaseUrl, max: 1 });

  const identity = await pool.query<{ database_name: string; role_name: string }>(
    'select current_database() as database_name, current_user as role_name',
  );
  if (
    identity.rows[0]?.database_name !== databaseName ||
    identity.rows[0]?.role_name !== adminRole
  ) {
    throw new Error('Production runtime grant target did not match the protected admin role.');
  }

  const ledger = await pool.query<{ name: string }>(
    'select name from form_farm_migrations order by name asc',
  );
  verifyMigrationLedger(ledger.rows.map(({ name }) => name));

  const role = quote(appRole);
  const tables = productionRuntimeTableNames.map(quote).join(', ');
  await pool.query('begin');
  try {
    await pool.query(`revoke all privileges on all tables in schema public from ${role}`);
    await pool.query(`revoke all privileges on all sequences in schema public from ${role}`);
    await pool.query(`revoke create on schema public from ${role}`);
    await pool.query(`grant connect on database ${quote(databaseName)} to ${role}`);
    await pool.query(`grant usage on schema public to ${role}`);
    await pool.query(`grant select, insert, update, delete on table ${tables} to ${role}`);
    await pool.query('commit');
  } catch (error) {
    await pool.query('rollback');
    throw error;
  }

  const boundary = await pool.query<{
    superuser: boolean;
    can_login: boolean;
    create_database: boolean;
    create_role: boolean;
    memberships: string[];
    schema_create: boolean;
    migration_ledger: boolean;
    runtime_table_access: boolean;
    development_only_table_access: boolean;
    database_connect: boolean;
    schema_usage: boolean;
  }>(
    `select r.rolsuper as superuser,
            r.rolcanlogin as can_login,
            r.rolcreatedb as create_database,
            r.rolcreaterole as create_role,
            array(select pg_get_userbyid(m.roleid) from pg_auth_members m where m.member = r.oid) as memberships,
            has_schema_privilege(r.rolname, 'public', 'CREATE') as schema_create,
            has_database_privilege(r.rolname, current_database(), 'CONNECT') as database_connect,
            has_schema_privilege(r.rolname, 'public', 'USAGE') as schema_usage,
            exists(select 1 from information_schema.role_table_grants g
                   where g.grantee = r.rolname and g.table_schema = 'public'
                     and g.table_name = 'form_farm_migrations') as migration_ledger,
            (select bool_and(
               has_table_privilege(r.rolname, t.name, 'SELECT')
               and has_table_privilege(r.rolname, t.name, 'INSERT')
               and has_table_privilege(r.rolname, t.name, 'UPDATE')
               and has_table_privilege(r.rolname, t.name, 'DELETE')
             ) from unnest($2::text[]) as t(name)) as runtime_table_access,
            (select bool_or(
               has_table_privilege(r.rolname, t.name, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
             ) from unnest($3::text[]) as t(name)) as development_only_table_access
       from pg_roles r where r.rolname = $1`,
    [appRole, productionRuntimeTableNames, developmentOnlyTableNames],
  );
  const result = boundary.rows[0];
  if (
    !result ||
    !result.can_login ||
    result.superuser ||
    result.create_database ||
    result.create_role ||
    result.memberships.length > 0 ||
    result.schema_create ||
    result.migration_ledger ||
    !result.database_connect ||
    !result.schema_usage ||
    !result.runtime_table_access ||
    result.development_only_table_access
  ) {
    throw new Error('Production application role exceeded the reviewed runtime boundary.');
  }
  console.log(`Production runtime grants passed: tables=${productionRuntimeTableNames.length}.`);
} catch {
  console.error('Production runtime grant failed; protected provider details were redacted.');
  process.exitCode = 1;
} finally {
  if (pool)
    await pool.end().catch(() => {
      console.error(
        'Production runtime grant cleanup failed; protected provider details were redacted.',
      );
      process.exitCode = 1;
    });
}
