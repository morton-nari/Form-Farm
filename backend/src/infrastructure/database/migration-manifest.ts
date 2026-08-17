export const migrationNames = [
  '0000_initial_form_read.sql',
  '0001_versioned_form_submissions.sql',
  '0002_authentication_ownership_core.sql',
  '0003_owner_form_drafts.sql',
] as const;

export function verifyMigrationLedger(names: readonly string[]): void {
  if (
    names.length !== migrationNames.length ||
    names.some((name, index) => name !== migrationNames[index])
  ) {
    throw new Error('Release rehearsal found an unexpected migration level or ordering.');
  }
}
