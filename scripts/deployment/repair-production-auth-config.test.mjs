import assert from 'node:assert/strict';
import { test } from 'node:test';

import { repairProductionAuthConfig } from './repair-production-auth-config.mjs';

const environment = {
  PRODUCTION_AUTH_REPAIR_APPROVAL: 'ROTATE PRODUCTION AUTH SECRETS',
  VERCEL_PROJECT_ID: 'prj_expected',
  VERCEL_ORG_ID: 'team_expected',
  VERCEL_TOKEN: 'never-print-this-token',
};

test('repairs only the three exact Production auth variables with distinct valid secrets', async () => {
  const calls = [];
  const variables = [...['AUTH_SECURE_COOKIES', 'XSRF_HMAC_SECRET', 'RATE_LIMIT_HMAC_SECRET']]
    .map((key, index) => ({ id: `env_${index}`, key, target: ['production'] }));
  const updated = await repairProductionAuthConfig(environment, async (url, options = {}) => {
    calls.push({ url, options });
    return options.method === 'PATCH'
      ? new Response('{}', { status: 200 })
      : new Response(JSON.stringify({ envs: variables }), { status: 200 });
  });
  assert.deepEqual(updated.sort(), ['AUTH_SECURE_COOKIES', 'RATE_LIMIT_HMAC_SECRET', 'XSRF_HMAC_SECRET']);
  const bodies = calls.slice(1).map(({ options }) => JSON.parse(options.body).value);
  assert.equal(bodies[0], 'true');
  assert.match(bodies[1], /^[A-Za-z0-9_-]{43}$/);
  assert.match(bodies[2], /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(bodies[1], bodies[2]);
  assert.equal(calls.every(({ url }) => url.includes('teamId=team_expected')), true);
  assert.equal(calls.every(({ options }) => !String(options.body).includes(environment.VERCEL_TOKEN)), true);
});

test('fails closed before writes for missing, ambiguous, or non-Production variables', async () => {
  for (const envs of [
    [],
    [
      { id: 'one', key: 'AUTH_SECURE_COOKIES', target: ['production'] },
      { id: 'two', key: 'AUTH_SECURE_COOKIES', target: ['production'] },
      { id: 'three', key: 'XSRF_HMAC_SECRET', target: ['production'] },
      { id: 'four', key: 'RATE_LIMIT_HMAC_SECRET', target: ['production'] },
    ],
    [...['AUTH_SECURE_COOKIES', 'XSRF_HMAC_SECRET', 'RATE_LIMIT_HMAC_SECRET']]
      .map((key, index) => ({ id: `env_${index}`, key, target: ['preview'] })),
  ]) {
    let writes = 0;
    await assert.rejects(repairProductionAuthConfig(environment, async (_url, options = {}) => {
      if (options.method === 'PATCH') writes += 1;
      return new Response(JSON.stringify({ envs }), { status: 200 });
    }));
    assert.equal(writes, 0);
  }
});

test('requires the exact approval phrase and redacts provider failures', async () => {
  await assert.rejects(
    repairProductionAuthConfig({ ...environment, PRODUCTION_AUTH_REPAIR_APPROVAL: 'yes' }, async () => {
      throw new Error('network must not be reached');
    }),
    { message: 'production-auth-repair:invalid-approval' },
  );
  await assert.rejects(
    repairProductionAuthConfig(environment, async () => new Response('secret provider body', { status: 403 })),
    (error) => {
      assert.equal(error.message, 'production-auth-repair:environment-lookup-failed');
      assert.equal(error.message.includes('secret provider body'), false);
      return true;
    },
  );
});
