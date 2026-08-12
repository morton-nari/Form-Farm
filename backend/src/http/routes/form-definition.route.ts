import type { FastifyInstance } from 'fastify';
import { FORM_IDENTIFIER_PATTERN } from '@form-farm/form-domain';

import type { GetFormDefinition } from '../../application/forms/get-form-definition.js';

interface FormDefinitionRouteOptions {
  readonly getFormDefinition: GetFormDefinition;
}

interface FormDefinitionParameters {
  readonly formId: string;
}

export async function registerFormDefinitionRoute(
  app: FastifyInstance,
  options: FormDefinitionRouteOptions,
): Promise<void> {
  app.get<{ Params: FormDefinitionParameters }>(
    '/api/v1/forms/:formId',
    {
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['formId'],
          properties: {
            formId: { type: 'string', pattern: FORM_IDENTIFIER_PATTERN },
          },
        },
      },
    },
    async (request) => options.getFormDefinition.execute(request.params.formId),
  );
}
