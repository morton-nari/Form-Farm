export class ForbiddenAuthenticationRequestError extends Error {
  override readonly name = 'ForbiddenAuthenticationRequestError';

  constructor() {
    super('The authentication request is forbidden.');
  }
}

export class UnauthenticatedError extends Error {
  override readonly name = 'UnauthenticatedError';

  constructor() {
    super('Authentication is required.');
  }
}
