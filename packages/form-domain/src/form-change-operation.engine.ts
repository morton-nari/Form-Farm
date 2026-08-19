import { z } from 'zod/mini';

import type {
  ApplyFormChangeSetResult,
  FormChangeIssue,
  FormChangeIssueCode,
  FormChangeOperation,
  FormChangeSet,
  FormChangeSetValidationResult,
  FormFieldPresentation,
} from './form-change-operation.models.js';
import type { FormDraftDefinition, FormDraftSection, FormField } from './form-definition.models.js';
import { validateFormDraftDefinition } from './form-definition.validator.js';
import { FORM_IDENTIFIER_PATTERN } from './form-identifier.js';

const identifier = z
  .string()
  .check(z.regex(new RegExp(FORM_IDENTIFIER_PATTERN), 'Must be a machine-safe identifier.'));
const nonBlankText = z.string().check(z.trim(), z.minLength(1));
const nullableNonBlankText = z.nullable(nonBlankText);
const nullableString = z.nullable(z.string());
const nullableIdentifier = z.nullable(identifier);

const autocomplete = z.enum([
  'name',
  'given-name',
  'family-name',
  'email',
  'username',
  'new-password',
  'current-password',
  'tel',
  'street-address',
  'address-line1',
  'address-line2',
  'address-level1',
  'address-level2',
  'postal-code',
  'country-name',
  'organization',
]);

const presentationBase = {
  label: nonBlankText,
  helpText: nullableNonBlankText,
};
const textPresentation = (fieldType: 'text' | 'email' | 'password' | 'tel' | 'url') =>
  z.strictObject({
    ...presentationBase,
    fieldType: z.literal(fieldType),
    placeholder: nullableString,
    autocomplete: z.nullable(autocomplete),
  });
const commonPresentation = (
  fieldType:
    'date' | 'datetime' | 'time' | 'radio' | 'multi-select' | 'checkbox' | 'checkbox-group',
) => z.strictObject({ ...presentationBase, fieldType: z.literal(fieldType) });

const fieldPresentation = z.discriminatedUnion('fieldType', [
  textPresentation('text'),
  textPresentation('email'),
  textPresentation('password'),
  textPresentation('tel'),
  textPresentation('url'),
  z.strictObject({
    ...presentationBase,
    fieldType: z.literal('textarea'),
    placeholder: nullableString,
    autocomplete: z.nullable(autocomplete),
    rows: z.nullable(z.number().check(z.int(), z.positive())),
  }),
  z.strictObject({
    ...presentationBase,
    fieldType: z.literal('number'),
    placeholder: nullableString,
  }),
  z.strictObject({
    ...presentationBase,
    fieldType: z.literal('select'),
    placeholder: nullableString,
  }),
  commonPresentation('date'),
  commonPresentation('datetime'),
  commonPresentation('time'),
  commonPresentation('radio'),
  commonPresentation('multi-select'),
  commonPresentation('checkbox'),
  commonPresentation('checkbox-group'),
]);

const requiredRule = z.strictObject({ type: z.literal('required') });
const validationRule = z.discriminatedUnion('type', [
  requiredRule,
  z.strictObject({
    type: z.literal('minLength'),
    value: z.number().check(z.int(), z.nonnegative()),
  }),
  z.strictObject({
    type: z.literal('maxLength'),
    value: z.number().check(z.int(), z.nonnegative()),
  }),
  z.strictObject({ type: z.literal('min'), value: z.number() }),
  z.strictObject({ type: z.literal('max'), value: z.number() }),
  z.strictObject({ type: z.literal('integer') }),
  z.strictObject({ type: z.literal('earliest'), value: nonBlankText }),
  z.strictObject({ type: z.literal('latest'), value: nonBlankText }),
  z.strictObject({
    type: z.literal('minSelections'),
    value: z.number().check(z.int(), z.nonnegative()),
  }),
  z.strictObject({
    type: z.literal('maxSelections'),
    value: z.number().check(z.int(), z.nonnegative()),
  }),
  z.strictObject({ type: z.literal('accepted') }),
]);
const answerValue = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]);
const option = z.strictObject({
  label: nonBlankText,
  value: nonBlankText,
  disabled: z.optional(z.boolean()),
});

const operation = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('setFormPresentation'),
    title: nonBlankText,
    description: nullableNonBlankText,
  }),
  z.strictObject({
    type: z.literal('setSubmissionPresentation'),
    submitLabel: nonBlankText,
    successMessage: nonBlankText,
  }),
  z.strictObject({
    type: z.literal('addSection'),
    section: z.unknown(),
    afterSectionId: nullableIdentifier,
  }),
  z.strictObject({
    type: z.literal('setSectionPresentation'),
    sectionId: identifier,
    title: nonBlankText,
    description: nullableNonBlankText,
  }),
  z.strictObject({ type: z.literal('removeSection'), sectionId: identifier }),
  z.strictObject({
    type: z.literal('moveSection'),
    sectionId: identifier,
    afterSectionId: nullableIdentifier,
  }),
  z.strictObject({
    type: z.literal('addField'),
    sectionId: identifier,
    field: z.unknown(),
    afterFieldId: nullableIdentifier,
  }),
  z.strictObject({
    type: z.literal('setFieldPresentation'),
    fieldId: identifier,
    presentation: fieldPresentation,
  }),
  z.strictObject({
    type: z.literal('setFieldDefault'),
    fieldId: identifier,
    defaultValue: z.nullable(answerValue),
  }),
  z.strictObject({
    type: z.literal('setFieldValidation'),
    fieldId: identifier,
    validation: z.nullable(z.array(validationRule)),
  }),
  z.strictObject({
    type: z.literal('setChoiceOptions'),
    fieldId: identifier,
    options: z.array(option).check(z.minLength(1)),
  }),
  z.strictObject({ type: z.literal('removeField'), fieldId: identifier }),
  z.strictObject({
    type: z.literal('moveField'),
    fieldId: identifier,
    toSectionId: identifier,
    afterFieldId: nullableIdentifier,
  }),
]);

const changeSetSchema = z.strictObject({
  changeSetVersion: z.literal(1),
  operations: z.array(operation).check(z.minLength(1)),
});

export function validateFormChangeSet(input: unknown): FormChangeSetValidationResult {
  const structural = changeSetSchema.safeParse(input);
  if (!structural.success) {
    return {
      success: false,
      issues: structural.error.issues.map((issue) => ({
        path: issue.path.map(stringOrNumber),
        ...mapStructuralIssue(issue.code),
      })),
    };
  }

  const operations: FormChangeOperation[] = [];
  const issues: FormChangeIssue[] = [];
  structural.data.operations.forEach((candidate, index) => {
    if (candidate.type === 'addSection') {
      const parsed = validateSectionCandidate(candidate.section);
      if (!parsed.success) {
        issues.push(...prefixDefinitionIssues(parsed.issues, ['operations', index, 'section']));
        return;
      }
      operations.push({ ...candidate, section: parsed.value });
      return;
    }
    if (candidate.type === 'addField') {
      const parsed = validateFieldCandidate(candidate.field);
      if (!parsed.success) {
        issues.push(...prefixDefinitionIssues(parsed.issues, ['operations', index, 'field']));
        return;
      }
      operations.push({ ...candidate, field: parsed.value });
      return;
    }
    operations.push(candidate as FormChangeOperation);
  });

  return issues.length > 0
    ? { success: false, issues }
    : {
        success: true,
        value: { changeSetVersion: 1, operations },
      };
}

export function applyFormChangeSet(
  definitionInput: unknown,
  changeSetInput: unknown,
): ApplyFormChangeSetResult {
  const definition = validateFormDraftDefinition(definitionInput);
  if (!definition.success) {
    return {
      success: false,
      issues: prefixDefinitionIssues(definition.issues, ['definition']),
    };
  }
  const changeSet = validateFormChangeSet(changeSetInput);
  if (!changeSet.success) return changeSet;

  const working = cloneValue(definition.value) as MutableDraft;
  for (let index = 0; index < changeSet.value.operations.length; index += 1) {
    const issue = applyOperation(working, changeSet.value.operations[index]!, index);
    if (issue) return { success: false, issues: [issue] };
  }

  const result = validateFormDraftDefinition(working);
  if (!result.success) {
    return {
      success: false,
      issues: result.issues.map((issue) => ({
        path: ['result', ...issue.path],
        code: 'invalid_result',
        message: 'Applied operations do not produce a valid form draft.',
      })),
    };
  }
  return {
    success: true,
    value: result.value,
    appliedOperationCount: changeSet.value.operations.length,
  };
}

type MutableDraft = {
  -readonly [Key in keyof FormDraftDefinition]: Key extends 'sections'
    ? MutableSection[]
    : FormDraftDefinition[Key];
};
type MutableSection = {
  -readonly [Key in keyof FormDraftSection]: Key extends 'fields'
    ? FormField[]
    : FormDraftSection[Key];
};

function applyOperation(
  draft: MutableDraft,
  operation: FormChangeOperation,
  operationIndex: number,
): FormChangeIssue | undefined {
  const path = ['operations', operationIndex] as const;
  switch (operation.type) {
    case 'setFormPresentation':
      draft.title = operation.title;
      setOptional(draft, 'description', operation.description);
      return;
    case 'setSubmissionPresentation':
      draft.submission = {
        submitLabel: operation.submitLabel,
        successMessage: operation.successMessage,
      };
      return;
    case 'addSection': {
      if (draft.sections.some((section) => section.id === operation.section.id))
        return issue(path, 'identifier_collision', 'Section ID is already in use.', 'section');
      const collidingFieldIndex = operation.section.fields.findIndex((field) =>
        Boolean(findField(draft, field.id)),
      );
      if (collidingFieldIndex >= 0) {
        return {
          path: [...path, 'section', 'fields', collidingFieldIndex, 'id'],
          code: 'identifier_collision',
          message: 'Field ID is already in use.',
        };
      }
      const insertion = insertionIndex(
        draft.sections,
        operation.afterSectionId,
        path,
        'afterSectionId',
      );
      if (typeof insertion !== 'number') return insertion;
      draft.sections.splice(insertion, 0, cloneValue(operation.section) as MutableSection);
      return;
    }
    case 'setSectionPresentation': {
      const section = draft.sections.find((candidate) => candidate.id === operation.sectionId);
      if (!section)
        return issue(path, 'target_not_found', 'Section target was not found.', 'sectionId');
      section.title = operation.title;
      setOptional(section, 'description', operation.description);
      return;
    }
    case 'removeSection': {
      const index = draft.sections.findIndex((section) => section.id === operation.sectionId);
      if (index < 0)
        return issue(path, 'target_not_found', 'Section target was not found.', 'sectionId');
      draft.sections.splice(index, 1);
      return;
    }
    case 'moveSection': {
      const index = draft.sections.findIndex((section) => section.id === operation.sectionId);
      if (index < 0)
        return issue(path, 'target_not_found', 'Section target was not found.', 'sectionId');
      if (operation.afterSectionId === operation.sectionId)
        return issue(
          path,
          'invalid_anchor',
          'A section cannot be anchored to itself.',
          'afterSectionId',
        );
      const [section] = draft.sections.splice(index, 1);
      const insertion = insertionIndex(
        draft.sections,
        operation.afterSectionId,
        path,
        'afterSectionId',
      );
      if (typeof insertion !== 'number') {
        draft.sections.splice(index, 0, section!);
        return insertion;
      }
      draft.sections.splice(insertion, 0, section!);
      return;
    }
    case 'addField': {
      const section = draft.sections.find((candidate) => candidate.id === operation.sectionId);
      if (!section)
        return issue(path, 'target_not_found', 'Section target was not found.', 'sectionId');
      if (findField(draft, operation.field.id))
        return issue(path, 'identifier_collision', 'Field ID is already in use.', 'field');
      const insertion = insertionIndex(
        section.fields,
        operation.afterFieldId,
        path,
        'afterFieldId',
      );
      if (typeof insertion !== 'number') return insertion;
      section.fields.splice(insertion, 0, cloneValue(operation.field));
      return;
    }
    case 'setFieldPresentation': {
      const located = findField(draft, operation.fieldId);
      if (!located)
        return issue(path, 'target_not_found', 'Field target was not found.', 'fieldId');
      if (located.field.type !== operation.presentation.fieldType)
        return issue(
          path,
          'incompatible_field_type',
          'Presentation type must match the target field type.',
          'presentation',
        );
      located.section.fields[located.index] = applyPresentation(
        located.field,
        operation.presentation,
      );
      return;
    }
    case 'setFieldDefault': {
      const located = findField(draft, operation.fieldId);
      if (!located)
        return issue(path, 'target_not_found', 'Field target was not found.', 'fieldId');
      if (!isDefaultCompatible(located.field, operation.defaultValue))
        return issue(
          path,
          'incompatible_field_type',
          'Default value shape is incompatible with the target field type.',
          'defaultValue',
        );
      const replacement = { ...located.field } as Record<string, unknown>;
      setOptional(replacement, 'defaultValue', operation.defaultValue);
      located.section.fields[located.index] = replacement as unknown as FormField;
      return;
    }
    case 'setFieldValidation': {
      const located = findField(draft, operation.fieldId);
      if (!located)
        return issue(path, 'target_not_found', 'Field target was not found.', 'fieldId');
      if (!isValidationCompatible(located.field, operation.validation))
        return issue(
          path,
          'incompatible_field_type',
          'Validation rule family is incompatible with the target field type.',
          'validation',
        );
      const replacement = { ...located.field } as Record<string, unknown>;
      setOptional(replacement, 'validation', operation.validation && [...operation.validation]);
      located.section.fields[located.index] = replacement as unknown as FormField;
      return;
    }
    case 'setChoiceOptions': {
      const located = findField(draft, operation.fieldId);
      if (!located)
        return issue(path, 'target_not_found', 'Field target was not found.', 'fieldId');
      if (!['select', 'radio', 'multi-select', 'checkbox-group'].includes(located.field.type))
        return issue(
          path,
          'incompatible_field_type',
          'Options require a choice field target.',
          'fieldId',
        );
      located.section.fields[located.index] = {
        ...located.field,
        options: cloneValue(operation.options),
      } as FormField;
      return;
    }
    case 'removeField': {
      const located = findField(draft, operation.fieldId);
      if (!located)
        return issue(path, 'target_not_found', 'Field target was not found.', 'fieldId');
      located.section.fields.splice(located.index, 1);
      return;
    }
    case 'moveField': {
      const located = findField(draft, operation.fieldId);
      if (!located)
        return issue(path, 'target_not_found', 'Field target was not found.', 'fieldId');
      const destination = draft.sections.find((section) => section.id === operation.toSectionId);
      if (!destination)
        return issue(path, 'target_not_found', 'Destination section was not found.', 'toSectionId');
      if (operation.afterFieldId === operation.fieldId)
        return issue(
          path,
          'invalid_anchor',
          'A field cannot be anchored to itself.',
          'afterFieldId',
        );
      const [field] = located.section.fields.splice(located.index, 1);
      const insertion = insertionIndex(
        destination.fields,
        operation.afterFieldId,
        path,
        'afterFieldId',
      );
      if (typeof insertion !== 'number') {
        located.section.fields.splice(located.index, 0, field!);
        return insertion;
      }
      destination.fields.splice(insertion, 0, field!);
      return;
    }
  }
}

function isDefaultCompatible(
  field: FormField,
  value: string | number | boolean | readonly string[] | null,
): boolean {
  if (value === null) return true;
  switch (field.type) {
    case 'text':
    case 'email':
    case 'tel':
    case 'url':
    case 'textarea':
    case 'date':
    case 'datetime':
    case 'time':
    case 'select':
    case 'radio':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'multi-select':
    case 'checkbox-group':
      return Array.isArray(value);
    case 'checkbox':
      return typeof value === 'boolean';
    case 'password':
      return false;
  }
}

function isValidationCompatible(
  field: FormField,
  rules: readonly { readonly type: string }[] | null,
): boolean {
  if (rules === null) return true;
  const allowed = validationRuleTypes(field.type);
  return rules.every((rule) => allowed.has(rule.type));
}

function validationRuleTypes(type: FormField['type']): ReadonlySet<string> {
  switch (type) {
    case 'text':
    case 'email':
    case 'password':
    case 'tel':
    case 'url':
    case 'textarea':
      return new Set(['required', 'minLength', 'maxLength']);
    case 'number':
      return new Set(['required', 'min', 'max', 'integer']);
    case 'date':
    case 'datetime':
    case 'time':
      return new Set(['required', 'earliest', 'latest']);
    case 'select':
    case 'radio':
      return new Set(['required']);
    case 'multi-select':
    case 'checkbox-group':
      return new Set(['required', 'minSelections', 'maxSelections']);
    case 'checkbox':
      return new Set(['required', 'accepted']);
  }
}

function applyPresentation(field: FormField, presentation: FormFieldPresentation): FormField {
  const replacement = { ...field } as Record<string, unknown>;
  replacement['label'] = presentation.label;
  setOptional(replacement, 'helpText', presentation.helpText);
  if ('placeholder' in presentation)
    setOptional(replacement, 'placeholder', presentation.placeholder);
  if ('autocomplete' in presentation)
    setOptional(replacement, 'autocomplete', presentation.autocomplete);
  if ('rows' in presentation) setOptional(replacement, 'rows', presentation.rows);
  return replacement as unknown as FormField;
}

function findField(
  draft: MutableDraft,
  fieldId: string,
):
  | { readonly section: MutableSection; readonly index: number; readonly field: FormField }
  | undefined {
  for (const section of draft.sections) {
    const index = section.fields.findIndex((field) => field.id === fieldId);
    if (index >= 0) return { section, index, field: section.fields[index]! };
  }
  return undefined;
}

function insertionIndex<T extends { readonly id: string }>(
  values: readonly T[],
  afterId: string | null,
  path: readonly (string | number)[],
  property: string,
): number | FormChangeIssue {
  if (afterId === null) return 0;
  const anchorIndex = values.findIndex((value) => value.id === afterId);
  return anchorIndex < 0
    ? issue(
        path,
        'invalid_anchor',
        'Ordering anchor was not found in the target container.',
        property,
      )
    : anchorIndex + 1;
}

function setOptional(
  target: Record<string, unknown>,
  property: string,
  value: unknown | null,
): void;
function setOptional<T extends object, K extends keyof T>(
  target: T,
  property: K,
  value: T[K] | null,
): void;
function setOptional(target: object, property: PropertyKey, value: unknown | null): void {
  if (value === null) delete (target as Record<PropertyKey, unknown>)[property];
  else (target as Record<PropertyKey, unknown>)[property] = value;
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => cloneValue(entry)) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]),
    ) as T;
  }
  return value;
}

function validateSectionCandidate(input: unknown) {
  const result = validateFormDraftDefinition(candidateDefinition([input]));
  return result.success
    ? { success: true as const, value: result.value.sections[0]! }
    : { success: false as const, issues: stripCandidatePath(result.issues, ['sections', 0]) };
}

function validateFieldCandidate(input: unknown) {
  const result = validateFormDraftDefinition(
    candidateDefinition([{ id: 'candidate', title: 'Candidate', fields: [input] }]),
  );
  return result.success
    ? { success: true as const, value: result.value.sections[0]!.fields[0]! }
    : {
        success: false as const,
        issues: stripCandidatePath(result.issues, ['sections', 0, 'fields', 0]),
      };
}

function candidateDefinition(sections: readonly unknown[]): unknown {
  return {
    schemaVersion: 1,
    id: 'change-candidate',
    formVersion: 1,
    title: 'Candidate',
    sections,
    submission: { submitLabel: 'Submit', successMessage: 'Complete' },
  };
}

function stripCandidatePath(
  issues: readonly {
    readonly path: readonly (string | number)[];
    readonly code: string;
    readonly message: string;
  }[],
  prefix: readonly (string | number)[],
) {
  return issues.map((issue) => ({ ...issue, path: issue.path.slice(prefix.length) }));
}

function prefixDefinitionIssues(
  issues: readonly { readonly path: readonly (string | number)[]; readonly message: string }[],
  prefix: readonly (string | number)[],
): FormChangeIssue[] {
  return issues.map((candidate) => ({
    path: [...prefix, ...candidate.path],
    code: 'invalid_candidate',
    message: 'Candidate does not satisfy the form draft contract.',
  }));
}

function issue(
  path: readonly (string | number)[],
  code: FormChangeIssueCode,
  message: string,
  property: string,
): FormChangeIssue {
  return { path: [...path, property], code, message };
}

function stringOrNumber(segment: PropertyKey): string | number {
  return typeof segment === 'number' ? segment : String(segment);
}

function mapStructuralIssue(code: z.core.$ZodIssue['code']): {
  readonly code: FormChangeIssueCode;
  readonly message: string;
} {
  switch (code) {
    case 'invalid_type':
      return { code: 'invalid_type', message: 'Has an invalid type.' };
    case 'invalid_value':
      return { code: 'unsupported_value', message: 'Contains an unsupported value.' };
    case 'unrecognized_keys':
      return { code: 'unknown_property', message: 'Contains unsupported properties.' };
    case 'invalid_format':
      return { code: 'invalid_format', message: 'Has an invalid format.' };
    case 'too_small':
      return { code: 'value_too_small', message: 'Is below the allowed minimum.' };
    default:
      return { code: 'invalid_structure', message: 'Does not match the change-set schema.' };
  }
}
