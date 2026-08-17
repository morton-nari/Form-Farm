export function requireDirectDatabaseAdminUrl(environment: NodeJS.ProcessEnv): string {
  const value = environment['DATABASE_ADMIN_URL'];
  if (!value) throw new Error('DATABASE_ADMIN_URL is required for database tooling.');

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('DATABASE_ADMIN_URL must be a valid PostgreSQL URL.');
  }
  if (!['postgresql:', 'postgres:'].includes(url.protocol)) {
    throw new Error('DATABASE_ADMIN_URL must be a PostgreSQL URL.');
  }
  if (url.hostname.split('.')[0]?.endsWith('-pooler')) {
    throw new Error('DATABASE_ADMIN_URL must use a direct database endpoint.');
  }
  return value;
}
