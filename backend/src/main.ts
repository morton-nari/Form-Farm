import { createComposedApplication } from './composition/create-composed-application.js';
import { installGracefulShutdown } from './lifecycle/graceful-shutdown.js';

const { app, config } = createComposedApplication();
const removeShutdownHandlers = installGracefulShutdown(app);

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  removeShutdownHandlers();
  app.log.error({ err: error }, 'Backend failed to start');
  process.exitCode = 1;
  await app.close();
}
