import { readdir } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { migrationNames, verifyMigrationLedger } from './migration-manifest.js';

describe('verifyMigrationLedger', () => {
  it('lists every committed migration SQL file exactly once', async () => {
    const entries = await readdir(new URL('../../../drizzle/', import.meta.url));
    const sqlFiles = entries.filter((entry) => entry.endsWith('.sql')).sort();

    expect([...migrationNames]).toEqual(sqlFiles);
  });

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
