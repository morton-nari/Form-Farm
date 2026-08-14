import { createApplication } from './app.js';
import { loadBackendConfig } from './config/backend-config.js';
import { installGracefulShutdown } from './lifecycle/graceful-shutdown.js';
import { createDatabase } from './infrastructure/database/create-database.js';
import { PostgresFormDefinitionSource } from './infrastructure/forms/postgres-form-definition-source.js';
import { PostgresFormSubmissionTransaction } from './infrastructure/forms/postgres-form-submission-transaction.js';
import { createAuthenticationServices } from './composition/create-authentication-services.js';
import { PostgresAccessibleFormSource } from './infrastructure/forms/postgres-accessible-form-source.js';
import { PostgresCreateFormDraftTransaction } from './infrastructure/forms/postgres-create-form-draft-transaction.js';
import { PostgresOwnerFormDraftStore } from './infrastructure/forms/postgres-owner-form-draft-store.js';
import { PostgresPublishFormDraftTransaction } from './infrastructure/forms/postgres-publish-form-draft-transaction.js';
import { PostgresBootstrapFormDraftTransaction } from './infrastructure/forms/postgres-bootstrap-form-draft-transaction.js';

const config = loadBackendConfig();
const database = createDatabase(config);
const app = createApplication({
  config,
  formDefinitionSource: new PostgresFormDefinitionSource(database.database),
  formSubmissionTransaction: new PostgresFormSubmissionTransaction(database.database),
  authentication: createAuthenticationServices(database.database, config.auth),
  accessibleFormSource: new PostgresAccessibleFormSource(database.database),
  createFormDraftTransaction: new PostgresCreateFormDraftTransaction(database.database),
  ownerFormDraftStore: new PostgresOwnerFormDraftStore(database.database),
  publishFormDraftTransaction: new PostgresPublishFormDraftTransaction(database.database),
  bootstrapFormDraftTransaction: new PostgresBootstrapFormDraftTransaction(database.database),
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
