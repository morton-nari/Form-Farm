export type ApplicationErrorCode = 'invalid_input' | 'not_found' | 'conflict';

export class ApplicationError extends Error {
  override readonly name = 'ApplicationError';

  constructor(
    readonly code: ApplicationErrorCode,
    message: string,
  ) {
    super(message);
  }
}
