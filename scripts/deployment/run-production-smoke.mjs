import { ProductionSmokeFailure, runProductionSmoke } from './production-smoke-lib.mjs';
import { createVercelProtectedFetch } from './vercel-protected-fetch.mjs';

try {
  const fetchImplementation = process.env.PRODUCTION_SMOKE_VERCEL_CURL === 'true'
    ? createVercelProtectedFetch(process.env)
    : fetch;
  await runProductionSmoke(process.env, fetchImplementation);
  process.stdout.write('production-smoke:complete\n');
} catch (error) {
  const message = error instanceof ProductionSmokeFailure
    ? error.message
    : 'production-smoke:failed:configuration';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
