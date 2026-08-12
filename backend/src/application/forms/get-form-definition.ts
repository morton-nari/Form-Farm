import {
  validateFormDefinition,
  type FormDefinition,
} from '@form-farm/form-domain';

import { ApplicationError } from '../errors/application-error.js';
import type { FormDefinitionSource } from '../ports/form-definition-source.js';

export class GetFormDefinition {
  constructor(private readonly source: FormDefinitionSource) {}

  async execute(formId: string): Promise<FormDefinition> {
    const candidate = await this.source.findById(formId);

    if (candidate === undefined) {
      throw new ApplicationError('not_found', 'Form not found.');
    }

    const result = validateFormDefinition(candidate);
    if (!result.success) {
      throw new InvalidStoredFormDefinitionError(formId, result.issues.length);
    }

    return result.value;
  }
}

export class InvalidStoredFormDefinitionError extends Error {
  override readonly name = 'InvalidStoredFormDefinitionError';

  constructor(
    readonly formId: string,
    readonly issueCount: number,
  ) {
    super(`Stored form definition "${formId}" is invalid (${issueCount} issues).`);
  }
}
