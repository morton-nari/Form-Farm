import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

import type { BackendConfig } from './config/backend-config.js';
import { registerErrorHandler } from './http/errors/register-error-handler.js';
import { registerHealthRoute } from './http/routes/health.route.js';

export interface CreateApplicationOptions {
  readonly config: BackendConfig;
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

  return app;
}
