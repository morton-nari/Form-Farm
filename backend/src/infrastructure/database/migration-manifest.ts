export const migrationNames = [
  '0000_initial_form_read.sql',
  '0001_versioned_form_submissions.sql',
  '0002_authentication_ownership_core.sql',
  '0003_owner_form_drafts.sql',
] as const;

export const applicationTableNames = [
  'forms',
  'form_versions',
  'form_submissions',
  'users',
  'user_sessions',
  'auth_rate_limits',
  'form_drafts',
] as const;

export function verifyMigrationLedger(names: readonly string[]): void {
  if (
    names.length !== migrationNames.length ||
    names.some((name, index) => name !== migrationNames[index])
  ) {
    throw new Error('Release rehearsal found an unexpected migration level or ordering.');
  }
}

export function verifyMigrationLedgerPrefix(names: readonly string[]): void {
  if (
    names.length > migrationNames.length ||
    names.some((name, index) => name !== migrationNames[index])
  ) {
    throw new Error('Production release found an unexpected migration level or ordering.');
  }
}
