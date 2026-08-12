import { ApplicationError } from '../../application/errors/application-error.js';
import type { ApplicationErrorCode } from '../../application/errors/application-error.js';
import type { FastifyInstance } from 'fastify';

interface ErrorResponse {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

const applicationStatus: Readonly<Record<ApplicationErrorCode, number>> = {
  invalid_input: 400,
  not_found: 404,
  conflict: 409,
};

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApplicationError) {
      return reply.status(applicationStatus[error.code]).send(
        response(error.code, error.message),
      );
    }

    if (hasRequestValidationErrors(error)) {
      return reply.status(400).send(response('invalid_request', 'The request is invalid.'));
    }

    request.log.error({ err: error }, 'Unhandled request error');
    return reply.status(500).send(response('internal_error', 'An unexpected error occurred.'));
  });
}

function hasRequestValidationErrors(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'validation' in error;
}

function response(code: string, message: string): ErrorResponse {
  return { error: { code, message } };
}
