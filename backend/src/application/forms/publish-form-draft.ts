import { validateFormDefinition } from '@form-farm/form-domain';

import { ApplicationError } from '../errors/application-error.js';
import type { AuthenticatedActor } from '../ports/create-form-draft-transaction.js';
import type {
  LockedDraftValidation,
  LockedFormDraft,
  PublishFormDraftTransaction,
  PublishabilityIssue,
} from '../ports/publish-form-draft-transaction.js';
import { InvalidStoredFormDefinitionError } from './get-form-definition.js';

export interface PublishedFormVersion {
  readonly formId: string;
  readonly status: 'published';
  readonly formVersion: number;
  readonly publishedAt: string;
}

export class PublishFormDraft {
  constructor(private readonly transaction: PublishFormDraftTransaction) {}

  async execute(
    actor: AuthenticatedActor,
    formId: string,
    expectedRevision: number,
  ): Promise<PublishedFormVersion> {
    const result = await this.transaction.execute({ actor, formId, expectedRevision }, (locked) =>
      validateLockedDraft(formId, locked),
    );
    if (result.status === 'not_found')
      throw new ApplicationError('not_found', 'Form draft not found.');
    if (result.status === 'conflict')
      throw new ApplicationError('conflict', 'The form draft has changed. Reload and try again.');
    if (result.status === 'unpublishable') throw new UnpublishableFormError(result.issues);
    return {
      formId,
      status: 'published',
      formVersion: result.version,
      publishedAt: result.publishedAt.toISOString(),
    };
  }
}

function validateLockedDraft(formId: string, locked: LockedFormDraft): LockedDraftValidation {
  const validation = validateFormDefinition(locked.definition);
  if (
    !validation.success ||
    locked.rowFormId !== formId ||
    validation.value.id !== locked.rowFormId ||
    validation.value.formVersion !== locked.latestVersion + 1
  ) {
    throw new InvalidStoredFormDefinitionError(
      formId,
      validation.success ? 1 : validation.issues.length,
    );
  }
  const issues: PublishabilityIssue[] = [];
  validation.value.sections.forEach((section, sectionIndex) =>
    section.fields.forEach((field, fieldIndex) => {
      if (field.type === 'password') {
        issues.push({
          path: ['sections', sectionIndex, 'fields', fieldIndex],
          code: 'unsupported_field',
        });
      }
    }),
  );
  return issues.length
    ? { success: false, issues }
    : { success: true, definition: validation.value };
}

export class UnpublishableFormError extends Error {
  override readonly name = 'UnpublishableFormError';
  constructor(readonly issues: readonly PublishabilityIssue[]) {
    super('The form cannot be published.');
  }
}
