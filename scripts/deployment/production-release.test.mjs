import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ProductionSmokeFailure, runProductionSmoke } from './production-smoke-lib.mjs';
import { createVercelProtectedFetch } from './vercel-protected-fetch.mjs';
import { verifyRequiredChecks } from './verify-required-checks.mjs';
import { fetchAndVerifyVercelDeployment, verifyVercelDeployment } from './verify-vercel-deployment.mjs';

const requiredChecks = ['Frontend and domain', 'Form domain', 'Backend', 'Backend integration', 'Deployment'];
const trustedCheck = (name, overrides = {}) => ({
  name,
  status: 'completed',
  conclusion: 'success',
  app: { id: 15368, slug: 'github-actions' },
  details_url: `https://github.com/owner/repo/actions/runs/123/jobs/456`,
  ...overrides,
});

const checkResponse = (checks) => async () => new Response(
  JSON.stringify({ check_runs: checks }),
  { status: 200 },
);

const checkEnvironment = {
  GITHUB_REPOSITORY: 'owner/repo',
  APPLICATION_COMMIT: 'a'.repeat(40),
  GITHUB_TOKEN: 'never-print-this-token',
};

test('required check verification emits no token and requires every stable check', async () => {
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
        check_runs: requiredChecks.map((name) => trustedCheck(name)),
      }), { status: 200 });
    },
  );
  assert.equal(count, 5);
  assert.equal(requests.length, 1);
});

test('required check verification rejects an expected name from the wrong app', async () => {
  const checks = requiredChecks.map((name) => trustedCheck(name));
  checks[0] = trustedCheck(requiredChecks[0], { app: { id: 1, slug: 'other-app' } });
  await assert.rejects(verifyRequiredChecks(checkEnvironment, checkResponse(checks)), /untrusted provenance/);
});

test('required check verification rejects ambiguous duplicate names', async () => {
  const checks = requiredChecks.map((name) => trustedCheck(name));
  checks.push(trustedCheck(requiredChecks[0]));
  await assert.rejects(verifyRequiredChecks(checkEnvironment, checkResponse(checks)), /ambiguous/);
});

for (const [label, replacement] of [
  ['missing', null],
  ['cancelled', { status: 'completed', conclusion: 'cancelled' }],
  ['skipped', { status: 'completed', conclusion: 'skipped' }],
  ['failed', { status: 'completed', conclusion: 'failure' }],
]) {
  test(`required check verification rejects ${label} checks`, async () => {
    const checks = requiredChecks.slice(1).map((name) => trustedCheck(name));
    if (replacement) checks.push(trustedCheck(requiredChecks[0], replacement));
    await assert.rejects(verifyRequiredChecks(checkEnvironment, checkResponse(checks)));
  });
}

test('Vercel deployment verification binds commit, Production target, project, and team', () => {
  const environment = {
    APPLICATION_COMMIT: 'b'.repeat(40),
    VERCEL_PROJECT_ID: 'prj_expected',
    VERCEL_ORG_ID: 'team_expected',
  };
  const deployment = {
    id: 'dpl_Expected123',
    target: 'production',
    projectId: 'prj_expected',
    teamId: 'team_expected',
    meta: { formFarmApplicationCommit: 'b'.repeat(40) },
  };
  assert.equal(verifyVercelDeployment(deployment, environment), deployment.id);
  for (const changed of [
    { target: 'preview' },
    { projectId: 'prj_other' },
    { teamId: 'team_other' },
    { meta: { formFarmApplicationCommit: 'c'.repeat(40) } },
  ]) {
    assert.throws(() => verifyVercelDeployment({ ...deployment, ...changed }, environment));
  }
});

test('Vercel deployment lookup keeps its token in the authorization header', async () => {
  const requests = [];
  const environment = {
    APPLICATION_COMMIT: 'd'.repeat(40),
    VERCEL_PROJECT_ID: 'prj_expected',
    VERCEL_ORG_ID: 'team_expected',
    VERCEL_TOKEN: 'never-print-this-vercel-token',
  };
  const id = await fetchAndVerifyVercelDeployment(
    'dpl_Expected123',
    environment,
    async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify({
        id: 'dpl_Expected123',
        target: 'production',
        projectId: 'prj_expected',
        teamId: 'team_expected',
        meta: { formFarmApplicationCommit: 'd'.repeat(40) },
      }), { status: 200 });
    },
  );
  assert.equal(id, 'dpl_Expected123');
  assert.equal(requests[0].url.includes(environment.VERCEL_TOKEN), false);
  assert.equal(requests[0].options.headers.authorization, `Bearer ${environment.VERCEL_TOKEN}`);
});

test('Vercel deployment lookup converts an exact HTTPS origin to its hostname', async () => {
  const requests = [];
  const environment = {
    APPLICATION_COMMIT: 'd'.repeat(40),
    VERCEL_PROJECT_ID: 'prj_expected',
    VERCEL_ORG_ID: 'team_expected',
    VERCEL_TOKEN: 'never-print-this-vercel-token',
  };
  await fetchAndVerifyVercelDeployment(
    'https://form-farm-stage.vercel.app',
    environment,
    async (url) => {
      requests.push(url);
      return new Response(JSON.stringify({
        id: 'dpl_Expected123',
        target: 'production',
        projectId: 'prj_expected',
        teamId: 'team_expected',
        meta: { formFarmApplicationCommit: 'd'.repeat(40) },
      }), { status: 200 });
    },
  );
  assert.equal(
    requests[0],
    'https://api.vercel.com/v13/deployments/form-farm-stage.vercel.app?teamId=team_expected',
  );
});

test('Vercel deployment lookup rejects non-exact origins before network access', async () => {
  const environment = {
    APPLICATION_COMMIT: 'd'.repeat(40),
    VERCEL_PROJECT_ID: 'prj_expected',
    VERCEL_ORG_ID: 'team_expected',
    VERCEL_TOKEN: 'never-print-this-vercel-token',
  };
  for (const reference of [
    'http://form-farm-stage.vercel.app',
    'https://form-farm-stage.vercel.app/path',
    'https://form-farm-stage.vercel.app?query=value',
    'https://vercel.app',
  ]) {
    await assert.rejects(
      fetchAndVerifyVercelDeployment(reference, environment, async () => {
        throw new Error('network must not be reached');
      }),
      /Invalid deployment reference/,
    );
  }
});

test('Vercel deployment lookup accepts omitted response team only after a team-scoped lookup', async () => {
  const environment = {
    APPLICATION_COMMIT: 'e'.repeat(40),
    VERCEL_PROJECT_ID: 'prj_expected',
    VERCEL_ORG_ID: 'team_expected',
    VERCEL_TOKEN: 'never-print-this-vercel-token',
  };
  const id = await fetchAndVerifyVercelDeployment(
    'dpl_Expected123',
    environment,
    async (url) => {
      assert.match(url, /[?&]teamId=team_expected(?:&|$)/);
      return new Response(JSON.stringify({
        id: 'dpl_Expected123',
        target: 'production',
        projectId: 'prj_expected',
        meta: { formFarmApplicationCommit: 'e'.repeat(40) },
      }), { status: 200 });
    },
  );
  assert.equal(id, 'dpl_Expected123');
});

test('Vercel deployment verification reports only safe mismatch categories', () => {
  const environment = {
    APPLICATION_COMMIT: 'f'.repeat(40),
    VERCEL_PROJECT_ID: 'prj_expected',
    VERCEL_ORG_ID: 'team_expected',
  };
  const deployment = {
    id: 'dpl_Expected123',
    target: 'production',
    projectId: 'prj_expected',
    teamId: 'team_expected',
    meta: {},
  };
  assert.throws(
    () => verifyVercelDeployment(deployment, environment),
    { message: 'deployment-verification:commit-mismatch' },
  );
});

test('production smoke is read-only and reports fixed names without response bodies', async () => {
  const requests = [];
  const output = [];
  await runProductionSmoke(
    { PRODUCTION_SMOKE_ORIGIN: 'https://form-farm.vercel.app' },
    async (url, options) => {
      requests.push({ path: url.pathname, options });
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
  assert.equal(
    requests.every(({ path }) => !path.includes('register') && !path.includes('management')),
    true,
  );
  const sessionRequests = requests.filter(({ path }) => path.endsWith('/session'));
  assert.equal(sessionRequests.length, 2);
  assert.equal(sessionRequests[0].options.headers, undefined);
  assert.match(
    sessionRequests[1].options.headers.cookie,
    /^__Host-ff_session=form-farm-production-smoke-invalid-session-credential-never-generated$/,
  );
  assert.equal(output.includes('production-smoke:pass:runtime-database-read'), true);
  assert.equal(output.join('\n').includes('invalid-session-credential'), false);
  assert.equal(output.join('\n').includes('not-reported'), false);
});

test('production smoke failures expose only the fixed check and bounded reason', async () => {
  const secretBody = 'database-url-and-cookie-must-not-appear';
  await assert.rejects(
    runProductionSmoke(
      { PRODUCTION_SMOKE_ORIGIN: 'https://form-farm.vercel.app' },
      async () => new Response(secretBody, { status: 503 }),
    ),
    (error) => {
      assert.ok(error instanceof ProductionSmokeFailure);
      assert.equal(error.message, 'production-smoke:failed:health:status-503');
      assert.equal(error.message.includes(secretBody), false);
      return true;
    },
  );

  await assert.rejects(
    runProductionSmoke(
      { PRODUCTION_SMOKE_ORIGIN: 'https://form-farm.vercel.app' },
      async () => { throw new Error(secretBody); },
    ),
    (error) => {
      assert.equal(error.message, 'production-smoke:failed:health:transport');
      assert.equal(error.message.includes(secretBody), false);
      return true;
    },
  );

  await assert.rejects(
    runProductionSmoke(
      { PRODUCTION_SMOKE_ORIGIN: 'https://form-farm.vercel.app' },
      async () => new Response(secretBody, {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    ),
    (error) => {
      assert.equal(error.message, 'production-smoke:failed:health:content-type');
      assert.equal(error.message.includes(secretBody), false);
      return true;
    },
  );

  await assert.rejects(
    runProductionSmoke(
      { PRODUCTION_SMOKE_ORIGIN: 'https://form-farm.vercel.app' },
      async () => new Response(JSON.stringify({ status: 'failed', secret: secretBody }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
    (error) => {
      assert.equal(error.message, 'production-smoke:failed:health:response');
      assert.equal(error.message.includes(secretBody), false);
      return true;
    },
  );
});

test('protected staged fetch rejects other origins and redacts CLI failures', async () => {
  const calls = [];
  const protectedFetch = createVercelProtectedFetch(
    {
      PRODUCTION_SMOKE_ORIGIN: 'https://staged-form-farm.vercel.app',
      VERCEL_ORG_ID: 'team_reviewed',
      VERCEL_AUTOMATION_BYPASS_SECRET: 'never-print-this-production-bypass',
      VERCEL_TOKEN: 'never-print-this-vercel-token',
    },
    (_command, args, options) => {
      calls.push(args);
      assert.equal(
        options.env.VERCEL_AUTOMATION_BYPASS_SECRET,
        'never-print-this-production-bypass',
      );
      return {
        status: 1,
        stdout: '',
        stderr: 'provider output containing never-print-this-vercel-token',
      };
    },
  );

  await assert.rejects(
    protectedFetch('https://other.vercel.app/health'),
    /escaped its origin/,
  );
  assert.equal(calls.length, 0);
  await assert.rejects(
    protectedFetch('https://staged-form-farm.vercel.app/health'),
    (error) => {
      assert.equal(error.message, 'Authenticated Vercel request failed.');
      assert.equal(error.message.includes('never-print-this-vercel-token'), false);
      return true;
    },
  );
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes('/health'));
  assert.ok(calls[0].includes('--deployment=https://staged-form-farm.vercel.app'));
  assert.equal(calls[0].includes('https://staged-form-farm.vercel.app/health'), false);
  const separatorIndex = calls[0].indexOf('--');
  assert.ok(separatorIndex > calls[0].indexOf('--token=never-print-this-vercel-token'));
  assert.ok(separatorIndex > calls[0].indexOf('--scope=team_reviewed'));
  assert.ok(separatorIndex < calls[0].indexOf('--silent'));
  assert.ok(separatorIndex < calls[0].indexOf('--dump-header'));
  assert.equal(calls[0].join(' ').includes('never-print-this-production-bypass'), false);
});

test('protected staged fetch reports bounded transport categories without provider output', async () => {
  const secret = 'never-print-this-provider-secret';
  for (const [stderr, category] of [
    [`Error: forbidden ${secret}`, 'authorization'],
    [`Deployment protection bypass rejected ${secret}`, 'protection'],
    [`Could not find deployment ${secret}`, 'deployment-lookup'],
    [`spawn curl ENOENT ${secret}`, 'native-curl'],
    [`Invalid token; log in ${secret}`, 'authentication'],
    [`unexpected provider failure ${secret}`, 'unknown'],
  ]) {
    const protectedFetch = createVercelProtectedFetch(
      {
        PRODUCTION_SMOKE_ORIGIN: 'https://staged-form-farm.vercel.app',
        VERCEL_ORG_ID: 'team_reviewed',
        VERCEL_AUTOMATION_BYPASS_SECRET: secret,
        VERCEL_TOKEN: secret,
      },
      () => ({ status: 1, stdout: '', stderr }),
    );
    await assert.rejects(
      protectedFetch('https://staged-form-farm.vercel.app/health'),
      (error) => {
        assert.equal(error.productionSmokeTransportCategory, category);
        assert.equal(error.message.includes(secret), false);
        assert.equal(error.message.includes(stderr), false);
        return true;
      },
    );
  }
});

test('production smoke exposes only allowlisted transport categories', async () => {
  for (const [category, expected] of [
    ['authorization', 'production-smoke:failed:health:transport-authorization'],
    ['not-allowlisted-secret', 'production-smoke:failed:health:transport'],
  ]) {
    await assert.rejects(
      runProductionSmoke(
        { PRODUCTION_SMOKE_ORIGIN: 'https://form-farm.vercel.app' },
        async () => {
          const error = new Error('provider details');
          error.productionSmokeTransportCategory = category;
          throw error;
        },
      ),
      (error) => {
        assert.equal(error.message, expected);
        assert.equal(error.message.includes('provider details'), false);
        assert.equal(error.message.includes('not-allowlisted-secret'), false);
        return true;
      },
    );
  }
});

test('protected staged fetch fails closed without an authorized Vercel team scope', () => {
  assert.throws(
    () => createVercelProtectedFetch({
      PRODUCTION_SMOKE_ORIGIN: 'https://staged-form-farm.vercel.app',
      VERCEL_TOKEN: 'never-print-this-vercel-token',
    }),
    /requires VERCEL_ORG_ID/,
  );
});

test('protected staged fetch fails closed without a Production protection bypass', () => {
  assert.throws(
    () => createVercelProtectedFetch({
      PRODUCTION_SMOKE_ORIGIN: 'https://staged-form-farm.vercel.app',
      VERCEL_ORG_ID: 'team_reviewed',
      VERCEL_TOKEN: 'never-print-this-vercel-token',
    }),
    /requires VERCEL_AUTOMATION_BYPASS_SECRET/,
  );
});
