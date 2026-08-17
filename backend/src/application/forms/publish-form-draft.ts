import { validateFormDefinition, validateFormDraftDefinition } from '@form-farm/form-domain';

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
  const draftValidation = validateFormDraftDefinition(locked.definition);
  if (
    !draftValidation.success ||
    locked.rowFormId !== formId ||
    draftValidation.value.id !== locked.rowFormId ||
    draftValidation.value.formVersion !== locked.latestVersion + 1
  ) {
    throw new InvalidStoredFormDefinitionError(
      formId,
      draftValidation.success ? 1 : draftValidation.issues.length,
    );
  }
  const validation = validateFormDefinition(draftValidation.value);
  if (!validation.success) {
    const issues = draftValidation.value.sections
      .map((section, sectionIndex) => ({ section, sectionIndex }))
      .filter(({ section }) => section.fields.length === 0)
      .map(({ sectionIndex }) => ({
        path: ['sections', sectionIndex, 'fields'] as const,
        code: 'incomplete_definition' as const,
      }));
    if (issues.length === 0) {
      throw new InvalidStoredFormDefinitionError(formId, validation.issues.length);
    }
    return {
      success: false,
      issues,
    };
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
