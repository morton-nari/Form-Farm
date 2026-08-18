import { readFile, readdir } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  applicationTableNames,
  migrationNames,
  verifyMigrationLedger,
  verifyMigrationLedgerPrefix,
} from './migration-manifest.js';

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

  it('accepts only an exact migration prefix before a Production migration', () => {
    expect(() => verifyMigrationLedgerPrefix([])).not.toThrow();
    expect(() => verifyMigrationLedgerPrefix(migrationNames.slice(0, 2))).not.toThrow();
    expect(() => verifyMigrationLedgerPrefix(migrationNames)).not.toThrow();
    expect(() => verifyMigrationLedgerPrefix(['0001_versioned_form_submissions.sql'])).toThrow(
      /unexpected migration level or ordering/,
    );
  });

  it('lists every application table created by committed migration SQL', async () => {
    const createdTables = (
      await Promise.all(
        migrationNames.map(async (name) =>
          Array.from(
            (await readFile(new URL(`../../../drizzle/${name}`, import.meta.url), 'utf8')).matchAll(
              /create table\s+"?([a-z_]+)"?/gi,
            ),
            (match) => match[1],
          ),
        ),
      )
    ).flat();
    expect([...applicationTableNames].sort()).toEqual(createdTables.sort());
  });
});
