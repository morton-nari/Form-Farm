import type {
  FormAnswers,
  FormAnswerValue,
  FormDefinition,
  FormField,
} from './form-definition.models.js';
import { z } from 'zod/mini';

const emailFormat = z.email();
const urlFormat = z.url();
const dateFormat = z.iso.date();
const dateTimeFormat = z.iso.datetime({ local: true });
const timeFormat = z.iso.time();

export type FormAnswersValidationIssueCode =
  | 'invalid_type'
  | 'unknown_field'
  | 'missing_required'
  | 'invalid_format'
  | 'invalid_option'
  | 'duplicate_selection'
  | 'rule_violation'
  | 'unsupported_field';

export interface FormAnswersValidationIssue {
  readonly path: readonly (string | number)[];
  readonly code: FormAnswersValidationIssueCode;
  readonly message: string;
}

export type FormAnswersValidationResult =
  | { readonly success: true; readonly value: FormAnswers }
  | { readonly success: false; readonly issues: readonly FormAnswersValidationIssue[] };

export function validateFormAnswers(
  definition: FormDefinition,
  input: unknown,
): FormAnswersValidationResult {
  if (!isPlainObject(input)) return failure([], 'invalid_type', 'Answers must be an object.');

  const fields = new Map(
    definition.sections.flatMap((section) => section.fields).map((field) => [field.id, field]),
  );
  const issues: FormAnswersValidationIssue[] = [];
  const answers: Record<string, FormAnswerValue> = {};

  for (const key of Object.keys(input)) {
    const field = fields.get(key);
    if (!field) {
      issues.push(issue(['answers', key], 'unknown_field', 'Answer field is not defined.'));
      continue;
    }
    const value = input[key];
    const fieldIssues = validateFieldAnswer(field, value);
    issues.push(...fieldIssues);
    if (fieldIssues.length === 0) answers[key] = value as FormAnswerValue;
  }

  for (const field of fields.values()) {
    if (!(field.id in input) && isRequired(field)) {
      issues.push(
        issue(['answers', field.id], 'missing_required', 'A required answer is missing.'),
      );
    }
    if (field.type === 'password') {
      issues.push(
        issue(
          ['answers', field.id],
          'unsupported_field',
          'This form contains a field that cannot be submitted generically.',
        ),
      );
    }
  }

  return issues.length > 0 ? { success: false, issues } : { success: true, value: answers };
}

function validateFieldAnswer(field: FormField, value: unknown): FormAnswersValidationIssue[] {
  const path = ['answers', field.id];
  if (field.type === 'password') return [];

  if (field.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return [issue(path, 'invalid_type', 'Answer must be a finite number.')];
    }
  } else if (field.type === 'checkbox') {
    if (typeof value !== 'boolean') return [issue(path, 'invalid_type', 'Answer must be boolean.')];
  } else if (field.type === 'multi-select' || field.type === 'checkbox-group') {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
      return [issue(path, 'invalid_type', 'Answer must be an array of strings.')];
    }
  } else if (typeof value !== 'string') {
    return [issue(path, 'invalid_type', 'Answer must be a string.')];
  }

  const issues: FormAnswersValidationIssue[] = [];
  if (typeof value === 'string') validateString(field, value, path, issues);
  if (typeof value === 'number') validateNumber(field, value, path, issues);
  if (typeof value === 'boolean') validateBoolean(field, value, path, issues);
  if (Array.isArray(value)) validateSelections(field, value as string[], path, issues);
  return issues;
}

function validateString(
  field: FormField,
  value: string,
  path: readonly string[],
  issues: FormAnswersValidationIssue[],
): void {
  if (isRequired(field) && value.length === 0) {
    issues.push(issue(path, 'missing_required', 'A required answer is empty.'));
  }
  if (field.type === 'email' && value.length > 0 && !emailFormat.safeParse(value).success) {
    issues.push(issue(path, 'invalid_format', 'Answer is not a valid email address.'));
  }
  if (field.type === 'url' && value.length > 0 && !urlFormat.safeParse(value).success) {
    issues.push(issue(path, 'invalid_format', 'Answer is not a valid URL.'));
  }
  if (field.type === 'date' && !dateFormat.safeParse(value).success) {
    issues.push(issue(path, 'invalid_format', 'Answer is not a valid date.'));
  }
  if (field.type === 'datetime' && !dateTimeFormat.safeParse(value).success) {
    issues.push(issue(path, 'invalid_format', 'Answer is not a valid date-time.'));
  }
  if (field.type === 'time' && !timeFormat.safeParse(value).success) {
    issues.push(issue(path, 'invalid_format', 'Answer is not a valid time.'));
  }
  if (field.type === 'select' || field.type === 'radio')
    validateSingleOption(field, value, path, issues);

  for (const rule of field.validation ?? []) {
    if (rule.type === 'minLength' && value.length < rule.value)
      addRuleIssue(issues, path, rule.type);
    if (rule.type === 'maxLength' && value.length > rule.value)
      addRuleIssue(issues, path, rule.type);
    if (rule.type === 'earliest' && value < rule.value) addRuleIssue(issues, path, rule.type);
    if (rule.type === 'latest' && value > rule.value) addRuleIssue(issues, path, rule.type);
  }
}

function validateNumber(
  field: FormField,
  value: number,
  path: readonly string[],
  issues: FormAnswersValidationIssue[],
): void {
  for (const rule of field.validation ?? []) {
    if (rule.type === 'min' && value < rule.value) addRuleIssue(issues, path, rule.type);
    if (rule.type === 'max' && value > rule.value) addRuleIssue(issues, path, rule.type);
    if (rule.type === 'integer' && !Number.isInteger(value)) addRuleIssue(issues, path, rule.type);
  }
}

function validateBoolean(
  field: FormField,
  value: boolean,
  path: readonly string[],
  issues: FormAnswersValidationIssue[],
): void {
  if ((isRequired(field) || field.validation?.some((rule) => rule.type === 'accepted')) && !value) {
    issues.push(issue(path, 'rule_violation', 'Answer does not satisfy the acceptance rule.'));
  }
}

function validateSelections(
  field: FormField,
  values: string[],
  path: readonly string[],
  issues: FormAnswersValidationIssue[],
): void {
  if (new Set(values).size !== values.length) {
    issues.push(issue(path, 'duplicate_selection', 'Answer contains duplicate selections.'));
  }
  if ('options' in field) {
    const enabled = new Set(
      field.options.filter((option) => !option.disabled).map((option) => option.value),
    );
    if (values.some((value) => !enabled.has(value))) {
      issues.push(issue(path, 'invalid_option', 'Answer contains an unavailable option.'));
    }
  }
  for (const rule of field.validation ?? []) {
    if (rule.type === 'required' && values.length === 0) {
      issues.push(issue(path, 'missing_required', 'A required selection is empty.'));
    }
    if (rule.type === 'minSelections' && values.length < rule.value)
      addRuleIssue(issues, path, rule.type);
    if (rule.type === 'maxSelections' && values.length > rule.value)
      addRuleIssue(issues, path, rule.type);
  }
}

function validateSingleOption(
  field: Extract<FormField, { type: 'select' | 'radio' }>,
  value: string,
  path: readonly string[],
  issues: FormAnswersValidationIssue[],
): void {
  if (!field.options.some((option) => option.value === value && !option.disabled)) {
    issues.push(issue(path, 'invalid_option', 'Answer is not an available option.'));
  }
}

function isRequired(field: FormField): boolean {
  return Boolean(
    field.validation?.some((rule) => rule.type === 'required' || rule.type === 'accepted'),
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function addRuleIssue(
  issues: FormAnswersValidationIssue[],
  path: readonly string[],
  rule: string,
): void {
  issues.push(issue([...path, rule], 'rule_violation', `Answer violates the ${rule} rule.`));
}

function issue(
  path: readonly (string | number)[],
  code: FormAnswersValidationIssueCode,
  message: string,
): FormAnswersValidationIssue {
  return { path, code, message };
}

function failure(
  path: readonly (string | number)[],
  code: FormAnswersValidationIssueCode,
  message: string,
): FormAnswersValidationResult {
  return { success: false, issues: [issue(path, code, message)] };
}
