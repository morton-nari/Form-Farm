import type {
  CompareFormDefinitionsResult,
  FieldPresentationProperty,
  FormSemanticChange,
  FormSemanticDiffOptions,
  FormSemanticDiffIssue,
  FormValidationRuleType,
} from './form-semantic-diff.models.js';
import {
  DEFAULT_FORM_SEMANTIC_DIFF_LIMIT,
  FORM_SEMANTIC_DIFF_VERSION,
  MAX_FORM_SEMANTIC_DIFF_LIMIT,
} from './form-semantic-diff.models.js';
import type {
  FormDraftDefinition,
  FormDraftSection,
  FormField,
  FormFieldOption,
} from './form-definition.models.js';
import { validateFormDraftDefinition } from './form-definition.validator.js';

const MAX_VALIDATION_ISSUES_PER_INPUT = 20;
const FIELD_PRESENTATION_PROPERTIES: readonly FieldPresentationProperty[] = [
  'label',
  'helpText',
  'placeholder',
  'autocomplete',
  'rows',
];
const VALIDATION_RULE_ORDER: readonly FormValidationRuleType[] = [
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
];

export function compareFormDefinitions(
  fromInput: unknown,
  toInput: unknown,
  options: FormSemanticDiffOptions = {},
): CompareFormDefinitionsResult {
  const maxChanges = options.maxChanges ?? DEFAULT_FORM_SEMANTIC_DIFF_LIMIT;
  if (
    !Number.isInteger(maxChanges) ||
    maxChanges < 1 ||
    maxChanges > MAX_FORM_SEMANTIC_DIFF_LIMIT
  ) {
    return {
      success: false,
      issues: [
        {
          path: ['options', 'maxChanges'],
          code: 'invalid_change_limit',
          message: `maxChanges must be an integer from 1 to ${MAX_FORM_SEMANTIC_DIFF_LIMIT}.`,
        },
      ],
    };
  }

  const from = validateFormDraftDefinition(fromInput);
  const to = validateFormDraftDefinition(toInput);
  if (!from.success || !to.success) {
    return {
      success: false,
      issues: [
        ...(from.success ? [] : definitionIssues('from', 'invalid_from_definition', from.issues)),
        ...(to.success ? [] : definitionIssues('to', 'invalid_to_definition', to.issues)),
      ],
    };
  }
  if (from.value.id !== to.value.id) {
    return {
      success: false,
      issues: [
        {
          path: ['to', 'id'],
          code: 'form_identity_mismatch',
          message: 'Semantic comparison requires the same logical form identity.',
        },
      ],
    };
  }

  const collector = new ChangeCollector(maxChanges);
  compareFormPresentation(from.value, to.value, collector);
  compareSubmissionPresentation(from.value, to.value, collector);
  compareSections(from.value, to.value, collector);
  compareFields(from.value, to.value, collector);

  return {
    success: true,
    value: {
      diffVersion: FORM_SEMANTIC_DIFF_VERSION,
      formId: from.value.id,
      fromFormVersion: from.value.formVersion,
      toFormVersion: to.value.formVersion,
      changes: collector.changes,
      totalChangeCount: collector.total,
      truncated: collector.total > collector.changes.length,
    },
  };
}

class ChangeCollector {
  readonly changes: FormSemanticChange[] = [];
  total = 0;

  constructor(private readonly limit: number) {}

  add(change: FormSemanticChange): void {
    this.total += 1;
    if (this.changes.length < this.limit) this.changes.push(change);
  }
}

function compareFormPresentation(
  from: FormDraftDefinition,
  to: FormDraftDefinition,
  collector: ChangeCollector,
): void {
  if (from.title !== to.title)
    collector.add({ type: 'formPresentationChanged', property: 'title' });
  if (from.description !== to.description)
    collector.add({ type: 'formPresentationChanged', property: 'description' });
}

function compareSubmissionPresentation(
  from: FormDraftDefinition,
  to: FormDraftDefinition,
  collector: ChangeCollector,
): void {
  if (from.submission.submitLabel !== to.submission.submitLabel)
    collector.add({ type: 'submissionPresentationChanged', property: 'submitLabel' });
  if (from.submission.successMessage !== to.submission.successMessage)
    collector.add({ type: 'submissionPresentationChanged', property: 'successMessage' });
}

function compareSections(
  from: FormDraftDefinition,
  to: FormDraftDefinition,
  collector: ChangeCollector,
): void {
  const fromById = indexSections(from.sections);
  const toById = indexSections(to.sections);

  from.sections.forEach((section, index) => {
    if (!toById.has(section.id))
      collector.add({ type: 'sectionRemoved', sectionId: section.id, fromIndex: index });
  });
  to.sections.forEach((section, index) => {
    if (!fromById.has(section.id))
      collector.add({ type: 'sectionAdded', sectionId: section.id, toIndex: index });
  });

  const fromCommon = from.sections
    .filter((section) => toById.has(section.id))
    .map((section) => section.id);
  const toCommon = to.sections
    .filter((section) => fromById.has(section.id))
    .map((section) => section.id);
  const fromCommonIndexes = indexStrings(fromCommon);
  toCommon.forEach((sectionId, commonIndex) => {
    if (fromCommonIndexes.get(sectionId) !== commonIndex) {
      collector.add({
        type: 'sectionMoved',
        sectionId,
        fromIndex: fromById.get(sectionId)!.index,
        toIndex: toById.get(sectionId)!.index,
      });
    }
  });

  to.sections.forEach((toSection) => {
    const fromSection = fromById.get(toSection.id)?.section;
    if (!fromSection) return;
    if (fromSection.title !== toSection.title)
      collector.add({
        type: 'sectionPresentationChanged',
        sectionId: toSection.id,
        property: 'title',
      });
    if (fromSection.description !== toSection.description)
      collector.add({
        type: 'sectionPresentationChanged',
        sectionId: toSection.id,
        property: 'description',
      });
  });
}

function compareFields(
  from: FormDraftDefinition,
  to: FormDraftDefinition,
  collector: ChangeCollector,
): void {
  const fromFields = indexFields(from);
  const toFields = indexFields(to);

  flattenedFields(from).forEach((located) => {
    if (!toFields.has(located.field.id)) {
      collector.add({
        type: 'fieldRemoved',
        fieldId: located.field.id,
        fieldType: located.field.type,
        fromSectionId: located.sectionId,
        fromIndex: located.index,
      });
    }
  });
  flattenedFields(to).forEach((located) => {
    if (!fromFields.has(located.field.id)) {
      collector.add({
        type: 'fieldAdded',
        fieldId: located.field.id,
        fieldType: located.field.type,
        toSectionId: located.sectionId,
        toIndex: located.index,
      });
    }
  });

  const reorderedWithinSections = reorderedFieldIds(from, to, fromFields, toFields);
  flattenedFields(to).forEach((toLocated) => {
    const fromLocated = fromFields.get(toLocated.field.id);
    if (!fromLocated) return;
    if (
      fromLocated.sectionId !== toLocated.sectionId ||
      reorderedWithinSections.has(toLocated.field.id)
    ) {
      collector.add({
        type: 'fieldMoved',
        fieldId: toLocated.field.id,
        fromSectionId: fromLocated.sectionId,
        toSectionId: toLocated.sectionId,
        fromIndex: fromLocated.index,
        toIndex: toLocated.index,
      });
    }
  });

  flattenedFields(to).forEach((toLocated) => {
    const fromLocated = fromFields.get(toLocated.field.id);
    if (!fromLocated) return;
    if (fromLocated.field.type !== toLocated.field.type) {
      collector.add({
        type: 'fieldTypeChanged',
        fieldId: toLocated.field.id,
        fromFieldType: fromLocated.field.type,
        toFieldType: toLocated.field.type,
      });
      return;
    }
    compareFieldDetails(fromLocated.field, toLocated.field, collector);
  });
}

function compareFieldDetails(from: FormField, to: FormField, collector: ChangeCollector): void {
  FIELD_PRESENTATION_PROPERTIES.forEach((property) => {
    if (fieldProperty(from, property) !== fieldProperty(to, property))
      collector.add({ type: 'fieldPresentationChanged', fieldId: to.id, property });
  });
  compareDefault(from, to, collector);
  compareValidation(from, to, collector);
  if (isChoiceField(from) && isChoiceField(to)) compareOptions(from, to, collector);
}

function compareDefault(from: FormField, to: FormField, collector: ChangeCollector): void {
  const fromHasDefault = Object.hasOwn(from, 'defaultValue');
  const toHasDefault = Object.hasOwn(to, 'defaultValue');
  if (!fromHasDefault && !toHasDefault) return;
  if (!fromHasDefault) {
    collector.add({ type: 'fieldDefaultChanged', fieldId: to.id, change: 'added' });
    return;
  }
  if (!toHasDefault) {
    collector.add({ type: 'fieldDefaultChanged', fieldId: to.id, change: 'removed' });
    return;
  }
  if (!equalValue(fieldProperty(from, 'defaultValue'), fieldProperty(to, 'defaultValue')))
    collector.add({ type: 'fieldDefaultChanged', fieldId: to.id, change: 'valueChanged' });
}

function compareValidation(from: FormField, to: FormField, collector: ChangeCollector): void {
  const fromRules = ruleMap(from.validation);
  const toRules = ruleMap(to.validation);
  VALIDATION_RULE_ORDER.forEach((ruleType) => {
    const fromRule = fromRules.get(ruleType);
    const toRule = toRules.get(ruleType);
    if (!fromRule && !toRule) return;
    if (!fromRule) {
      collector.add({ type: 'fieldValidationChanged', fieldId: to.id, ruleType, change: 'added' });
    } else if (!toRule) {
      collector.add({
        type: 'fieldValidationChanged',
        fieldId: to.id,
        ruleType,
        change: 'removed',
      });
    } else if (!equalValue(fromRule, toRule)) {
      collector.add({
        type: 'fieldValidationChanged',
        fieldId: to.id,
        ruleType,
        change: 'valueChanged',
      });
    }
  });
}

function compareOptions(
  from: FormField & { readonly options: readonly FormFieldOption[] },
  to: FormField & { readonly options: readonly FormFieldOption[] },
  collector: ChangeCollector,
): void {
  const fromByValue = indexOptions(from.options);
  const toByValue = indexOptions(to.options);
  from.options.forEach((option, index) => {
    if (!toByValue.has(option.value))
      collector.add({ type: 'choiceOptionRemoved', fieldId: to.id, fromIndex: index });
  });
  to.options.forEach((option, index) => {
    if (!fromByValue.has(option.value))
      collector.add({ type: 'choiceOptionAdded', fieldId: to.id, toIndex: index });
  });

  const fromCommon = from.options
    .filter((option) => toByValue.has(option.value))
    .map((option) => option.value);
  const toCommon = to.options
    .filter((option) => fromByValue.has(option.value))
    .map((option) => option.value);
  const fromCommonIndexes = indexStrings(fromCommon);
  toCommon.forEach((value, commonIndex) => {
    if (fromCommonIndexes.get(value) !== commonIndex) {
      collector.add({
        type: 'choiceOptionMoved',
        fieldId: to.id,
        fromIndex: fromByValue.get(value)!.index,
        toIndex: toByValue.get(value)!.index,
      });
    }
  });

  to.options.forEach((toOption, toIndex) => {
    const fromOption = fromByValue.get(toOption.value)?.option;
    if (!fromOption) return;
    if (fromOption.label !== toOption.label)
      collector.add({
        type: 'choiceOptionPresentationChanged',
        fieldId: to.id,
        optionIndex: toIndex,
        property: 'label',
      });
    if ((fromOption.disabled ?? false) !== (toOption.disabled ?? false))
      collector.add({
        type: 'choiceOptionPresentationChanged',
        fieldId: to.id,
        optionIndex: toIndex,
        property: 'disabled',
      });
  });
}

type LocatedSection = { readonly section: FormDraftSection; readonly index: number };
type LocatedField = {
  readonly field: FormField;
  readonly sectionId: string;
  readonly index: number;
};

function indexSections(sections: readonly FormDraftSection[]): ReadonlyMap<string, LocatedSection> {
  return new Map(sections.map((section, index) => [section.id, { section, index }]));
}

function indexFields(definition: FormDraftDefinition): ReadonlyMap<string, LocatedField> {
  return new Map(flattenedFields(definition).map((located) => [located.field.id, located]));
}

function flattenedFields(definition: FormDraftDefinition): readonly LocatedField[] {
  return definition.sections.flatMap((section) =>
    section.fields.map((field, index) => ({ field, sectionId: section.id, index })),
  );
}

function reorderedFieldIds(
  from: FormDraftDefinition,
  to: FormDraftDefinition,
  fromFields: ReadonlyMap<string, LocatedField>,
  toFields: ReadonlyMap<string, LocatedField>,
): ReadonlySet<string> {
  const reordered = new Set<string>();
  to.sections.forEach((toSection) => {
    const fromSection = from.sections.find((section) => section.id === toSection.id);
    if (!fromSection) return;
    const fromCommon = fromSection.fields
      .filter((field) => toFields.get(field.id)?.sectionId === toSection.id)
      .map((field) => field.id);
    const toCommon = toSection.fields
      .filter((field) => fromFields.get(field.id)?.sectionId === toSection.id)
      .map((field) => field.id);
    const fromIndexes = indexStrings(fromCommon);
    toCommon.forEach((fieldId, index) => {
      if (fromIndexes.get(fieldId) !== index) reordered.add(fieldId);
    });
  });
  return reordered;
}

function indexOptions(
  options: readonly FormFieldOption[],
): ReadonlyMap<string, { readonly option: FormFieldOption; readonly index: number }> {
  return new Map(options.map((option, index) => [option.value, { option, index }]));
}

function indexStrings(values: readonly string[]): ReadonlyMap<string, number> {
  return new Map(values.map((value, index) => [value, index]));
}

function ruleMap(
  rules: readonly { readonly type: string }[] | undefined,
): ReadonlyMap<FormValidationRuleType, { readonly type: string; readonly value?: unknown }> {
  return new Map(
    (rules ?? []).map((rule) => [
      rule.type as FormValidationRuleType,
      rule as { readonly type: string; readonly value?: unknown },
    ]),
  );
}

function fieldProperty(field: FormField, property: string): unknown {
  return (field as unknown as Record<string, unknown>)[property];
}

function equalValue(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right))
    return (
      left.length === right.length && left.every((value, index) => equalValue(value, right[index]))
    );
  if (left !== null && right !== null && typeof left === 'object' && typeof right === 'object') {
    const leftEntries = Object.entries(left);
    const rightEntries = Object.entries(right);
    return (
      leftEntries.length === rightEntries.length &&
      leftEntries.every(([key, value]) =>
        equalValue(value, (right as Record<string, unknown>)[key]),
      )
    );
  }
  return Object.is(left, right);
}

function isChoiceField(
  field: FormField,
): field is FormField & { readonly options: readonly FormFieldOption[] } {
  return 'options' in field;
}

function definitionIssues(
  input: 'from' | 'to',
  code: 'invalid_from_definition' | 'invalid_to_definition',
  issues: readonly { readonly path: readonly (string | number)[] }[],
): FormSemanticDiffIssue[] {
  return issues.slice(0, MAX_VALIDATION_ISSUES_PER_INPUT).map((issue) => ({
    path: [input, ...issue.path],
    code,
    message: 'Definition does not satisfy the form draft contract.',
  }));
}
