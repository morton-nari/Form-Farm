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
