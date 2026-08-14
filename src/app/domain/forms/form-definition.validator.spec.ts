import { validateFormDefinition } from '@form-farm/form-domain';
import { USER_REGISTRATION_FORM } from '@form-farm/form-domain/examples/user-registration';

describe('validateFormDefinition', () => {
  it('accepts the complete provider-neutral example', () => {
    expect(validateFormDefinition(USER_REGISTRATION_FORM)).toEqual({
      success: true,
      value: USER_REGISTRATION_FORM,
    });
  });

  it('accepts every schema version one field discriminant', () => {
    const form = cloneForm();
    form.sections = [
      {
        id: 'allFields',
        title: 'All fields',
        fields: [
          { id: 'text', type: 'text', label: 'Text' },
          { id: 'email', type: 'email', label: 'Email', defaultValue: 'person@example.com' },
          { id: 'password', type: 'password', label: 'Password' },
          { id: 'tel', type: 'tel', label: 'Telephone' },
          { id: 'url', type: 'url', label: 'URL', defaultValue: 'https://example.com' },
          { id: 'textarea', type: 'textarea', label: 'Comments', rows: 4 },
          {
            id: 'number',
            type: 'number',
            label: 'Number',
            validation: [{ type: 'integer' }],
          },
          { id: 'date', type: 'date', label: 'Date', defaultValue: '2026-08-12' },
          {
            id: 'datetime',
            type: 'datetime',
            label: 'Date and time',
            defaultValue: '2026-08-12T10:30:00',
          },
          { id: 'time', type: 'time', label: 'Time', defaultValue: '10:30:00' },
          {
            id: 'select',
            type: 'select',
            label: 'Select',
            options: [{ label: 'One', value: 'one' }],
          },
          {
            id: 'radio',
            type: 'radio',
            label: 'Radio',
            options: [{ label: 'One', value: 'one' }],
          },
          {
            id: 'multiSelect',
            type: 'multi-select',
            label: 'Multi-select',
            options: [{ label: 'One', value: 'one' }],
            defaultValue: ['one'],
          },
          { id: 'checkbox', type: 'checkbox', label: 'Checkbox', defaultValue: false },
          {
            id: 'checkboxGroup',
            type: 'checkbox-group',
            label: 'Checkbox group',
            options: [{ label: 'One', value: 'one' }],
          },
        ],
      },
    ];

    expect(validateFormDefinition(form).success).toBe(true);
  });

  it.each([
    ['unknown schema version', { schemaVersion: 2 }, ['schemaVersion']],
    ['invalid form version', { formVersion: 0 }, ['formVersion']],
    ['unsafe identifier', { id: 'registration form' }, ['id']],
    ['unknown top-level property', { provider: 'example-ai' }, []],
  ])('rejects %s', (_description, replacement, expectedPath) => {
    const result = validateFormDefinition({ ...cloneForm(), ...replacement });

    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: expectedPath })]),
      );
  });

  it('rejects empty forms, sections, and presentation text', () => {
    const emptyForm = { ...cloneForm(), title: ' ', sections: [] };
    const result = validateFormDefinition(emptyForm);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.map((issue) => issue.path)).toEqual(
        expect.arrayContaining([['title'], ['sections']]),
      );
    }
  });

  it('rejects duplicate section and globally duplicate field IDs with exact paths', () => {
    const form = cloneForm();
    form.sections[1]!.id = form.sections[0]!.id;
    form.sections[1]!.fields[0]!.id = form.sections[0]!.fields[0]!.id;

    const result = validateFormDefinition(form);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ['sections', 1, 'id'], code: 'duplicate' }),
          expect.objectContaining({ path: ['sections', 1, 'fields', 0, 'id'], code: 'duplicate' }),
        ]),
      );
    }
  });

  it('rejects unsupported field types and field-specific properties', () => {
    const form = cloneForm();
    form.sections[0]!.fields[0] = {
      id: 'avatar',
      type: 'file',
      label: 'Avatar',
      options: [{ label: 'Invalid', value: 'invalid' }],
    };

    const result = validateFormDefinition(form);

    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.issues[0]?.path).toEqual(['sections', 0, 'fields', 0, 'type']);
  });

  it('rejects duplicate options and defaults outside enabled options', () => {
    const form = cloneForm();
    const choice = form.sections[1]!.fields[1]!;
    choice.options = [
      { label: 'Email', value: 'email', disabled: true },
      { label: 'Duplicate email', value: 'email' },
    ];
    choice.defaultValue = 'missing';

    const result = validateFormDefinition(form);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'duplicate' }),
          expect.objectContaining({ code: 'invalid_default' }),
        ]),
      );
    }
  });

  it('rejects duplicate and contradictory validation rules', () => {
    const form = cloneForm();
    form.sections[0]!.fields[0]!.validation = [
      { type: 'minLength', value: 20 },
      { type: 'minLength', value: 10 },
      { type: 'maxLength', value: 5 },
    ];

    const result = validateFormDefinition(form);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'duplicate' }),
          expect.objectContaining({ code: 'invalid_range' }),
        ]),
      );
    }
  });

  it('rejects rules that are incompatible with a field type', () => {
    const form = cloneForm();
    form.sections[0]!.fields[0]!.validation = [{ type: 'min', value: 1 }];

    const result = validateFormDefinition(form);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues[0]?.path).toEqual(['sections', 0, 'fields', 0, 'validation', 0, 'type']);
    }
  });

  it.each([
    ['below minimum', 2, [{ type: 'min' as const, value: 3 }]],
    ['above maximum', 5, [{ type: 'max' as const, value: 4 }]],
    ['not an integer', 2.5, [{ type: 'integer' as const }]],
  ])('rejects a number default that is %s', (_case, defaultValue, validation) => {
    const form = cloneForm();
    form.sections[0]!.fields[0] = {
      id: 'amount',
      type: 'number',
      label: 'Amount',
      defaultValue,
      validation,
    };

    const result = validateFormDefinition(form);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          path: ['sections', 0, 'fields', 0, 'defaultValue'],
          code: 'invalid_default',
        }),
      );
    }
  });

  it('rejects temporal rule values that do not match their field format', () => {
    const form = cloneForm();
    form.sections[0]!.fields[0] = {
      id: 'startDate',
      type: 'date',
      label: 'Start date',
      validation: [{ type: 'earliest', value: 'next Tuesday' }],
    };

    const result = validateFormDefinition(form);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'invalid_temporal_value' })]),
      );
    }
  });

  it('returns safe issues rather than throwing for non-object input', () => {
    expect(() => validateFormDefinition(null)).not.toThrow();
    expect(validateFormDefinition(null)).toMatchObject({
      success: false,
      issues: [{ path: [], code: 'invalid_type' }],
    });
  });
});

function cloneForm(): any {
  return structuredClone(USER_REGISTRATION_FORM);
}
