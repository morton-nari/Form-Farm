import { describe, expect, it, vi } from 'vitest';
import type { FormDraftDefinition } from '@form-farm/form-domain';

import type { AuthenticatedActor } from '../ports/create-form-draft-transaction.js';
import type { FormIntelligenceSource } from '../ports/form-intelligence-source.js';
import { AnalyzeDraftChangeImpact, CompareFormVersions, InspectForm } from './form-intelligence.js';

const actor: AuthenticatedActor = { userId: '11111111-1111-4111-8111-111111111111' };
const draft: FormDraftDefinition = {
  schemaVersion: 1,
  id: 'owned-form',
  formVersion: 2,
  title: 'Private title',
  sections: [
    {
      id: 'main',
      title: 'Private section',
      fields: [
        { id: 'name', type: 'text', label: 'Private label', validation: [{ type: 'required' }] },
      ],
    },
  ],
  submission: { submitLabel: 'Send', successMessage: 'Thanks' },
};
const versionOne = { ...draft, formVersion: 1 };

describe('form intelligence application use cases', () => {
  it('returns a bounded structural inspection without presentation or answer values', async () => {
    const source = sourceWith({
      findLifecycleForOwner: vi.fn().mockResolvedValue({
        formId: 'owned-form',
        status: 'published',
        latestVersion: 1,
        currentPublishedVersion: 1,
        draftRevision: 3,
        draftDefinition: draft,
        publishedDefinition: versionOne,
      }),
    });
    const result = await new InspectForm(source).execute(actor, 'owned-form');
    expect(result.draft).toMatchObject({
      fieldCount: 1,
      validationRuleCount: 1,
      fieldTypes: { text: 1 },
    });
    expect(JSON.stringify(result)).not.toContain('Private');
  });

  it('uses existence-hiding not-found behavior', async () => {
    await expect(new InspectForm(sourceWith()).execute(actor, 'other-form')).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('compares two exact validated immutable versions', async () => {
    const source = sourceWith({
      findVersionForOwner: vi.fn(async (_actor, _formId, version) => ({
        formId: 'owned-form',
        version,
        schemaVersion: 1,
        definition:
          version === 1 ? versionOne : { ...versionOne, formVersion: 2, title: 'Changed' },
      })),
    });
    const result = await new CompareFormVersions(source).execute(actor, 'owned-form', 1, 2);
    expect(result.changes).toEqual([{ type: 'formPresentationChanged', property: 'title' }]);
  });

  it('analyzes controlled operations without calling a write port', async () => {
    const source = sourceWith({
      findDraftForOwner: vi.fn().mockResolvedValue({
        formId: 'owned-form',
        latestVersion: 1,
        revision: 4,
        definition: draft,
      }),
    });
    const result = await new AnalyzeDraftChangeImpact(source).execute(actor, 'owned-form', {
      changeSetVersion: 1,
      operations: [{ type: 'setFormPresentation', title: 'Changed', description: null }],
    });
    expect(result).toMatchObject({
      draftRevision: 4,
      impact: { risk: 'low', publication: { automaticPublicationAllowed: false } },
    });
    expect(source.findDraftForOwner).toHaveBeenCalledOnce();
  });

  it('rejects invalid operations without returning a partial analysis', async () => {
    const source = sourceWith({
      findDraftForOwner: vi.fn().mockResolvedValue({
        formId: 'owned-form',
        latestVersion: 1,
        revision: 4,
        definition: draft,
      }),
    });
    await expect(
      new AnalyzeDraftChangeImpact(source).execute(actor, 'owned-form', {
        changeSetVersion: 1,
        operations: [{ type: 'removeField', fieldId: 'missing' }],
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('rejects unknown properties inside the controlled change-set contract', async () => {
    const source = sourceWith({
      findDraftForOwner: vi.fn().mockResolvedValue({
        formId: 'owned-form',
        latestVersion: 1,
        revision: 4,
        definition: draft,
      }),
    });
    await expect(
      new AnalyzeDraftChangeImpact(source).execute(actor, 'owned-form', {
        changeSetVersion: 1,
        operations: [
          {
            type: 'setFormPresentation',
            title: 'Changed',
            description: null,
            ownerId: actor.userId,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

function sourceWith(overrides: Partial<FormIntelligenceSource> = {}): FormIntelligenceSource {
  return {
    findLifecycleForOwner: vi.fn().mockResolvedValue(undefined),
    findVersionForOwner: vi.fn().mockResolvedValue(undefined),
    findDraftForOwner: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
