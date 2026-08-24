import { createApplication } from '../app.js';
import { loadBackendConfig } from '../config/backend-config.js';
import { createAuthenticationServices } from './create-authentication-services.js';
import { createDatabase } from '../infrastructure/database/create-database.js';
import { PostgresAccessibleFormSource } from '../infrastructure/forms/postgres-accessible-form-source.js';
import { PostgresBootstrapFormDraftTransaction } from '../infrastructure/forms/postgres-bootstrap-form-draft-transaction.js';
import { PostgresCreateFormDraftTransaction } from '../infrastructure/forms/postgres-create-form-draft-transaction.js';
import { PostgresFormDefinitionSource } from '../infrastructure/forms/postgres-form-definition-source.js';
import { PostgresFormSubmissionTransaction } from '../infrastructure/forms/postgres-form-submission-transaction.js';
import { PostgresOwnerFormDraftStore } from '../infrastructure/forms/postgres-owner-form-draft-store.js';
import { PostgresOwnerFormManagementSource } from '../infrastructure/forms/postgres-owner-form-management-source.js';
import { PostgresPublishFormDraftTransaction } from '../infrastructure/forms/postgres-publish-form-draft-transaction.js';

export function createComposedApplication(environment: NodeJS.ProcessEnv = process.env) {
  const config = loadBackendConfig(environment);
  const database = createDatabase(config);

  return {
    app: createApplication({
      config,
      formDefinitionSource: new PostgresFormDefinitionSource(database.database),
      formSubmissionTransaction: new PostgresFormSubmissionTransaction(database.database),
      authentication: createAuthenticationServices(
        database.database,
        config.auth,
        config.deploymentStage,
      ),
      accessibleFormSource: new PostgresAccessibleFormSource(database.database),
      createFormDraftTransaction: new PostgresCreateFormDraftTransaction(database.database),
      ownerFormDraftStore: new PostgresOwnerFormDraftStore(database.database),
      publishFormDraftTransaction: new PostgresPublishFormDraftTransaction(database.database),
      bootstrapFormDraftTransaction: new PostgresBootstrapFormDraftTransaction(database.database),
      ownerFormManagementSource: new PostgresOwnerFormManagementSource(database.database),
      closeInfrastructure: database.close,
    }),
    config,
  };
}
