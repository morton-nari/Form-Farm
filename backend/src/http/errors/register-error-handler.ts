import { ApplicationError } from '../../application/errors/application-error.js';
import { InvalidFormSubmissionError } from '../../application/forms/submit-form.js';
import type { ApplicationErrorCode } from '../../application/errors/application-error.js';
import type { FastifyInstance } from 'fastify';

interface ErrorResponse {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
  readonly issues?: unknown;
}

const applicationStatus: Readonly<Record<ApplicationErrorCode, number>> = {
  invalid_input: 400,
  not_found: 404,
  conflict: 409,
};

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof InvalidFormSubmissionError) {
      return reply.status(422).send({
        error: { code: 'invalid_submission', message: 'The submitted answers are invalid.' },
        issues: error.issues,
      });
    }
    if (error instanceof ApplicationError) {
      const responseCode = error.code === 'invalid_input' ? 'invalid_request' : error.code;
      return reply
        .status(applicationStatus[error.code])
        .send(response(responseCode, error.message));
    }

    if (hasRequestValidationErrors(error)) {
      return reply.status(400).send(response('invalid_request', 'The request is invalid.'));
    }

    if (hasStatusCode(error, 413)) {
      return reply
        .status(413)
        .send(response('payload_too_large', 'The request payload is too large.'));
    }

    request.log.error({ err: error }, 'Unhandled request error');
    return reply.status(500).send(response('internal_error', 'An unexpected error occurred.'));
  });
}

function hasStatusCode(error: unknown, statusCode: number): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    error.statusCode === statusCode
  );
}

function hasRequestValidationErrors(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'validation' in error;
}

function response(code: string, message: string): ErrorResponse {
  return { error: { code, message } };
}
