import type { FormDefinition } from '@form-farm/form-domain';

/**
 * Demonstration content only. Publishing this schema does not approve production collection,
 * retention, clinical use, diagnosis, or treatment workflows.
 */
export const HEALTH_QUESTIONNAIRE_FORM = {
  schemaVersion: 1,
  id: 'health-questionnaire',
  formVersion: 1,
  title: 'Health questionnaire',
  description:
    'A general information sample. It does not provide medical advice, diagnosis, or treatment.',
  sections: [
    {
      id: 'your-details',
      title: 'Your details',
      description: 'Tell us how to identify and contact you.',
      fields: [
        {
          id: 'firstName',
          type: 'text',
          label: 'First name',
          autocomplete: 'given-name',
          validation: [{ type: 'required' }, { type: 'maxLength', value: 100 }],
        },
        {
          id: 'lastName',
          type: 'text',
          label: 'Last name',
          autocomplete: 'family-name',
          validation: [{ type: 'required' }, { type: 'maxLength', value: 100 }],
        },
        {
          id: 'phoneNumber',
          type: 'tel',
          label: 'Phone number',
          autocomplete: 'tel',
          helpText: 'Include the country or area code where applicable.',
          validation: [{ type: 'required' }, { type: 'maxLength', value: 40 }],
        },
        {
          id: 'addressLine1',
          type: 'text',
          label: 'Address line 1',
          autocomplete: 'address-line1',
          validation: [{ type: 'required' }, { type: 'maxLength', value: 200 }],
        },
        {
          id: 'addressLine2',
          type: 'text',
          label: 'Address line 2',
          autocomplete: 'address-line2',
          validation: [{ type: 'maxLength', value: 200 }],
        },
        {
          id: 'suburbOrCity',
          type: 'text',
          label: 'Suburb or city',
          autocomplete: 'address-level2',
          validation: [{ type: 'required' }, { type: 'maxLength', value: 100 }],
        },
        {
          id: 'stateOrRegion',
          type: 'text',
          label: 'State, province, or region',
          autocomplete: 'address-level1',
          validation: [{ type: 'required' }, { type: 'maxLength', value: 100 }],
        },
        {
          id: 'postalCode',
          type: 'text',
          label: 'Postal code',
          autocomplete: 'postal-code',
          validation: [{ type: 'required' }, { type: 'maxLength', value: 20 }],
        },
        {
          id: 'country',
          type: 'text',
          label: 'Country',
          autocomplete: 'country-name',
          validation: [{ type: 'required' }, { type: 'maxLength', value: 100 }],
        },
      ],
    },
    {
      id: 'general-health',
      title: 'General health information',
      description: 'Provide only the information you are comfortable sharing in this demonstration.',
      fields: [
        {
          id: 'dateOfBirth',
          type: 'date',
          label: 'Date of birth',
          validation: [{ type: 'required' }],
        },
        {
          id: 'overallHealth',
          type: 'radio',
          label: 'How would you describe your overall health?',
          options: [
            { label: 'Excellent', value: 'excellent' },
            { label: 'Good', value: 'good' },
            { label: 'Fair', value: 'fair' },
            { label: 'Poor', value: 'poor' },
            { label: 'Prefer not to say', value: 'prefer-not-to-say' },
          ],
          validation: [{ type: 'required' }],
        },
        {
          id: 'healthTopics',
          type: 'checkbox-group',
          label: 'Which general topics would you like to discuss?',
          helpText: 'Select any that apply. This does not request a diagnosis.',
          options: [
            { label: 'General wellbeing', value: 'general-wellbeing' },
            { label: 'Sleep', value: 'sleep' },
            { label: 'Nutrition', value: 'nutrition' },
            { label: 'Physical activity', value: 'physical-activity' },
            { label: 'Stress and wellbeing', value: 'stress-wellbeing' },
            { label: 'Something else', value: 'other' },
          ],
          validation: [{ type: 'maxSelections', value: 6 }],
        },
        {
          id: 'additionalInformation',
          type: 'textarea',
          label: 'Is there anything else you would like to share?',
          rows: 5,
          helpText: 'Do not include emergency information. Contact local emergency services if needed.',
          validation: [{ type: 'maxLength', value: 2_000 }],
        },
      ],
    },
    {
      id: 'communication',
      title: 'Communication preferences',
      fields: [
        {
          id: 'preferredContactMethod',
          type: 'select',
          label: 'Preferred contact method',
          placeholder: 'Choose a contact method',
          options: [
            { label: 'Phone call', value: 'phone' },
            { label: 'Text message', value: 'text-message' },
            { label: 'Email', value: 'email' },
          ],
          validation: [{ type: 'required' }],
        },
        {
          id: 'accessibilityNeeds',
          type: 'textarea',
          label: 'Communication or accessibility needs',
          rows: 3,
          validation: [{ type: 'maxLength', value: 1_000 }],
        },
        {
          id: 'informationAcknowledgement',
          type: 'checkbox',
          label: 'I understand this sample form does not provide medical advice',
          validation: [{ type: 'accepted' }],
        },
      ],
    },
  ],
  submission: {
    submitLabel: 'Submit questionnaire',
    successMessage: 'Your sample questionnaire has been submitted.',
  },
} satisfies FormDefinition;
