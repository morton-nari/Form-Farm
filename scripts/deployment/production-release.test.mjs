import assert from 'node:assert/strict';
import { test } from 'node:test';

import { runProductionSmoke } from './production-smoke-lib.mjs';
import { verifyRequiredChecks } from './verify-required-checks.mjs';

test('required check verification emits no token and requires every stable check', async () => {
  const checks = ['Frontend and domain', 'Form domain', 'Backend', 'Backend integration', 'Deployment'];
  const requests = [];
  const count = await verifyRequiredChecks(
    {
      GITHUB_REPOSITORY: 'owner/repo',
      APPLICATION_COMMIT: 'a'.repeat(40),
      GITHUB_TOKEN: 'never-print-this-token',
    },
    async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify({
        check_runs: checks.map((name) => ({ name, status: 'completed', conclusion: 'success' })),
      }), { status: 200 });
    },
  );
  assert.equal(count, 5);
  assert.equal(requests.length, 1);
});

test('production smoke is read-only and reports fixed names without response bodies', async () => {
  const requests = [];
  const output = [];
  await runProductionSmoke(
    { PRODUCTION_SMOKE_ORIGIN: 'https://form-farm.vercel.app' },
    async (url) => {
      requests.push(url.pathname);
      const isHealth = url.pathname === '/health';
      const isSpa = url.pathname === '/login';
      const isXsrf = url.pathname.endsWith('/xsrf');
      const status = isSpa || isHealth ? 200 : isXsrf ? 204 : url.pathname.endsWith('/session') ? 401 : 404;
      const body = isHealth
        ? '{"status":"ok","secret":"not-reported"}'
        : isSpa
          ? '<app-root></app-root>'
          : url.pathname.includes('does-not-exist')
            ? '{"error":{"code":"route_not_found"}}'
            : '';
      return new Response(status === 204 ? null : body, {
        status,
        headers: {
          'content-type': isSpa ? 'text/html' : 'application/json',
          ...(isXsrf ? { 'set-cookie': '__Host-ff_xsrf=test; Secure; SameSite=Lax; Path=/' } : {}),
        },
      });
    },
    (line) => output.push(line),
  );
  assert.equal(requests.every((path) => !path.includes('register') && !path.includes('management')), true);
  assert.equal(output.join('\n').includes('not-reported'), false);
});
