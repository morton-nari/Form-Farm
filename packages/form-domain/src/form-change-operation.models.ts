import type {
  FormAnswerValue,
  FormAutocomplete,
  FormDraftSection,
  FormField,
  FormFieldOption,
} from './form-definition.models.js';

export const FORM_CHANGE_SET_VERSION = 1 as const;

export interface FormChangeSet {
  readonly changeSetVersion: typeof FORM_CHANGE_SET_VERSION;
  /** Array position is the authoritative application order. */
  readonly operations: readonly FormChangeOperation[];
}

export type FormChangeOperation =
  | SetFormPresentationOperation
  | SetSubmissionPresentationOperation
  | AddSectionOperation
  | SetSectionPresentationOperation
  | RemoveSectionOperation
  | MoveSectionOperation
  | AddFieldOperation
  | SetFieldPresentationOperation
  | SetFieldDefaultOperation
  | SetFieldValidationOperation
  | SetChoiceOptionsOperation
  | RemoveFieldOperation
  | MoveFieldOperation;

export interface SetFormPresentationOperation {
  readonly type: 'setFormPresentation';
  readonly title: string;
  /** `null` removes the optional description. */
  readonly description: string | null;
}

export interface SetSubmissionPresentationOperation {
  readonly type: 'setSubmissionPresentation';
  readonly submitLabel: string;
  readonly successMessage: string;
}

export interface AddSectionOperation {
  readonly type: 'addSection';
  readonly section: FormDraftSection;
  /** `null` inserts first; otherwise insert immediately after this stable section ID. */
  readonly afterSectionId: string | null;
}

export interface SetSectionPresentationOperation {
  readonly type: 'setSectionPresentation';
  readonly sectionId: string;
  readonly title: string;
  /** `null` removes the optional description. */
  readonly description: string | null;
}

export interface RemoveSectionOperation {
  readonly type: 'removeSection';
  readonly sectionId: string;
}

export interface MoveSectionOperation {
  readonly type: 'moveSection';
  readonly sectionId: string;
  /** `null` moves first; otherwise move immediately after this other stable section ID. */
  readonly afterSectionId: string | null;
}

export interface AddFieldOperation {
  readonly type: 'addField';
  readonly sectionId: string;
  readonly field: FormField;
  /** `null` inserts first; otherwise insert immediately after a field in the target section. */
  readonly afterFieldId: string | null;
}

export interface SetFieldPresentationOperation {
  readonly type: 'setFieldPresentation';
  readonly fieldId: string;
  readonly presentation: FormFieldPresentation;
}

export type FormFieldPresentation =
  | TextEntryFieldPresentation
  | TextareaFieldPresentation
  | PlaceholderFieldPresentation
  | CommonFieldPresentation;

interface FieldPresentationBase {
  readonly label: string;
  readonly helpText: string | null;
}

export interface TextEntryFieldPresentation extends FieldPresentationBase {
  readonly fieldType: 'text' | 'email' | 'password' | 'tel' | 'url';
  readonly placeholder: string | null;
  readonly autocomplete: FormAutocomplete | null;
}

export interface TextareaFieldPresentation extends FieldPresentationBase {
  readonly fieldType: 'textarea';
  readonly placeholder: string | null;
  readonly autocomplete: FormAutocomplete | null;
  readonly rows: number | null;
}

export interface PlaceholderFieldPresentation extends FieldPresentationBase {
  readonly fieldType: 'number' | 'select';
  readonly placeholder: string | null;
}

export interface CommonFieldPresentation extends FieldPresentationBase {
  readonly fieldType:
    | 'date'
    | 'datetime'
    | 'time'
    | 'radio'
    | 'multi-select'
    | 'checkbox'
    | 'checkbox-group';
}

export interface SetFieldDefaultOperation {
  readonly type: 'setFieldDefault';
  readonly fieldId: string;
  /** `null` removes the optional default. */
  readonly defaultValue: FormAnswerValue | null;
}

export type FormValidationRule = NonNullable<FormField['validation']>[number];

export interface SetFieldValidationOperation {
  readonly type: 'setFieldValidation';
  readonly fieldId: string;
  /** `null` removes the optional validation array. */
  readonly validation: readonly FormValidationRule[] | null;
}

export interface SetChoiceOptionsOperation {
  readonly type: 'setChoiceOptions';
  readonly fieldId: string;
  /** Complete replacement; array position is the new display order. */
  readonly options: readonly FormFieldOption[];
}

export interface RemoveFieldOperation {
  readonly type: 'removeField';
  readonly fieldId: string;
}

export interface MoveFieldOperation {
  readonly type: 'moveField';
  readonly fieldId: string;
  readonly toSectionId: string;
  /** `null` moves first; otherwise move immediately after a field in the target section. */
  readonly afterFieldId: string | null;
}

export type FormChangeIssueCode =
  | 'invalid_type'
  | 'unsupported_value'
  | 'unknown_property'
  | 'invalid_format'
  | 'value_too_small'
  | 'invalid_structure'
  | 'invalid_candidate'
  | 'target_not_found'
  | 'identifier_collision'
  | 'invalid_anchor'
  | 'incompatible_field_type'
  | 'invalid_result';

export interface FormChangeIssue {
  readonly path: readonly (string | number)[];
  readonly code: FormChangeIssueCode;
  readonly message: string;
}

export type FormChangeSetValidationResult =
  | { readonly success: true; readonly value: FormChangeSet }
  | { readonly success: false; readonly issues: readonly FormChangeIssue[] };

export type ApplyFormChangeSetResult =
  | {
      readonly success: true;
      readonly value: import('./form-definition.models.js').FormDraftDefinition;
      readonly appliedOperationCount: number;
    }
  | { readonly success: false; readonly issues: readonly FormChangeIssue[] };
