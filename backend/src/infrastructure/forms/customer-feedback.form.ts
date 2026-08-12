import type { FormDefinition } from '@form-farm/form-domain';

export const CUSTOMER_FEEDBACK_FORM = {
  schemaVersion: 1,
  id: 'customer-feedback',
  formVersion: 1,
  title: 'Customer feedback',
  description: 'Tell us about your recent experience.',
  sections: [
    {
      id: 'experience',
      title: 'Your experience',
      fields: [
        {
          id: 'overallRating',
          type: 'radio',
          label: 'How would you rate your experience?',
          options: [
            { label: 'Excellent', value: 'excellent' },
            { label: 'Good', value: 'good' },
            { label: 'Fair', value: 'fair' },
            { label: 'Poor', value: 'poor' },
          ],
          validation: [{ type: 'required' }],
        },
        {
          id: 'likedMost',
          type: 'textarea',
          label: 'What did you like most?',
          rows: 4,
          validation: [{ type: 'maxLength', value: 1_000 }],
        },
        {
          id: 'improvements',
          type: 'textarea',
          label: 'What could we improve?',
          rows: 4,
          validation: [{ type: 'maxLength', value: 1_000 }],
        },
      ],
    },
    {
      id: 'follow-up',
      title: 'Optional follow-up',
      description: 'Leave your details only if you would like us to contact you.',
      fields: [
        {
          id: 'contactEmail',
          type: 'email',
          label: 'Email address',
          autocomplete: 'email',
        },
        {
          id: 'contactPermission',
          type: 'checkbox',
          label: 'You may contact me about this feedback',
        },
      ],
    },
  ],
  submission: {
    submitLabel: 'Send feedback',
    successMessage: 'Thank you for your feedback.',
  },
} satisfies FormDefinition;
