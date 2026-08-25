import { describe, expect, it } from 'vitest';
import {
  analyzeFormDefinition,
  EXCESSIVE_FORM_FIELD_COUNT,
  EXCESSIVE_REQUIRED_FIELD_COUNT,
  LARGE_CHOICE_SET_OPTION_COUNT,
  LONG_FIELD_LABEL_CHARACTER_COUNT,
  type FormDefinition,
  type FormField,
} from '@form-farm/form-domain';

describe('analyzeFormDefinition', () => {
  it('returns a versioned empty report for a simple valid form', () => {
    const result = analyzeFormDefinition(formWith([{ id: 'name', type: 'text', label: 'Name' }]));
    expect(result).toEqual({
      success: true,
      value: expect.objectContaining({
        analysisVersion: 1,
        formId: 'analysis-form',
        formVersion: 1,
        findings: [],
        totalFindingCount: 0,
        truncated: false,
        limitations: {
          accessibilityAudit: false,
          usabilityResearch: false,
          privacyOrLegalReview: false,
          securityReview: false,
          explanation: expect.stringContaining('not an accessibility audit'),
        },
      }),
    });
  });

  it('fails closed for invalid definitions and finding limits', () => {
    expect(analyzeFormDefinition({ id: 'invalid' })).toMatchObject({
      success: false,
      issues: [{ code: 'invalid_definition', path: [] }],
    });
    expect(analyzeFormDefinition(formWith(simpleFields(1)), { maxFindings: 0 })).toMatchObject({
      success: false,
      issues: [{ code: 'invalid_finding_limit', path: ['options', 'maxFindings'] }],
    });
  });

  it('uses exclusive conservative thresholds for total and required fields', () => {
    expect(
      codes(analyzeFormDefinition(formWith(simpleFields(EXCESSIVE_FORM_FIELD_COUNT)))),
    ).not.toContain('excessive_field_count');
    expect(
      codes(analyzeFormDefinition(formWith(simpleFields(EXCESSIVE_FORM_FIELD_COUNT + 1)))),
    ).toContain('excessive_field_count');
    const required = simpleFields(EXCESSIVE_REQUIRED_FIELD_COUNT + 1).map((field) => ({
      ...field,
      validation: [{ type: 'required' as const }],
    }));
    expect(codes(analyzeFormDefinition(formWith(required)))).toContain(
      'excessive_required_field_count',
    );
  });

  it('reports duplicate normalized field and choice labels without exposing their text', () => {
    const secretLabel = 'Internal Secret Phrase';
    const result = analyzeFormDefinition(
      formWith([
        { id: 'first', type: 'text', label: secretLabel },
        { id: 'second', type: 'text', label: '  INTERNAL   SECRET PHRASE ' },
        {
          id: 'choice',
          type: 'select',
          label: 'Choice',
          options: [
            { label: secretLabel, value: 'one' },
            { label: ` ${secretLabel.toUpperCase()} `, value: 'two' },
          ],
        },
      ]),
    );
    expect(codes(result)).toEqual(['duplicate_field_label', 'duplicate_choice_label']);
    expect(JSON.stringify(result)).not.toContain(secretLabel);
    expect(JSON.stringify(result)).not.toContain('one');
  });

  it('distinguishes schema facts from conservative indicators', () => {
    const result = successful(
      analyzeFormDefinition(
        formWith([
          { id: 'notes', type: 'textarea', label: 'Medical notes' },
          { id: 'password', type: 'password', label: 'Password' },
          { id: 'email', type: 'email', label: 'Email', autocomplete: 'email' },
        ]),
      ),
    );
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unbounded_free_text', confidence: 'fact' }),
        expect.objectContaining({ code: 'password_collection', confidence: 'fact' }),
        expect.objectContaining({ code: 'personal_data_autocomplete', confidence: 'fact' }),
        expect.objectContaining({
          code: 'sensitive_data_wording_indicator',
          confidence: 'indicator',
        }),
      ]),
    );
  });

  it('avoids adjacent false positives and respects bounded-rule thresholds', () => {
    const fields: FormField[] = [
      {
        id: 'healthy',
        type: 'textarea',
        label: 'Healthy workplace ideas',
        validation: [{ type: 'maxLength', value: 500 }],
      },
      {
        id: 'choices',
        type: 'select',
        label: 'Choice',
        options: Array.from({ length: LARGE_CHOICE_SET_OPTION_COUNT }, (_, index) => ({
          label: `Option ${index}`,
          value: `option-${index}`,
        })),
      },
      { id: 'long', type: 'text', label: 'x'.repeat(LONG_FIELD_LABEL_CHARACTER_COUNT) },
    ];
    expect(codes(analyzeFormDefinition(formWith(fields)))).toEqual([]);
  });

  it('orders findings deterministically and truncates only the returned list', () => {
    const definition = formWith([
      { id: 'z-password', type: 'password', label: 'Password' },
      { id: 'a-notes', type: 'textarea', label: 'Notes' },
    ]);
    const first = successful(analyzeFormDefinition(definition, { maxFindings: 1 }));
    const second = successful(
      analyzeFormDefinition(structuredClone(definition), { maxFindings: 1 }),
    );
    expect(first).toEqual(second);
    expect(first.findings).toHaveLength(1);
    expect(first.totalFindingCount).toBe(2);
    expect(first.truncated).toBe(true);
  });

  it('bounds affected identities while evaluating every matching field', () => {
    const fields = Array.from({ length: 60 }, (_, index): FormField => ({
      id: `duplicate-${index}`,
      type: 'text',
      label: 'Repeated label',
    }));
    const result = successful(analyzeFormDefinition(formWith(fields)));
    const duplicateFinding = result.findings.find(({ code }) => code === 'duplicate_field_label');

    expect(result.evaluatedFieldCount).toBe(60);
    expect(duplicateFinding).toMatchObject({
      affectedIdentitiesTruncated: true,
      sectionIds: ['main'],
    });
    expect(duplicateFinding?.fieldIds).toHaveLength(50);
  });
});

function formWith(fields: readonly FormField[]): FormDefinition {
  return {
    schemaVersion: 1,
    id: 'analysis-form',
    formVersion: 1,
    title: 'Analysis form',
    sections: [{ id: 'main', title: 'Main', fields }],
    submission: { submitLabel: 'Submit', successMessage: 'Done' },
  };
}

function simpleFields(count: number): FormField[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `field-${index}`,
    type: 'text' as const,
    label: `Field ${index}`,
  }));
}

function successful(result: ReturnType<typeof analyzeFormDefinition>) {
  if (!result.success) throw new Error('Expected successful analysis.');
  return result.value;
}

function codes(result: ReturnType<typeof analyzeFormDefinition>): string[] {
  return successful(result).findings.map(({ code }) => code);
}
