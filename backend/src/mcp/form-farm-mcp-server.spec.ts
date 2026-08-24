import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FormFarmMcpServices } from './form-farm-mcp-server.js';
import { boundReadOnlyResponseLifecycle, createFormFarmMcpServer } from './form-farm-mcp-server.js';

const actor = { userId: '11111111-1111-4111-8111-111111111111' };
const connections: Array<{ close(): Promise<void> }> = [];

afterEach(async () => Promise.all(connections.splice(0).map((connection) => connection.close())));

describe('Form Farm MCP server', () => {
  it('advertises exactly three local read-only tools with strict schemas', async () => {
    const { client } = await connect(services());
    const tools = await client.listTools();
    expect(tools.tools.map(({ name }) => name)).toEqual([
      'inspect_form',
      'compare_form_versions',
      'impact_analysis',
    ]);
    expect(tools.tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
    expect(tools.tools.every((tool) => tool.inputSchema.additionalProperties === false)).toBe(true);
  });

  it('resolves authentication again for every invocation', async () => {
    const configured = services();
    const { client } = await connect(configured);
    await client.callTool({ name: 'inspect_form', arguments: { formId: 'owned-form' } });
    await client.callTool({ name: 'inspect_form', arguments: { formId: 'owned-form' } });
    expect(configured.authenticate).toHaveBeenCalledTimes(2);
  });

  it('rejects unknown input properties before invoking application code', async () => {
    const configured = services();
    const { client } = await connect(configured);
    const result = await client.callTool({
      name: 'inspect_form',
      arguments: { formId: 'owned-form', ownerId: actor.userId },
    });
    expect(result.isError).toBe(true);
    expect(configured.inspectForm.execute).not.toHaveBeenCalled();
  });

  it('returns one stable safe error for failed authentication', async () => {
    const configured = services();
    vi.mocked(configured.authenticate).mockResolvedValue(undefined);
    const { client } = await connect(configured);
    const result = await client.callTool({
      name: 'inspect_form',
      arguments: { formId: 'owned-form' },
    });
    expect(result).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: '{"error":{"code":"unauthenticated"}}' }],
    });
    expect(configured.inspectForm.execute).not.toHaveBeenCalled();
  });

  it('bounds timeout responses without claiming to stop underlying read work', async () => {
    let finishRead: ((value: string) => void) | undefined;
    const underlyingRead = new Promise<string>((resolve) => {
      finishRead = resolve;
    });
    const response = boundReadOnlyResponseLifecycle(
      underlyingRead,
      new AbortController().signal,
      1,
    );

    await expect(response).rejects.toThrow('MCP read response timeout.');
    finishRead?.('completed');
    await expect(underlyingRead).resolves.toBe('completed');
  });

  it('bounds cancelled responses without claiming to stop underlying read work', async () => {
    const controller = new AbortController();
    let finishRead: ((value: string) => void) | undefined;
    const underlyingRead = new Promise<string>((resolve) => {
      finishRead = resolve;
    });
    const response = boundReadOnlyResponseLifecycle(underlyingRead, controller.signal);
    controller.abort();

    await expect(response).rejects.toThrow('MCP read response cancelled.');
    finishRead?.('completed');
    await expect(underlyingRead).resolves.toBe('completed');
  });
});

async function connect(configured: FormFarmMcpServices) {
  const server = createFormFarmMcpServer(configured);
  const client = new Client({ name: 'contract-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  connections.push(client, server);
  return { client };
}

function services(): FormFarmMcpServices {
  return {
    authenticate: vi.fn().mockResolvedValue(actor),
    inspectForm: {
      execute: vi.fn().mockResolvedValue({
        formId: 'owned-form',
        status: 'draft',
        latestVersion: 0,
        currentPublishedVersion: null,
        draftRevision: 1,
        draft: null,
        published: null,
      }),
    } as unknown as FormFarmMcpServices['inspectForm'],
    compareFormVersions: {
      execute: vi.fn(),
    } as unknown as FormFarmMcpServices['compareFormVersions'],
    analyzeDraftChangeImpact: {
      execute: vi.fn(),
    } as unknown as FormFarmMcpServices['analyzeDraftChangeImpact'],
  };
}
