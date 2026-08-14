import { validateFormDefinition, type FormDefinition } from '@form-farm/form-domain';

import { ApplicationError } from '../errors/application-error.js';
import type { AuthenticatedActor } from '../ports/create-form-draft-transaction.js';
import type { OwnerFormDraftStore, StoredOwnerFormDraft } from '../ports/owner-form-draft-store.js';
import { InvalidStoredFormDefinitionError } from './get-form-definition.js';

export interface OwnerFormDraft {
  readonly formId: string;
  readonly status: 'draft';
  readonly draftRevision: number;
  readonly definition: FormDefinition;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export class GetOwnerFormDraft {
  constructor(private readonly store: OwnerFormDraftStore) {}

  async execute(actor: AuthenticatedActor, formId: string): Promise<OwnerFormDraft> {
    const stored = await this.store.findByIdForOwner(formId, actor);
    if (!stored) throw new ApplicationError('not_found', 'Form draft not found.');
    return toOwnerFormDraft(formId, stored);
  }
}

export class SaveOwnerFormDraft {
  constructor(private readonly store: OwnerFormDraftStore) {}

  async execute(
    actor: AuthenticatedActor,
    formId: string,
    expectedRevision: number,
    candidate: unknown,
  ): Promise<OwnerFormDraft> {
    const validation = validateFormDefinition(candidate);
    if (!validation.success || validation.value.id !== formId) {
      throw new ApplicationError('invalid_input', 'The form definition is invalid.');
    }
    const result = await this.store.save({
      actor,
      formId,
      expectedRevision,
      definition: validation.value,
    });
    if (result.status === 'not_found') {
      throw new ApplicationError('not_found', 'Form draft not found.');
    }
    if (result.status === 'conflict') {
      throw new ApplicationError('conflict', 'The form draft has changed. Reload and try again.');
    }
    if (result.status === 'invalid_version') {
      throw new ApplicationError('invalid_input', 'The form definition version is invalid.');
    }
    return toOwnerFormDraft(formId, result.draft);
  }
}

function toOwnerFormDraft(formId: string, stored: StoredOwnerFormDraft): OwnerFormDraft {
  const validation = validateFormDefinition(stored.definition);
  if (
    !validation.success ||
    validation.value.id !== stored.rowFormId ||
    stored.rowFormId !== formId ||
    validation.value.formVersion !== stored.latestVersion + 1
  ) {
    throw new InvalidStoredFormDefinitionError(
      formId,
      validation.success ? 1 : validation.issues.length,
    );
  }
  return {
    formId,
    status: 'draft',
    draftRevision: stored.revision,
    definition: validation.value,
    createdAt: stored.createdAt.toISOString(),
    updatedAt: stored.updatedAt.toISOString(),
  };
}
