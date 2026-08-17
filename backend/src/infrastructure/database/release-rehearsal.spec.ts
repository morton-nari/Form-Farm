import { describe, expect, it } from 'vitest';

import { migrationNames, verifyMigrationLedger } from './migration-manifest.js';

describe('verifyMigrationLedger', () => {
  it('accepts the exact committed migration order', () => {
    expect(() => verifyMigrationLedger(migrationNames)).not.toThrow();
  });

  it.each([
    migrationNames.slice(0, -1),
    [...migrationNames, '0004_unreviewed.sql'],
    [...migrationNames].reverse(),
  ])('rejects missing, unexpected, or reordered migration state', (names) => {
    expect(() => verifyMigrationLedger(names)).toThrowError(
      /unexpected migration level or ordering/,
    );
  });
});
