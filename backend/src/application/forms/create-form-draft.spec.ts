import { describe, expect, it, vi } from 'vitest';

import { CUSTOMER_FEEDBACK_FORM } from '../../infrastructure/forms/customer-feedback.form.js';
import type { CreateFormDraftTransaction } from '../ports/create-form-draft-transaction.js';
import { CreateFormDraft, MAXIMUM_OWNED_FORMS } from './create-form-draft.js';

describe('CreateFormDraft', () => {
  it('accepts an initial draft with an empty section', async () => {
    const execute = vi.fn(async () => ({
      status: 'created' as const,
      createdAt: new Date('2026-08-14T00:00:00.000Z'),
    }));
    const definition = {
      ...CUSTOMER_FEEDBACK_FORM,
      sections: [{ ...CUSTOMER_FEEDBACK_FORM.sections[0], fields: [] }],
    };

    await expect(
      new CreateFormDraft({ execute }).execute({ userId: 'user-1' }, definition),
    ).resolves.toMatchObject({
      definition,
    });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ definition }));
  });

  it('validates unknown input and passes actor-derived ownership to the transaction', async () => {
    const execute = vi.fn(async () => ({
      status: 'created' as const,
      createdAt: new Date('2026-08-14T00:00:00.000Z'),
    }));
    const useCase = new CreateFormDraft({ execute });

    await expect(useCase.execute({ userId: 'user-1' }, CUSTOMER_FEEDBACK_FORM)).resolves.toEqual({
      formId: 'customer-feedback',
      status: 'draft',
      draftRevision: 1,
      definition: CUSTOMER_FEEDBACK_FORM,
      createdAt: '2026-08-14T00:00:00.000Z',
    });
    expect(execute).toHaveBeenCalledWith({
      actor: { userId: 'user-1' },
      definition: CUSTOMER_FEEDBACK_FORM,
      maximumOwnedForms: MAXIMUM_OWNED_FORMS,
    });
  });

  it('rejects invalid and non-initial versions before persistence', async () => {
    const execute = vi.fn<CreateFormDraftTransaction['execute']>();
    const useCase = new CreateFormDraft({ execute });
    await expect(useCase.execute({ userId: 'user-1' }, { id: 'invalid' })).rejects.toMatchObject({
      code: 'invalid_input',
    });
    await expect(
      useCase.execute({ userId: 'user-1' }, { ...CUSTOMER_FEEDBACK_FORM, formVersion: 2 }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    expect(execute).not.toHaveBeenCalled();
  });

  it.each(['conflict', 'owner_limit_reached'] as const)(
    'maps %s to a safe conflict',
    async (status) => {
      const useCase = new CreateFormDraft({ execute: async () => ({ status }) });
      await expect(
        useCase.execute({ userId: 'user-1' }, CUSTOMER_FEEDBACK_FORM),
      ).rejects.toMatchObject({
        code: 'conflict',
      });
    },
  );
});
