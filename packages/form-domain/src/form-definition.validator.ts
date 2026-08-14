import { z } from 'zod/mini';

import type { FormDefinition } from './form-definition.models.js';
import { FORM_IDENTIFIER_PATTERN } from './form-identifier.js';

const identifier = z
  .string()
  .check(z.regex(new RegExp(FORM_IDENTIFIER_PATTERN), 'Must be a machine-safe identifier.'));
const nonBlankText = z.string().check(z.trim(), z.minLength(1, 'Must not be empty.'));
const positiveInteger = z.number().check(z.int(), z.positive());
const nonNegativeInteger = z.number().check(z.int(), z.nonnegative());
const dateValue = z.iso.date();
const localDateTimeValue = z.iso
  .datetime({ local: true })
  .check(z.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/));
const timeValue = z.iso.time();

const requiredRule = z.strictObject({ type: z.literal('required') });
const minLengthRule = z.strictObject({
  type: z.literal('minLength'),
  value: nonNegativeInteger,
});
const maxLengthRule = z.strictObject({
  type: z.literal('maxLength'),
  value: nonNegativeInteger,
});
const minRule = z.strictObject({ type: z.literal('min'), value: z.number() });
const maxRule = z.strictObject({ type: z.literal('max'), value: z.number() });
const integerRule = z.strictObject({ type: z.literal('integer') });
const earliestRule = z.strictObject({ type: z.literal('earliest'), value: nonBlankText });
const latestRule = z.strictObject({ type: z.literal('latest'), value: nonBlankText });
const minSelectionsRule = z.strictObject({
  type: z.literal('minSelections'),
  value: nonNegativeInteger,
});
const maxSelectionsRule = z.strictObject({
  type: z.literal('maxSelections'),
  value: nonNegativeInteger,
});
const acceptedRule = z.strictObject({ type: z.literal('accepted') });

const textRule = z.discriminatedUnion('type', [requiredRule, minLengthRule, maxLengthRule]);
const numberRule = z.discriminatedUnion('type', [requiredRule, minRule, maxRule, integerRule]);
const temporalRule = z.discriminatedUnion('type', [requiredRule, earliestRule, latestRule]);
const selectionRule = z.discriminatedUnion('type', [
  requiredRule,
  minSelectionsRule,
  maxSelectionsRule,
]);
const booleanRule = z.discriminatedUnion('type', [requiredRule, acceptedRule]);

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

const fieldBase = {
  id: identifier,
  label: nonBlankText,
  helpText: z.optional(nonBlankText),
};

const textEntryBase = {
  ...fieldBase,
  placeholder: z.optional(z.string()),
  autocomplete: z.optional(autocomplete),
  defaultValue: z.optional(z.string()),
  validation: z.optional(z.array(textRule)),
};

const passwordField = z.strictObject({
  ...fieldBase,
  type: z.literal('password'),
  placeholder: z.optional(z.string()),
  autocomplete: z.optional(autocomplete),
  validation: z.optional(z.array(textRule)),
});

const option = z.strictObject({
  label: nonBlankText,
  value: nonBlankText,
  disabled: z.optional(z.boolean()),
});

const singleChoiceBase = {
  ...fieldBase,
  options: z.array(option).check(z.minLength(1)),
  defaultValue: z.optional(z.string()),
  validation: z.optional(z.array(requiredRule)),
};

const multipleChoiceBase = {
  ...fieldBase,
  options: z.array(option).check(z.minLength(1)),
  defaultValue: z.optional(z.array(z.string())),
  validation: z.optional(z.array(selectionRule)),
};

const formFieldSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...textEntryBase, type: z.literal('text') }),
  z.strictObject({
    ...textEntryBase,
    type: z.literal('email'),
    defaultValue: z.optional(z.email()),
  }),
  passwordField,
  z.strictObject({ ...textEntryBase, type: z.literal('tel') }),
  z.strictObject({ ...textEntryBase, type: z.literal('url'), defaultValue: z.optional(z.url()) }),
  z.strictObject({
    ...textEntryBase,
    type: z.literal('textarea'),
    rows: z.optional(positiveInteger),
  }),
  z.strictObject({
    ...fieldBase,
    type: z.literal('number'),
    placeholder: z.optional(z.string()),
    defaultValue: z.optional(z.number()),
    validation: z.optional(z.array(numberRule)),
  }),
  z.strictObject({
    ...fieldBase,
    type: z.literal('date'),
    defaultValue: z.optional(dateValue),
    validation: z.optional(z.array(temporalRule)),
  }),
  z.strictObject({
    ...fieldBase,
    type: z.literal('datetime'),
    defaultValue: z.optional(localDateTimeValue),
    validation: z.optional(z.array(temporalRule)),
  }),
  z.strictObject({
    ...fieldBase,
    type: z.literal('time'),
    defaultValue: z.optional(timeValue),
    validation: z.optional(z.array(temporalRule)),
  }),
  z.strictObject({
    ...singleChoiceBase,
    type: z.literal('select'),
    placeholder: z.optional(z.string()),
  }),
  z.strictObject({ ...singleChoiceBase, type: z.literal('radio') }),
  z.strictObject({ ...multipleChoiceBase, type: z.literal('multi-select') }),
  z.strictObject({
    ...fieldBase,
    type: z.literal('checkbox'),
    defaultValue: z.optional(z.boolean()),
    validation: z.optional(z.array(booleanRule)),
  }),
  z.strictObject({ ...multipleChoiceBase, type: z.literal('checkbox-group') }),
]);

const formDefinitionStructure = z.strictObject({
  schemaVersion: z.literal(1),
  id: identifier,
  formVersion: positiveInteger,
  title: nonBlankText,
  description: z.optional(nonBlankText),
  sections: z
    .array(
      z.strictObject({
        id: identifier,
        title: nonBlankText,
        description: z.optional(nonBlankText),
        fields: z.array(formFieldSchema).check(z.minLength(1)),
      }),
    )
    .check(z.minLength(1)),
  submission: z.strictObject({
    submitLabel: nonBlankText,
    successMessage: nonBlankText,
  }),
});

export interface FormDefinitionValidationIssue {
  readonly path: readonly (string | number)[];
  readonly code: FormDefinitionValidationIssueCode;
  readonly message: string;
}

export type FormDefinitionValidationIssueCode =
  | 'invalid_type'
  | 'unsupported_value'
  | 'unknown_property'
  | 'invalid_format'
  | 'value_too_small'
  | 'duplicate'
  | 'invalid_default'
  | 'invalid_range'
  | 'invalid_temporal_value'
  | 'invalid_structure';

export type FormDefinitionValidationResult =
  | { readonly success: true; readonly value: FormDefinition }
  | { readonly success: false; readonly issues: readonly FormDefinitionValidationIssue[] };

export function validateFormDefinition(input: unknown): FormDefinitionValidationResult {
  const structuralResult = formDefinitionStructure.safeParse(input);

  if (!structuralResult.success) {
    return {
      success: false,
      issues: structuralResult.error.issues.map((issue) => ({
        path: issue.path.map(StringOrNumber),
        ...mapStructuralIssue(issue.code),
      })),
    };
  }

  const issues = validateDomainInvariants(structuralResult.data);

  return issues.length > 0
    ? { success: false, issues }
    : { success: true, value: structuralResult.data as FormDefinition };
}

function validateDomainInvariants(
  form: z.infer<typeof formDefinitionStructure>,
): FormDefinitionValidationIssue[] {
  const issues: FormDefinitionValidationIssue[] = [];
  const sectionIds = new Set<string>();
  const fieldIds = new Set<string>();

  form.sections.forEach((section, sectionIndex) => {
    addDuplicateIssue(issues, sectionIds, section.id, ['sections', sectionIndex, 'id'], 'section');

    section.fields.forEach((field, fieldIndex) => {
      const fieldPath: (string | number)[] = ['sections', sectionIndex, 'fields', fieldIndex];
      addDuplicateIssue(issues, fieldIds, field.id, [...fieldPath, 'id'], 'field');
      validateUniqueRuleTypes(issues, field.validation, [...fieldPath, 'validation']);

      if ('options' in field) {
        validateChoiceField(issues, field, fieldPath);
      }

      if (field.type === 'number') {
        validateNumberDefault(issues, field, fieldPath);
      }

      if (field.type === 'date' || field.type === 'datetime' || field.type === 'time') {
        validateTemporalDefault(issues, field, fieldPath);
      }

      validateRuleRanges(issues, field.type, field.validation, [...fieldPath, 'validation']);
      validateTemporalRules(issues, field, [...fieldPath, 'validation']);
    });
  });

  return issues;
}

function validateNumberDefault(
  issues: FormDefinitionValidationIssue[],
  field: {
    readonly defaultValue?: number | undefined;
    readonly validation?:
      | readonly (
          | { readonly type: 'required' | 'integer' }
          | { readonly type: 'min' | 'max'; readonly value: number }
        )[]
      | undefined;
  },
  fieldPath: readonly (string | number)[],
): void {
  if (field.defaultValue === undefined) return;
  const min = field.validation?.find((rule) => rule.type === 'min');
  const max = field.validation?.find((rule) => rule.type === 'max');
  const requiresInteger = field.validation?.some((rule) => rule.type === 'integer') ?? false;
  if (
    (min?.type === 'min' && field.defaultValue < min.value) ||
    (max?.type === 'max' && field.defaultValue > max.value) ||
    (requiresInteger && !Number.isInteger(field.defaultValue))
  ) {
    issues.push({
      path: [...fieldPath, 'defaultValue'],
      code: 'invalid_default',
      message: 'Number default does not satisfy its validation rules.',
    });
  }
}

function validateTemporalDefault(
  issues: FormDefinitionValidationIssue[],
  field: {
    readonly type: 'date' | 'datetime' | 'time';
    readonly defaultValue?: string | undefined;
    readonly validation?:
      | readonly (
          | { readonly type: 'required' }
          | { readonly type: 'earliest' | 'latest'; readonly value: string }
        )[]
      | undefined;
  },
  fieldPath: readonly (string | number)[],
): void {
  if (field.defaultValue === undefined) return;
  const earliest = field.validation?.find((rule) => rule.type === 'earliest');
  const latest = field.validation?.find((rule) => rule.type === 'latest');
  if (
    (earliest?.type === 'earliest' &&
      compareTemporalValues(field.type, field.defaultValue, earliest.value) < 0) ||
    (latest?.type === 'latest' &&
      compareTemporalValues(field.type, field.defaultValue, latest.value) > 0)
  ) {
    issues.push({
      path: [...fieldPath, 'defaultValue'],
      code: 'invalid_default',
      message: 'Temporal default does not satisfy its validation rules.',
    });
  }
}

function validateChoiceField(
  issues: FormDefinitionValidationIssue[],
  field: {
    readonly type: 'select' | 'radio' | 'multi-select' | 'checkbox-group';
    readonly options: readonly {
      readonly value: string;
      readonly disabled?: boolean | undefined;
    }[];
    readonly defaultValue?: string | string[] | undefined;
    readonly validation?:
      | readonly {
          readonly type: 'required' | 'minSelections' | 'maxSelections';
          readonly value?: number | undefined;
        }[]
      | undefined;
  },
  fieldPath: readonly (string | number)[],
): void {
  const optionValues = new Set<string>();

  field.options.forEach((option, optionIndex) => {
    addDuplicateIssue(
      issues,
      optionValues,
      option.value,
      [...fieldPath, 'options', optionIndex, 'value'],
      'option value',
    );
  });

  const defaults = Array.isArray(field.defaultValue)
    ? field.defaultValue
    : field.defaultValue === undefined
      ? []
      : [field.defaultValue];
  const enabledOptionValues = new Set(
    field.options.filter((option) => !option.disabled).map((option) => option.value),
  );
  const seenDefaults = new Set<string>();

  const required = field.validation?.some((rule) => rule.type === 'required') ?? false;
  const minimum = field.validation?.find((rule) => rule.type === 'minSelections');
  const maximum = field.validation?.find((rule) => rule.type === 'maxSelections');
  const requiredCount = Math.max(required ? 1 : 0, minimum?.value ?? 0);
  if (requiredCount > enabledOptionValues.size || requiredCount > (maximum?.value ?? Infinity)) {
    issues.push({
      path: [...fieldPath, 'validation'],
      code: 'invalid_range',
      message: 'Selection validation cannot be satisfied by the enabled options.',
    });
  }

  defaults.forEach((defaultValue, defaultIndex) => {
    const defaultPath = [
      ...fieldPath,
      'defaultValue',
      ...(Array.isArray(field.defaultValue) ? [defaultIndex] : []),
    ];
    if (!enabledOptionValues.has(defaultValue)) {
      issues.push({
        path: defaultPath,
        code: 'invalid_default',
        message: `Default value "${defaultValue}" is not an enabled field option.`,
      });
    }
    addDuplicateIssue(issues, seenDefaults, defaultValue, defaultPath, 'default value');
  });
}

function validateTemporalRules(
  issues: FormDefinitionValidationIssue[],
  field: {
    readonly type: string;
    readonly validation?:
      | readonly { readonly type: string; readonly value?: string | number | undefined }[]
      | undefined;
  },
  path: readonly (string | number)[],
): void {
  if (!['date', 'datetime', 'time'].includes(field.type)) return;

  const format =
    field.type === 'date' ? dateValue : field.type === 'time' ? timeValue : localDateTimeValue;

  field.validation?.forEach((rule, index) => {
    if (
      (rule.type === 'earliest' || rule.type === 'latest') &&
      !format.safeParse(rule.value).success
    ) {
      issues.push({
        path: [...path, index, 'value'],
        code: 'invalid_temporal_value',
        message: `${rule.type} must use the ${field.type} field's ISO format.`,
      });
    }
  });
}

function compareTemporalValues(
  type: 'date' | 'datetime' | 'time',
  left: string,
  right: string,
): number {
  if (type === 'date') return left.localeCompare(right);

  const leftParts = temporalComparisonParts(type, left);
  const rightParts = temporalComparisonParts(type, right);
  const wholeValueComparison = leftParts.whole.localeCompare(rightParts.whole);
  if (wholeValueComparison !== 0) return wholeValueComparison;

  const precision = Math.max(leftParts.fraction.length, rightParts.fraction.length);
  return leftParts.fraction
    .padEnd(precision, '0')
    .localeCompare(rightParts.fraction.padEnd(precision, '0'));
}

function temporalComparisonParts(
  type: 'datetime' | 'time',
  value: string,
): { readonly whole: string; readonly fraction: string } {
  const [wholeValue, fraction = ''] = value.split('.');
  const timeSeparator = type === 'datetime' ? 'T' : '';
  const [datePart, timePart] =
    type === 'datetime' ? wholeValue!.split('T') : ['', wholeValue ?? ''];
  const whole = `${datePart}${timeSeparator}${timePart!.length === 5 ? `${timePart}:00` : timePart}`;
  return { whole, fraction };
}

function validateUniqueRuleTypes(
  issues: FormDefinitionValidationIssue[],
  rules: readonly { readonly type: string }[] | undefined,
  path: readonly (string | number)[],
): void {
  const ruleTypes = new Set<string>();
  rules?.forEach((rule, index) =>
    addDuplicateIssue(issues, ruleTypes, rule.type, [...path, index, 'type'], 'validation rule'),
  );
}

function validateRuleRanges(
  issues: FormDefinitionValidationIssue[],
  fieldType: string,
  rules:
    readonly { readonly type: string; readonly value?: string | number | undefined }[] | undefined,
  path: readonly (string | number)[],
): void {
  if (!rules) return;

  const minimum = rules.find((rule) =>
    ['min', 'minLength', 'minSelections', 'earliest'].includes(rule.type),
  );
  const maximum = rules.find((rule) =>
    ['max', 'maxLength', 'maxSelections', 'latest'].includes(rule.type),
  );

  if (minimum?.value === undefined || maximum?.value === undefined) return;

  const invalidRange =
    (fieldType === 'date' || fieldType === 'datetime' || fieldType === 'time') &&
    typeof minimum.value === 'string' &&
    typeof maximum.value === 'string'
      ? compareTemporalValues(fieldType, minimum.value, maximum.value) > 0
      : minimum.value > maximum.value;

  if (invalidRange) {
    issues.push({
      path,
      code: 'invalid_range',
      message: `${minimum.type} must not exceed ${maximum.type}.`,
    });
  }
}

function addDuplicateIssue(
  issues: FormDefinitionValidationIssue[],
  seen: Set<string>,
  value: string,
  path: readonly (string | number)[],
  subject: string,
): void {
  if (seen.has(value)) {
    issues.push({ path, code: 'duplicate', message: `Duplicate ${subject} "${value}".` });
  }
  seen.add(value);
}

function StringOrNumber(segment: PropertyKey): string | number {
  return typeof segment === 'number' ? segment : String(segment);
}

function mapStructuralIssue(code: z.core.$ZodIssue['code']): {
  readonly code: FormDefinitionValidationIssueCode;
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
      return { code: 'invalid_structure', message: 'Does not match the form schema.' };
  }
}
