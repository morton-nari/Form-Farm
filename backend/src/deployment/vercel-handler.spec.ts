import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { createVercelHandler } from './vercel-handler.js';

describe('createVercelHandler', () => {
  it('prepares one application and forwards warm requests without opening a listener', async () => {
    const server = new EventEmitter();
    const ready = vi.fn(async () => undefined);
    const createApplication = vi.fn(() => ({ app: { ready, server } as unknown as FastifyInstance }));
    const received: unknown[][] = [];
    server.on('request', (...arguments_) => {
      received.push(arguments_);
      (arguments_[1] as EventEmitter).emit('finish');
    });
    const handler = createVercelHandler(createApplication);
    const first = requestAndResponse();
    const second = requestAndResponse();

    await handler(first.request, first.response);
    await handler(second.request, second.response);

    expect(createApplication).toHaveBeenCalledTimes(1);
    expect(ready).toHaveBeenCalledTimes(1);
    expect(received).toEqual([
      [first.request, first.response],
      [second.request, second.response],
    ]);
    expect(responseListenerCounts(first.response)).toEqual([0, 0, 0]);
    expect(responseListenerCounts(second.response)).toEqual([0, 0, 0]);
  });

  it('shares one pending cold-start initialization across concurrent requests', async () => {
    const server = new EventEmitter();
    const readiness = deferred<void>();
    const ready = vi.fn(() => readiness.promise);
    const createApplication = vi.fn(() => ({ app: { ready, server } as unknown as FastifyInstance }));
    const forwarded = vi.fn((_: unknown, response: EventEmitter) => response.emit('finish'));
    server.on('request', forwarded);
    const handler = createVercelHandler(createApplication);
    const first = requestAndResponse();
    const second = requestAndResponse();

    const firstInvocation = handler(first.request, first.response);
    const secondInvocation = handler(second.request, second.response);
    await Promise.resolve();

    expect(createApplication).toHaveBeenCalledTimes(1);
    expect(ready).toHaveBeenCalledTimes(1);
    expect(forwarded).not.toHaveBeenCalled();

    readiness.resolve();
    await Promise.all([firstInvocation, secondInvocation]);

    expect(forwarded).toHaveBeenCalledTimes(2);
    expect(forwarded).toHaveBeenCalledWith(first.request, first.response);
    expect(forwarded).toHaveBeenCalledWith(second.request, second.response);
  });

  it('fails safely and allows a fresh initialization attempt after a cold-start failure', async () => {
    const server = new EventEmitter();
    const close = vi.fn(async () => undefined);
    const createApplication = vi
      .fn()
      .mockReturnValueOnce({
        app: {
          ready: vi.fn(async () => Promise.reject(new Error('secret connection detail'))),
          close,
          server,
        } as unknown as FastifyInstance,
      })
      .mockReturnValueOnce({
        app: { ready: vi.fn(async () => undefined), server } as unknown as FastifyInstance,
      });
    const handler = createVercelHandler(createApplication);
    const failed = requestAndResponse();
    const recovered = requestAndResponse();
    const forwarded = vi.fn();
    server.on('request', (...arguments_) => {
      forwarded(...arguments_);
      (arguments_[1] as EventEmitter).emit('finish');
    });

    await handler(failed.request, failed.response);
    await handler(recovered.request, recovered.response);

    expect(failed.response.statusCode).toBe(500);
    expect(failed.end).toHaveBeenCalledWith(
      JSON.stringify({ error: { code: 'internal_error', message: 'Internal server error.' } }),
    );
    expect(createApplication).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(1);
    expect(forwarded).toHaveBeenCalledWith(recovered.request, recovered.response);
  });

  it('shares one failing cold start, closes it once, and permits later recovery', async () => {
    const server = new EventEmitter();
    const readiness = deferred<void>();
    const close = vi.fn(async () => undefined);
    const createApplication = vi
      .fn()
      .mockReturnValueOnce({
        app: { ready: vi.fn(() => readiness.promise), close, server } as unknown as FastifyInstance,
      })
      .mockReturnValueOnce({
        app: { ready: vi.fn(async () => undefined), server } as unknown as FastifyInstance,
      });
    const forwarded = vi.fn((_: unknown, response: EventEmitter) => response.emit('finish'));
    server.on('request', forwarded);
    const handler = createVercelHandler(createApplication);
    const first = requestAndResponse();
    const second = requestAndResponse();

    const firstInvocation = handler(first.request, first.response);
    const secondInvocation = handler(second.request, second.response);
    await Promise.resolve();
    readiness.reject(new Error('secret connection detail'));
    await Promise.all([firstInvocation, secondInvocation]);

    expect(createApplication).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(first.response.statusCode).toBe(500);
    expect(second.response.statusCode).toBe(500);
    expect(forwarded).not.toHaveBeenCalled();

    const recovered = requestAndResponse();
    await handler(recovered.request, recovered.response);

    expect(createApplication).toHaveBeenCalledTimes(2);
    expect(forwarded).toHaveBeenCalledOnce();
    expect(forwarded).toHaveBeenCalledWith(recovered.request, recovered.response);
  });

  it('fails safely and removes response listeners when request forwarding throws synchronously', async () => {
    const server = new EventEmitter();
    server.on('request', () => {
      throw new Error('unexpected forwarding detail');
    });
    const handler = createVercelHandler(() => ({
      app: { ready: vi.fn(async () => undefined), server } as unknown as FastifyInstance,
    }));
    const exchange = requestAndResponse();

    await handler(exchange.request, exchange.response);

    expect(exchange.response.statusCode).toBe(500);
    expect(exchange.end).toHaveBeenCalledWith(
      JSON.stringify({ error: { code: 'internal_error', message: 'Internal server error.' } }),
    );
    expect(responseListenerCounts(exchange.response)).toEqual([0, 0, 0]);
  });
});

function requestAndResponse() {
  const end = vi.fn();
  const response = Object.assign(new EventEmitter(), {
    headersSent: false,
    writableEnded: false,
    statusCode: 200,
    setHeader: vi.fn(),
    end,
  }) as unknown as ServerResponse;
  return {
    request: {} as IncomingMessage,
    response,
    end,
  };
}

function responseListenerCounts(response: ServerResponse): readonly number[] {
  return ['finish', 'close', 'error'].map((event) => response.listenerCount(event));
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
