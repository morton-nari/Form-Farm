import { describe, expect, it, vi } from 'vitest';

import { CUSTOMER_FEEDBACK_FORM } from '../../infrastructure/forms/customer-feedback.form.js';
import type { PublishFormDraftTransaction } from '../ports/publish-form-draft-transaction.js';
import { PublishFormDraft } from './publish-form-draft.js';

describe('PublishFormDraft', () => {
  it('rejects password fields through explicit publishability issues', async () => {
    const definition = {
      ...CUSTOMER_FEEDBACK_FORM,
      sections: [
        {
          ...CUSTOMER_FEEDBACK_FORM.sections[0],
          fields: [{ id: 'secret', label: 'Secret', type: 'password' as const }],
        },
      ],
    };
    const transaction: PublishFormDraftTransaction = {
      execute: vi.fn(async (_input, validate) => {
        const result = validate({
          definition,
          rowFormId: definition.id,
          latestVersion: 0,
          revision: 1,
        });
        return result.success
          ? { status: 'conflict' as const }
          : { status: 'unpublishable' as const, issues: result.issues };
      }),
    };
    await expect(
      new PublishFormDraft(transaction).execute({ userId: 'owner' }, definition.id, 1),
    ).rejects.toMatchObject({
      name: 'UnpublishableFormError',
      issues: [{ path: ['sections', 0, 'fields', 0], code: 'unsupported_field' }],
    });
  });

  it('fails closed when locked relational identity differs', async () => {
    const transaction: PublishFormDraftTransaction = {
      execute: vi.fn(async (_input, validate) => {
        validate({
          definition: CUSTOMER_FEEDBACK_FORM,
          rowFormId: 'different',
          latestVersion: 0,
          revision: 1,
        });
        return { status: 'conflict' as const };
      }),
    };
    await expect(
      new PublishFormDraft(transaction).execute({ userId: 'owner' }, CUSTOMER_FEEDBACK_FORM.id, 1),
    ).rejects.toMatchObject({
      name: 'InvalidStoredFormDefinitionError',
    });
  });
});
