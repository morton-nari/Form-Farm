import type { FormDefinition } from '@form-farm/form-domain';

/** Demonstration content only; production collection requires an explicit privacy/retention policy. */
export const CONTACT_REQUEST_FORM = {
  schemaVersion: 1,
  id: 'contact-request',
  formVersion: 1,
  title: 'Contact request',
  description: 'Send a question or request to the example team.',
  sections: [
    {
      id: 'contact-details',
      title: 'Your contact details',
      fields: [
        {
          id: 'fullName',
          type: 'text',
          label: 'Full name',
          autocomplete: 'name',
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
          id: 'phoneNumber',
          type: 'tel',
          label: 'Phone number',
          autocomplete: 'tel',
          helpText: 'Optional. Include the country or area code where applicable.',
          validation: [{ type: 'maxLength', value: 40 }],
        },
        {
          id: 'preferredContactMethod',
          type: 'radio',
          label: 'How should we reply?',
          options: [
            { label: 'Email', value: 'email' },
            { label: 'Phone', value: 'phone' },
          ],
          validation: [{ type: 'required' }],
        },
      ],
    },
    {
      id: 'request-details',
      title: 'Your request',
      fields: [
        {
          id: 'requestTopic',
          type: 'select',
          label: 'What is your request about?',
          placeholder: 'Choose a topic',
          options: [
            { label: 'Product information', value: 'product-information' },
            { label: 'Existing service', value: 'existing-service' },
            { label: 'Partnership enquiry', value: 'partnership-enquiry' },
            { label: 'Something else', value: 'other' },
          ],
          validation: [{ type: 'required' }],
        },
        {
          id: 'message',
          type: 'textarea',
          label: 'How can we help?',
          rows: 6,
          helpText: 'Do not include passwords, payment details, or other secrets.',
          validation: [
            { type: 'required' },
            { type: 'minLength', value: 10 },
            { type: 'maxLength', value: 2_000 },
          ],
        },
        {
          id: 'contactAcknowledgement',
          type: 'checkbox',
          label: 'I understand the example team may contact me about this request',
          validation: [{ type: 'accepted' }],
        },
      ],
    },
  ],
  submission: {
    submitLabel: 'Send request',
    successMessage: 'Your request has been received.',
  },
} satisfies FormDefinition;
