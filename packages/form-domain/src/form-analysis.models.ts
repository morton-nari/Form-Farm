export const FORM_ANALYSIS_VERSION = 1 as const;
export const DEFAULT_FORM_ANALYSIS_FINDING_LIMIT = 100;
export const MAX_FORM_ANALYSIS_FINDING_LIMIT = 200;
export const MAX_FORM_ANALYSIS_AFFECTED_IDENTITIES = 50;

export type FormAnalysisSeverity = 'low' | 'moderate' | 'high';
export type FormAnalysisConfidence = 'fact' | 'indicator';
export type FormAnalysisClassification =
  | 'structural'
  | 'validation'
  | 'data-collection'
  | 'privacy-sensitive'
  | 'accessibility-sensitive'
  | 'comprehension';

export type FormAnalysisFindingCode =
  | 'excessive_field_count'
  | 'excessive_required_field_count'
  | 'duplicate_field_label'
  | 'duplicate_choice_label'
  | 'unbounded_free_text'
  | 'password_collection'
  | 'personal_data_autocomplete'
  | 'sensitive_data_wording_indicator'
  | 'large_choice_set'
  | 'long_field_label';

export interface FormAnalysisFinding {
  readonly code: FormAnalysisFindingCode;
  readonly severity: FormAnalysisSeverity;
  readonly confidence: FormAnalysisConfidence;
  readonly classifications: readonly FormAnalysisClassification[];
  readonly explanation: string;
  readonly sectionIds: readonly string[];
  readonly fieldIds: readonly string[];
  readonly affectedIdentitiesTruncated: boolean;
}

export interface FormAnalysisReport {
  readonly analysisVersion: typeof FORM_ANALYSIS_VERSION;
  readonly formId: string;
  readonly formVersion: number;
  readonly schemaVersion: number;
  readonly evaluatedSectionCount: number;
  readonly evaluatedFieldCount: number;
  readonly findings: readonly FormAnalysisFinding[];
  readonly totalFindingCount: number;
  readonly truncated: boolean;
  readonly limitations: {
    readonly accessibilityAudit: false;
    readonly usabilityResearch: false;
    readonly privacyOrLegalReview: false;
    readonly securityReview: false;
    readonly explanation: string;
  };
}

export interface FormAnalysisOptions {
  readonly maxFindings?: number;
}

export type FormAnalysisIssueCode = 'invalid_definition' | 'invalid_finding_limit';

export interface FormAnalysisIssue {
  readonly path: readonly (string | number)[];
  readonly code: FormAnalysisIssueCode;
  readonly message: string;
}

export type AnalyzeFormDefinitionResult =
  | { readonly success: true; readonly value: FormAnalysisReport }
  | { readonly success: false; readonly issues: readonly FormAnalysisIssue[] };
