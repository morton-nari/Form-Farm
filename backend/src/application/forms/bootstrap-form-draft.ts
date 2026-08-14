import { validateFormDefinition } from '@form-farm/form-domain';
import { ApplicationError } from '../errors/application-error.js';
import type { AuthenticatedActor } from '../ports/create-form-draft-transaction.js';
import type {
  BootstrapFormDraftTransaction,
  LockedPublishedForm,
} from '../ports/bootstrap-form-draft-transaction.js';
import { InvalidStoredFormDefinitionError } from './get-form-definition.js';
import { toOwnerFormDraft, type OwnerFormDraft } from './owner-form-draft.js';

export interface BootstrappedFormDraft extends OwnerFormDraft {
  readonly created: boolean;
}

export class BootstrapFormDraft {
  constructor(private readonly transaction: BootstrapFormDraftTransaction) {}
  async execute(actor: AuthenticatedActor, formId: string): Promise<BootstrappedFormDraft> {
    const result = await this.transaction.execute({ actor, formId }, (locked) =>
      prepare(formId, locked),
    );
    if (result.status === 'not_found') throw new ApplicationError('not_found', 'Form not found.');
    if (result.status === 'conflict')
      throw new ApplicationError('conflict', 'The form cannot start another draft version.');
    return { ...toOwnerFormDraft(formId, result.draft), created: result.created };
  }
}

function prepare(formId: string, locked: LockedPublishedForm) {
  const result = validateFormDefinition(locked.definition);
  if (
    !result.success ||
    result.value.id !== formId ||
    locked.rowFormId !== formId ||
    result.value.formVersion !== locked.rowVersion ||
    result.value.schemaVersion !== locked.rowSchemaVersion ||
    locked.rowVersion !== locked.latestVersion
  ) {
    throw new InvalidStoredFormDefinitionError(formId, result.success ? 1 : result.issues.length);
  }
  return { ...result.value, formVersion: locked.latestVersion + 1 };
}
