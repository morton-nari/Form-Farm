import { describe, expect, it } from 'vitest';
import { validateFormAnswers, validateFormDefinition } from '@form-farm/form-domain';

import { CONTACT_REQUEST_FORM } from './contact-request.form.js';
import { EVENT_REGISTRATION_FORM } from './event-registration.form.js';

describe.each([
  ['contact request', CONTACT_REQUEST_FORM],
  ['event registration', EVENT_REGISTRATION_FORM],
] as const)('%s sample', (_name, definition) => {
  it('is a valid provider-neutral schema-v1 definition', () => {
    expect(validateFormDefinition(definition)).toEqual({ success: true, value: definition });
  });

  it('keeps option labels separate from stable submitted values', () => {
    const options = definition.sections
      .flatMap((section) => section.fields)
      .flatMap((field) => ('options' in field ? field.options : []));

    expect(options.length).toBeGreaterThan(0);
    expect(options.some((option) => option.label !== option.value)).toBe(true);
  });
});

describe('contact request answers', () => {
  const validAnswers = {
    fullName: 'Alex Morgan',
    emailAddress: 'alex@example.test',
    preferredContactMethod: 'email',
    requestTopic: 'product-information',
    message: 'Please send more information about the example product.',
    contactAcknowledgement: true,
  } as const;

  it('accepts a representative answer map', () => {
    expect(validateFormAnswers(CONTACT_REQUEST_FORM, validAnswers)).toMatchObject({
      success: true,
    });
  });

  it('rejects a message below the declared minimum length', () => {
    expect(
      validateFormAnswers(CONTACT_REQUEST_FORM, { ...validAnswers, message: 'Short' }),
    ).toMatchObject({ success: false });
  });
});

describe('event registration answers', () => {
  const validAnswers = {
    firstName: 'Taylor',
    lastName: 'Lee',
    emailAddress: 'taylor@example.test',
    attendanceFormat: 'online',
    sessions: ['accessible-validation', 'schema-driven-applications'],
    experienceLevel: 'intermediate',
    registrationAcknowledgement: true,
  } as const;

  it('accepts a representative answer map', () => {
    expect(validateFormAnswers(EVENT_REGISTRATION_FORM, validAnswers)).toMatchObject({
      success: true,
    });
  });

  it('rejects more sessions than the declared maximum', () => {
    expect(
      validateFormAnswers(EVENT_REGISTRATION_FORM, {
        ...validAnswers,
        sessions: [
          'form-design-fundamentals',
          'accessible-validation',
          'schema-driven-applications',
        ],
      }),
    ).toMatchObject({ success: false });
  });
});
