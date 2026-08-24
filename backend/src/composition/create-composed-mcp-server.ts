import {
  AnalyzeDraftChangeImpact,
  CompareFormVersions,
  InspectForm,
} from '../application/forms/form-intelligence.js';
import { loadBackendConfig } from '../config/backend-config.js';
import { readLocalDeveloperCredential } from '../config/local-developer-credential-config.js';
import { createDatabase } from '../infrastructure/database/create-database.js';
import { PostgresFormIntelligenceSource } from '../infrastructure/forms/postgres-form-intelligence-source.js';
import { createFormFarmMcpServer } from '../mcp/form-farm-mcp-server.js';
import { createAuthenticationServices } from './create-authentication-services.js';

export function createComposedMcpRuntime(environment: NodeJS.ProcessEnv = process.env) {
  const config = loadBackendConfig(environment);
  const rawCredential = readLocalDeveloperCredential(environment);
  const database = createDatabase(config);
  const authentication = createAuthenticationServices(
    database.database,
    config.auth,
    config.deploymentStage,
  );
  const resolveDeveloperCredential = authentication.resolveDeveloperCredential;
  if (!resolveDeveloperCredential)
    throw new Error('Developer credential authentication is unavailable.');
  const source = new PostgresFormIntelligenceSource(database.database);

  return {
    createServer: () =>
      createFormFarmMcpServer({
        authenticate: () => resolveDeveloperCredential.execute(rawCredential),
        inspectForm: new InspectForm(source),
        compareFormVersions: new CompareFormVersions(source),
        analyzeDraftChangeImpact: new AnalyzeDraftChangeImpact(source),
      }),
    close: database.close,
  };
}
