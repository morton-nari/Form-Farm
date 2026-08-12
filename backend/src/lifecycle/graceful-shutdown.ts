import type { FastifyInstance } from 'fastify';

type ShutdownSignal = 'SIGINT' | 'SIGTERM';
type SignalListener = () => void;

export interface ShutdownRuntime {
  exitCode: string | number | null | undefined;
  once(signal: ShutdownSignal, listener: SignalListener): unknown;
  off(signal: ShutdownSignal, listener: SignalListener): unknown;
}

export function installGracefulShutdown(
  app: FastifyInstance,
  runtime: ShutdownRuntime = process,
): () => void {
  let shuttingDown = false;

  const shutdown = async (signal: ShutdownSignal): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'Shutting down');

    try {
      await app.close();
      runtime.exitCode = 0;
    } catch (error) {
      app.log.error({ err: error }, 'Graceful shutdown failed');
      runtime.exitCode = 1;
    }
  };

  const onSigint = (): void => void shutdown('SIGINT');
  const onSigterm = (): void => void shutdown('SIGTERM');

  runtime.once('SIGINT', onSigint);
  runtime.once('SIGTERM', onSigterm);

  return () => {
    runtime.off('SIGINT', onSigint);
    runtime.off('SIGTERM', onSigterm);
  };
}
