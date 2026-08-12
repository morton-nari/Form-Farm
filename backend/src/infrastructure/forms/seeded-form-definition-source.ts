import type { FormDefinitionSource } from '../../application/ports/form-definition-source.js';
import { CUSTOMER_FEEDBACK_FORM } from './customer-feedback.form.js';

export class SeededFormDefinitionSource implements FormDefinitionSource {
  constructor(
    private readonly definitions: Readonly<Record<string, unknown>> = {
      [CUSTOMER_FEEDBACK_FORM.id]: CUSTOMER_FEEDBACK_FORM,
    },
  ) {}

  async findById(formId: string): Promise<unknown | undefined> {
    return this.definitions[formId];
  }
}
