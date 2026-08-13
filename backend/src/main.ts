import { createApplication } from './app.js';
import { loadBackendConfig } from './config/backend-config.js';
import { installGracefulShutdown } from './lifecycle/graceful-shutdown.js';
import { createDatabase } from './infrastructure/database/create-database.js';
import { PostgresFormDefinitionSource } from './infrastructure/forms/postgres-form-definition-source.js';
import { PostgresFormSubmissionTransaction } from './infrastructure/forms/postgres-form-submission-transaction.js';

const config = loadBackendConfig();
const database = createDatabase(config);
const app = createApplication({
  config,
  formDefinitionSource: new PostgresFormDefinitionSource(database.database),
  formSubmissionTransaction: new PostgresFormSubmissionTransaction(database.database),
  closeInfrastructure: database.close,
});
const removeShutdownHandlers = installGracefulShutdown(app);

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  removeShutdownHandlers();
  app.log.error({ err: error }, 'Backend failed to start');
  process.exitCode = 1;
  await app.close();
}
