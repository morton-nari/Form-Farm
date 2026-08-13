import { FormDefinition, FormField, validateFormAnswers } from '@form-farm/form-domain';

describe('validateFormAnswers', () => {
  it('accepts exhaustive typed answers and preserves omitted versus empty', () => {
    const result = validateFormAnswers(definition(), {
      name: '',
      notes: 'ok',
      phone: '123',
      email: 'user@example.com',
      website: 'https://example.com',
      age: 3,
      date: '2026-01-01',
      datetime: '2026-01-01T12:30',
      time: '12:30',
      choice: 'one',
      radio: 'one',
      tags: ['one'],
      multi: ['one'],
      accepted: true,
    });
    expect(result).toEqual({
      success: true,
      value: {
        name: '',
        notes: 'ok',
        phone: '123',
        email: 'user@example.com',
        website: 'https://example.com',
        age: 3,
        date: '2026-01-01',
        datetime: '2026-01-01T12:30',
        time: '12:30',
        choice: 'one',
        radio: 'one',
        tags: ['one'],
        multi: ['one'],
        accepted: true,
      },
    });
  });

  it('rejects unknown keys, wrong types, disabled options, duplicates, and rule failures safely', () => {
    const result = validateFormAnswers(definition(), {
      unknown: 'secret',
      email: 'bad',
      age: 1.5,
      date: 'bad',
      time: 'bad',
      choice: 'disabled',
      tags: ['one', 'one'],
      accepted: false,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues.map((entry) => entry.code)).toEqual(
      expect.arrayContaining([
        'unknown_field',
        'invalid_format',
        'rule_violation',
        'invalid_option',
        'duplicate_selection',
      ]),
    );
    expect(JSON.stringify(result.issues)).not.toContain('secret');
  });

  it('rejects missing required answers and any generically submitted password form', () => {
    const form = definition();
    const withPassword: FormDefinition = {
      ...form,
      sections: [
        {
          ...form.sections[0]!,
          fields: [
            ...form.sections[0]!.fields,
            {
              id: 'password',
              type: 'password',
              label: 'Password',
            },
          ],
        },
      ],
    };
    const result = validateFormAnswers(withPassword, {});
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['answers', 'email'], code: 'missing_required' }),
        expect.objectContaining({ path: ['answers', 'password'], code: 'unsupported_field' }),
      ]),
    );
  });

  it('is deterministic, side-effect free, and does not coerce values', () => {
    const input = { age: '3' };
    const snapshot = structuredClone(input);
    expect(validateFormAnswers(definition(), input)).toEqual(
      validateFormAnswers(definition(), input),
    );
    expect(input).toEqual(snapshot);
    expect(validateFormAnswers(definition(), input)).toEqual(
      expect.objectContaining({ success: false }),
    );
  });

  it.each([
    [
      { id: 'text', type: 'text', label: 'Text', validation: [{ type: 'minLength', value: 2 }] },
      'x',
      'minLength',
    ],
    [
      { id: 'text', type: 'text', label: 'Text', validation: [{ type: 'maxLength', value: 2 }] },
      'xxx',
      'maxLength',
    ],
    [
      { id: 'number', type: 'number', label: 'Number', validation: [{ type: 'min', value: 2 }] },
      1,
      'min',
    ],
    [
      { id: 'number', type: 'number', label: 'Number', validation: [{ type: 'max', value: 2 }] },
      3,
      'max',
    ],
    [
      { id: 'number', type: 'number', label: 'Number', validation: [{ type: 'integer' }] },
      1.5,
      'integer',
    ],
    [
      {
        id: 'date',
        type: 'date',
        label: 'Date',
        validation: [{ type: 'earliest', value: '2026-01-02' }],
      },
      '2026-01-01',
      'earliest',
    ],
    [
      {
        id: 'date',
        type: 'date',
        label: 'Date',
        validation: [{ type: 'latest', value: '2026-01-01' }],
      },
      '2026-01-02',
      'latest',
    ],
    [
      {
        id: 'choices',
        type: 'multi-select',
        label: 'Choices',
        options: [{ label: 'One', value: 'one' }],
        validation: [{ type: 'minSelections', value: 1 }],
      },
      [],
      'minSelections',
    ],
    [
      {
        id: 'choices',
        type: 'multi-select',
        label: 'Choices',
        options: [
          { label: 'One', value: 'one' },
          { label: 'Two', value: 'two' },
        ],
        validation: [{ type: 'maxSelections', value: 1 }],
      },
      ['one', 'two'],
      'maxSelections',
    ],
  ] as const)('enforces the %s rule family', (candidate, value, rule) => {
    const form = singleFieldDefinition(candidate as FormField);
    const result = validateFormAnswers(form, { [candidate.id]: value });
    expect(result).toEqual(expect.objectContaining({ success: false }));
    if (result.success) return;
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        path: ['answers', candidate.id, rule],
        code: 'rule_violation',
      }),
    );
  });
});

function singleFieldDefinition(field: FormField): FormDefinition {
  return {
    schemaVersion: 1,
    id: 'rule-form',
    formVersion: 1,
    title: 'Rules',
    sections: [{ id: 'main', title: 'Main', fields: [field] }],
    submission: { submitLabel: 'Submit', successMessage: 'Done' },
  };
}

function definition(): FormDefinition {
  return {
    schemaVersion: 1,
    id: 'test-form',
    formVersion: 1,
    title: 'Test',
    sections: [
      {
        id: 'main',
        title: 'Main',
        fields: [
          {
            id: 'name',
            type: 'text',
            label: 'Name',
            validation: [{ type: 'maxLength', value: 4 }],
          },
          { id: 'notes', type: 'textarea', label: 'Notes' },
          { id: 'phone', type: 'tel', label: 'Phone' },
          { id: 'email', type: 'email', label: 'Email', validation: [{ type: 'required' }] },
          { id: 'website', type: 'url', label: 'Website' },
          {
            id: 'age',
            type: 'number',
            label: 'Age',
            validation: [{ type: 'integer' }, { type: 'min', value: 2 }],
          },
          {
            id: 'date',
            type: 'date',
            label: 'Date',
            validation: [{ type: 'earliest', value: '2026-01-01' }],
          },
          { id: 'datetime', type: 'datetime', label: 'Date time' },
          { id: 'time', type: 'time', label: 'Time' },
          {
            id: 'choice',
            type: 'select',
            label: 'Choice',
            options: [
              { label: 'One', value: 'one' },
              { label: 'Disabled', value: 'disabled', disabled: true },
            ],
          },
          {
            id: 'radio',
            type: 'radio',
            label: 'Radio',
            options: [{ label: 'One', value: 'one' }],
          },
          {
            id: 'tags',
            type: 'checkbox-group',
            label: 'Tags',
            options: [{ label: 'One', value: 'one' }],
          },
          {
            id: 'multi',
            type: 'multi-select',
            label: 'Multi',
            options: [{ label: 'One', value: 'one' }],
          },
          {
            id: 'accepted',
            type: 'checkbox',
            label: 'Accepted',
            validation: [{ type: 'accepted' }],
          },
        ],
      },
    ],
    submission: { submitLabel: 'Submit', successMessage: 'Done' },
  };
}
