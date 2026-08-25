import type { FormDraftDefinition } from '@form-farm/form-domain';
import { describe, expect, it, vi } from 'vitest';

import type { FormChangeProposalProvider } from '../ports/form-change-proposal-provider.js';
import type { FormIntelligenceSource } from '../ports/form-intelligence-source.js';
import { ProposeFormChanges } from './propose-form-changes.js';

const actor = { userId: 'owner-1' };

describe('ProposeFormChanges', () => {
  it('turns untrusted provider output into a deterministic non-mutating proposal', async () => {
    const draft = definition();
    const before = structuredClone(draft);
    const generate = vi.fn().mockResolvedValue(generation(changeSet('Short title')));
    const result = await new ProposeFormChanges(source(draft), { generate }).execute(
      actor,
      draft.id,
      '  Shorten the title  ',
    );

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ goal: 'Shorten the title', draft }),
    );
    expect(result.changeSet.operations).toHaveLength(1);
    expect(result.diff.changes).toEqual([
      expect.objectContaining({ type: 'formPresentationChanged' }),
    ]);
    expect(result.candidatePublishable).toBe(true);
    expect(result.candidateAnalysis).not.toBeNull();
    expect(draft).toEqual(before);
  });

  it('rejects malformed provider output without applying a partial proposal', async () => {
    const draft = definition();
    const generate = vi.fn().mockResolvedValue(generation({ operations: [] }));
    await expect(
      new ProposeFormChanges(source(draft), { generate }).execute(actor, draft.id, 'Improve it'),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    expect(draft.title).toBe('Original title');
  });

  it.each([undefined, '', 'x'.repeat(1_001)])(
    'rejects an invalid goal before contacting a provider',
    async (goal) => {
      const generate = vi.fn();
      await expect(
        new ProposeFormChanges(source(definition()), { generate }).execute(
          actor,
          'owned-form',
          goal,
        ),
      ).rejects.toMatchObject({ code: 'invalid_input' });
      expect(generate).not.toHaveBeenCalled();
    },
  );

  it('reports a valid draft candidate as not yet publishable when it has an empty section', async () => {
    const draft = definition();
    draft.sections.push({ id: 'empty', title: 'Empty', fields: [] });
    const generate = vi.fn().mockResolvedValue(generation(changeSet('Short title')));
    const result = await new ProposeFormChanges(source(draft), { generate }).execute(
      actor,
      draft.id,
      'Shorten the title',
    );
    expect(result.candidatePublishable).toBe(false);
    expect(result.candidateAnalysis).toBeNull();
  });

  it('bounds provider work and does not expose provider failures', async () => {
    const generate = vi.fn(
      ({ abortSignal }: { abortSignal: AbortSignal }) =>
        new Promise((_, reject) =>
          abortSignal.addEventListener(
            'abort',
            () => reject(new Error('secret provider response')),
            { once: true },
          ),
        ),
    );
    const service = new ProposeFormChanges(source(definition()), { generate }, 1);

    await expect(service.execute(actor, 'owned-form', 'Improve it')).rejects.toMatchObject({
      name: 'FormChangeProposalGenerationError',
      message: 'Form-change proposal generation failed.',
    });
  });
});

function definition(): FormDraftDefinition {
  return {
    schemaVersion: 1,
    id: 'owned-form',
    formVersion: 2,
    title: 'Original title',
    sections: [
      {
        id: 'main',
        title: 'Main',
        fields: [{ id: 'name', type: 'text', label: 'Name' }],
      },
    ],
    submission: { submitLabel: 'Submit', successMessage: 'Done' },
  };
}

function changeSet(title: string) {
  return {
    changeSetVersion: 1,
    operations: [{ type: 'setFormPresentation', title, description: null }],
  };
}

function generation(output: unknown) {
  return {
    output,
    metadata: {
      provider: 'fake',
      model: 'fake-model',
      finishReason: 'stop',
      inputTokens: 10,
      outputTokens: 5,
    },
  };
}

function source(draft: FormDraftDefinition): FormIntelligenceSource {
  return {
    findDraftForOwner: async () => ({
      formId: draft.id,
      latestVersion: 1,
      revision: 3,
      definition: draft,
    }),
    findLifecycleForOwner: async () => undefined,
    findVersionForOwner: async () => undefined,
  };
}
