import { describe, expect, it } from 'vitest';

import type { FormDefinitionSource } from '../ports/form-definition-source.js';
import { GetFormDefinition, InvalidStoredFormDefinitionError } from './get-form-definition.js';

describe('GetFormDefinition', () => {
  it('returns a structurally and domain-valid definition', async () => {
    const definition = validDefinition();
    const useCase = new GetFormDefinition(sourceReturning(definition));

    await expect(useCase.execute('test-form')).resolves.toEqual(definition);
  });

  it('reports a missing form through an application error', async () => {
    const useCase = new GetFormDefinition(sourceReturning(undefined));

    await expect(useCase.execute('missing')).rejects.toMatchObject({
      name: 'ApplicationError',
      code: 'not_found',
      message: 'Form not found.',
    });
  });

  it('rejects invalid source data before it reaches HTTP', async () => {
    const useCase = new GetFormDefinition(sourceReturning({ id: 'invalid' }));

    await expect(useCase.execute('invalid')).rejects.toBeInstanceOf(
      InvalidStoredFormDefinitionError,
    );
  });
});

function sourceReturning(value: unknown | undefined): FormDefinitionSource {
  return { findById: async () => value };
}

function validDefinition(): unknown {
  return {
    schemaVersion: 1,
    id: 'test-form',
    formVersion: 1,
    title: 'Test form',
    sections: [
      {
        id: 'details',
        title: 'Details',
        fields: [{ id: 'name', type: 'text', label: 'Name' }],
      },
    ],
    submission: { submitLabel: 'Submit', successMessage: 'Submitted.' },
  };
}
