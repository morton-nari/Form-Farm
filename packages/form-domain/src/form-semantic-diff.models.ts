import type { FormField } from './form-definition.models.js';

export const FORM_SEMANTIC_DIFF_VERSION = 1 as const;
export const DEFAULT_FORM_SEMANTIC_DIFF_LIMIT = 200;
export const MAX_FORM_SEMANTIC_DIFF_LIMIT = 1_000;

export interface FormSemanticDiffOptions {
  readonly maxChanges?: number;
}

export interface FormSemanticDiff {
  readonly diffVersion: typeof FORM_SEMANTIC_DIFF_VERSION;
  readonly formId: string;
  readonly fromFormVersion: number;
  readonly toFormVersion: number;
  /** Deterministic semantic order; never raw object-key order. */
  readonly changes: readonly FormSemanticChange[];
  readonly totalChangeCount: number;
  readonly truncated: boolean;
}

export type FormSemanticChange =
  | FormPresentationChanged
  | SubmissionPresentationChanged
  | SectionAdded
  | SectionRemoved
  | SectionMoved
  | SectionPresentationChanged
  | FieldAdded
  | FieldRemoved
  | FieldMoved
  | FieldTypeChanged
  | FieldPresentationChanged
  | FieldDefaultChanged
  | FieldValidationChanged
  | ChoiceOptionAdded
  | ChoiceOptionRemoved
  | ChoiceOptionMoved
  | ChoiceOptionPresentationChanged;

export interface FormPresentationChanged {
  readonly type: 'formPresentationChanged';
  readonly property: 'title' | 'description';
}

export interface SubmissionPresentationChanged {
  readonly type: 'submissionPresentationChanged';
  readonly property: 'submitLabel' | 'successMessage';
}

export interface SectionAdded {
  readonly type: 'sectionAdded';
  readonly sectionId: string;
  readonly toIndex: number;
}

export interface SectionRemoved {
  readonly type: 'sectionRemoved';
  readonly sectionId: string;
  readonly fromIndex: number;
}

export interface SectionMoved {
  readonly type: 'sectionMoved';
  readonly sectionId: string;
  readonly fromIndex: number;
  readonly toIndex: number;
}

export interface SectionPresentationChanged {
  readonly type: 'sectionPresentationChanged';
  readonly sectionId: string;
  readonly property: 'title' | 'description';
}

export interface FieldAdded {
  readonly type: 'fieldAdded';
  readonly fieldId: string;
  readonly fieldType: FormField['type'];
  readonly toSectionId: string;
  readonly toIndex: number;
}

export interface FieldRemoved {
  readonly type: 'fieldRemoved';
  readonly fieldId: string;
  readonly fieldType: FormField['type'];
  readonly fromSectionId: string;
  readonly fromIndex: number;
}

export interface FieldMoved {
  readonly type: 'fieldMoved';
  readonly fieldId: string;
  readonly fromSectionId: string;
  readonly toSectionId: string;
  readonly fromIndex: number;
  readonly toIndex: number;
}

export interface FieldTypeChanged {
  readonly type: 'fieldTypeChanged';
  readonly fieldId: string;
  readonly fromFieldType: FormField['type'];
  readonly toFieldType: FormField['type'];
}

export type FieldPresentationProperty =
  'label' | 'helpText' | 'placeholder' | 'autocomplete' | 'rows';

export interface FieldPresentationChanged {
  readonly type: 'fieldPresentationChanged';
  readonly fieldId: string;
  readonly property: FieldPresentationProperty;
}

export interface FieldDefaultChanged {
  readonly type: 'fieldDefaultChanged';
  readonly fieldId: string;
  readonly change: 'added' | 'removed' | 'valueChanged';
}

export type FormValidationRuleType =
  | 'required'
  | 'minLength'
  | 'maxLength'
  | 'min'
  | 'max'
  | 'integer'
  | 'earliest'
  | 'latest'
  | 'minSelections'
  | 'maxSelections'
  | 'accepted';

export interface FieldValidationChanged {
  readonly type: 'fieldValidationChanged';
  readonly fieldId: string;
  readonly ruleType: FormValidationRuleType;
  readonly change: 'added' | 'removed' | 'valueChanged';
}

export interface ChoiceOptionAdded {
  readonly type: 'choiceOptionAdded';
  readonly fieldId: string;
  readonly toIndex: number;
}

export interface ChoiceOptionRemoved {
  readonly type: 'choiceOptionRemoved';
  readonly fieldId: string;
  readonly fromIndex: number;
}

export interface ChoiceOptionMoved {
  readonly type: 'choiceOptionMoved';
  readonly fieldId: string;
  readonly fromIndex: number;
  readonly toIndex: number;
}

export interface ChoiceOptionPresentationChanged {
  readonly type: 'choiceOptionPresentationChanged';
  readonly fieldId: string;
  readonly optionIndex: number;
  readonly property: 'label' | 'disabled';
}

export type FormSemanticDiffIssueCode =
  | 'invalid_from_definition'
  | 'invalid_to_definition'
  | 'form_identity_mismatch'
  | 'invalid_change_limit';

export interface FormSemanticDiffIssue {
  readonly path: readonly (string | number)[];
  readonly code: FormSemanticDiffIssueCode;
  readonly message: string;
}

export type CompareFormDefinitionsResult =
  | { readonly success: true; readonly value: FormSemanticDiff }
  | { readonly success: false; readonly issues: readonly FormSemanticDiffIssue[] };
