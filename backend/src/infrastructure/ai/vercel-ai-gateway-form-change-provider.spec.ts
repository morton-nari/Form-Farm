import { describe, expect, it, vi } from 'vitest';

import { VercelAiGatewayFormChangeProvider } from './vercel-ai-gateway-form-change-provider.js';

describe('VercelAiGatewayFormChangeProvider', () => {
  it('requests bounded structured JSON without exposing provider content in metadata', async () => {
    const output = { changeSetVersion: 1, operations: [] };
    const generate = vi.fn().mockResolvedValue({
      output,
      finishReason: 'stop',
      inputTokens: 12,
      outputTokens: 4,
    });
    const abortSignal = new AbortController().signal;
    const provider = new VercelAiGatewayFormChangeProvider('test/model', generate);
    const result = await provider.generate({
      goal: 'Shorten the form',
      draft: {
        schemaVersion: 1,
        id: 'form-1',
        formVersion: 1,
        title: 'Form',
        sections: [],
        submission: { submitLabel: 'Submit', successMessage: 'Done' },
      },
      abortSignal,
    });

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'test/model', abortSignal }),
    );
    expect(result).toEqual({
      output,
      metadata: {
        provider: 'vercel-ai-gateway',
        model: 'test/model',
        finishReason: 'stop',
        inputTokens: 12,
        outputTokens: 4,
      },
    });
    expect(JSON.stringify(result.metadata)).not.toContain('Shorten the form');
  });
});
