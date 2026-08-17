import type { IncomingMessage, ServerResponse } from 'node:http';

import { createComposedApplication } from '../backend/src/composition/create-composed-application.js';
import {
  createVercelHandler,
  restoreVercelRequestPath,
} from '../backend/src/deployment/vercel-handler.js';

const handler = createVercelHandler(createComposedApplication);

export default (request: IncomingMessage, response: ServerResponse): Promise<void> => {
  if (!restoreVercelRequestPath(request)) {
    response.statusCode = 400;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ error: { code: 'bad_request', message: 'Bad request.' } }));
    return Promise.resolve();
  }
  return handler(request, response);
};
