import Fastify from 'fastify';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';

import { GetFormDefinition } from './application/forms/get-form-definition.js';
import { SubmitForm } from './application/forms/submit-form.js';
import type { FormDefinitionSource } from './application/ports/form-definition-source.js';
import type { FormSubmissionTransaction } from './application/ports/form-submission-transaction.js';
import type { BackendConfig } from './config/backend-config.js';
import { registerErrorHandler } from './http/errors/register-error-handler.js';
import { registerFormDefinitionRoute } from './http/routes/form-definition.route.js';
import { registerHealthRoute } from './http/routes/health.route.js';
import { registerFormSubmissionRoute } from './http/routes/form-submission.route.js';
import { registerAuthenticationRoutes } from './http/routes/authentication.route.js';
import type { AuthenticationRateLimiter } from './http/authentication/authentication-rate-limiter.js';
import type { XsrfTokenService } from './http/authentication/xsrf-token-service.js';

export interface AuthenticationApplicationServices {
  readonly registerAccount: {
    execute(input: { readonly email: string; readonly password: string }): Promise<void>;
  };
  readonly login: {
    execute(input: {
      readonly email: string;
      readonly password: string;
    }): Promise<{ readonly sessionCredential: string }>;
  };
  readonly logout: { execute(sessionCredential: string): Promise<void> };
  readonly resolveSession: {
    execute(sessionCredential: string): Promise<{ readonly userId: string } | undefined>;
  };
  readonly rateLimiter: AuthenticationRateLimiter;
  readonly xsrfTokens: XsrfTokenService;
}

export interface CreateApplicationOptions {
  readonly config: BackendConfig;
  readonly formDefinitionSource: FormDefinitionSource;
  readonly formSubmissionTransaction: FormSubmissionTransaction;
  readonly authentication?: AuthenticationApplicationServices;
  readonly loggerInstance?: FastifyBaseLogger;
  readonly closeInfrastructure?: () => Promise<void>;
}

export function createApplication(options: CreateApplicationOptions): FastifyInstance {
  const app = Fastify({
    ...(options.loggerInstance
      ? { loggerInstance: options.loggerInstance }
      : {
          logger:
            options.config.logLevel === 'silent'
              ? false
              : {
                  level: options.config.logLevel,
                  redact: [
                    'req.headers.cookie',
                    'req.headers.authorization',
                    'req.headers.x-xsrf-token',
                    'res.headers.set-cookie',
                  ],
                },
        }),
    trustProxy: options.config.auth.trustedProxyHops || false,
  });

  registerErrorHandler(app);
  app.addHook('onSend', async (request, reply) => {
    if (request.url.startsWith('/api/v1/auth/')) void reply.header('cache-control', 'no-store');
  });
  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({
      error: { code: 'route_not_found', message: 'Route not found.' },
    }),
  );
  void app.register(registerHealthRoute);
  if (options.authentication) {
    void app.register(fastifyCookie);
    void app.register(registerAuthenticationRoutes, {
      config: options.config.auth,
      ...options.authentication,
    });
  }
  void app.register(registerFormDefinitionRoute, {
    getFormDefinition: new GetFormDefinition(options.formDefinitionSource),
  });
  void app.register(registerFormSubmissionRoute, {
    submitForm: new SubmitForm(options.formSubmissionTransaction),
  });
  if (options.closeInfrastructure) {
    app.addHook('onClose', options.closeInfrastructure);
  }

  return app;
}
