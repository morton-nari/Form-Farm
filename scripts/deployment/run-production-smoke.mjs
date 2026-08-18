import { runProductionSmoke } from './production-smoke-lib.mjs';

try {
  await runProductionSmoke(process.env);
  process.stdout.write('production-smoke:complete\n');
} catch {
  process.stderr.write('production-smoke:failed\n');
  process.exitCode = 1;
}
