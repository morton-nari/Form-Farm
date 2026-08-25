import type {
  FormDefinition,
  FormField,
  FormFieldOption,
  FormSection,
} from './form-definition.models.js';
import { validateFormDefinition } from './form-definition.validator.js';
import {
  DEFAULT_FORM_ANALYSIS_FINDING_LIMIT,
  FORM_ANALYSIS_VERSION,
  MAX_FORM_ANALYSIS_AFFECTED_IDENTITIES,
  MAX_FORM_ANALYSIS_FINDING_LIMIT,
  type AnalyzeFormDefinitionResult,
  type FormAnalysisClassification,
  type FormAnalysisConfidence,
  type FormAnalysisFinding,
  type FormAnalysisFindingCode,
  type FormAnalysisOptions,
  type FormAnalysisSeverity,
} from './form-analysis.models.js';

export const EXCESSIVE_FORM_FIELD_COUNT = 40;
export const EXCESSIVE_REQUIRED_FIELD_COUNT = 15;
export const LARGE_CHOICE_SET_OPTION_COUNT = 15;
export const LONG_FIELD_LABEL_CHARACTER_COUNT = 120;

const PERSONAL_DATA_AUTOCOMPLETE = new Set([
  'name',
  'given-name',
  'family-name',
  'email',
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
const SENSITIVE_WORDING =
  /\b(?:health|medical|diagnosis|medication|disability|passport|tax file|social security|bank account|credit card)\b/i;
const LIMITATIONS_EXPLANATION =
  'Deterministic schema indicators support human review; they are not an accessibility audit, usability study, privacy or legal review, or security assessment.';

interface CandidateFinding {
  readonly code: FormAnalysisFindingCode;
  readonly severity: FormAnalysisSeverity;
  readonly confidence: FormAnalysisConfidence;
  readonly classifications: readonly FormAnalysisClassification[];
  readonly explanation: string;
  readonly sectionIds: readonly string[];
  readonly fieldIds: readonly string[];
}

export function analyzeFormDefinition(
  input: unknown,
  options: FormAnalysisOptions = {},
): AnalyzeFormDefinitionResult {
  const maxFindings = options.maxFindings ?? DEFAULT_FORM_ANALYSIS_FINDING_LIMIT;
  if (
    !Number.isInteger(maxFindings) ||
    maxFindings < 1 ||
    maxFindings > MAX_FORM_ANALYSIS_FINDING_LIMIT
  ) {
    return failure(
      'invalid_finding_limit',
      ['options', 'maxFindings'],
      `maxFindings must be an integer from 1 to ${MAX_FORM_ANALYSIS_FINDING_LIMIT}.`,
    );
  }
  const validation = validateFormDefinition(input);
  if (!validation.success) {
    return failure('invalid_definition', [], 'Form analysis requires a valid form definition.');
  }

  const definition = validation.value;
  const candidates = collectFindings(definition);
  return {
    success: true,
    value: {
      analysisVersion: FORM_ANALYSIS_VERSION,
      formId: definition.id,
      formVersion: definition.formVersion,
      schemaVersion: definition.schemaVersion,
      evaluatedSectionCount: definition.sections.length,
      evaluatedFieldCount: allFields(definition).length,
      findings: candidates.slice(0, maxFindings).map(boundFinding),
      totalFindingCount: candidates.length,
      truncated: candidates.length > maxFindings,
      limitations: {
        accessibilityAudit: false,
        usabilityResearch: false,
        privacyOrLegalReview: false,
        securityReview: false,
        explanation: LIMITATIONS_EXPLANATION,
      },
    },
  };
}

function collectFindings(definition: FormDefinition): CandidateFinding[] {
  const fields = allFields(definition);
  return [
    ...overallLengthFindings(fields),
    ...duplicateFieldLabelFindings(definition.sections),
    ...fields.flatMap(({ section, field }) => fieldFindings(section, field)),
  ];
}

function overallLengthFindings(
  fields: readonly { readonly section: FormSection; readonly field: FormField }[],
): CandidateFinding[] {
  const findings: CandidateFinding[] = [];
  if (fields.length > EXCESSIVE_FORM_FIELD_COUNT) {
    findings.push(
      finding(
        'excessive_field_count',
        'moderate',
        'indicator',
        ['structural', 'accessibility-sensitive', 'comprehension'],
        'The form exceeds the conservative field-count threshold and may require completion-flow review.',
        fields.map(({ section }) => section.id),
        fields.map(({ field }) => field.id),
      ),
    );
  }
  const required = fields.filter(({ field }) => isRequired(field));
  if (required.length > EXCESSIVE_REQUIRED_FIELD_COUNT) {
    findings.push(
      finding(
        'excessive_required_field_count',
        'moderate',
        'indicator',
        ['validation', 'data-collection', 'comprehension'],
        'The form exceeds the conservative required-field threshold and may collect more mandatory data than necessary.',
        required.map(({ section }) => section.id),
        required.map(({ field }) => field.id),
      ),
    );
  }
  return findings;
}

function duplicateFieldLabelFindings(sections: readonly FormSection[]): CandidateFinding[] {
  const labels = new Map<string, Array<{ sectionId: string; fieldId: string }>>();
  for (const section of sections)
    for (const field of section.fields) {
      const normalized = normalizeLabel(field.label);
      const entries = labels.get(normalized) ?? [];
      entries.push({ sectionId: section.id, fieldId: field.id });
      labels.set(normalized, entries);
    }
  return [...labels.entries()]
    .filter(([, entries]) => entries.length > 1)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, entries]) =>
      finding(
        'duplicate_field_label',
        'moderate',
        'fact',
        ['accessibility-sensitive', 'comprehension'],
        'Multiple fields use the same normalized visible label and require differentiation review.',
        entries.map(({ sectionId }) => sectionId),
        entries.map(({ fieldId }) => fieldId),
      ),
    );
}

function fieldFindings(section: FormSection, field: FormField): CandidateFinding[] {
  const findings: CandidateFinding[] = [];
  if (field.type === 'textarea' && !field.validation?.some((rule) => rule.type === 'maxLength')) {
    findings.push(
      oneField(
        'unbounded_free_text',
        'moderate',
        'fact',
        ['validation', 'data-collection', 'privacy-sensitive'],
        'A textarea has no maximum-length rule and permits broad free-text collection.',
        section,
        field,
      ),
    );
  }
  if (field.type === 'password') {
    findings.push(
      oneField(
        'password_collection',
        'high',
        'fact',
        ['data-collection', 'privacy-sensitive'],
        'A password field collects sensitive authentication material and requires explicit handling review.',
        section,
        field,
      ),
    );
  }
  if (
    'autocomplete' in field &&
    field.autocomplete &&
    PERSONAL_DATA_AUTOCOMPLETE.has(field.autocomplete)
  ) {
    findings.push(
      oneField(
        'personal_data_autocomplete',
        'moderate',
        'fact',
        ['data-collection', 'privacy-sensitive'],
        'The declared autocomplete purpose identifies a personal-data category.',
        section,
        field,
      ),
    );
  }
  if (SENSITIVE_WORDING.test(`${field.label} ${field.helpText ?? ''}`)) {
    findings.push(
      oneField(
        'sensitive_data_wording_indicator',
        'moderate',
        'indicator',
        ['data-collection', 'privacy-sensitive'],
        'Field wording matches a conservative sensitive-data indicator and requires human review.',
        section,
        field,
      ),
    );
  }
  if (field.label.length > LONG_FIELD_LABEL_CHARACTER_COUNT) {
    findings.push(
      oneField(
        'long_field_label',
        'low',
        'indicator',
        ['accessibility-sensitive', 'comprehension'],
        'The field label exceeds the conservative length threshold and may be difficult to scan.',
        section,
        field,
      ),
    );
  }
  if ('options' in field) {
    if (field.options.length > LARGE_CHOICE_SET_OPTION_COUNT) {
      findings.push(
        oneField(
          'large_choice_set',
          'low',
          'indicator',
          ['structural', 'accessibility-sensitive', 'comprehension'],
          'The choice field exceeds the conservative option-count threshold and may require navigation review.',
          section,
          field,
        ),
      );
    }
    findings.push(...duplicateChoiceLabelFindings(section, field, field.options));
  }
  return findings;
}

function duplicateChoiceLabelFindings(
  section: FormSection,
  field: FormField,
  options: readonly FormFieldOption[],
): CandidateFinding[] {
  const normalizedLabels = options.map((option) => normalizeLabel(option.label));
  if (new Set(normalizedLabels).size === normalizedLabels.length) return [];
  return [
    oneField(
      'duplicate_choice_label',
      'moderate',
      'fact',
      ['accessibility-sensitive', 'comprehension'],
      'A choice field contains repeated normalized option labels with distinct submitted identities.',
      section,
      field,
    ),
  ];
}

function allFields(definition: FormDefinition) {
  return definition.sections.flatMap((section) =>
    section.fields.map((field) => ({ section, field })),
  );
}

function isRequired(field: FormField): boolean {
  return (
    field.validation?.some((rule) => rule.type === 'required' || rule.type === 'accepted') ?? false
  );
}

function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function oneField(
  code: FormAnalysisFindingCode,
  severity: FormAnalysisSeverity,
  confidence: FormAnalysisConfidence,
  classifications: readonly FormAnalysisClassification[],
  explanation: string,
  section: FormSection,
  field: FormField,
): CandidateFinding {
  return finding(
    code,
    severity,
    confidence,
    classifications,
    explanation,
    [section.id],
    [field.id],
  );
}

function finding(
  code: FormAnalysisFindingCode,
  severity: FormAnalysisSeverity,
  confidence: FormAnalysisConfidence,
  classifications: readonly FormAnalysisClassification[],
  explanation: string,
  sectionIds: readonly string[],
  fieldIds: readonly string[],
): CandidateFinding {
  return {
    code,
    severity,
    confidence,
    classifications,
    explanation,
    sectionIds: uniqueSorted(sectionIds),
    fieldIds: uniqueSorted(fieldIds),
  };
}

function boundFinding(candidate: CandidateFinding): FormAnalysisFinding {
  const sectionIds = candidate.sectionIds.slice(0, MAX_FORM_ANALYSIS_AFFECTED_IDENTITIES);
  const fieldIds = candidate.fieldIds.slice(0, MAX_FORM_ANALYSIS_AFFECTED_IDENTITIES);
  return {
    ...candidate,
    sectionIds,
    fieldIds,
    affectedIdentitiesTruncated:
      sectionIds.length < candidate.sectionIds.length ||
      fieldIds.length < candidate.fieldIds.length,
  };
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function failure(
  code: 'invalid_definition' | 'invalid_finding_limit',
  path: readonly (string | number)[],
  message: string,
): AnalyzeFormDefinitionResult {
  return { success: false, issues: [{ code, path, message }] };
}
