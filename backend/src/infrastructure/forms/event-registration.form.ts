import type { FormDefinition } from '@form-farm/form-domain';

/** Demonstration content only; it does not perform booking, ticketing, or payment workflows. */
export const EVENT_REGISTRATION_FORM = {
  schemaVersion: 1,
  id: 'event-registration',
  formVersion: 1,
  title: 'Workshop registration',
  description: 'Register for a free example workshop.',
  sections: [
    {
      id: 'attendee',
      title: 'Attendee details',
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
          id: 'emailAddress',
          type: 'email',
          label: 'Email address',
          autocomplete: 'email',
          validation: [{ type: 'required' }, { type: 'maxLength', value: 254 }],
        },
        {
          id: 'organisation',
          type: 'text',
          label: 'Organisation',
          autocomplete: 'organization',
          validation: [{ type: 'maxLength', value: 150 }],
        },
      ],
    },
    {
      id: 'workshop',
      title: 'Workshop choices',
      fields: [
        {
          id: 'attendanceFormat',
          type: 'radio',
          label: 'How will you attend?',
          options: [
            { label: 'In person', value: 'in-person' },
            { label: 'Online', value: 'online' },
          ],
          validation: [{ type: 'required' }],
        },
        {
          id: 'sessions',
          type: 'checkbox-group',
          label: 'Choose one or two sessions',
          options: [
            { label: 'Form design fundamentals', value: 'form-design-fundamentals' },
            { label: 'Accessible validation', value: 'accessible-validation' },
            { label: 'Schema-driven applications', value: 'schema-driven-applications' },
          ],
          validation: [
            { type: 'required' },
            { type: 'minSelections', value: 1 },
            { type: 'maxSelections', value: 2 },
          ],
        },
        {
          id: 'experienceLevel',
          type: 'select',
          label: 'Experience level',
          placeholder: 'Choose a level',
          options: [
            { label: 'New to form building', value: 'beginner' },
            { label: 'Some experience', value: 'intermediate' },
            { label: 'Experienced practitioner', value: 'advanced' },
          ],
          validation: [{ type: 'required' }],
        },
      ],
    },
    {
      id: 'accessibility',
      title: 'Accessibility and confirmation',
      fields: [
        {
          id: 'accessibilityNeeds',
          type: 'textarea',
          label: 'Accessibility or participation needs',
          rows: 4,
          helpText: 'Optional. Share only what the organisers need to support your participation.',
          validation: [{ type: 'maxLength', value: 1_000 }],
        },
        {
          id: 'registrationAcknowledgement',
          type: 'checkbox',
          label: 'I understand this is a demonstration registration and not a confirmed booking',
          validation: [{ type: 'accepted' }],
        },
      ],
    },
  ],
  submission: {
    submitLabel: 'Register for workshop',
    successMessage: 'Your demonstration registration has been received.',
  },
} satisfies FormDefinition;
