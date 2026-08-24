import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { createComposedMcpRuntime } from './composition/create-composed-mcp-server.js';

async function main(): Promise<void> {
  const runtime = createComposedMcpRuntime();
  const handle = serveStdio(runtime.createServer, {
    onerror: () => console.error('Form Farm MCP transport error.'),
  });
  let closing: Promise<void> | undefined;
  const close = () =>
    (closing ??= Promise.allSettled([handle.close(), runtime.close()]).then(() => undefined));
  process.once('SIGINT', () => void close().finally(() => process.exit(0)));
  process.once('SIGTERM', () => void close().finally(() => process.exit(0)));
  process.stdin.once('end', () => void close());
}

main().catch(() => {
  console.error('Form Farm MCP failed to start.');
  process.exitCode = 1;
});
