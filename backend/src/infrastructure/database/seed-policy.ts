export function assertDatabaseSeedAllowed(environment: NodeJS.ProcessEnv): void {
  if (environment['NODE_ENV'] === 'production') {
    throw new Error('Database seeding is disabled in production.');
  }
  if (environment['ALLOW_DATABASE_SEED'] !== 'true') {
    throw new Error('Set ALLOW_DATABASE_SEED=true to run the development seed.');
  }
}
