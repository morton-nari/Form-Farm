import { z } from 'zod';

import { FormDefinition } from './form-definition.models';

const identifier = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/, 'Must be a machine-safe identifier.');
const nonBlankText = z.string().trim().min(1, 'Must not be empty.');
const positiveInteger = z.number().int().positive();
const nonNegativeInteger = z.number().int().nonnegative();

const requiredRule = z.strictObject({ type: z.literal('required') });
const minLengthRule = z.strictObject({
  type: z.literal('minLength'),
  value: nonNegativeInteger,
});
const maxLengthRule = z.strictObject({
  type: z.literal('maxLength'),
  value: nonNegativeInteger,
});
const minRule = z.strictObject({ type: z.literal('min'), value: z.number().finite() });
const maxRule = z.strictObject({ type: z.literal('max'), value: z.number().finite() });
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
  helpText: nonBlankText.optional(),
};

const textEntryBase = {
  ...fieldBase,
  placeholder: z.string().optional(),
  autocomplete: autocomplete.optional(),
  defaultValue: z.string().optional(),
  validation: z.array(textRule).optional(),
};

const passwordField = z.strictObject({
  ...fieldBase,
  type: z.literal('password'),
  placeholder: z.string().optional(),
  autocomplete: autocomplete.optional(),
  validation: z.array(textRule).optional(),
});

const option = z.strictObject({
  label: nonBlankText,
  value: nonBlankText,
  disabled: z.boolean().optional(),
});

const singleChoiceBase = {
  ...fieldBase,
  options: z.array(option).min(1),
  defaultValue: z.string().optional(),
  validation: z.array(requiredRule).optional(),
};

const multipleChoiceBase = {
  ...fieldBase,
  options: z.array(option).min(1),
  defaultValue: z.array(z.string()).optional(),
  validation: z.array(selectionRule).optional(),
};

const formFieldSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...textEntryBase, type: z.literal('text') }),
  z.strictObject({
    ...textEntryBase,
    type: z.literal('email'),
    defaultValue: z.email().optional(),
  }),
  passwordField,
  z.strictObject({ ...textEntryBase, type: z.literal('tel') }),
  z.strictObject({ ...textEntryBase, type: z.literal('url'), defaultValue: z.url().optional() }),
  z.strictObject({
    ...textEntryBase,
    type: z.literal('textarea'),
    rows: positiveInteger.optional(),
  }),
  z.strictObject({
    ...fieldBase,
    type: z.literal('number'),
    placeholder: z.string().optional(),
    defaultValue: z.number().finite().optional(),
    validation: z.array(numberRule).optional(),
  }),
  z.strictObject({
    ...fieldBase,
    type: z.literal('date'),
    defaultValue: z.iso.date().optional(),
    validation: z.array(temporalRule).optional(),
  }),
  z.strictObject({
    ...fieldBase,
    type: z.literal('datetime'),
    defaultValue: z.iso.datetime({ local: true }).optional(),
    validation: z.array(temporalRule).optional(),
  }),
  z.strictObject({
    ...fieldBase,
    type: z.literal('time'),
    defaultValue: z.iso.time().optional(),
    validation: z.array(temporalRule).optional(),
  }),
  z.strictObject({
    ...singleChoiceBase,
    type: z.literal('select'),
    placeholder: z.string().optional(),
  }),
  z.strictObject({ ...singleChoiceBase, type: z.literal('radio') }),
  z.strictObject({ ...multipleChoiceBase, type: z.literal('multi-select') }),
  z.strictObject({
    ...fieldBase,
    type: z.literal('checkbox'),
    defaultValue: z.boolean().optional(),
    validation: z.array(booleanRule).optional(),
  }),
  z.strictObject({ ...multipleChoiceBase, type: z.literal('checkbox-group') }),
]);

const formDefinitionStructure = z.strictObject({
  schemaVersion: z.literal(1),
  id: identifier,
  formVersion: positiveInteger,
  title: nonBlankText,
  description: nonBlankText.optional(),
  sections: z
    .array(
      z.strictObject({
        id: identifier,
        title: nonBlankText,
        description: nonBlankText.optional(),
        fields: z.array(formFieldSchema).min(1),
      }),
    )
    .min(1),
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

      validateRuleRanges(issues, field.validation, [...fieldPath, 'validation']);
      validateTemporalRules(issues, field, [...fieldPath, 'validation']);
    });
  });

  return issues;
}

function validateChoiceField(
  issues: FormDefinitionValidationIssue[],
  field: {
    readonly options: readonly { readonly value: string; readonly disabled?: boolean }[];
    readonly defaultValue?: string | string[];
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
    readonly validation?: readonly { readonly type: string; readonly value?: string | number }[];
  },
  path: readonly (string | number)[],
): void {
  if (!['date', 'datetime', 'time'].includes(field.type)) return;

  const format =
    field.type === 'date'
      ? /^\d{4}-\d{2}-\d{2}$/
      : field.type === 'time'
        ? /^\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/
        : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

  field.validation?.forEach((rule, index) => {
    if ((rule.type === 'earliest' || rule.type === 'latest') && !format.test(String(rule.value))) {
      issues.push({
        path: [...path, index, 'value'],
        code: 'invalid_temporal_value',
        message: `${rule.type} must use the ${field.type} field's ISO format.`,
      });
    }
  });
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
  rules: readonly { readonly type: string; readonly value?: string | number }[] | undefined,
  path: readonly (string | number)[],
): void {
  if (!rules) return;

  const minimum = rules.find((rule) =>
    ['min', 'minLength', 'minSelections', 'earliest'].includes(rule.type),
  );
  const maximum = rules.find((rule) =>
    ['max', 'maxLength', 'maxSelections', 'latest'].includes(rule.type),
  );

  if (
    minimum?.value !== undefined &&
    maximum?.value !== undefined &&
    minimum.value > maximum.value
  ) {
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
