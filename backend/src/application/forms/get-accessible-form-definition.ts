import { validateFormDefinition, type FormDefinition } from '@form-farm/form-domain';

import { ApplicationError } from '../errors/application-error.js';
import type { AccessibleFormSource } from '../ports/accessible-form-source.js';
import { InvalidStoredFormDefinitionError } from './get-form-definition.js';
import { assertIdentity } from './list-accessible-forms.js';

export class GetAccessibleFormDefinition {
  constructor(private readonly source: AccessibleFormSource) {}

  async execute(formId: string, userId: string): Promise<FormDefinition> {
    const record = await this.source.findPublishedByIdForUser(formId, userId);
    if (record === undefined) throw new ApplicationError('not_found', 'Form not found.');
    const result = validateFormDefinition(record.definition);
    if (!result.success) throw new InvalidStoredFormDefinitionError(formId, result.issues.length);
    assertIdentity(result.value, record);
    return result.value;
  }
}
