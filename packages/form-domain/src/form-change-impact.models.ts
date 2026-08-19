export const FORM_CHANGE_IMPACT_VERSION = 1 as const;
export const MAX_IMPACT_AFFECTED_IDENTITIES = 200;

export type FormChangeRisk = 'none' | 'low' | 'moderate' | 'high';

export type FormChangeImpactClassification =
  | 'presentation'
  | 'validation'
  | 'answer-contract'
  | 'structural'
  | 'potentially-destructive'
  | 'privacy-sensitive'
  | 'accessibility-sensitive'
  | 'compatibility';

export type FormChangeImpactFindingCode =
  | 'presentation_changed'
  | 'submission_presentation_changed'
  | 'section_structure_changed'
  | 'section_presentation_changed'
  | 'field_added'
  | 'field_removed'
  | 'field_moved'
  | 'field_type_changed'
  | 'field_presentation_changed'
  | 'field_default_changed'
  | 'validation_added'
  | 'validation_removed'
  | 'validation_value_changed'
  | 'choice_option_added'
  | 'choice_option_removed'
  | 'choice_option_moved'
  | 'choice_option_presentation_changed';

export interface FormChangeImpactFinding {
  readonly code: FormChangeImpactFindingCode;
  readonly risk: Exclude<FormChangeRisk, 'none'>;
  readonly classifications: readonly FormChangeImpactClassification[];
  readonly changeCount: number;
  /** Stable explanation of the rule, never definition or answer content. */
  readonly explanation: string;
}

export interface FormChangeImpact {
  readonly impactVersion: typeof FORM_CHANGE_IMPACT_VERSION;
  readonly diffVersion: number;
  readonly formId: string;
  readonly fromFormVersion: number;
  readonly toFormVersion: number;
  readonly analyzedChangeCount: number;
  readonly risk: FormChangeRisk;
  readonly classifications: readonly FormChangeImpactClassification[];
  readonly findings: readonly FormChangeImpactFinding[];
  readonly affectedSectionIds: readonly string[];
  readonly affectedFieldIds: readonly string[];
  readonly affectedIdentitiesTruncated: boolean;
  readonly historicalSubmissions: {
    readonly status: 'unaffected';
    readonly explanation: string;
  };
  readonly futureSubmissions: {
    readonly answerContractChanged: boolean;
    readonly explanation: string;
  };
  readonly publication: {
    readonly humanReviewRequired: boolean;
    readonly automaticPublicationAllowed: false;
    readonly explanation: string;
  };
}

export type FormChangeImpactIssueCode =
  | 'invalid_diff'
  | 'unsupported_diff_version'
  | 'incomplete_diff';

export interface FormChangeImpactIssue {
  readonly path: readonly (string | number)[];
  readonly code: FormChangeImpactIssueCode;
  readonly message: string;
}

export type AnalyzeFormChangeImpactResult =
  | { readonly success: true; readonly value: FormChangeImpact }
  | { readonly success: false; readonly issues: readonly FormChangeImpactIssue[] };
