import { createApplication } from './app.js';
import { loadBackendConfig } from './config/backend-config.js';
import { installGracefulShutdown } from './lifecycle/graceful-shutdown.js';

const config = loadBackendConfig();
const app = createApplication({ config });
const removeShutdownHandlers = installGracefulShutdown(app);

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  removeShutdownHandlers();
  app.log.error({ err: error }, 'Backend failed to start');
  process.exitCode = 1;
  await app.close();
}
