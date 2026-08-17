/**
 * The version of the Form Farm schema contract understood by this application.
 * Form content revisions use FormDefinition.formVersion instead.
 */
export const FORM_SCHEMA_VERSION = 1 as const;

export type FormSchemaVersion = typeof FORM_SCHEMA_VERSION;

export interface FormDefinition {
  readonly schemaVersion: FormSchemaVersion;
  /** Stable identity for the logical form across its content versions. */
  readonly id: string;
  /** Monotonically increasing revision of this form's content. */
  readonly formVersion: number;
  readonly title: string;
  readonly description?: string;
  /** Array position is the authoritative section order. */
  readonly sections: readonly FormSection[];
  readonly submission: FormSubmissionConfiguration;
}

export interface FormSection {
  /** Unique within the form and stable when the section is reordered or renamed. */
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  /** Array position is the authoritative field order. */
  readonly fields: readonly FormField[];
}

/**
 * Mutable owner workspace content. It shares schema-v1 field semantics with FormDefinition but may contain
 * temporarily empty sections. It must pass validateFormDefinition before entering a runner or publication.
 */
export interface FormDraftDefinition {
  readonly schemaVersion: FormSchemaVersion;
  readonly id: string;
  readonly formVersion: number;
  readonly title: string;
  readonly description?: string;
  readonly sections: readonly FormDraftSection[];
  readonly submission: FormSubmissionConfiguration;
}

export interface FormDraftSection {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  /** May be empty only while this definition remains an owner draft. */
  readonly fields: readonly FormField[];
}

export interface FormSubmissionConfiguration {
  readonly submitLabel: string;
  readonly successMessage: string;
}

interface FormFieldBase {
  /** Globally unique within the form and used as the submitted answer key. */
  readonly id: string;
  readonly label: string;
  readonly helpText?: string;
}

interface TextEntryFieldBase extends FormFieldBase {
  readonly placeholder?: string;
  readonly autocomplete?: FormAutocomplete;
  readonly defaultValue?: string;
  readonly validation?: readonly TextValidationRule[];
}

export interface TextField extends TextEntryFieldBase {
  readonly type: 'text';
}

export interface EmailField extends TextEntryFieldBase {
  readonly type: 'email';
}

export interface PasswordField extends Omit<TextEntryFieldBase, 'defaultValue'> {
  readonly type: 'password';
}

export interface TelephoneField extends TextEntryFieldBase {
  readonly type: 'tel';
}

export interface UrlField extends TextEntryFieldBase {
  readonly type: 'url';
}

export interface TextareaField extends TextEntryFieldBase {
  readonly type: 'textarea';
  readonly rows?: number;
}

export interface NumberField extends FormFieldBase {
  readonly type: 'number';
  readonly placeholder?: string;
  readonly defaultValue?: number;
  readonly validation?: readonly NumberValidationRule[];
}

export interface DateField extends FormFieldBase {
  readonly type: 'date';
  /** ISO 8601 calendar date: YYYY-MM-DD. */
  readonly defaultValue?: string;
  readonly validation?: readonly TemporalValidationRule[];
}

export interface DateTimeField extends FormFieldBase {
  readonly type: 'datetime';
  /** ISO 8601 date-time string. */
  readonly defaultValue?: string;
  readonly validation?: readonly TemporalValidationRule[];
}

export interface TimeField extends FormFieldBase {
  readonly type: 'time';
  /** Local time in HH:mm or HH:mm:ss form. */
  readonly defaultValue?: string;
  readonly validation?: readonly TemporalValidationRule[];
}

interface SingleChoiceFieldBase extends FormFieldBase {
  /** Array position is the authoritative display order. */
  readonly options: readonly FormFieldOption[];
  readonly defaultValue?: string;
  readonly validation?: readonly RequiredRule[];
}

export interface SelectField extends SingleChoiceFieldBase {
  readonly type: 'select';
  readonly placeholder?: string;
}

export interface RadioField extends SingleChoiceFieldBase {
  readonly type: 'radio';
}

interface MultipleChoiceFieldBase extends FormFieldBase {
  readonly options: readonly FormFieldOption[];
  readonly defaultValue?: readonly string[];
  readonly validation?: readonly SelectionValidationRule[];
}

export interface MultiSelectField extends MultipleChoiceFieldBase {
  readonly type: 'multi-select';
}

export interface CheckboxGroupField extends MultipleChoiceFieldBase {
  readonly type: 'checkbox-group';
}

export interface CheckboxField extends FormFieldBase {
  readonly type: 'checkbox';
  readonly defaultValue?: boolean;
  readonly validation?: readonly BooleanValidationRule[];
}

export type FormField =
  | TextField
  | EmailField
  | PasswordField
  | TelephoneField
  | UrlField
  | TextareaField
  | NumberField
  | DateField
  | DateTimeField
  | TimeField
  | SelectField
  | RadioField
  | MultiSelectField
  | CheckboxField
  | CheckboxGroupField;

export interface FormFieldOption {
  readonly label: string;
  /** Stable submitted value; unique among this field's options. */
  readonly value: string;
  readonly disabled?: boolean;
}

export interface RequiredRule {
  readonly type: 'required';
}

export type TextValidationRule =
  | RequiredRule
  | { readonly type: 'minLength'; readonly value: number }
  | { readonly type: 'maxLength'; readonly value: number };

export type NumberValidationRule =
  | RequiredRule
  | { readonly type: 'min'; readonly value: number }
  | { readonly type: 'max'; readonly value: number }
  | { readonly type: 'integer' };

export type TemporalValidationRule =
  | RequiredRule
  | { readonly type: 'earliest'; readonly value: string }
  | { readonly type: 'latest'; readonly value: string };

export type SelectionValidationRule =
  | RequiredRule
  | { readonly type: 'minSelections'; readonly value: number }
  | { readonly type: 'maxSelections'; readonly value: number };

export type BooleanValidationRule = RequiredRule | { readonly type: 'accepted' };

export type FormAnswerValue = string | number | boolean | readonly string[];

export type FormAnswers = Readonly<Record<string, FormAnswerValue>>;

/** Allowlisted browser autofill purposes; arbitrary values are not part of schema v1. */
export type FormAutocomplete =
  | 'name'
  | 'given-name'
  | 'family-name'
  | 'email'
  | 'username'
  | 'new-password'
  | 'current-password'
  | 'tel'
  | 'street-address'
  | 'address-line1'
  | 'address-line2'
  | 'address-level1'
  | 'address-level2'
  | 'postal-code'
  | 'country-name'
  | 'organization';
