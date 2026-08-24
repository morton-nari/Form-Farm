export class DeveloperCredentialPersistenceError extends Error {
  override readonly name = 'DeveloperCredentialPersistenceError';

  constructor() {
    super('The developer credential persistence operation failed.');
  }
}

export async function safelyPersistDeveloperCredential<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new DeveloperCredentialPersistenceError();
  }
}
