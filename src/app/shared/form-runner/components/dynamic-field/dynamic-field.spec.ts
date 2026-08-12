import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';

import { FormField } from '../../../../domain/forms/form-definition.models';
import { DynamicFormControl } from '../../forms/dynamic-form.factory';
import { DynamicField } from './dynamic-field';

describe('DynamicField', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DynamicField] }).compileComponents();
  });

  it.each([
    [{ id: 'text', type: 'text', label: 'Text' }, 'input[type="text"]'],
    [{ id: 'email', type: 'email', label: 'Email' }, 'input[type="email"]'],
    [{ id: 'password', type: 'password', label: 'Password' }, 'input[type="password"]'],
    [{ id: 'tel', type: 'tel', label: 'Telephone' }, 'input[type="tel"]'],
    [{ id: 'url', type: 'url', label: 'URL' }, 'input[type="url"]'],
    [{ id: 'textarea', type: 'textarea', label: 'Textarea' }, 'textarea'],
    [{ id: 'number', type: 'number', label: 'Number' }, 'input[type="number"]'],
    [{ id: 'date', type: 'date', label: 'Date' }, 'input[type="date"]'],
    [{ id: 'datetime', type: 'datetime', label: 'Date time' }, 'input[type="datetime-local"]'],
    [{ id: 'time', type: 'time', label: 'Time' }, 'input[type="time"]'],
    [choiceField('select', 'select'), 'select:not([multiple])'],
    [choiceField('radio', 'radio'), 'input[type="radio"]'],
    [choiceField('multiSelect', 'multi-select'), 'select[multiple]'],
    [{ id: 'checkbox', type: 'checkbox', label: 'Checkbox' }, 'input[type="checkbox"]'],
    [choiceField('checkboxGroup', 'checkbox-group'), 'fieldset input[type="checkbox"]'],
  ] as const)('renders the schema-v1 field %# explicitly', (field, selector) => {
    const fixture = render(field as FormField);
    expect(fixture.nativeElement.querySelector(selector)).toBeTruthy();
  });

  it('renders stable option values separately from labels', () => {
    const fixture = render({
      id: 'contact',
      type: 'select',
      label: 'Contact method',
      options: [{ label: 'Phone call', value: 'phone' }],
    });
    const option = fixture.nativeElement.querySelectorAll('option')[1] as HTMLOptionElement;

    expect(option.textContent?.trim()).toBe('Phone call');
    expect(option.value).toBe('phone');
  });

  it('associates labels, help, required state, and errors accessibly', () => {
    const control = new FormControl<string | number | boolean | readonly string[] | null>(null);
    control.setErrors({ required: true });
    control.markAsTouched();
    const fixture = render(
      {
        id: 'name',
        type: 'text',
        label: 'Full name',
        helpText: 'Enter your legal name.',
        validation: [{ type: 'required' }],
      },
      control,
    );
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const label = fixture.nativeElement.querySelector('label') as HTMLLabelElement;
    const error = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;

    expect(label.htmlFor).toBe(input.id);
    expect(input.required).toBe(true);
    expect(input.getAttribute('aria-describedby')).toBe(`field-name-help ${error.id}`);
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('updates checkbox-group array answers without duplicate values', () => {
    const control = new FormControl<string | number | boolean | readonly string[] | null>([]);
    const fixture = render(choiceField('interests', 'checkbox-group'), control);
    const checkbox = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    checkbox.click();
    fixture.detectChanges();
    expect(control.value).toEqual(['one']);

    checkbox.click();
    fixture.detectChanges();
    expect(control.value).toEqual([]);
  });
});

function choiceField(
  id: string,
  type: 'select' | 'radio' | 'multi-select' | 'checkbox-group',
): FormField {
  return { id, type, label: id, options: [{ label: 'One', value: 'one' }] } as FormField;
}

function render(
  field: FormField,
  control: DynamicFormControl = new FormControl(null),
): ComponentFixture<DynamicField> {
  const fixture = TestBed.createComponent(DynamicField);
  fixture.componentRef.setInput('field', field);
  fixture.componentRef.setInput('control', control);
  fixture.detectChanges();
  return fixture;
}
