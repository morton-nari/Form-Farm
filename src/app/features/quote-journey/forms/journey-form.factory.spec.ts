import { TestBed } from '@angular/core/testing';

import { ApplicationQuestion } from '../../../core/api/insurance-api.models';
import { JourneySection } from '../models/journey.models';
import { JourneyFormFactory } from './journey-form.factory';

describe('JourneyFormFactory', () => {
  let factory: JourneyFormFactory;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    factory = TestBed.inject(JourneyFormFactory);
  });

  it('creates controls and validators from API question metadata', () => {
    const form = factory.create(createSections());
    const emailControl = form.controls['email'];
    const phoneControl = form.controls['phone'];

    expect(Object.keys(form.controls)).toEqual(['email', 'phone', 'occupation']);
    expect(emailControl?.hasError('required')).toBe(true);
    expect(phoneControl?.hasError('required')).toBe(true);

    emailControl?.setValue('invalid-email');
    expect(emailControl?.hasError('email')).toBe(true);

    emailControl?.setValue('person@example.com');
    expect(emailControl?.valid).toBe(true);
  });

  it('adds additional questions without replacing existing answers', () => {
    const form = factory.create(createSections());
    const originalEmailControl = form.controls['email'];
    originalEmailControl?.setValue('person@example.com');

    factory.addQuestions(form, [
      createQuestion('email', 'Email Address', 'email'),
      createQuestion('cigarettesPerWeek', 'Cigarettes per week', 'number'),
    ]);

    expect(form.controls['email']).toBe(originalEmailControl);
    expect(form.controls['email']?.value).toBe('person@example.com');

    const cigarettesControl = form.controls['cigarettesPerWeek'];
    cigarettesControl?.setValue(-1);
    expect(cigarettesControl?.hasError('min')).toBe(true);

    cigarettesControl?.setValue(20);
    expect(cigarettesControl?.valid).toBe(true);
  });

  it('returns only answered values in the quote payload shape', () => {
    const form = factory.create(createSections());

    form.controls['email']?.setValue('person@example.com');
    form.controls['phone']?.setValue('');
    form.controls['occupation']?.setValue('Teacher');

    expect(factory.getAnswers(form)).toEqual({
      email: 'person@example.com',
      occupation: 'Teacher',
    });
  });
});

function createSections(): readonly JourneySection[] {
  return [
    {
      id: 'about-you',
      title: 'About You',
      questions: [
        createQuestion('email', 'Email Address', 'email'),
        createQuestion('phone', 'Phone Number', 'text'),
        {
          ...createQuestion('occupation', 'Occupation', 'select'),
          options: ['Accountant', 'Teacher', 'Builder', 'Pilot', 'Other'],
        },
      ],
    },
  ];
}

function createQuestion(
  id: string,
  label: string,
  type: ApplicationQuestion['type'],
): ApplicationQuestion {
  return { id, label, type, required: true };
}
