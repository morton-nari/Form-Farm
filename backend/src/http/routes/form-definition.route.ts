import type { FastifyInstance } from 'fastify';

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
            formId: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]*$' },
          },
        },
      },
    },
    async (request) => options.getFormDefinition.execute(request.params.formId),
  );
}
