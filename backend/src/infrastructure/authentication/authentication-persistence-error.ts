export class AuthenticationPersistenceError extends Error {
  override readonly name = 'AuthenticationPersistenceError';

  constructor() {
    super('The authentication persistence operation failed.');
  }
}

export async function safelyPersistAuthentication<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new AuthenticationPersistenceError();
  }
}
