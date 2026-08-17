import type { IncomingMessage, ServerResponse } from 'node:http';

import { createComposedApplication } from '../backend/src/composition/create-composed-application.js';
import {
  createVercelHandler,
  restoreVercelRequestPath,
} from '../backend/src/deployment/vercel-handler.js';

const handler = createVercelHandler(createComposedApplication);

export default (request: IncomingMessage, response: ServerResponse): Promise<void> => {
  restoreVercelRequestPath(request);
  return handler(request, response);
};
