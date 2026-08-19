import {
  analyzeFormChangeImpact,
  type FormSemanticChange,
  type FormSemanticDiff,
} from '@form-farm/form-domain';

import { describe, expect, it } from 'vitest';

describe('form change impact analysis', () => {
  it('returns a no-change report without implying publication approval', () => {
    expect(analyzeFormChangeImpact(diff([]))).toEqual({
      success: true,
      value: {
        impactVersion: 1,
        diffVersion: 1,
        formId: 'impact-form',
        fromFormVersion: 1,
        toFormVersion: 2,
        analyzedChangeCount: 0,
        risk: 'none',
        classifications: [],
        findings: [],
        affectedSectionIds: [],
        affectedFieldIds: [],
        affectedIdentitiesTruncated: false,
        historicalSubmissions: {
          status: 'unaffected',
          explanation:
            'Existing submissions remain bound to their immutable published form version and are not reinterpreted.',
        },
        futureSubmissions: {
          answerContractChanged: false,
          explanation: 'The analyzed changes do not alter the future submitted-answer contract.',
        },
        publication: {
          humanReviewRequired: false,
          automaticPublicationAllowed: false,
          explanation: 'No changes were detected; this analysis never authorizes automatic publication.',
        },
      },
    });
  });

  it('classifies display-only changes as low-risk presentation effects', () => {
    const result = analyze([
      { type: 'formPresentationChanged', property: 'title' },
      { type: 'submissionPresentationChanged', property: 'successMessage' },
    ]);

    expect(result.risk).toBe('low');
    expect(result.classifications).toEqual(['presentation']);
    expect(result.futureSubmissions.answerContractChanged).toBe(false);
    expect(result.publication.humanReviewRequired).toBe(true);
  });

  it('classifies structural and accessibility effects with stable affected identities', () => {
    const result = analyze([
      { type: 'fieldMoved', fieldId: 'field-b', fromSectionId: 'section-b', toSectionId: 'section-a', fromIndex: 0, toIndex: 1 },
      { type: 'sectionMoved', sectionId: 'section-b', fromIndex: 1, toIndex: 0 },
      { type: 'sectionPresentationChanged', sectionId: 'section-a', property: 'title' },
    ]);

    expect(result.risk).toBe('moderate');
    expect(result.classifications).toEqual([
      'presentation',
      'structural',
      'accessibility-sensitive',
    ]);
    expect(result.affectedSectionIds).toEqual(['section-a', 'section-b']);
    expect(result.affectedFieldIds).toEqual(['field-b']);
  });

  it('treats field removal and type replacement as high-risk answer-contract changes', () => {
    const result = analyze([
      { type: 'fieldRemoved', fieldId: 'old', fieldType: 'text', fromSectionId: 'section-a', fromIndex: 0 },
      { type: 'fieldTypeChanged', fieldId: 'age', fromFieldType: 'number', toFieldType: 'text' },
    ]);

    expect(result.risk).toBe('high');
    expect(result.classifications).toEqual([
      'answer-contract',
      'structural',
      'potentially-destructive',
      'accessibility-sensitive',
      'compatibility',
    ]);
    expect(result.futureSubmissions.answerContractChanged).toBe(true);
    expect(result.historicalSubmissions.status).toBe('unaffected');
  });

  it('flags password-field introduction and autocomplete changes for privacy review', () => {
    const result = analyze([
      { type: 'fieldAdded', fieldId: 'secret', fieldType: 'password', toSectionId: 'section-a', toIndex: 0 },
      { type: 'fieldPresentationChanged', fieldId: 'email', property: 'autocomplete' },
    ]);

    expect(result.risk).toBe('high');
    expect(result.classifications).toContain('privacy-sensitive');
    expect(result.findings.find((finding) => finding.code === 'field_added')?.explanation).not.toContain('secret');
  });

  it('treats submitted choice-value removal and addition as answer-contract changes', () => {
    const result = analyze([
      { type: 'choiceOptionRemoved', fieldId: 'country', fromIndex: 0 },
      { type: 'choiceOptionAdded', fieldId: 'country', toIndex: 0 },
    ]);

    expect(result.risk).toBe('high');
    expect(result.classifications).toEqual([
      'answer-contract',
      'potentially-destructive',
      'compatibility',
    ]);
    expect(result.findings.map((finding) => finding.code)).toEqual([
      'choice_option_added',
      'choice_option_removed',
    ]);
  });

  it('keeps option reorder and presentation effects independent of submitted values', () => {
    const result = analyze([
      { type: 'choiceOptionMoved', fieldId: 'choice', fromIndex: 2, toIndex: 0 },
      { type: 'choiceOptionPresentationChanged', fieldId: 'choice', optionIndex: 0, property: 'label' },
    ]);

    expect(result.risk).toBe('moderate');
    expect(result.classifications).toEqual(['presentation', 'accessibility-sensitive']);
    expect(JSON.stringify(result)).not.toContain('option-value');
  });

  it.each([
    ['added', 'validation_added', 'high'],
    ['removed', 'validation_removed', 'moderate'],
    ['valueChanged', 'validation_value_changed', 'high'],
  ] as const)('classifies %s validation rules conservatively', (change, code, risk) => {
    const result = analyze([
      { type: 'fieldValidationChanged', fieldId: 'name', ruleType: 'minLength', change },
    ]);

    expect(result.risk).toBe(risk);
    expect(result.findings[0]?.code).toBe(code);
    expect(result.classifications).toContain('validation');
    expect(result.futureSubmissions.answerContractChanged).toBe(true);
  });

  it('aggregates repeated rules deterministically without echoing identity in findings', () => {
    const result = analyze([
      { type: 'fieldDefaultChanged', fieldId: 'z-private', change: 'added' },
      { type: 'fieldDefaultChanged', fieldId: 'a-private', change: 'removed' },
      { type: 'fieldDefaultChanged', fieldId: 'm-private', change: 'valueChanged' },
    ]);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.changeCount).toBe(3);
    expect(result.affectedFieldIds).toEqual(['a-private', 'm-private', 'z-private']);
    expect(JSON.stringify(result.findings)).not.toContain('private');
  });

  it('rejects truncated or count-inconsistent diffs instead of reporting partial low risk', () => {
    const truncated = { ...diff([{ type: 'formPresentationChanged', property: 'title' }]), totalChangeCount: 5, truncated: true };
    const inconsistent = { ...diff([{ type: 'formPresentationChanged', property: 'title' }]), totalChangeCount: 2 };

    expect(analyzeFormChangeImpact(truncated)).toEqual({
      success: false,
      issues: [{ path: ['truncated'], code: 'incomplete_diff', message: 'Complete impact analysis requires an untruncated semantic diff.' }],
    });
    expect(analyzeFormChangeImpact(inconsistent)).toEqual({
      success: false,
      issues: [{ path: ['truncated'], code: 'incomplete_diff', message: 'Complete impact analysis requires an untruncated semantic diff.' }],
    });
  });

  it('rejects malformed and unsupported semantic diff contracts safely', () => {
    expect(analyzeFormChangeImpact({})).toMatchObject({ success: false, issues: [{ code: 'invalid_diff' }] });
    expect(analyzeFormChangeImpact({ ...diff([]), diffVersion: 2 })).toEqual({
      success: false,
      issues: [{ path: ['diffVersion'], code: 'unsupported_diff_version', message: 'Impact analysis supports semantic diff version 1.' }],
    });
  });

  it('bounds affected identity output while analyzing every change', () => {
    const changes: FormSemanticChange[] = Array.from({ length: 205 }, (_, index) => ({
      type: 'fieldPresentationChanged',
      fieldId: `field-${String(index).padStart(3, '0')}`,
      property: 'label',
    }));
    const result = analyze(changes);

    expect(result.analyzedChangeCount).toBe(205);
    expect(result.affectedFieldIds).toHaveLength(200);
    expect(result.affectedIdentitiesTruncated).toBe(true);
    expect(result.findings[0]?.changeCount).toBe(205);
  });
});

function diff(changes: readonly FormSemanticChange[]): FormSemanticDiff {
  return {
    diffVersion: 1,
    formId: 'impact-form',
    fromFormVersion: 1,
    toFormVersion: 2,
    changes,
    totalChangeCount: changes.length,
    truncated: false,
  };
}

function analyze(changes: readonly FormSemanticChange[]) {
  const result = analyzeFormChangeImpact(diff(changes));
  if (!result.success) throw new Error(JSON.stringify(result.issues));
  return result.value;
}
