import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

import { createSmokeReporter } from './smoke-lib.mjs';

test('normal smoke reporting emits check names without supplied secret values', () => {
  const output = [];
  const reporter = createSmokeReporter((line) => output.push(line));
  const sensitiveValues = [
    'postgresql://database-credential@example.invalid/database',
    'session-cookie-value',
    'xsrf-token-value',
    'hmac-secret-value',
    'authorization-header-value',
  ];

  reporter.passed('health');
  reporter.failed('login-cookie');

  const rendered = output.join('\n');
  assert.equal(rendered, 'smoke:pass:health\nsmoke:fail:login-cookie');
  for (const value of sensitiveValues) assert.equal(rendered.includes(value), false);
});

test('smoke command redacts configuration when validation fails', () => {
  const sensitiveBypass = 'vercel-bypass-secret-value';
  const result = spawnSync(process.execPath, ['scripts/deployment/run-deployed-smoke.mjs'], {
    cwd: new URL('../..', import.meta.url),
    encoding: 'utf8',
    env: {
      ...process.env,
      SMOKE_ORIGIN: 'not-a-valid-origin',
      SMOKE_ACCOUNT_EMAIL: 'form-farm-smoke-123-1@example.invalid',
      SMOKE_PROTECTION_BYPASS: sensitiveBypass,
    },
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'smoke:failed\n');
  assert.equal(`${result.stdout}${result.stderr}`.includes(sensitiveBypass), false);
});
