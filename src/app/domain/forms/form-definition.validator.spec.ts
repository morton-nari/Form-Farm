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

  it.each([
    ['date', '2026-08-13', { type: 'earliest' as const, value: '2026-08-14' }],
    ['datetime', '2026-08-15T10:00', { type: 'latest' as const, value: '2026-08-15T09:00' }],
    ['time', '08:59', { type: 'earliest' as const, value: '09:00' }],
  ])('rejects a %s default outside its temporal range', (type, defaultValue, rule) => {
    const form = cloneForm();
    form.sections[0]!.fields[0] = {
      id: 'when',
      type: type as 'date' | 'datetime' | 'time',
      label: 'When',
      defaultValue,
      validation: [rule],
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

  it.each([
    [
      'required single choice with no enabled options',
      {
        id: 'choice',
        type: 'select',
        label: 'Choice',
        options: [{ label: 'Unavailable', value: 'unavailable', disabled: true }],
        validation: [{ type: 'required' }],
      },
    ],
    [
      'minimum selections above enabled option count',
      {
        id: 'choices',
        type: 'multi-select',
        label: 'Choices',
        options: [
          { label: 'One', value: 'one' },
          { label: 'Unavailable', value: 'unavailable', disabled: true },
        ],
        validation: [{ type: 'minSelections', value: 2 }],
      },
    ],
    [
      'required selection with a zero maximum',
      {
        id: 'choices',
        type: 'checkbox-group',
        label: 'Choices',
        options: [{ label: 'One', value: 'one' }],
        validation: [{ type: 'required' }, { type: 'maxSelections', value: 0 }],
      },
    ],
  ])('rejects unsatisfiable selection validation: %s', (_case, field) => {
    const form = cloneForm();
    form.sections[0]!.fields[0] = field;

    const result = validateFormDefinition(form);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          path: ['sections', 0, 'fields', 0, 'validation'],
          code: 'invalid_range',
        }),
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

  it.each([
    ['date', 'next Tuesday'],
    ['date', '2026-8-14'],
    ['datetime', '2026-08-14T09:05Z'],
    ['datetime', '2026-08-14T09:05junk'],
    ['time', '9:05'],
  ])('rejects a non-canonical %s rule value %s', (type, value) => {
    const form = cloneForm();
    form.sections[0]!.fields[0] = {
      id: 'start',
      type,
      label: 'Start',
      validation: [{ type: 'earliest', value }],
    };

    const result = validateFormDefinition(form);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'invalid_temporal_value' })]),
      );
    }
  });

  it.each([
    ['date', '2026-8-14'],
    ['datetime', '2026-08-14T09:05Z'],
    ['time', '9:05'],
  ])('rejects a non-canonical %s default before temporal comparisons', (type, defaultValue) => {
    const form = cloneForm();
    form.sections[0]!.fields[0] = {
      id: 'when',
      type,
      label: 'When',
      defaultValue,
      validation: [{ type: 'earliest', value: defaultValue }],
    };

    expect(validateFormDefinition(form).success).toBe(false);
  });

  it('accepts canonical local temporal values with optional seconds and fractional seconds', () => {
    const form = cloneForm();
    form.sections[0]!.fields = [
      {
        id: 'date',
        type: 'date',
        label: 'Date',
        defaultValue: '2026-08-14',
        validation: [{ type: 'earliest', value: '2026-08-14' }],
      },
      {
        id: 'datetime',
        type: 'datetime',
        label: 'Date and time',
        defaultValue: '2026-08-14T09:05:06',
        validation: [{ type: 'latest', value: '2026-08-14T09:05:06.500' }],
      },
      {
        id: 'time',
        type: 'time',
        label: 'Time',
        defaultValue: '09:05',
        validation: [
          { type: 'earliest', value: '09:05:00' },
          { type: 'latest', value: '09:05:00.500' },
        ],
      },
    ];

    expect(validateFormDefinition(form).success).toBe(true);
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
