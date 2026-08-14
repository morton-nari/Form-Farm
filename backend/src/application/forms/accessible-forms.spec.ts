import { describe, expect, it } from 'vitest';

import type { AccessibleFormSource } from '../ports/accessible-form-source.js';
import { CUSTOMER_FEEDBACK_FORM } from '../../infrastructure/forms/customer-feedback.form.js';
import { GetAccessibleFormDefinition } from './get-accessible-form-definition.js';
import { ListAccessibleForms } from './list-accessible-forms.js';

const record = {
  definition: CUSTOMER_FEEDBACK_FORM,
  updatedAt: new Date('2026-08-14T00:00:00.000Z'),
  rowFormId: CUSTOMER_FEEDBACK_FORM.id,
  rowVersion: CUSTOMER_FEEDBACK_FORM.formVersion,
  rowSchemaVersion: CUSTOMER_FEEDBACK_FORM.schemaVersion,
};

describe('accessible forms application services', () => {
  it('returns validated dashboard summaries without full definitions', async () => {
    const source = sourceReturning([record]);
    await expect(new ListAccessibleForms(source).execute('user-1')).resolves.toEqual([
      {
        id: 'customer-feedback',
        title: 'Customer feedback',
        formVersion: 1,
        updatedAt: '2026-08-14T00:00:00.000Z',
      },
    ]);
  });

  it('fails closed for invalid definitions and relational identity mismatches', async () => {
    const invalid = sourceReturning([{ ...record, definition: { id: 'invalid' } }]);
    await expect(new ListAccessibleForms(invalid).execute('user-1')).rejects.toMatchObject({
      name: 'InvalidStoredFormDefinitionError',
    });
    const mismatch = sourceReturning([{ ...record, rowFormId: 'different-form' }]);
    await expect(new ListAccessibleForms(mismatch).execute('user-1')).rejects.toMatchObject({
      name: 'InvalidStoredFormDefinitionError',
    });
  });

  it('does not distinguish an inaccessible form from a missing form', async () => {
    const source = sourceReturning([]);
    await expect(
      new GetAccessibleFormDefinition(source).execute('another-users-form', 'user-1'),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

function sourceReturning(records: readonly typeof record[]): AccessibleFormSource {
  return {
    listPublishedForUser: async () => records,
    findPublishedByIdForUser: async (formId) =>
      records.find((candidate) => candidate.rowFormId === formId),
  };
}
