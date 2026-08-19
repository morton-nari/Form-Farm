import {
  applyFormChangeSet,
  validateFormChangeSet,
  type FormChangeOperation,
  type FormChangeSet,
  type FormDraftDefinition,
  type FormField,
  type TextField,
} from '@form-farm/form-domain';

import { describe, expect, it } from 'vitest';

describe('controlled form change operations', () => {
  it('applies the complete operation vocabulary in authoritative array order', () => {
    const result = apply(baseDraft(), [
      { type: 'setFormPresentation', title: 'Updated form', description: 'Updated description' },
      {
        type: 'setSubmissionPresentation',
        submitLabel: 'Continue',
        successMessage: 'Saved',
      },
      {
        type: 'addSection',
        section: { id: 'temporary', title: 'Temporary', fields: [] },
        afterSectionId: 'personal',
      },
      {
        type: 'setSectionPresentation',
        sectionId: 'temporary',
        title: 'Temporary details',
        description: 'Short lived',
      },
      { type: 'moveSection', sectionId: 'details', afterSectionId: null },
      {
        type: 'addField',
        sectionId: 'temporary',
        field: textField('nickname', 'Nickname'),
        afterFieldId: null,
      },
      {
        type: 'setFieldPresentation',
        fieldId: 'name',
        presentation: {
          fieldType: 'text',
          label: 'Full name',
          helpText: 'As shown on your ID',
          placeholder: 'Ada Lovelace',
          autocomplete: 'name',
        },
      },
      { type: 'setFieldDefault', fieldId: 'age', defaultValue: 21 },
      {
        type: 'setFieldValidation',
        fieldId: 'age',
        validation: [
          { type: 'min', value: 18 },
          { type: 'integer' },
        ],
      },
      {
        type: 'setChoiceOptions',
        fieldId: 'country',
        options: [
          { label: 'New Zealand', value: 'NZ' },
          { label: 'Australia', value: 'AU' },
        ],
      },
      {
        type: 'moveField',
        fieldId: 'country',
        toSectionId: 'details',
        afterFieldId: 'age',
      },
      { type: 'removeField', fieldId: 'nickname' },
      { type: 'removeSection', sectionId: 'temporary' },
    ]);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.appliedOperationCount).toBe(13);
    expect(result.value).toMatchObject({
      title: 'Updated form',
      description: 'Updated description',
      submission: { submitLabel: 'Continue', successMessage: 'Saved' },
    });
    expect(result.value.sections.map((section) => section.id)).toEqual(['details', 'personal']);
    expect(result.value.sections[0]?.fields.map((field) => field.id)).toEqual(['age', 'country']);
    expect(result.value.sections[1]?.fields.map((field) => field.id)).toEqual(['name']);
    expect(result.value.sections[1]?.fields[0]).toMatchObject({
      label: 'Full name',
      helpText: 'As shown on your ID',
      placeholder: 'Ada Lovelace',
      autocomplete: 'name',
    });
  });

  it('uses null to remove optional presentation, default, and validation properties', () => {
    const result = apply(baseDraft(), [
      { type: 'setFormPresentation', title: 'Form', description: null },
      {
        type: 'setSectionPresentation',
        sectionId: 'personal',
        title: 'Personal',
        description: null,
      },
      {
        type: 'setFieldPresentation',
        fieldId: 'name',
        presentation: {
          fieldType: 'text',
          label: 'Name',
          helpText: null,
          placeholder: null,
          autocomplete: null,
        },
      },
      { type: 'setFieldDefault', fieldId: 'name', defaultValue: null },
      { type: 'setFieldValidation', fieldId: 'name', validation: null },
    ]);

    expect(result.success).toBe(true);
    if (!result.success) return;
    const field = result.value.sections[0]?.fields[0];
    expect(result.value).not.toHaveProperty('description');
    expect(result.value.sections[0]).not.toHaveProperty('description');
    expect(field).not.toHaveProperty('helpText');
    expect(field).not.toHaveProperty('placeholder');
    expect(field).not.toHaveProperty('autocomplete');
    expect(field).not.toHaveProperty('defaultValue');
    expect(field).not.toHaveProperty('validation');
  });

  it('supports first-position and same-section stable-ID moves without numeric indexes', () => {
    const result = apply(baseDraft(), [
      { type: 'moveField', fieldId: 'country', toSectionId: 'personal', afterFieldId: null },
      { type: 'moveField', fieldId: 'name', toSectionId: 'personal', afterFieldId: 'country' },
    ]);
    expect(result.success).toBe(true);
    if (result.success)
      expect(result.value.sections[0]?.fields.map((field) => field.id)).toEqual(['country', 'name']);
  });

  it('allows deliberate ordered transitions but validates the complete final draft', () => {
    const valid = apply(baseDraft(), [
      { type: 'removeField', fieldId: 'name' },
      {
        type: 'addField',
        sectionId: 'personal',
        field: textField('name', 'Replacement name'),
        afterFieldId: null,
      },
    ]);
    expect(valid.success).toBe(true);

    const invalid = apply(baseDraft(), [{ type: 'removeSection', sectionId: 'personal' }, { type: 'removeSection', sectionId: 'details' }]);
    expect(invalid).toMatchObject({
      success: false,
      issues: [{ path: ['result', 'sections'], code: 'invalid_result' }],
    });
  });

  it.each([
    ['section target', { type: 'removeSection', sectionId: 'missing' }],
    ['field target', { type: 'removeField', fieldId: 'missing' }],
    [
      'destination section',
      { type: 'moveField', fieldId: 'name', toSectionId: 'missing', afterFieldId: null },
    ],
  ] as const)('fails closed for a missing %s', (_label, operation) => {
    expect(apply(baseDraft(), [operation])).toMatchObject({
      success: false,
      issues: [{ code: 'target_not_found' }],
    });
  });

  it('rejects section and globally unique field identifier collisions', () => {
    expect(
      apply(baseDraft(), [
        {
          type: 'addSection',
          section: { id: 'personal', title: 'Duplicate', fields: [] },
          afterSectionId: null,
        },
      ]),
    ).toMatchObject({ success: false, issues: [{ code: 'identifier_collision' }] });
    expect(
      apply(baseDraft(), [
        {
          type: 'addField',
          sectionId: 'details',
          field: textField('name', 'Duplicate'),
          afterFieldId: null,
        },
      ]),
    ).toMatchObject({ success: false, issues: [{ code: 'identifier_collision' }] });
  });

  it.each([
    { type: 'moveSection', sectionId: 'personal', afterSectionId: 'personal' },
    { type: 'moveSection', sectionId: 'personal', afterSectionId: 'missing' },
    {
      type: 'moveField',
      fieldId: 'name',
      toSectionId: 'personal',
      afterFieldId: 'name',
    },
    {
      type: 'moveField',
      fieldId: 'name',
      toSectionId: 'details',
      afterFieldId: 'country',
    },
  ] satisfies readonly FormChangeOperation[])('rejects invalid ordering anchor %#', (operation) => {
    expect(apply(baseDraft(), [operation])).toMatchObject({
      success: false,
      issues: [{ code: 'invalid_anchor' }],
    });
  });

  it('rejects presentation and choice operations incompatible with the target type', () => {
    expect(
      apply(baseDraft(), [
        {
          type: 'setFieldPresentation',
          fieldId: 'age',
          presentation: {
            fieldType: 'text',
            label: 'Age',
            helpText: null,
            placeholder: null,
            autocomplete: null,
          },
        },
      ]),
    ).toMatchObject({ success: false, issues: [{ code: 'incompatible_field_type' }] });
    expect(
      apply(baseDraft(), [
        {
          type: 'setChoiceOptions',
          fieldId: 'age',
          options: [{ label: 'One', value: '1' }],
        },
      ]),
    ).toMatchObject({ success: false, issues: [{ code: 'incompatible_field_type' }] });
  });

  it('rejects incompatible defaults, rules, and option changes through final domain validation', () => {
    const invalidCases: readonly FormChangeOperation[][] = [
      [{ type: 'setFieldDefault', fieldId: 'age', defaultValue: 'old' }],
      [{ type: 'setFieldValidation', fieldId: 'age', validation: [{ type: 'minLength', value: 2 }] }],
      [
        {
          type: 'setChoiceOptions',
          fieldId: 'country',
          options: [{ label: 'New Zealand', value: 'NZ' }],
        },
      ],
    ];
    invalidCases.forEach((operations) =>
      expect(apply(baseDraft(), operations)).toMatchObject({
        success: false,
        issues: [{ code: 'invalid_result' }],
      }),
    );
  });

  it('forbids password defaults explicitly', () => {
    const base = baseDraft();
    const password: FormField = { id: 'secret', type: 'password', label: 'Secret' };
    const draft: FormDraftDefinition = {
      ...base,
      sections: [base.sections[0]!, { ...base.sections[1]!, fields: [password] }],
    };
    expect(
      apply(draft, [{ type: 'setFieldDefault', fieldId: 'secret', defaultValue: 'unsafe' }]),
    ).toMatchObject({ success: false, issues: [{ code: 'incompatible_field_type' }] });
  });

  it('strictly rejects unknown, incomplete, empty, and invalid candidate operations', () => {
    expect(
      validateFormChangeSet({
        changeSetVersion: 1,
        operations: [{ type: 'removeField', fieldId: 'name', extra: true }],
      }),
    ).toMatchObject({ success: false, issues: [{ code: 'unknown_property' }] });
    expect(
      validateFormChangeSet({ changeSetVersion: 1, operations: [{ type: 'moveField' }] }),
    ).toMatchObject({ success: false });
    expect(validateFormChangeSet({ changeSetVersion: 1, operations: [] })).toMatchObject({
      success: false,
      issues: [{ code: 'value_too_small' }],
    });
    const invalidCandidate = validateFormChangeSet({
        changeSetVersion: 1,
        operations: [
          {
            type: 'addField',
            sectionId: 'personal',
            field: { id: 'bad', type: 'text', label: '', unexpected: true },
            afterFieldId: null,
          },
        ],
      });
    expect(invalidCandidate.success).toBe(false);
    if (!invalidCandidate.success)
      expect(invalidCandidate.issues.every((issue) => issue.code === 'invalid_candidate')).toBe(true);
  });

  it('rejects an invalid source draft before applying operations', () => {
    expect(
      applyFormChangeSet({ ...baseDraft(), title: '' }, changeSet([{ type: 'removeField', fieldId: 'name' }])),
    ).toMatchObject({
      success: false,
      issues: [{ path: ['definition', 'title'], code: 'invalid_candidate' }],
    });
  });

  it('does not mutate input or partially expose a failed application and is deterministic', () => {
    const draft = baseDraft();
    const before = JSON.parse(JSON.stringify(draft));
    const operations: readonly FormChangeOperation[] = [
      { type: 'setFormPresentation', title: 'Would change', description: null },
      { type: 'removeField', fieldId: 'missing' },
    ];
    const first = apply(draft, operations);
    const second = apply(draft, operations);
    expect(draft).toEqual(before);
    expect(first).toEqual(second);
    expect(first).not.toHaveProperty('value');
  });
});

function apply(definition: FormDraftDefinition, operations: readonly FormChangeOperation[]) {
  return applyFormChangeSet(definition, changeSet(operations));
}

function changeSet(operations: readonly FormChangeOperation[]): FormChangeSet {
  return { changeSetVersion: 1, operations };
}

function baseDraft(): FormDraftDefinition {
  return {
    schemaVersion: 1,
    id: 'test-form',
    formVersion: 1,
    title: 'Test form',
    description: 'Original description',
    sections: [
      {
        id: 'personal',
        title: 'Personal',
        description: 'Personal details',
        fields: [
          {
            ...textField('name', 'Name'),
            helpText: 'Original help',
            placeholder: 'Name',
            autocomplete: 'name',
            defaultValue: 'Ada',
            validation: [{ type: 'minLength', value: 2 }],
          },
          {
            id: 'country',
            type: 'select',
            label: 'Country',
            options: [
              { label: 'Australia', value: 'AU' },
              { label: 'New Zealand', value: 'NZ' },
            ],
            defaultValue: 'AU',
          },
        ],
      },
      {
        id: 'details',
        title: 'Details',
        fields: [{ id: 'age', type: 'number', label: 'Age' }],
      },
    ],
    submission: { submitLabel: 'Submit', successMessage: 'Complete' },
  };
}

function textField(id: string, label: string): TextField {
  return { id, type: 'text', label };
}
