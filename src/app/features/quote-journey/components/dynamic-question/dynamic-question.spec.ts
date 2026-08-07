import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, Validators } from '@angular/forms';

import { ApplicationQuestion } from '../../../../core/api/insurance-api.models';
import { JourneyFormControl } from '../../forms/journey-form.factory';
import { DynamicQuestion } from './dynamic-question';

describe('DynamicQuestion', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DynamicQuestion],
    }).compileComponents();
  });

  it('renders an email field and its validation message accessibly', () => {
    const control = new FormControl<string | number | null>(null, [
      Validators.required,
      Validators.email,
    ]);
    const fixture = renderQuestion(
      {
        id: 'email',
        label: 'Email Address',
        type: 'email',
        required: true,
      },
      control,
    );

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const label = fixture.nativeElement.querySelector('label') as HTMLLabelElement;

    expect(input.type).toBe('email');
    expect(input.autocomplete).toBe('email');
    expect(input.required).toBe(true);
    expect(input.getAttribute('aria-required')).toBe('true');
    expect(label.htmlFor).toBe(input.id);

    control.markAsTouched();
    fixture.detectChanges();

    const error = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(error.textContent).toContain('Email Address is required.');
    expect(input.getAttribute('aria-describedby')).toBe(error.id);
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('provides telephone keyboard and autofill hints for the API phone field', () => {
    const fixture = renderQuestion(
      {
        id: 'phone',
        label: 'Phone Number',
        type: 'text',
        required: true,
      },
      new FormControl<string | number | null>(null),
    );

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    expect(input.autocomplete).toBe('tel');
    expect(input.inputMode).toBe('tel');
  });

  it('renders API-provided select options', () => {
    const fixture = renderQuestion(
      {
        id: 'occupation',
        label: 'Occupation',
        type: 'select',
        required: true,
        options: ['Accountant', 'Teacher', 'Builder'],
      },
      new FormControl<string | number | null>(null),
    );

    const options = Array.from(
      fixture.nativeElement.querySelectorAll('option') as NodeListOf<HTMLOptionElement>,
    ).map((option) => option.textContent?.trim());

    expect(options).toEqual(['Select an option', 'Accountant', 'Teacher', 'Builder']);
  });

  it('renders a labelled radio group for every API option', () => {
    const control = new FormControl<string | number | null>(null);
    const fixture = renderQuestion(
      {
        id: 'smokedLast12Months',
        label: 'Have you smoked in the last 12 months?',
        type: 'radio',
        required: true,
        options: ['Yes', 'No'],
      },
      control,
    );

    const radios = fixture.nativeElement.querySelectorAll(
      'input[type="radio"]',
    ) as NodeListOf<HTMLInputElement>;
    const legend = fixture.nativeElement.querySelector('legend') as HTMLElement;

    expect(radios).toHaveLength(2);
    expect(radios[0]?.required).toBe(true);
    expect(radios[0]?.getAttribute('aria-required')).toBe('true');
    expect(legend.textContent).toContain('Have you smoked in the last 12 months?');

    radios[0]?.click();
    expect(control.value).toBe('Yes');

    radios[1]?.click();
    expect(control.value).toBe('No');
  });

  it('renders whole-number constraints for number questions', () => {
    const fixture = renderQuestion(
      {
        id: 'cigarettesPerWeek',
        label: 'How many cigarettes do you smoke each week?',
        type: 'number',
        required: true,
      },
      new FormControl<string | number | null>(null),
    );

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    expect(input.type).toBe('number');
    expect(input.min).toBe('0');
    expect(input.step).toBe('1');
  });
});

function renderQuestion(
  question: ApplicationQuestion,
  control: JourneyFormControl,
): ComponentFixture<DynamicQuestion> {
  const fixture = TestBed.createComponent(DynamicQuestion);
  fixture.componentRef.setInput('question', question);
  fixture.componentRef.setInput('control', control);
  fixture.detectChanges();
  return fixture;
}
