import { describe, expect, it } from 'vitest';
import { CUSTOMER_FEEDBACK_FORM } from '../../infrastructure/forms/customer-feedback.form.js';
import { ListOwnerManagedForms } from './list-owner-managed-forms.js';

describe('ListOwnerManagedForms', () => {
  it('returns a bounded page and cursor without definitions', async () => {
    const records = ['first', 'second'].map((id, index) => ({
      definition: { ...CUSTOMER_FEEDBACK_FORM, id, title: id },
      rowFormId: id,
      status: 'draft' as const,
      latestVersion: 0,
      currentPublishedVersion: null,
      draftRevision: 1,
      definitionVersion: 1,
      updatedAt: new Date(`2026-08-14T00:00:0${index}.000Z`),
    }));
    const result = await new ListOwnerManagedForms({ list: async () => records }).execute(
      'owner',
      1,
    );
    expect(result.forms).toEqual([
      {
        id: 'first',
        title: 'first',
        status: 'draft',
        latestVersion: 0,
        currentPublishedVersion: null,
        draftRevision: 1,
        updatedAt: '2026-08-14T00:00:00.000Z',
      },
    ]);
    expect(result.nextCursor).toEqual({ updatedAt: records[0].updatedAt, formId: 'first' });
    expect(result.forms[0]).not.toHaveProperty('definition');
  });

  it('fails closed for malformed relational versions', async () => {
    const record = {
      definition: CUSTOMER_FEEDBACK_FORM,
      rowFormId: CUSTOMER_FEEDBACK_FORM.id,
      status: 'draft' as const,
      latestVersion: 0,
      currentPublishedVersion: null,
      draftRevision: Number.NaN,
      definitionVersion: 1,
      updatedAt: new Date(),
    };
    await expect(
      new ListOwnerManagedForms({ list: async () => [record] }).execute('owner', 20),
    ).rejects.toMatchObject({ name: 'InvalidStoredFormDefinitionError' });
  });
});
