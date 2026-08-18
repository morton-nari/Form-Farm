import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const smokeWorkflow = await readFile(
  new URL('../../.github/workflows/deployed-preview-smoke.yml', import.meta.url),
  'utf8',
);
const productionReleaseWorkflow = await readFile(
  new URL('../../.github/workflows/production-release.yml', import.meta.url),
  'utf8',
);
const productionRollbackWorkflow = await readFile(
  new URL('../../.github/workflows/production-rollback.yml', import.meta.url),
  'utf8',
);
const rehearsalWorkflow = await readFile(
  new URL('../../.github/workflows/release-control-rehearsal.yml', import.meta.url),
  'utf8',
);

test('deployed smoke is restricted to preview environment secrets and always cleans up', () => {
  assert.match(smokeWorkflow, /environment: preview-smoke/);
  assert.match(smokeWorkflow, /if: \$\{\{ always\(\) \}\}/);
  assert.match(smokeWorkflow, /secrets\.PREVIEW_SMOKE_PROTECTION_BYPASS/);
  assert.match(smokeWorkflow, /secrets\.PREVIEW_DATABASE_ADMIN_URL/);
  assert.doesNotMatch(smokeWorkflow, /secrets\.(?:PRODUCTION|DATABASE_URL|DATABASE_ADMIN_URL)/);
  assert.doesNotMatch(smokeWorkflow, /upload-artifact/);
});

test('production release is staged, approval protected, explicit, and seed-free', () => {
  assert.match(productionReleaseWorkflow, /workflow_dispatch:/);
  assert.match(productionReleaseWorkflow, /environment: Production/);
  assert.match(productionReleaseWorkflow, /verify-required-checks\.mjs/);
  assert.match(productionReleaseWorkflow, /npm run db:prepare-production-release/);
  assert.match(productionReleaseWorkflow, /npm run db:migrate/);
  assert.match(productionReleaseWorkflow, /npm run db:grant-production-app-role/);
  assert.match(productionReleaseWorkflow, /--prod --skip-domain/);
  assert.match(productionReleaseWorkflow, /deployment:production-smoke/g);
  assert.match(productionReleaseWorkflow, /vercel@59\.1\.3 promote/);
  assert.doesNotMatch(productionReleaseWorkflow, /db:seed|reset|upload-artifact|set -x|printenv/);
  assert.doesNotMatch(productionReleaseWorkflow, /PREVIEW_/);
  assert.ok(
    productionReleaseWorkflow.indexOf('npm run db:migrate') <
      productionReleaseWorkflow.indexOf('--prod --skip-domain'),
  );
  assert.ok(
    productionReleaseWorkflow.indexOf('--prod --skip-domain') <
      productionReleaseWorkflow.indexOf('vercel@59.1.3 promote'),
  );
  assert.equal(
    productionReleaseWorkflow.match(/DATABASE_ADMIN_URL: \$\{\{ secrets\.PRODUCTION_DATABASE_ADMIN_URL \}\}/g)
      ?.length,
    3,
  );
  assert.equal(
    productionReleaseWorkflow.match(/VERCEL_TOKEN: \$\{\{ secrets\.VERCEL_TOKEN \}\}/g)?.length,
    3,
  );
});

test('production rollback requires compatibility review and never reverses SQL', () => {
  assert.match(productionRollbackWorkflow, /workflow_dispatch:/);
  assert.match(productionRollbackWorkflow, /environment: Production/);
  assert.match(productionRollbackWorkflow, /schema_compatible:/);
  assert.match(productionRollbackWorkflow, /PRODUCTION_REQUIRE_CURRENT_MIGRATIONS/);
  assert.match(productionRollbackWorkflow, /vercel@59\.1\.3 rollback/);
  assert.doesNotMatch(productionRollbackWorkflow, /db:migrate|down|PREVIEW_|upload-artifact/);
});

test('release rehearsal is isolated, explicit, and cannot consume Production secrets', () => {
  assert.match(rehearsalWorkflow, /workflow_dispatch:/);
  assert.match(rehearsalWorkflow, /environment: preview-smoke/);
  assert.match(rehearsalWorkflow, /ref: \$\{\{ inputs\.application_commit \}\}/);
  assert.match(rehearsalWorkflow, /secrets\.PREVIEW_DATABASE_ADMIN_URL/);
  assert.match(rehearsalWorkflow, /npm run db:migrate/);
  assert.match(rehearsalWorkflow, /npm run db:rehearse-release/g);
  assert.doesNotMatch(rehearsalWorkflow, /secrets\.(?:PRODUCTION|DATABASE_URL|DATABASE_ADMIN_URL)/);
  assert.doesNotMatch(rehearsalWorkflow, /vercel (?:deploy|promote|--prod)/);
  assert.doesNotMatch(rehearsalWorkflow, /upload-artifact/);
  assert.doesNotMatch(rehearsalWorkflow, /set -x|printenv|env\s*$/m);
});
