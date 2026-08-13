import { describe, expect, it, vi } from 'vitest';
import type { FormSubmissionTransaction } from '../ports/form-submission-transaction.js';
import { CUSTOMER_FEEDBACK_FORM } from '../../infrastructure/forms/customer-feedback.form.js';
import { fingerprintRequest, SubmitForm } from './submit-form.js';

describe('SubmitForm', () => {
  it('validates through the exact stored version and returns creation identity', async () => {
    const transaction: FormSubmissionTransaction = {
      execute: vi.fn(async (_request, validate) => {
        expect(validate(stored())).toEqual({ overallRating: 'good' });
        return { status: 'created', submissionId: 'id' };
      }),
    };
    await expect(new SubmitForm(transaction).execute(request())).resolves.toEqual({
      submissionId: 'id',
      replayed: false,
    });
  });

  it.each([
    ['not_found', 'not_found'],
    ['not_accepting', 'conflict'],
    ['idempotency_conflict', 'conflict'],
  ] as const)('maps %s without infrastructure details', async (status, code) => {
    const transaction: FormSubmissionTransaction = { execute: async () => ({ status }) };
    await expect(new SubmitForm(transaction).execute(request())).rejects.toMatchObject({ code });
  });

  it('canonicalizes recursively and distinguishes array order and Unicode forms', () => {
    expect(fingerprintRequest('form', 1, { b: 2, a: 1 })).toBe(
      '37d3bf02f8f077e1e02633d2b33da7425c1cd8689d00027fd4919884b29d11b0',
    );
    expect(fingerprintRequest('form', 1, { b: 2, nested: { z: true, a: 'x' } })).toBe(
      fingerprintRequest('form', 1, { nested: { a: 'x', z: true }, b: 2 }),
    );
    expect(fingerprintRequest('form', 1, { values: ['a', 'b'] })).not.toBe(
      fingerprintRequest('form', 1, { values: ['b', 'a'] }),
    );
    expect(fingerprintRequest('form', 1, { value: '\u00e9' })).not.toBe(
      fingerprintRequest('form', 1, { value: 'e\u0301' }),
    );
    expect(() => fingerprintRequest('form', 1, { value: '\ud800' })).toThrowError(
      expect.objectContaining({ code: 'invalid_input' }),
    );
  });
});

function request() {
  return {
    formId: 'customer-feedback',
    formVersion: 1,
    answers: { overallRating: 'good' },
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
  };
}
function stored() {
  return {
    rowFormId: 'customer-feedback',
    rowVersion: 1,
    rowSchemaVersion: 1,
    definition: CUSTOMER_FEEDBACK_FORM,
  };
}
