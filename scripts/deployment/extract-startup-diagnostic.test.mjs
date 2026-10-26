import assert from 'node:assert/strict';
import { test } from 'node:test';

import { extractStartupDiagnostic } from './extract-startup-diagnostic.mjs';

test('extracts and normalizes only an allowlisted configuration diagnostic', () => {
  assert.equal(
    extractStartupDiagnostic('{"message":"form-farm-startup:configuration:publicOrigin,auth"}'),
    'form-farm-startup:configuration:auth,publicOrigin',
  );
});

test('accepts the fixed initialization diagnostic', () => {
  assert.equal(
    extractStartupDiagnostic('prefix form-farm-startup:initialization suffix'),
    'form-farm-startup:initialization',
  );
});

test('fails closed for unknown fields, ambiguity, malformed input, and secrets', () => {
  const secret = 'postgresql://form_farm_app:password@example.neon.tech/neondb';
  for (const input of [
    `form-farm-startup:configuration:databaseUrl,${secret}`,
    'form-farm-startup:configuration:notAllowlisted',
    'form-farm-startup:configuration:',
    'form-farm-startup:initialization form-farm-startup:configuration:auth',
    secret,
  ]) {
    const result = extractStartupDiagnostic(input);
    assert.equal(result, 'form-farm-startup:unavailable');
    assert.equal(result.includes(secret), false);
  }
});
