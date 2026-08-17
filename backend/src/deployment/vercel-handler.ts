import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';

export type VercelApplicationFactory = () => { readonly app: FastifyInstance };
export type VercelHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void>;

const VERCEL_PATH_PARAMETER = '__form_farm_path';

export function restoreVercelRequestPath(request: IncomingMessage): void {
  if (request.url === undefined) return;

  const rewrittenUrl = new URL(request.url, 'http://vercel.internal');
  const path = rewrittenUrl.searchParams.get(VERCEL_PATH_PARAMETER);
  if (path === null) return;

  rewrittenUrl.searchParams.delete(VERCEL_PATH_PARAMETER);
  const search = rewrittenUrl.searchParams.toString();
  request.url = `/api/${path}${search.length > 0 ? `?${search}` : ''}`;
}

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
      sendSafeInternalError(response);
      return;
    }

    try {
      await forwardRequest(app, request, response);
    } catch {
      sendSafeInternalError(response);
    }
  };
}

function forwardRequest(
  app: FastifyInstance,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      response.removeListener('finish', succeed);
      response.removeListener('close', succeed);
      response.removeListener('error', fail);
    };
    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    response.once('finish', succeed);
    response.once('close', succeed);
    response.once('error', fail);
    try {
      app.server.emit('request', request, response);
      if (response.writableEnded) succeed();
    } catch (error) {
      fail(error instanceof Error ? error : new Error('Request forwarding failed.'));
    }
  });
}

function sendSafeInternalError(response: ServerResponse): void {
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
}
