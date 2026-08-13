import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

import { GetFormDefinition } from './application/forms/get-form-definition.js';
import type { FormDefinitionSource } from './application/ports/form-definition-source.js';
import type { BackendConfig } from './config/backend-config.js';
import { registerErrorHandler } from './http/errors/register-error-handler.js';
import { registerFormDefinitionRoute } from './http/routes/form-definition.route.js';
import { registerHealthRoute } from './http/routes/health.route.js';

export interface CreateApplicationOptions {
  readonly config: BackendConfig;
  readonly formDefinitionSource: FormDefinitionSource;
  readonly closeInfrastructure?: () => Promise<void>;
}

export function createApplication(options: CreateApplicationOptions): FastifyInstance {
  const app = Fastify({
    logger: options.config.logLevel === 'silent' ? false : { level: options.config.logLevel },
  });

  registerErrorHandler(app);
  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({
      error: { code: 'route_not_found', message: 'Route not found.' },
    }),
  );
  void app.register(registerHealthRoute);
  void app.register(registerFormDefinitionRoute, {
    getFormDefinition: new GetFormDefinition(options.formDefinitionSource),
  });
  if (options.closeInfrastructure) {
    app.addHook('onClose', options.closeInfrastructure);
  }

  return app;
}
