import { defineConfig } from 'drizzle-kit';

import { requireDirectDatabaseAdminUrl } from './src/infrastructure/database/database-url-policy.js';

const databaseUrl = requireDirectDatabaseAdminUrl(process.env);

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/infrastructure/database/schema.ts',
  out: './drizzle',
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
});
