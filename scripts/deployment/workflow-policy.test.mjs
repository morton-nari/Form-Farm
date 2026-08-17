import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const smokeWorkflow = await readFile(
  new URL('../../.github/workflows/deployed-preview-smoke.yml', import.meta.url),
  'utf8',
);
const promotionWorkflow = await readFile(
  new URL('../../.github/workflows/production-promotion-gate.yml', import.meta.url),
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

test('production gate is manual, protected, and contains no deployment or migration command', () => {
  assert.match(promotionWorkflow, /workflow_dispatch:/);
  assert.match(promotionWorkflow, /environment: Production/);
  assert.match(promotionWorkflow, /required_checks_green:/);
  assert.match(promotionWorkflow, /migration_state_reviewed:/);
  assert.match(promotionWorkflow, /APPROVAL_REFERENCE.*\n[\s\S]*\[\[ "\$APPROVAL_REFERENCE" =~/);
  assert.doesNotMatch(promotionWorkflow, /vercel (?:deploy|promote|--prod)/);
  assert.doesNotMatch(promotionWorkflow, /npm run db:migrate/);
});
