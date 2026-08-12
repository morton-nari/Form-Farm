import { describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { installGracefulShutdown, type ShutdownRuntime } from './graceful-shutdown.js';

class FakeRuntime implements ShutdownRuntime {
  exitCode: number | undefined;
  readonly listeners = new Map<string, () => void>();

  once(signal: string, listener: () => void): void {
    this.listeners.set(signal, listener);
  }

  off(signal: string, listener: () => void): void {
    if (this.listeners.get(signal) === listener) this.listeners.delete(signal);
  }

  emit(signal: string): void {
    this.listeners.get(signal)?.();
  }
}

describe('installGracefulShutdown', () => {
  it('closes the application once and supports removing signal handlers', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const runtime = new FakeRuntime();
    const app = {
      close,
      log: { info: vi.fn(), error: vi.fn() },
    } as unknown as FastifyInstance;

    const removeHandlers = installGracefulShutdown(app, runtime);
    runtime.emit('SIGTERM');
    runtime.emit('SIGINT');
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());

    expect(runtime.exitCode).toBe(0);
    removeHandlers();
    expect(runtime.listeners.size).toBe(0);
  });

  it('sets a failing exit code when cleanup fails', async () => {
    const runtime = new FakeRuntime();
    const app = {
      close: vi.fn().mockRejectedValue(new Error('close failed')),
      log: { info: vi.fn(), error: vi.fn() },
    } as unknown as FastifyInstance;

    installGracefulShutdown(app, runtime);
    runtime.emit('SIGINT');
    await vi.waitFor(() => expect(runtime.exitCode).toBe(1));
  });
});
