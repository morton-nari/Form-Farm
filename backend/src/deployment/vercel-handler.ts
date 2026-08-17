import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';

export type VercelApplicationFactory = () => { readonly app: FastifyInstance };
export type VercelHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void>;

export function createVercelHandler(createApplication: VercelApplicationFactory): VercelHandler {
  let readyApplication: FastifyInstance | undefined;
  let initialization: Promise<FastifyInstance> | undefined;

  return async (request, response) => {
    let app: FastifyInstance;
    try {
      initialization ??= (async () => {
        const { app } = createApplication();
        try {
          await app.ready();
          readyApplication = app;
          return app;
        } catch (error) {
          await app.close().catch(() => undefined);
          throw error;
        }
      })();
      app = readyApplication ?? (await initialization);
    } catch {
      initialization = undefined;
      if (!response.headersSent) {
        response.statusCode = 500;
        response.setHeader('content-type', 'application/json; charset=utf-8');
      }
      if (!response.writableEnded && !response.headersSent) {
        response.end(
          JSON.stringify({ error: { code: 'internal_error', message: 'Internal server error.' } }),
        );
      } else if (!response.writableEnded) {
        response.end();
      }
      return;
    }

    await forwardRequest(app, request, response);
  };
}

function forwardRequest(
  app: FastifyInstance,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const settle = () => resolve();
    response.once('finish', settle);
    response.once('close', settle);
    response.once('error', reject);
    app.server.emit('request', request, response);
    if (response.writableEnded) resolve();
  });
}
