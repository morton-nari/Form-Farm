import { USER_REGISTRATION_FORM } from '@form-farm/form-domain/examples/user-registration';
import { FormDefinitionValidationIssueCode, validateFormDefinition } from '@form-farm/form-domain';

describe('form-definition validation rules', () => {
  it.each([
    [
      'text',
      {
        id: 'textField',
        type: 'text',
        label: 'Text',
        validation: [
          { type: 'required' },
          { type: 'minLength', value: 0 },
          { type: 'maxLength', value: 0 },
        ],
      },
    ],
    [
      'number',
      {
        id: 'numberField',
        type: 'number',
        label: 'Number',
        validation: [
          { type: 'required' },
          { type: 'min', value: 5 },
          { type: 'max', value: 5 },
          { type: 'integer' },
        ],
      },
    ],
    [
      'temporal',
      {
        id: 'dateField',
        type: 'date',
        label: 'Date',
        validation: [
          { type: 'required' },
          { type: 'earliest', value: '2026-08-12' },
          { type: 'latest', value: '2026-08-12' },
        ],
      },
    ],
    [
      'selection',
      {
        id: 'selectionField',
        type: 'multi-select',
        label: 'Selection',
        options: [{ label: 'One', value: 'one' }],
        validation: [
          { type: 'required' },
          { type: 'minSelections', value: 1 },
          { type: 'maxSelections', value: 1 },
        ],
      },
    ],
    [
      'boolean',
      {
        id: 'booleanField',
        type: 'checkbox',
        label: 'Boolean',
        validation: [{ type: 'required' }, { type: 'accepted' }],
      },
    ],
  ])('accepts every %s rule, including equal range boundaries', (_family, field) => {
    expect(validateFormDefinition(formWith(field)).success).toBe(true);
  });

  it.each([
    [
      'text length',
      {
        id: 'textField',
        type: 'text',
        label: 'Text',
        validation: [
          { type: 'minLength', value: 2 },
          { type: 'maxLength', value: 1 },
        ],
      },
    ],
    [
      'number',
      {
        id: 'numberField',
        type: 'number',
        label: 'Number',
        validation: [
          { type: 'min', value: 2 },
          { type: 'max', value: 1 },
        ],
      },
    ],
    [
      'temporal',
      {
        id: 'dateField',
        type: 'date',
        label: 'Date',
        validation: [
          { type: 'earliest', value: '2026-08-13' },
          { type: 'latest', value: '2026-08-12' },
        ],
      },
    ],
    [
      'selection count',
      {
        id: 'selectionField',
        type: 'multi-select',
        label: 'Selection',
        options: [{ label: 'One', value: 'one' }],
        validation: [
          { type: 'minSelections', value: 2 },
          { type: 'maxSelections', value: 1 },
        ],
      },
    ],
  ])('rejects a reversed %s range', (_family, field) => {
    expect(issueCodes(formWith(field))).toContain('invalid_range');
  });

  it.each([
    [
      'text',
      {
        id: 'textField',
        type: 'text',
        label: 'Text',
        validation: [{ type: 'minLength', value: -1 }],
      },
    ],
    [
      'number',
      {
        id: 'numberField',
        type: 'number',
        label: 'Number',
        validation: [{ type: 'min', value: 'one' }],
      },
    ],
    [
      'temporal',
      {
        id: 'dateField',
        type: 'date',
        label: 'Date',
        validation: [{ type: 'earliest', value: 'tomorrow' }],
      },
    ],
    [
      'selection',
      {
        id: 'selectionField',
        type: 'multi-select',
        label: 'Selection',
        options: [{ label: 'One', value: 'one' }],
        validation: [{ type: 'minSelections', value: -1 }],
      },
    ],
    [
      'boolean',
      {
        id: 'booleanField',
        type: 'checkbox',
        label: 'Boolean',
        validation: [{ type: 'minLength', value: 1 }],
      },
    ],
  ])('rejects a malformed or incompatible %s rule', (_family, field) => {
    expect(validateFormDefinition(formWith(field)).success).toBe(false);
  });

  it.each([
    ['text', { id: 'textField', type: 'text', label: 'Text' }, { type: 'minLength', value: 1 }],
    ['number', { id: 'numberField', type: 'number', label: 'Number' }, { type: 'min', value: 1 }],
    [
      'temporal',
      { id: 'dateField', type: 'date', label: 'Date' },
      { type: 'earliest', value: '2026-08-12' },
    ],
    [
      'selection',
      {
        id: 'selectionField',
        type: 'multi-select',
        label: 'Selection',
        options: [{ label: 'One', value: 'one' }],
      },
      { type: 'minSelections', value: 1 },
    ],
    ['boolean', { id: 'booleanField', type: 'checkbox', label: 'Boolean' }, { type: 'accepted' }],
  ])('rejects duplicate %s rules consistently', (_family, field, rule) => {
    expect(issueCodes(formWith({ ...field, validation: [rule, rule] }))).toContain('duplicate');
  });

  it.each([
    ['form', (form: any) => (form.unexpected = true), []],
    ['submission', (form: any) => (form.submission.unexpected = true), ['submission']],
    ['section', (form: any) => (form.sections[0].unexpected = true), ['sections', 0]],
    [
      'field',
      (form: any) => (form.sections[0].fields[0].unexpected = true),
      ['sections', 0, 'fields', 0],
    ],
    [
      'option',
      (form: any) => (form.sections[1].fields[1].options[0].unexpected = true),
      ['sections', 1, 'fields', 1, 'options', 0],
    ],
    [
      'rule',
      (form: any) => (form.sections[0].fields[0].validation[0].unexpected = true),
      ['sections', 0, 'fields', 0, 'validation', 0],
    ],
  ])('rejects unknown properties at the %s level', (_level, mutate, expectedPath) => {
    const form = cloneForm();
    mutate(form);

    const result = validateFormDefinition(form);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: expectedPath, code: 'unknown_property' }),
        ]),
      );
    }
  });

  it('is deterministic, side-effect free, and does not expose Zod errors', () => {
    const form = cloneForm();
    form.sections[0].fields[0].validation[0].unexpected = true;
    const before = JSON.stringify(form);

    const first = validateFormDefinition(form);
    const second = validateFormDefinition(form);

    expect(first).toEqual(second);
    expect(JSON.stringify(form)).toBe(before);
    expect(first).not.toHaveProperty('error');
    if (!first.success) {
      expect(first.issues[0]).toEqual({
        path: ['sections', 0, 'fields', 0, 'validation', 0],
        code: 'unknown_property',
        message: 'Contains unsupported properties.',
      });
    }
  });
});

function formWith(field: unknown): any {
  const form = cloneForm();
  form.sections = [{ id: 'section', title: 'Section', fields: [field] }];
  return form;
}

function issueCodes(form: unknown): readonly FormDefinitionValidationIssueCode[] {
  const result = validateFormDefinition(form);
  return result.success ? [] : result.issues.map((issue) => issue.code);
}

function cloneForm(): any {
  return structuredClone(USER_REGISTRATION_FORM);
}
