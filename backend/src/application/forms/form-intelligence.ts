import {
  analyzeFormChangeImpact,
  applyFormChangeSet,
  compareFormDefinitions,
  validateFormDefinition,
  validateFormDraftDefinition,
  type FormDefinition,
  type FormDraftDefinition,
  type FormField,
  type FormSemanticDiff,
  type FormChangeImpact,
} from '@form-farm/form-domain';

import { ApplicationError } from '../errors/application-error.js';
import type { AuthenticatedActor } from '../ports/create-form-draft-transaction.js';
import type {
  FormIntelligenceSource,
  StoredFormIntelligenceDraft,
  StoredFormIntelligenceVersion,
} from '../ports/form-intelligence-source.js';
import { InvalidStoredFormDefinitionError } from './get-form-definition.js';

const MAXIMUM_ANALYZED_CHANGES = 1_000;

export interface FormDefinitionSummary {
  readonly formVersion: number;
  readonly schemaVersion: number;
  readonly sectionCount: number;
  readonly fieldCount: number;
  readonly validationRuleCount: number;
  readonly fieldTypes: Readonly<Record<FormField['type'], number>>;
}

export interface FormInspection {
  readonly formId: string;
  readonly status: 'draft' | 'published' | 'archived';
  readonly latestVersion: number;
  readonly currentPublishedVersion: number | null;
  readonly draftRevision: number | null;
  readonly draft: FormDefinitionSummary | null;
  readonly published: FormDefinitionSummary | null;
}

export class InspectForm {
  constructor(private readonly source: FormIntelligenceSource) {}

  async execute(actor: AuthenticatedActor, formId: string): Promise<FormInspection> {
    const stored = await this.source.findLifecycleForOwner(actor, formId);
    if (!stored) throw notFound();
    return {
      formId: stored.formId,
      status: stored.status,
      latestVersion: stored.latestVersion,
      currentPublishedVersion: stored.currentPublishedVersion,
      draftRevision: stored.draftRevision,
      draft:
        stored.draftDefinition === null
          ? null
          : summarize(
              validateDraft(stored.draftDefinition, stored.formId, stored.latestVersion + 1),
            ),
      published:
        stored.publishedDefinition === null
          ? null
          : summarize(
              validatePublished(
                stored.publishedDefinition,
                stored.formId,
                stored.currentPublishedVersion,
              ),
            ),
    };
  }
}

export class CompareFormVersions {
  constructor(private readonly source: FormIntelligenceSource) {}

  async execute(
    actor: AuthenticatedActor,
    formId: string,
    fromVersion: number,
    toVersion: number,
  ): Promise<FormSemanticDiff> {
    const [fromStored, toStored] = await Promise.all([
      this.source.findVersionForOwner(actor, formId, fromVersion),
      this.source.findVersionForOwner(actor, formId, toVersion),
    ]);
    if (!fromStored || !toStored) throw notFound();
    const from = validateStoredVersion(fromStored);
    const to = validateStoredVersion(toStored);
    const result = compareFormDefinitions(from, to, { maxChanges: MAXIMUM_ANALYZED_CHANGES });
    if (!result.success)
      throw new ApplicationError('invalid_input', 'The form versions cannot be compared.');
    return result.value;
  }
}

export interface FormImpactAnalysis {
  readonly draftRevision: number;
  readonly diff: FormSemanticDiff;
  readonly impact: FormChangeImpact;
}

export class AnalyzeDraftChangeImpact {
  constructor(private readonly source: FormIntelligenceSource) {}

  async execute(
    actor: AuthenticatedActor,
    formId: string,
    proposedChangeSet: unknown,
  ): Promise<FormImpactAnalysis> {
    const stored = await this.source.findDraftForOwner(actor, formId);
    if (!stored) throw notFound();
    const draft = validateStoredDraft(stored);
    const applied = applyFormChangeSet(draft, proposedChangeSet);
    if (!applied.success) {
      throw new ApplicationError('invalid_input', 'The proposed form operations are invalid.');
    }
    const compared = compareFormDefinitions(draft, applied.value, {
      maxChanges: MAXIMUM_ANALYZED_CHANGES,
    });
    if (!compared.success || compared.value.truncated) {
      throw new ApplicationError(
        'invalid_input',
        'The proposed form operations cannot be analyzed completely.',
      );
    }
    const analyzed = analyzeFormChangeImpact(compared.value);
    if (!analyzed.success) {
      throw new ApplicationError(
        'invalid_input',
        'The proposed form impact cannot be analyzed completely.',
      );
    }
    return { draftRevision: stored.revision, diff: compared.value, impact: analyzed.value };
  }
}

function summarize(definition: FormDraftDefinition): FormDefinitionSummary {
  const fieldTypes = Object.fromEntries(
    [
      'text',
      'email',
      'password',
      'tel',
      'url',
      'textarea',
      'number',
      'date',
      'datetime',
      'time',
      'select',
      'radio',
      'multi-select',
      'checkbox',
      'checkbox-group',
    ].map((type) => [type, 0]),
  ) as Record<FormField['type'], number>;
  let fieldCount = 0;
  let validationRuleCount = 0;
  for (const section of definition.sections) {
    for (const field of section.fields) {
      fieldCount += 1;
      fieldTypes[field.type] += 1;
      validationRuleCount += field.validation?.length ?? 0;
    }
  }
  return {
    formVersion: definition.formVersion,
    schemaVersion: definition.schemaVersion,
    sectionCount: definition.sections.length,
    fieldCount,
    validationRuleCount,
    fieldTypes,
  };
}

function validateDraft(
  input: unknown,
  formId: string,
  expectedVersion: number,
): FormDraftDefinition {
  const validation = validateFormDraftDefinition(input);
  if (
    !validation.success ||
    validation.value.id !== formId ||
    validation.value.formVersion !== expectedVersion
  ) {
    throw new InvalidStoredFormDefinitionError(
      formId,
      validation.success ? 1 : validation.issues.length,
    );
  }
  return validation.value;
}

function validatePublished(
  input: unknown,
  formId: string,
  expectedVersion: number | null,
): FormDefinition {
  const validation = validateFormDefinition(input);
  if (
    !validation.success ||
    validation.value.id !== formId ||
    validation.value.formVersion !== expectedVersion
  ) {
    throw new InvalidStoredFormDefinitionError(
      formId,
      validation.success ? 1 : validation.issues.length,
    );
  }
  return validation.value;
}

function validateStoredVersion(stored: StoredFormIntelligenceVersion): FormDefinition {
  const definition = validatePublished(stored.definition, stored.formId, stored.version);
  if (definition.schemaVersion !== stored.schemaVersion) {
    throw new InvalidStoredFormDefinitionError(stored.formId, 1);
  }
  return definition;
}

function validateStoredDraft(stored: StoredFormIntelligenceDraft): FormDraftDefinition {
  return validateDraft(stored.definition, stored.formId, stored.latestVersion + 1);
}

function notFound(): ApplicationError {
  return new ApplicationError('not_found', 'Form not found.');
}
