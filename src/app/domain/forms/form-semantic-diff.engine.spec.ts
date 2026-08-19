import {
  compareFormDefinitions,
  type FormDraftDefinition,
  type FormDraftSection,
  type FormField,
  type FormSemanticChange,
} from '@form-farm/form-domain';

import { describe, expect, it } from 'vitest';

describe('semantic form-definition diffing', () => {
  it('returns stable version identity and no changes for equivalent definitions', () => {
    const from = baseDraft();
    const to = clone(from);
    to.formVersion = 2;

    expect(compareFormDefinitions(from, to)).toEqual({
      success: true,
      value: {
        diffVersion: 1,
        formId: 'test-form',
        fromFormVersion: 1,
        toFormVersion: 2,
        changes: [],
        totalChangeCount: 0,
        truncated: false,
      },
    });
  });

  it('reports form and submission presentation without returning their text values', () => {
    const to = clone(baseDraft());
    to.title = 'Private changed title';
    delete to.description;
    to.submission = { submitLabel: 'Continue', successMessage: 'Private changed message' };

    const changes = successfulChanges(baseDraft(), to);
    expect(changes).toEqual([
      { type: 'formPresentationChanged', property: 'title' },
      { type: 'formPresentationChanged', property: 'description' },
      { type: 'submissionPresentationChanged', property: 'submitLabel' },
      { type: 'submissionPresentationChanged', property: 'successMessage' },
    ]);
    expect(JSON.stringify(changes)).not.toContain('Private');
  });

  it('distinguishes section add, remove, reorder, and presentation changes', () => {
    const to = clone(baseDraft());
    const personal: MutableSection = {
      ...to.sections[0]!,
      title: 'Updated personal',
      description: 'Updated description',
    };
    to.sections = [
      to.sections[1]!,
      personal,
      { id: 'new-section', title: 'New section', fields: [] },
    ];
    const from = baseDraft();
    from.sections.push({ id: 'removed-section', title: 'Removed', fields: [] });

    expect(successfulChanges(from, to)).toEqual([
      { type: 'sectionRemoved', sectionId: 'removed-section', fromIndex: 2 },
      { type: 'sectionAdded', sectionId: 'new-section', toIndex: 2 },
      { type: 'sectionMoved', sectionId: 'details', fromIndex: 1, toIndex: 0 },
      { type: 'sectionMoved', sectionId: 'personal', fromIndex: 0, toIndex: 1 },
      { type: 'sectionPresentationChanged', sectionId: 'personal', property: 'title' },
      { type: 'sectionPresentationChanged', sectionId: 'personal', property: 'description' },
    ]);
  });

  it('does not report unchanged sections as moved when neighbors are added or removed', () => {
    const from = baseDraft();
    from.sections.unshift({ id: 'removed', title: 'Removed', fields: [] });
    const to = clone(baseDraft());
    to.sections.splice(1, 0, { id: 'added', title: 'Added', fields: [] });

    expect(successfulChanges(from, to)).toEqual([
      { type: 'sectionRemoved', sectionId: 'removed', fromIndex: 0 },
      { type: 'sectionAdded', sectionId: 'added', toIndex: 1 },
    ]);
  });

  it('reports field add, remove, cross-section move, and same-section reorder separately', () => {
    const from = baseDraft();
    from.sections[1]!.fields.push(numberField('removed', 'Removed'));
    const to = clone(baseDraft());
    const country = to.sections[0]!.fields.pop()!;
    to.sections[1]!.fields.unshift(country);
    to.sections[0]!.fields.unshift(textField('added', 'Added'));

    expect(successfulChanges(from, to)).toEqual([
      {
        type: 'fieldRemoved',
        fieldId: 'removed',
        fieldType: 'number',
        fromSectionId: 'details',
        fromIndex: 1,
      },
      {
        type: 'fieldAdded',
        fieldId: 'added',
        fieldType: 'text',
        toSectionId: 'personal',
        toIndex: 0,
      },
      {
        type: 'fieldMoved',
        fieldId: 'country',
        fromSectionId: 'personal',
        toSectionId: 'details',
        fromIndex: 1,
        toIndex: 0,
      },
    ]);

    const reordered = clone(baseDraft());
    reordered.sections[0]!.fields.reverse();
    expect(successfulChanges(baseDraft(), reordered).filter(isType('fieldMoved'))).toEqual([
      {
        type: 'fieldMoved',
        fieldId: 'country',
        fromSectionId: 'personal',
        toSectionId: 'personal',
        fromIndex: 1,
        toIndex: 0,
      },
      {
        type: 'fieldMoved',
        fieldId: 'name',
        fromSectionId: 'personal',
        toSectionId: 'personal',
        fromIndex: 0,
        toIndex: 1,
      },
    ]);
  });

  it('does not report unchanged fields as moved when siblings are added or removed', () => {
    const from = baseDraft();
    from.sections[0]!.fields.unshift(textField('removed', 'Removed'));
    const to = clone(baseDraft());
    to.sections[0]!.fields.splice(1, 0, textField('added', 'Added'));

    expect(successfulChanges(from, to).filter(isType('fieldMoved'))).toEqual([]);
  });

  it('treats a stable field ID with a changed type as an explicit replacement', () => {
    const to = clone(baseDraft());
    to.sections[1]!.fields[0] = textField('age', 'Age as text');

    expect(successfulChanges(baseDraft(), to)).toEqual([
      { type: 'fieldTypeChanged', fieldId: 'age', fromFieldType: 'number', toFieldType: 'text' },
    ]);
  });

  it('reports field presentation properties without returning their values', () => {
    const to = clone(baseDraft());
    to.sections[0]!.fields[0] = {
      ...to.sections[0]!.fields[0]!,
      label: 'Private label',
      helpText: 'Private help',
      placeholder: 'Private placeholder',
      autocomplete: 'username',
    } as FormField;

    const changes = successfulChanges(baseDraft(), to);
    expect(changes).toEqual([
      { type: 'fieldPresentationChanged', fieldId: 'name', property: 'label' },
      { type: 'fieldPresentationChanged', fieldId: 'name', property: 'helpText' },
      { type: 'fieldPresentationChanged', fieldId: 'name', property: 'placeholder' },
      { type: 'fieldPresentationChanged', fieldId: 'name', property: 'autocomplete' },
    ]);
    expect(JSON.stringify(changes)).not.toContain('Private');
  });

  it('reports default lifecycle and value changes without returning defaults', () => {
    const added = clone(baseDraft());
    added.sections[1]!.fields[0] = {
      ...added.sections[1]!.fields[0]!,
      defaultValue: 18,
    } as FormField;
    expect(successfulChanges(baseDraft(), added)).toContainEqual({
      type: 'fieldDefaultChanged',
      fieldId: 'age',
      change: 'added',
    });

    const removed = clone(baseDraft());
    removed.sections[0]!.fields[0] = withoutProperty(
      removed.sections[0]!.fields[0]!,
      'defaultValue',
    );
    expect(successfulChanges(baseDraft(), removed)).toContainEqual({
      type: 'fieldDefaultChanged',
      fieldId: 'name',
      change: 'removed',
    });

    const changed = clone(baseDraft());
    changed.sections[0]!.fields[0] = {
      ...changed.sections[0]!.fields[0]!,
      defaultValue: 'Grace',
    } as FormField;
    const changes = successfulChanges(baseDraft(), changed);
    expect(changes).toContainEqual({
      type: 'fieldDefaultChanged',
      fieldId: 'name',
      change: 'valueChanged',
    });
    expect(JSON.stringify(changes)).not.toContain('Grace');
  });

  it('compares validation by rule identity in canonical order rather than array order', () => {
    const from = baseDraft();
    from.sections[1]!.fields[0] = {
      ...from.sections[1]!.fields[0]!,
      validation: [
        { type: 'max', value: 100 },
        { type: 'min', value: 0 },
      ],
    } as FormField;
    const reorderedOnly = clone(from);
    reorderedOnly.sections[1]!.fields[0] = {
      ...reorderedOnly.sections[1]!.fields[0]!,
      validation: [
        { type: 'min', value: 0 },
        { type: 'max', value: 100 },
      ],
    } as FormField;
    expect(successfulChanges(from, reorderedOnly)).toEqual([]);

    const to = clone(from);
    to.sections[1]!.fields[0] = {
      ...to.sections[1]!.fields[0]!,
      validation: [{ type: 'required' }, { type: 'min', value: 18 }],
    } as FormField;
    expect(successfulChanges(from, to)).toEqual([
      { type: 'fieldValidationChanged', fieldId: 'age', ruleType: 'required', change: 'added' },
      {
        type: 'fieldValidationChanged',
        fieldId: 'age',
        ruleType: 'min',
        change: 'valueChanged',
      },
      { type: 'fieldValidationChanged', fieldId: 'age', ruleType: 'max', change: 'removed' },
    ]);
  });

  it('distinguishes option label presentation from submitted-value changes', () => {
    const labelOnly = clone(baseDraft());
    replaceCountryOptions(labelOnly, [
      { label: 'Commonwealth of Australia', value: 'AU' },
      { label: 'New Zealand', value: 'NZ' },
    ]);
    expect(successfulChanges(baseDraft(), labelOnly)).toEqual([
      {
        type: 'choiceOptionPresentationChanged',
        fieldId: 'country',
        optionIndex: 0,
        property: 'label',
      },
    ]);

    const valueChanged = clone(baseDraft());
    replaceCountryOptions(valueChanged, [
      { label: 'Australia', value: 'AUS' },
      { label: 'New Zealand', value: 'NZ' },
    ]);
    valueChanged.sections[0]!.fields[1] = withoutProperty(
      valueChanged.sections[0]!.fields[1]!,
      'defaultValue',
    );
    expect(successfulChanges(baseDraft(), valueChanged)).toEqual([
      { type: 'fieldDefaultChanged', fieldId: 'country', change: 'removed' },
      { type: 'choiceOptionRemoved', fieldId: 'country', fromIndex: 0 },
      { type: 'choiceOptionAdded', fieldId: 'country', toIndex: 0 },
    ]);
  });

  it('reports option add, remove, reorder, label, and disabled semantics deterministically', () => {
    const from = baseDraft();
    replaceCountryOptions(from, [
      { label: 'Australia', value: 'AU' },
      { label: 'New Zealand', value: 'NZ' },
      { label: 'Canada', value: 'CA' },
    ]);
    const to = clone(baseDraft());
    replaceCountryOptions(to, [
      { label: 'New Zealand updated', value: 'NZ', disabled: true },
      { label: 'Australia', value: 'AU' },
      { label: 'United States', value: 'US' },
    ]);

    expect(successfulChanges(from, to)).toEqual([
      { type: 'choiceOptionRemoved', fieldId: 'country', fromIndex: 2 },
      { type: 'choiceOptionAdded', fieldId: 'country', toIndex: 2 },
      { type: 'choiceOptionMoved', fieldId: 'country', fromIndex: 1, toIndex: 0 },
      { type: 'choiceOptionMoved', fieldId: 'country', fromIndex: 0, toIndex: 1 },
      {
        type: 'choiceOptionPresentationChanged',
        fieldId: 'country',
        optionIndex: 0,
        property: 'label',
      },
      {
        type: 'choiceOptionPresentationChanged',
        fieldId: 'country',
        optionIndex: 0,
        property: 'disabled',
      },
    ]);
  });

  it('bounds output with explicit total and truncation metadata', () => {
    const to = clone(baseDraft());
    to.title = 'Changed';
    delete to.description;
    to.submission = { submitLabel: 'Continue', successMessage: 'Saved' };
    const result = compareFormDefinitions(baseDraft(), to, { maxChanges: 2 });
    expect(result).toEqual({
      success: true,
      value: {
        diffVersion: 1,
        formId: 'test-form',
        fromFormVersion: 1,
        toFormVersion: 1,
        changes: [
          { type: 'formPresentationChanged', property: 'title' },
          { type: 'formPresentationChanged', property: 'description' },
        ],
        totalChangeCount: 4,
        truncated: true,
      },
    });
  });

  it.each([0, 1.5, 1001])('rejects invalid output limit %s', (maxChanges) => {
    expect(compareFormDefinitions(baseDraft(), baseDraft(), { maxChanges })).toMatchObject({
      success: false,
      issues: [{ path: ['options', 'maxChanges'], code: 'invalid_change_limit' }],
    });
  });

  it('rejects invalid inputs and different logical form identities with safe issues', () => {
    expect(compareFormDefinitions({ ...baseDraft(), title: '' }, baseDraft())).toMatchObject({
      success: false,
      issues: [{ path: ['from', 'title'], code: 'invalid_from_definition' }],
    });
    expect(
      compareFormDefinitions(baseDraft(), { ...baseDraft(), id: 'another-form' }),
    ).toMatchObject({
      success: false,
      issues: [{ path: ['to', 'id'], code: 'form_identity_mismatch' }],
    });
  });

  it('does not mutate either comparison input and produces deterministic output', () => {
    const from = baseDraft();
    const to = clone(from);
    to.sections.reverse();
    const beforeFrom = clone(from);
    const beforeTo = clone(to);
    const first = compareFormDefinitions(from, to);
    const second = compareFormDefinitions(from, to);
    expect(first).toEqual(second);
    expect(from).toEqual(beforeFrom);
    expect(to).toEqual(beforeTo);
  });
});

function successfulChanges(
  from: FormDraftDefinition,
  to: FormDraftDefinition,
): readonly FormSemanticChange[] {
  const result = compareFormDefinitions(from, to);
  expect(result.success).toBe(true);
  return result.success ? result.value.changes : [];
}

function isType<T extends FormSemanticChange['type']>(type: T) {
  return (
    change: FormSemanticChange,
  ): change is Extract<FormSemanticChange, { readonly type: T }> => change.type === type;
}

interface MutableSection extends Omit<FormDraftSection, 'fields'> {
  fields: FormField[];
}

interface MutableDraft extends Omit<FormDraftDefinition, 'sections' | 'submission'> {
  formVersion: number;
  title: string;
  description?: string;
  sections: MutableSection[];
  submission: { submitLabel: string; successMessage: string };
}

function baseDraft(): MutableDraft {
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
            id: 'name',
            type: 'text',
            label: 'Name',
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
        fields: [numberField('age', 'Age')],
      },
    ],
    submission: { submitLabel: 'Submit', successMessage: 'Complete' },
  };
}

function textField(id: string, label: string): FormField {
  return { id, type: 'text', label };
}

function numberField(id: string, label: string): FormField {
  return { id, type: 'number', label };
}

function replaceCountryOptions(
  draft: MutableDraft,
  options: readonly {
    readonly label: string;
    readonly value: string;
    readonly disabled?: boolean;
  }[],
): void {
  const field = draft.sections[0]!.fields[1]!;
  draft.sections[0]!.fields[1] = { ...field, options } as FormField;
}

function withoutProperty(field: FormField, property: string): FormField {
  const copy = { ...field } as Record<string, unknown>;
  delete copy[property];
  return copy as unknown as FormField;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
