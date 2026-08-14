import { describe, expect, it } from 'vitest';
import { validateFormAnswers, validateFormDefinition } from '@form-farm/form-domain';

import { HEALTH_QUESTIONNAIRE_FORM } from './health-questionnaire.form.js';

describe('health questionnaire sample', () => {
  it('is a valid provider-neutral schema-v1 definition', () => {
    expect(validateFormDefinition(HEALTH_QUESTIONNAIRE_FORM)).toEqual({
      success: true,
      value: HEALTH_QUESTIONNAIRE_FORM,
    });
  });

  it('keeps option labels separate from stable submitted values', () => {
    const overallHealth = HEALTH_QUESTIONNAIRE_FORM.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === 'overallHealth');
    expect(overallHealth).toMatchObject({
      type: 'radio',
      options: expect.arrayContaining([{ label: 'Prefer not to say', value: 'prefer-not-to-say' }]),
    });
  });

  it('validates a complete provider-neutral answer map', () => {
    expect(
      validateFormAnswers(HEALTH_QUESTIONNAIRE_FORM, {
        firstName: 'Alex',
        lastName: 'Morgan',
        phoneNumber: '+61 400 000 000',
        addressLine1: '1 Example Street',
        suburbOrCity: 'Sydney',
        stateOrRegion: 'NSW',
        postalCode: '2000',
        country: 'Australia',
        dateOfBirth: '1990-01-01',
        overallHealth: 'good',
        healthTopics: ['sleep', 'physical-activity'],
        preferredContactMethod: 'phone',
        informationAcknowledgement: true,
      }),
    ).toMatchObject({ success: true });
  });

  it('applies the versioned date-of-birth bounds declared by the sample', () => {
    const invalid = validateFormAnswers(HEALTH_QUESTIONNAIRE_FORM, {
      firstName: 'Alex',
      lastName: 'Morgan',
      phoneNumber: '+61 400 000 000',
      addressLine1: '1 Example Street',
      suburbOrCity: 'Sydney',
      stateOrRegion: 'NSW',
      postalCode: '2000',
      country: 'Australia',
      dateOfBirth: '2027-01-01',
      overallHealth: 'good',
      preferredContactMethod: 'phone',
      informationAcknowledgement: true,
    });
    expect(invalid).toMatchObject({ success: false });
  });
});
