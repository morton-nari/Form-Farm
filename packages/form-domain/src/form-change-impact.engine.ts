import {
  FORM_SEMANTIC_DIFF_VERSION,
  type FormSemanticChange,
} from './form-semantic-diff.models.js';
import { validateFormSemanticDiff } from './form-semantic-diff.validator.js';
import {
  FORM_CHANGE_IMPACT_VERSION,
  MAX_IMPACT_AFFECTED_IDENTITIES,
  type AnalyzeFormChangeImpactResult,
  type FormChangeImpactClassification,
  type FormChangeImpactFinding,
  type FormChangeImpactFindingCode,
  type FormChangeRisk,
} from './form-change-impact.models.js';

const CLASSIFICATION_ORDER: readonly FormChangeImpactClassification[] = [
  'presentation',
  'validation',
  'answer-contract',
  'structural',
  'potentially-destructive',
  'privacy-sensitive',
  'accessibility-sensitive',
  'compatibility',
];
const RISK_RANK: Readonly<Record<FormChangeRisk, number>> = {
  none: 0,
  low: 1,
  moderate: 2,
  high: 3,
};
const FINDING_ORDER: readonly FormChangeImpactFindingCode[] = [
  'presentation_changed',
  'submission_presentation_changed',
  'section_structure_changed',
  'section_presentation_changed',
  'field_added',
  'field_removed',
  'field_moved',
  'field_type_changed',
  'field_presentation_changed',
  'field_default_changed',
  'validation_added',
  'validation_removed',
  'validation_value_changed',
  'choice_option_added',
  'choice_option_removed',
  'choice_option_moved',
  'choice_option_presentation_changed',
];

type FindingRule = Omit<FormChangeImpactFinding, 'changeCount'>;

export function analyzeFormChangeImpact(input: unknown): AnalyzeFormChangeImpactResult {
  const validation = validateFormSemanticDiff(input);
  if (!validation.success) {
    return failure('invalid_diff', [], 'Impact analysis requires a valid semantic diff.');
  }
  const semanticDiff = validation.value;
  if (semanticDiff.diffVersion !== FORM_SEMANTIC_DIFF_VERSION) {
    return failure(
      'unsupported_diff_version',
      ['diffVersion'],
      `Impact analysis supports semantic diff version ${FORM_SEMANTIC_DIFF_VERSION}.`,
    );
  }
  if (semanticDiff.truncated || semanticDiff.changes.length !== semanticDiff.totalChangeCount) {
    return failure(
      'incomplete_diff',
      ['truncated'],
      'Complete impact analysis requires an untruncated semantic diff.',
    );
  }

  const findingCounts = new Map<FormChangeImpactFindingCode, { rule: FindingRule; count: number }>();
  const sectionIds = new Set<string>();
  const fieldIds = new Set<string>();

  for (const change of semanticDiff.changes) {
    collectIdentity(change, sectionIds, fieldIds);
    const rule = ruleFor(change);
    const existing = findingCounts.get(rule.code);
    if (existing) existing.count += 1;
    else findingCounts.set(rule.code, { rule, count: 1 });
  }

  const findings = FINDING_ORDER.flatMap((code) => {
    const entry = findingCounts.get(code);
    return entry ? [{ ...entry.rule, changeCount: entry.count }] : [];
  });
  const classifications = CLASSIFICATION_ORDER.filter((classification) =>
    findings.some((finding) => finding.classifications.includes(classification)),
  );
  const risk = findings.reduce<FormChangeRisk>(
    (current, finding) => (RISK_RANK[finding.risk] > RISK_RANK[current] ? finding.risk : current),
    'none',
  );
  const affectedSectionIds = [...sectionIds].sort();
  const affectedFieldIds = [...fieldIds].sort();
  const affectedIdentitiesTruncated =
    affectedSectionIds.length > MAX_IMPACT_AFFECTED_IDENTITIES ||
    affectedFieldIds.length > MAX_IMPACT_AFFECTED_IDENTITIES;
  const answerContractChanged = classifications.includes('answer-contract');
  const hasChanges = semanticDiff.totalChangeCount > 0;

  return {
    success: true,
    value: {
      impactVersion: FORM_CHANGE_IMPACT_VERSION,
      diffVersion: semanticDiff.diffVersion,
      formId: semanticDiff.formId,
      fromFormVersion: semanticDiff.fromFormVersion,
      toFormVersion: semanticDiff.toFormVersion,
      analyzedChangeCount: semanticDiff.totalChangeCount,
      risk,
      classifications,
      findings,
      affectedSectionIds: affectedSectionIds.slice(0, MAX_IMPACT_AFFECTED_IDENTITIES),
      affectedFieldIds: affectedFieldIds.slice(0, MAX_IMPACT_AFFECTED_IDENTITIES),
      affectedIdentitiesTruncated,
      historicalSubmissions: {
        status: 'unaffected',
        explanation:
          'Existing submissions remain bound to their immutable published form version and are not reinterpreted.',
      },
      futureSubmissions: {
        answerContractChanged,
        explanation: answerContractChanged
          ? 'Future submissions may accept, require, or encode answers differently after publication.'
          : 'The analyzed changes do not alter the future submitted-answer contract.',
      },
      publication: {
        humanReviewRequired: hasChanges,
        automaticPublicationAllowed: false,
        explanation: hasChanges
          ? 'A person must review the deterministic impact before any separate publication action.'
          : 'No changes were detected; this analysis never authorizes automatic publication.',
      },
    },
  };
}

function ruleFor(change: FormSemanticChange): FindingRule {
  switch (change.type) {
    case 'formPresentationChanged':
      return rule('presentation_changed', 'low', ['presentation'], 'Form presentation changes affect future display only.');
    case 'submissionPresentationChanged':
      return rule('submission_presentation_changed', 'low', ['presentation'], 'Submission-screen wording changes affect future display only.');
    case 'sectionAdded':
    case 'sectionRemoved':
    case 'sectionMoved':
      return rule('section_structure_changed', 'moderate', ['structural', 'accessibility-sensitive'], 'Section structure or reading order changes and requires navigation review.');
    case 'sectionPresentationChanged':
      return rule('section_presentation_changed', 'low', ['presentation', 'accessibility-sensitive'], 'Section wording changes may affect comprehension and accessible navigation.');
    case 'fieldAdded':
      return ruleForAddedField(change.fieldType);
    case 'fieldRemoved':
      return ruleForRemovedField(change.fieldType);
    case 'fieldMoved':
      return rule('field_moved', 'moderate', ['structural', 'accessibility-sensitive'], 'Field reading and completion order changes.');
    case 'fieldTypeChanged':
      return rule('field_type_changed', 'high', fieldTypeClassifications(change.fromFieldType, change.toFieldType), 'A stable answer key changes type and may be incompatible with clients and future answers.');
    case 'fieldPresentationChanged':
      return ruleForFieldPresentation(change.property);
    case 'fieldDefaultChanged':
      return rule('field_default_changed', 'moderate', ['answer-contract'], 'A future initial answer changes, while historical submissions remain version-bound.');
    case 'fieldValidationChanged':
      return ruleForValidation(change.change);
    case 'choiceOptionAdded':
      return rule('choice_option_added', 'moderate', ['answer-contract', 'compatibility'], 'A new submitted choice value expands the future answer contract.');
    case 'choiceOptionRemoved':
      return rule('choice_option_removed', 'high', ['answer-contract', 'potentially-destructive', 'compatibility'], 'A submitted choice value is no longer available to future submissions.');
    case 'choiceOptionMoved':
      return rule('choice_option_moved', 'low', ['presentation', 'accessibility-sensitive'], 'Choice display order changes without changing submitted-value identity.');
    case 'choiceOptionPresentationChanged':
      return rule('choice_option_presentation_changed', 'moderate', ['presentation', 'accessibility-sensitive'], 'Choice wording or availability changes and requires comprehension review.');
  }
}

function ruleForAddedField(fieldType: string): FindingRule {
  return rule(
    'field_added',
    fieldType === 'password' ? 'high' : 'moderate',
    ['answer-contract', 'structural', 'compatibility', 'accessibility-sensitive', ...(fieldType === 'password' ? ['privacy-sensitive' as const] : [])],
    fieldType === 'password'
      ? 'A password field adds a sensitive future answer and requires explicit privacy review.'
      : 'A field adds a stable answer key to the future answer contract.',
  );
}

function ruleForRemovedField(fieldType: string): FindingRule {
  return rule(
    'field_removed',
    'high',
    ['answer-contract', 'structural', 'potentially-destructive', 'compatibility', ...(fieldType === 'password' ? ['privacy-sensitive' as const] : [])],
    'A stable answer key is removed from future submissions; historical data remains version-bound.',
  );
}

function fieldTypeClassifications(from: string, to: string): readonly FormChangeImpactClassification[] {
  return [
    'answer-contract',
    'potentially-destructive',
    'compatibility',
    'accessibility-sensitive',
    ...(from === 'password' || to === 'password' ? ['privacy-sensitive' as const] : []),
  ];
}

function ruleForFieldPresentation(property: string): FindingRule {
  const privacy = property === 'autocomplete';
  return rule(
    'field_presentation_changed',
    privacy ? 'moderate' : 'low',
    ['presentation', 'accessibility-sensitive', ...(privacy ? ['privacy-sensitive' as const] : [])],
    privacy
      ? 'Autofill-purpose changes may affect personal-data handling and accessible input behavior.'
      : 'Field presentation changes may affect comprehension or accessible input guidance.',
  );
}

function ruleForValidation(change: 'added' | 'removed' | 'valueChanged'): FindingRule {
  if (change === 'removed') {
    return rule('validation_removed', 'moderate', ['validation', 'answer-contract', 'compatibility'], 'Removing a rule broadens which future answers may be accepted.');
  }
  if (change === 'added') {
    return rule('validation_added', 'high', ['validation', 'answer-contract', 'potentially-destructive', 'compatibility', 'accessibility-sensitive'], 'Adding a rule can reject future answers that were previously valid.');
  }
  return rule('validation_value_changed', 'high', ['validation', 'answer-contract', 'potentially-destructive', 'compatibility', 'accessibility-sensitive'], 'A rule threshold changed; the safe diff does not expose direction, so compatibility risk is treated conservatively.');
}

function rule(
  code: FormChangeImpactFindingCode,
  risk: Exclude<FormChangeRisk, 'none'>,
  classifications: readonly FormChangeImpactClassification[],
  explanation: string,
): FindingRule {
  return { code, risk, classifications, explanation };
}

function collectIdentity(
  change: FormSemanticChange,
  sectionIds: Set<string>,
  fieldIds: Set<string>,
): void {
  if ('sectionId' in change) sectionIds.add(change.sectionId);
  if ('fromSectionId' in change) sectionIds.add(change.fromSectionId);
  if ('toSectionId' in change) sectionIds.add(change.toSectionId);
  if ('fieldId' in change) fieldIds.add(change.fieldId);
}

function failure(
  code: 'invalid_diff' | 'unsupported_diff_version' | 'incomplete_diff',
  path: readonly (string | number)[],
  message: string,
): AnalyzeFormChangeImpactResult {
  return { success: false, issues: [{ path, code, message }] };
}
