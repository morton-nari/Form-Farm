import type { FastifyInstance } from 'fastify';
import { FORM_IDENTIFIER_PATTERN } from '@form-farm/form-domain';

import type { SubmitForm } from '../../application/forms/submit-form.js';

interface Options {
  readonly submitForm: SubmitForm;
}
interface Params {
  readonly formId: string;
}
interface Body {
  readonly formVersion: number;
  readonly answers: unknown;
}
interface Headers {
  readonly 'idempotency-key': string;
}

export async function registerFormSubmissionRoute(
  app: FastifyInstance,
  options: Options,
): Promise<void> {
  app.post<{ Params: Params; Body: Body; Headers: Headers }>(
    '/api/v1/forms/:formId/submissions',
    {
      bodyLimit: 256 * 1024,
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['formId'],
          properties: {
            formId: { type: 'string', pattern: FORM_IDENTIFIER_PATTERN },
          },
        },
        headers: {
          type: 'object',
          required: ['idempotency-key'],
          properties: {
            'idempotency-key': { type: 'string', minLength: 1, maxLength: 64 },
          },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['formVersion', 'answers'],
          properties: {
            formVersion: { type: 'integer', minimum: 1 },
            answers: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
    async (request, reply) => {
      const result = await options.submitForm.execute({
        formId: request.params.formId,
        formVersion: request.body.formVersion,
        answers: request.body.answers,
        idempotencyKey: request.headers['idempotency-key'],
      });
      return reply.status(result.replayed ? 200 : 201).send(result);
    },
  );
}
