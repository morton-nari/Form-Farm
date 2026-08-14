import { validateFormDefinition, type FormDefinition } from '@form-farm/form-domain';

import { ApplicationError } from '../errors/application-error.js';
import type {
  AuthenticatedActor,
  CreateFormDraftTransaction,
} from '../ports/create-form-draft-transaction.js';

export const MAXIMUM_OWNED_FORMS = 100;

export interface CreatedFormDraft {
  readonly formId: string;
  readonly status: 'draft';
  readonly draftRevision: 1;
  readonly definition: FormDefinition;
  readonly createdAt: string;
}

export class CreateFormDraft {
  constructor(private readonly transaction: CreateFormDraftTransaction) {}

  async execute(actor: AuthenticatedActor, candidate: unknown): Promise<CreatedFormDraft> {
    const validation = validateFormDefinition(candidate);
    if (!validation.success || validation.value.formVersion !== 1) {
      throw new ApplicationError('invalid_input', 'The form definition is invalid.');
    }

    const result = await this.transaction.execute({
      actor,
      definition: validation.value,
      maximumOwnedForms: MAXIMUM_OWNED_FORMS,
    });
    if (result.status === 'conflict') {
      throw new ApplicationError('conflict', 'A form with this identifier already exists.');
    }
    if (result.status === 'owner_limit_reached') {
      throw new ApplicationError('conflict', 'The form creation limit has been reached.');
    }
    return {
      formId: validation.value.id,
      status: 'draft',
      draftRevision: 1,
      definition: validation.value,
      createdAt: result.createdAt.toISOString(),
    };
  }
}
