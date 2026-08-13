import { FORM_IDENTIFIER_PATTERN } from '@form-farm/form-domain';
import type { FastifyPluginAsync } from 'fastify';

import type { GetAccessibleFormDefinition } from '../../application/forms/get-accessible-form-definition.js';
import type { ListAccessibleForms } from '../../application/forms/list-accessible-forms.js';
import { resolveAuthenticatedUser } from '../authentication/resolve-authenticated-user.js';

interface OwnedFormsRouteOptions {
  readonly secureCookies: boolean;
  readonly resolveSession: {
    execute(sessionCredential: string): Promise<{ readonly userId: string } | undefined>;
  };
  readonly getFormDefinition: GetAccessibleFormDefinition;
  readonly listForms: ListAccessibleForms;
}

export const registerOwnedFormsRoutes: FastifyPluginAsync<OwnedFormsRouteOptions> = async (
  app,
  options,
) => {
  app.get('/api/v1/forms', async (request) => {
    const userId = await resolveAuthenticatedUser(
      request,
      options.secureCookies,
      options.resolveSession,
    );
    return { forms: await options.listForms.execute(userId) };
  });

  app.get<{ Params: { readonly formId: string } }>(
    '/api/v1/forms/:formId',
    {
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['formId'],
          properties: { formId: { type: 'string', pattern: FORM_IDENTIFIER_PATTERN } },
        },
      },
    },
    async (request) => {
      const userId = await resolveAuthenticatedUser(
        request,
        options.secureCookies,
        options.resolveSession,
      );
      return options.getFormDefinition.execute(request.params.formId, userId);
    },
  );
};
