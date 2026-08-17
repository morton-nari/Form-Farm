import { createComposedApplication } from '../backend/src/composition/create-composed-application.js';
import { createVercelHandler } from '../backend/src/deployment/vercel-handler.js';

export default createVercelHandler(createComposedApplication);
