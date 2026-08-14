import { describe, expect, it, vi } from 'vitest';

import { CUSTOMER_FEEDBACK_FORM } from '../../infrastructure/forms/customer-feedback.form.js';
import type { OwnerFormDraftStore } from '../ports/owner-form-draft-store.js';
import { GetOwnerFormDraft, SaveOwnerFormDraft } from './owner-form-draft.js';

const actor = { userId: 'owner-1' };
const timestamp = new Date('2026-08-14T00:00:00.000Z');

describe('owner form draft use cases', () => {
  it('fails closed when stored definition identity does not match the row', async () => {
    const store = createStore({ rowFormId: 'different-form' });
    await expect(
      new GetOwnerFormDraft(store).execute(actor, 'customer-feedback'),
    ).rejects.toMatchObject({
      name: 'InvalidStoredFormDefinitionError',
    });
  });

  it('rejects a candidate whose route identity differs before persistence', async () => {
    const store = createStore();
    await expect(
      new SaveOwnerFormDraft(store).execute(actor, 'different-form', 1, CUSTOMER_FEEDBACK_FORM),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    expect(store.save).not.toHaveBeenCalled();
  });

  it.each([
    ['not_found', 'not_found'],
    ['conflict', 'conflict'],
    ['invalid_version', 'invalid_input'],
  ] as const)('maps %s safely', async (status, code) => {
    const store = createStore();
    vi.mocked(store.save).mockResolvedValue({ status });
    await expect(
      new SaveOwnerFormDraft(store).execute(actor, 'customer-feedback', 1, CUSTOMER_FEEDBACK_FORM),
    ).rejects.toMatchObject({ code });
  });
});

function createStore(
  overrides: Partial<Awaited<ReturnType<OwnerFormDraftStore['findByIdForOwner']>>> = {},
): OwnerFormDraftStore {
  return {
    findByIdForOwner: vi.fn(async () => ({
      definition: CUSTOMER_FEEDBACK_FORM,
      rowFormId: CUSTOMER_FEEDBACK_FORM.id,
      latestVersion: 0,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...overrides,
    })),
    save: vi.fn(),
  };
}
