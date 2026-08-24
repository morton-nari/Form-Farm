export const LOCAL_DEVELOPER_CREDENTIAL_ENVIRONMENT_VARIABLE =
  'FORM_FARM_DEVELOPER_CREDENTIAL' as const;

export class LocalDeveloperCredentialConfigurationError extends Error {
  override readonly name = 'LocalDeveloperCredentialConfigurationError';

  constructor(readonly field: 'APP_ENV' | typeof LOCAL_DEVELOPER_CREDENTIAL_ENVIRONMENT_VARIABLE) {
    super(`Invalid local developer credential configuration: ${field}.`);
  }
}

export function readLocalDeveloperCredential(environment: NodeJS.ProcessEnv = process.env): string {
  if (environment['APP_ENV'] !== 'development') {
    throw new LocalDeveloperCredentialConfigurationError('APP_ENV');
  }
  const credential = environment[LOCAL_DEVELOPER_CREDENTIAL_ENVIRONMENT_VARIABLE];
  if (
    typeof credential !== 'string' ||
    credential.length < 1 ||
    credential.length > 256 ||
    credential !== credential.trim()
  ) {
    throw new LocalDeveloperCredentialConfigurationError(
      LOCAL_DEVELOPER_CREDENTIAL_ENVIRONMENT_VARIABLE,
    );
  }
  return credential;
}
