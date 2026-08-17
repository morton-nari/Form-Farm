import { Pool } from 'pg';

import { requireDirectDatabaseAdminUrl } from './database-url-policy.js';
import { cleanupSmokeAccount, requireSmokeAccountEmail } from './smoke-account-cleanup.js';

let pool: Pool | undefined;
try {
  const databaseUrl = requireDirectDatabaseAdminUrl(process.env);
  const email = requireSmokeAccountEmail(process.env);
  pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const result = await cleanupSmokeAccount(pool, email);
  process.stdout.write(`${JSON.stringify({ cleanup: 'ok', ...result })}\n`);
} catch {
  process.stderr.write('Smoke cleanup failed.\n');
  process.exitCode = 1;
} finally {
  await pool?.end().catch(() => {
    process.stderr.write('Smoke cleanup connection close failed.\n');
    process.exitCode = 1;
  });
}
