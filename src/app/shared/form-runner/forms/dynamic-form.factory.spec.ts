import { TestBed } from '@angular/core/testing';

import { FormField, FormSection } from '@form-farm/form-domain';
import { DynamicFormFactory } from './dynamic-form.factory';

describe('DynamicFormFactory', () => {
  let factory: DynamicFormFactory;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    factory = TestBed.inject(DynamicFormFactory);
  });

  it('creates controls with defaults and every domain validation-rule family', () => {
    const form = factory.create([
      section([
        field('name', 'text', [
          { type: 'required' },
          { type: 'minLength', value: 2 },
          { type: 'maxLength', value: 4 },
        ]),
        field('age', 'number', [
          { type: 'min', value: 1 },
          { type: 'max', value: 10 },
          { type: 'integer' },
        ]),
        {
          id: 'choices',
          type: 'multi-select',
          label: 'Choices',
          options: [
            { label: 'One', value: 'one' },
            { label: 'Two', value: 'two' },
          ],
          defaultValue: ['one'],
          validation: [
            { type: 'minSelections', value: 1 },
            { type: 'maxSelections', value: 1 },
          ],
        },
        {
          id: 'accepted',
          type: 'checkbox',
          label: 'Accepted',
          defaultValue: false,
          validation: [{ type: 'accepted' }],
        },
        {
          id: 'date',
          type: 'date',
          label: 'Date',
          validation: [
            { type: 'earliest', value: '2026-01-01' },
            { type: 'latest', value: '2026-12-31' },
          ],
        },
      ]),
    ]);

    expect(form.controls['choices']?.value).toEqual(['one']);
    expect(form.controls['accepted']?.hasError('required')).toBe(true);

    form.controls['name']?.setValue('x');
    expect(form.controls['name']?.hasError('minlength')).toBe(true);
    form.controls['name']?.setValue('abcde');
    expect(form.controls['name']?.hasError('maxlength')).toBe(true);

    form.controls['age']?.setValue(0);
    expect(form.controls['age']?.hasError('min')).toBe(true);
    form.controls['age']?.setValue(11);
    expect(form.controls['age']?.hasError('max')).toBe(true);
    form.controls['age']?.setValue(1.5);
    expect(form.controls['age']?.hasError('integer')).toBe(true);

    form.controls['choices']?.setValue([]);
    expect(form.controls['choices']?.hasError('minSelections')).toBe(true);
    form.controls['choices']?.setValue(['one', 'two']);
    expect(form.controls['choices']?.hasError('maxSelections')).toBe(true);

    form.controls['date']?.setValue('2025-12-31');
    expect(form.controls['date']?.hasError('earliest')).toBe(true);
    form.controls['date']?.setValue('2027-01-01');
    expect(form.controls['date']?.hasError('latest')).toBe(true);
  });

  it('adds fields without replacing existing answers and returns typed non-empty answers', () => {
    const form = factory.create([section([field('name', 'text', [{ type: 'required' }])])]);
    const original = form.controls['name'];
    original?.setValue('Taylor');

    factory.addFields(form, [
      field('name', 'text', [{ type: 'required' }]),
      { id: 'active', type: 'checkbox', label: 'Active', defaultValue: false },
      { id: 'count', type: 'number', label: 'Count', defaultValue: 3 },
      {
        id: 'tags',
        type: 'multi-select',
        label: 'Tags',
        options: [{ label: 'One', value: 'one' }],
      },
    ]);
    form.controls['tags']?.setValue(['one']);

    expect(form.controls['name']).toBe(original);
    expect(factory.getAnswers(form)).toEqual({
      name: 'Taylor',
      active: false,
      count: 3,
      tags: ['one'],
    });
  });

  it('applies inherent email and URL validation', () => {
    const form = factory.create([
      section([
        { id: 'email', type: 'email', label: 'Email' },
        { id: 'website', type: 'url', label: 'Website' },
      ]),
    ]);

    form.controls['email']?.setValue('invalid');
    form.controls['website']?.setValue('invalid');
    expect(form.controls['email']?.hasError('email')).toBe(true);
    expect(form.controls['website']?.hasError('url')).toBe(true);
  });
});

function section(fields: readonly FormField[]): FormSection {
  return { id: 'section', title: 'Section', fields };
}

function field(
  id: string,
  type: 'text' | 'number',
  validation: FormField['validation'],
): FormField {
  return { id, type, label: id, validation } as FormField;
}
