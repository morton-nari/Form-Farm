import { createSmokeReporter, runDeployedSmoke } from './smoke-lib.mjs';

const reporter = createSmokeReporter();

try {
  await runDeployedSmoke(process.env, fetch, reporter);
  process.stdout.write('smoke:complete\n');
} catch {
  process.stderr.write('smoke:failed\n');
  process.exitCode = 1;
}
