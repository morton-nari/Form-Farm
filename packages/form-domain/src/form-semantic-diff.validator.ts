import { z } from 'zod/mini';

import type { FormSemanticChange } from './form-semantic-diff.models.js';
import { FORM_IDENTIFIER_PATTERN } from './form-identifier.js';

const identifier = z
  .string()
  .check(z.regex(new RegExp(FORM_IDENTIFIER_PATTERN), 'Must be a machine-safe identifier.'));
const nonNegativeInteger = z.number().check(z.int(), z.nonnegative());
const positiveInteger = z.number().check(z.int(), z.positive());
const fieldType = z.enum([
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
]);
const validationRuleType = z.enum([
  'required',
  'minLength',
  'maxLength',
  'min',
  'max',
  'integer',
  'earliest',
  'latest',
  'minSelections',
  'maxSelections',
  'accepted',
]);
const validationChange = z.enum(['added', 'removed', 'valueChanged']);

const formSemanticChangeSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('formPresentationChanged'),
    property: z.enum(['title', 'description']),
  }),
  z.strictObject({
    type: z.literal('submissionPresentationChanged'),
    property: z.enum(['submitLabel', 'successMessage']),
  }),
  z.strictObject({
    type: z.literal('sectionAdded'),
    sectionId: identifier,
    toIndex: nonNegativeInteger,
  }),
  z.strictObject({
    type: z.literal('sectionRemoved'),
    sectionId: identifier,
    fromIndex: nonNegativeInteger,
  }),
  z.strictObject({
    type: z.literal('sectionMoved'),
    sectionId: identifier,
    fromIndex: nonNegativeInteger,
    toIndex: nonNegativeInteger,
  }),
  z.strictObject({
    type: z.literal('sectionPresentationChanged'),
    sectionId: identifier,
    property: z.enum(['title', 'description']),
  }),
  z.strictObject({
    type: z.literal('fieldAdded'),
    fieldId: identifier,
    fieldType,
    toSectionId: identifier,
    toIndex: nonNegativeInteger,
  }),
  z.strictObject({
    type: z.literal('fieldRemoved'),
    fieldId: identifier,
    fieldType,
    fromSectionId: identifier,
    fromIndex: nonNegativeInteger,
  }),
  z.strictObject({
    type: z.literal('fieldMoved'),
    fieldId: identifier,
    fromSectionId: identifier,
    toSectionId: identifier,
    fromIndex: nonNegativeInteger,
    toIndex: nonNegativeInteger,
  }),
  z.strictObject({
    type: z.literal('fieldTypeChanged'),
    fieldId: identifier,
    fromFieldType: fieldType,
    toFieldType: fieldType,
  }),
  z.strictObject({
    type: z.literal('fieldPresentationChanged'),
    fieldId: identifier,
    property: z.enum(['label', 'helpText', 'placeholder', 'autocomplete', 'rows']),
  }),
  z.strictObject({
    type: z.literal('fieldDefaultChanged'),
    fieldId: identifier,
    change: validationChange,
  }),
  z.strictObject({
    type: z.literal('fieldValidationChanged'),
    fieldId: identifier,
    ruleType: validationRuleType,
    change: validationChange,
  }),
  z.strictObject({
    type: z.literal('choiceOptionAdded'),
    fieldId: identifier,
    toIndex: nonNegativeInteger,
  }),
  z.strictObject({
    type: z.literal('choiceOptionRemoved'),
    fieldId: identifier,
    fromIndex: nonNegativeInteger,
  }),
  z.strictObject({
    type: z.literal('choiceOptionMoved'),
    fieldId: identifier,
    fromIndex: nonNegativeInteger,
    toIndex: nonNegativeInteger,
  }),
  z.strictObject({
    type: z.literal('choiceOptionPresentationChanged'),
    fieldId: identifier,
    optionIndex: nonNegativeInteger,
    property: z.enum(['label', 'disabled']),
  }),
]);

const formSemanticDiffSchema = z.strictObject({
  // Structurally valid unknown versions reach the consumer's explicit version policy.
  diffVersion: positiveInteger,
  formId: identifier,
  fromFormVersion: positiveInteger,
  toFormVersion: positiveInteger,
  changes: z.array(formSemanticChangeSchema),
  totalChangeCount: nonNegativeInteger,
  truncated: z.boolean(),
});

export interface ValidatedFormSemanticDiff {
  readonly diffVersion: number;
  readonly formId: string;
  readonly fromFormVersion: number;
  readonly toFormVersion: number;
  readonly changes: readonly FormSemanticChange[];
  readonly totalChangeCount: number;
  readonly truncated: boolean;
}

export interface FormSemanticDiffValidationIssue {
  readonly path: readonly (string | number)[];
  readonly code: 'invalid_type' | 'unsupported_value' | 'unknown_property' | 'invalid_format' | 'value_too_small';
  readonly message: string;
}

export type FormSemanticDiffValidationResult =
  | { readonly success: true; readonly value: ValidatedFormSemanticDiff }
  | { readonly success: false; readonly issues: readonly FormSemanticDiffValidationIssue[] };

export function validateFormSemanticDiff(input: unknown): FormSemanticDiffValidationResult {
  const result = formSemanticDiffSchema.safeParse(input);
  if (result.success) return { success: true, value: result.data };

  return {
    success: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.map((part) => (typeof part === 'number' ? part : String(part))),
      code: issueCode(issue.code),
      message: safeMessage(issue.code),
    })),
  };
}

function issueCode(
  code: string,
): FormSemanticDiffValidationIssue['code'] {
  if (code === 'unrecognized_keys') return 'unknown_property';
  if (code === 'invalid_format') return 'invalid_format';
  if (code === 'too_small') return 'value_too_small';
  if (code === 'invalid_value') return 'unsupported_value';
  return 'invalid_type';
}

function safeMessage(code: string): string {
  if (code === 'unrecognized_keys') return 'Unexpected property.';
  if (code === 'invalid_format') return 'Invalid format.';
  if (code === 'too_small') return 'Value is below the allowed minimum.';
  if (code === 'invalid_value') return 'Unsupported value.';
  return 'Invalid value type.';
}
